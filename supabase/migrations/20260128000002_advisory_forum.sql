-- =============================================
-- MIGRATION: Advisory Forum for Founder Support
-- =============================================
-- Q&A system where founders can ask questions and get answers
-- from AI assistants and human advisors with verification workflows

-- 1. Create advisory_questions table
CREATE TABLE public.advisory_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    asked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    title text NOT NULL,
    body text NOT NULL,
    category text CHECK (category IN (
        'finance', 'legal', 'sales', 'marketing', 
        'product', 'operations', 'people', 'customer', 'strategy'
    )),
    tags text[] DEFAULT '{}',
    visibility text NOT NULL DEFAULT 'network' CHECK (visibility IN ('foundry', 'network')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'verified', 'closed')),
    view_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create advisory_answers table
CREATE TABLE public.advisory_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.advisory_questions(id) ON DELETE CASCADE,
    author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_type text NOT NULL CHECK (author_type IN ('ai', 'human')),
    body text NOT NULL,
    is_accepted boolean NOT NULL DEFAULT false,
    verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'endorsed', 'verified', 'disputed')),
    verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at timestamptz,
    upvotes integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create advisory_comments table
CREATE TABLE public.advisory_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id uuid NOT NULL REFERENCES public.advisory_answers(id) ON DELETE CASCADE,
    author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create advisory_votes table for tracking upvotes/downvotes
CREATE TABLE public.advisory_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id uuid NOT NULL REFERENCES public.advisory_answers(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(answer_id, user_id)
);

-- 5. Create indexes for performance
-- Question lookups
CREATE INDEX idx_advisory_questions_foundry ON public.advisory_questions(foundry_id);
CREATE INDEX idx_advisory_questions_category ON public.advisory_questions(category);
CREATE INDEX idx_advisory_questions_status ON public.advisory_questions(status);
CREATE INDEX idx_advisory_questions_visibility ON public.advisory_questions(visibility);
CREATE INDEX idx_advisory_questions_created ON public.advisory_questions(created_at DESC);
CREATE INDEX idx_advisory_questions_open_network ON public.advisory_questions(category, created_at DESC) 
    WHERE status = 'open' AND visibility = 'network';

-- Answer lookups
CREATE INDEX idx_advisory_answers_question ON public.advisory_answers(question_id);
CREATE INDEX idx_advisory_answers_author ON public.advisory_answers(author_id);
CREATE INDEX idx_advisory_answers_accepted ON public.advisory_answers(question_id) WHERE is_accepted = true;
CREATE INDEX idx_advisory_answers_verification ON public.advisory_answers(verification_status);

-- Comment lookups
CREATE INDEX idx_advisory_comments_answer ON public.advisory_comments(answer_id);

-- Vote lookups
CREATE INDEX idx_advisory_votes_answer ON public.advisory_votes(answer_id);
CREATE INDEX idx_advisory_votes_user ON public.advisory_votes(user_id);

-- 6. Enable RLS
ALTER TABLE public.advisory_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisory_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisory_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisory_votes ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for advisory_questions

-- SELECT: Users can view their foundry's questions OR network-visible questions
CREATE POLICY "Users can view accessible questions" ON public.advisory_questions
    FOR SELECT
    USING (
        visibility = 'network' 
        OR foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

-- INSERT: Users can create questions in their foundry
CREATE POLICY "Users can create questions in own foundry" ON public.advisory_questions
    FOR INSERT
    WITH CHECK (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
        AND (asked_by = auth.uid() OR asked_by IS NULL)
    );

-- UPDATE: Question author or foundry member can update
CREATE POLICY "Users can update own foundry questions" ON public.advisory_questions
    FOR UPDATE
    USING (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

-- DELETE: Question author or foundry member can delete
CREATE POLICY "Users can delete own foundry questions" ON public.advisory_questions
    FOR DELETE
    USING (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

-- 8. RLS Policies for advisory_answers

-- SELECT: Users can view answers on questions they can see
CREATE POLICY "Users can view answers on accessible questions" ON public.advisory_answers
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.advisory_questions q 
            WHERE q.id = question_id 
            AND (q.visibility = 'network' OR q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()))
        )
    );

-- INSERT: Authenticated users can answer network questions; foundry members can answer private
CREATE POLICY "Users can create answers on accessible questions" ON public.advisory_answers
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.advisory_questions q 
            WHERE q.id = question_id 
            AND (q.visibility = 'network' OR q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()))
        )
        AND (author_id = auth.uid() OR author_id IS NULL)
    );

-- UPDATE: Answer author can update their answer
CREATE POLICY "Users can update own answers" ON public.advisory_answers
    FOR UPDATE
    USING (
        author_id = auth.uid() 
        OR author_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.advisory_questions q 
            WHERE q.id = question_id 
            AND q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
        )
    )
    WITH CHECK (
        author_id = auth.uid() 
        OR author_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.advisory_questions q 
            WHERE q.id = question_id 
            AND q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- DELETE: Answer author or question's foundry member can delete
CREATE POLICY "Users can delete own answers" ON public.advisory_answers
    FOR DELETE
    USING (
        author_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.advisory_questions q 
            WHERE q.id = question_id 
            AND q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- 9. RLS Policies for advisory_comments

-- SELECT: Users can view comments on answers they can see
CREATE POLICY "Users can view comments on accessible answers" ON public.advisory_comments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.advisory_answers a
            JOIN public.advisory_questions q ON q.id = a.question_id
            WHERE a.id = answer_id 
            AND (q.visibility = 'network' OR q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()))
        )
    );

-- INSERT: Users can comment on answers they can see
CREATE POLICY "Users can create comments on accessible answers" ON public.advisory_comments
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.advisory_answers a
            JOIN public.advisory_questions q ON q.id = a.question_id
            WHERE a.id = answer_id 
            AND (q.visibility = 'network' OR q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()))
        )
        AND (author_id = auth.uid() OR author_id IS NULL)
    );

-- UPDATE: Comment author can update
CREATE POLICY "Users can update own comments" ON public.advisory_comments
    FOR UPDATE
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- DELETE: Comment author can delete
CREATE POLICY "Users can delete own comments" ON public.advisory_comments
    FOR DELETE
    USING (author_id = auth.uid());

-- 10. RLS Policies for advisory_votes

-- SELECT: Users can view their own votes
CREATE POLICY "Users can view own votes" ON public.advisory_votes
    FOR SELECT
    USING (user_id = auth.uid());

-- INSERT: Users can vote on visible answers
CREATE POLICY "Users can vote on accessible answers" ON public.advisory_votes
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.advisory_answers a
            JOIN public.advisory_questions q ON q.id = a.question_id
            WHERE a.id = answer_id 
            AND (q.visibility = 'network' OR q.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()))
        )
    );

-- UPDATE: Users can change their vote
CREATE POLICY "Users can update own votes" ON public.advisory_votes
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- DELETE: Users can remove their vote
CREATE POLICY "Users can delete own votes" ON public.advisory_votes
    FOR DELETE
    USING (user_id = auth.uid());

-- 11. Trigger to update answer upvote count when votes change
CREATE OR REPLACE FUNCTION public.update_answer_upvotes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.advisory_answers
        SET upvotes = upvotes + CASE WHEN NEW.vote_type = 'up' THEN 1 ELSE -1 END
        WHERE id = NEW.answer_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.advisory_answers
        SET upvotes = upvotes - CASE WHEN OLD.vote_type = 'up' THEN 1 ELSE -1 END
        WHERE id = OLD.answer_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.vote_type != NEW.vote_type THEN
            UPDATE public.advisory_answers
            SET upvotes = upvotes + CASE WHEN NEW.vote_type = 'up' THEN 2 ELSE -2 END
            WHERE id = NEW.answer_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_answer_upvotes
    AFTER INSERT OR UPDATE OR DELETE ON public.advisory_votes
    FOR EACH ROW EXECUTE FUNCTION public.update_answer_upvotes();

-- 12. Trigger to update question status when answer is accepted
CREATE OR REPLACE FUNCTION public.update_question_status_on_accept()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_accepted = true AND (OLD IS NULL OR OLD.is_accepted = false) THEN
        -- Set other answers on this question to not accepted
        UPDATE public.advisory_answers
        SET is_accepted = false
        WHERE question_id = NEW.question_id AND id != NEW.id;
        
        -- Update question status to answered (or verified if answer is verified)
        UPDATE public.advisory_questions
        SET 
            status = CASE 
                WHEN NEW.verification_status = 'verified' THEN 'verified'
                ELSE 'answered'
            END,
            updated_at = now()
        WHERE id = NEW.question_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_question_status_on_accept
    AFTER INSERT OR UPDATE ON public.advisory_answers
    FOR EACH ROW EXECUTE FUNCTION public.update_question_status_on_accept();

-- 13. Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_advisory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_advisory_questions_updated_at
    BEFORE UPDATE ON public.advisory_questions
    FOR EACH ROW EXECUTE FUNCTION public.update_advisory_updated_at();

CREATE TRIGGER trg_advisory_answers_updated_at
    BEFORE UPDATE ON public.advisory_answers
    FOR EACH ROW EXECUTE FUNCTION public.update_advisory_updated_at();

-- 14. Helper function to increment view count
CREATE OR REPLACE FUNCTION public.increment_question_views(p_question_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.advisory_questions
    SET view_count = view_count + 1
    WHERE id = p_question_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_question_views TO authenticated;

-- 15. Helper function to accept an answer (only question asker or foundry member)
CREATE OR REPLACE FUNCTION public.accept_advisory_answer(p_answer_id uuid)
RETURNS public.advisory_answers AS $$
DECLARE
    v_result public.advisory_answers;
    v_question public.advisory_questions;
BEGIN
    -- Get the question
    SELECT q.* INTO v_question
    FROM public.advisory_questions q
    JOIN public.advisory_answers a ON a.question_id = q.id
    WHERE a.id = p_answer_id;
    
    -- Check authorization
    IF v_question.foundry_id != (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized to accept this answer';
    END IF;
    
    -- Accept the answer
    UPDATE public.advisory_answers
    SET is_accepted = true
    WHERE id = p_answer_id
    RETURNING * INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.accept_advisory_answer TO authenticated;

-- 16. Helper function to verify an answer
CREATE OR REPLACE FUNCTION public.verify_advisory_answer(
    p_answer_id uuid,
    p_status text DEFAULT 'verified'
)
RETURNS public.advisory_answers AS $$
DECLARE
    v_result public.advisory_answers;
BEGIN
    -- Verify status is valid
    IF p_status NOT IN ('unverified', 'endorsed', 'verified', 'disputed') THEN
        RAISE EXCEPTION 'Invalid verification status';
    END IF;
    
    UPDATE public.advisory_answers
    SET 
        verification_status = p_status,
        verified_by = auth.uid(),
        verified_at = CASE WHEN p_status != 'unverified' THEN now() ELSE NULL END
    WHERE id = p_answer_id
    RETURNING * INTO v_result;
    
    -- If verified and accepted, update question status
    IF v_result.is_accepted AND p_status = 'verified' THEN
        UPDATE public.advisory_questions
        SET status = 'verified', updated_at = now()
        WHERE id = v_result.question_id;
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_advisory_answer TO authenticated;

-- Comments
COMMENT ON TABLE public.advisory_questions IS 'Questions asked by founders seeking advice';
COMMENT ON TABLE public.advisory_answers IS 'Answers from AI or human advisors';
COMMENT ON TABLE public.advisory_comments IS 'Follow-up comments on answers';
COMMENT ON TABLE public.advisory_votes IS 'User votes on answer quality';
COMMENT ON COLUMN public.advisory_questions.visibility IS 'foundry: private to foundry, network: visible to all authenticated users';
COMMENT ON COLUMN public.advisory_answers.author_type IS 'ai: generated by AI assistant, human: written by a user';
COMMENT ON COLUMN public.advisory_answers.verification_status IS 'unverified: not checked, endorsed: expert recommends, verified: expert confirmed accurate, disputed: expert found issues';
