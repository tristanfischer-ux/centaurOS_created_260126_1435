-- Add async standup system for remote team coordination
-- This enables the Standup Agent to facilitate daily check-ins across timezones

-- Create standups table
CREATE TABLE public.standups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    foundry_id text NOT NULL,
    standup_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- What did you accomplish yesterday?
    completed text,
    
    -- What will you work on today?
    planned text,
    
    -- Any blockers or issues?
    blockers text,
    
    -- Structured blocker data for routing
    blocker_tags text[] DEFAULT '{}',
    blocker_severity text CHECK (blocker_severity IN ('low', 'medium', 'high', 'critical')),
    needs_help boolean DEFAULT false,
    
    -- Metadata
    mood text CHECK (mood IN ('great', 'good', 'okay', 'struggling')),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure one standup per user per day
    UNIQUE(user_id, standup_date)
);

-- Indexes for efficient queries
CREATE INDEX idx_standups_user_id ON public.standups(user_id);
CREATE INDEX idx_standups_foundry_id ON public.standups(foundry_id);
CREATE INDEX idx_standups_date ON public.standups(standup_date DESC);
CREATE INDEX idx_standups_needs_help ON public.standups(needs_help) WHERE needs_help = true;
CREATE INDEX idx_standups_blocker_severity ON public.standups(blocker_severity) WHERE blocker_severity IS NOT NULL;

-- Enable RLS
ALTER TABLE public.standups ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view standups in their foundry
CREATE POLICY "Users can view standups in same foundry" ON public.standups
    FOR SELECT
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

-- Policy: Users can insert their own standups
CREATE POLICY "Users can insert own standups" ON public.standups
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own standups (same day only)
CREATE POLICY "Users can update own standups" ON public.standups
    FOR UPDATE
    USING (user_id = auth.uid() AND standup_date = CURRENT_DATE)
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own standups
CREATE POLICY "Users can delete own standups" ON public.standups
    FOR DELETE
    USING (user_id = auth.uid());

-- Create standup summaries table for AI-generated digests
CREATE TABLE public.standup_summaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    summary_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- AI-generated content
    summary_text text NOT NULL,
    key_highlights text[],
    blockers_summary text,
    team_mood text,
    
    -- Stats
    total_standups integer NOT NULL DEFAULT 0,
    members_with_blockers integer NOT NULL DEFAULT 0,
    
    -- Metadata
    generated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    
    UNIQUE(foundry_id, summary_date)
);

-- Enable RLS
ALTER TABLE public.standup_summaries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view summaries in their foundry
CREATE POLICY "Users can view summaries in same foundry" ON public.standup_summaries
    FOR SELECT
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

-- Enable realtime for standups
ALTER PUBLICATION supabase_realtime ADD TABLE public.standups;

-- Helper function to get today's standup for current user
CREATE OR REPLACE FUNCTION public.get_my_today_standup()
RETURNS public.standups AS $$
DECLARE
    result public.standups;
BEGIN
    SELECT * INTO result
    FROM public.standups
    WHERE user_id = auth.uid()
    AND standup_date = CURRENT_DATE;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to submit/update standup
CREATE OR REPLACE FUNCTION public.submit_standup(
    p_completed text DEFAULT NULL,
    p_planned text DEFAULT NULL,
    p_blockers text DEFAULT NULL,
    p_blocker_tags text[] DEFAULT '{}',
    p_blocker_severity text DEFAULT NULL,
    p_needs_help boolean DEFAULT false,
    p_mood text DEFAULT NULL
)
RETURNS public.standups AS $$
DECLARE
    result public.standups;
    v_foundry_id text;
BEGIN
    -- Get user's foundry_id
    SELECT foundry_id INTO v_foundry_id FROM public.profiles WHERE id = auth.uid();
    
    IF v_foundry_id IS NULL THEN
        RAISE EXCEPTION 'User not found or no foundry assigned';
    END IF;
    
    INSERT INTO public.standups (
        user_id, foundry_id, standup_date,
        completed, planned, blockers,
        blocker_tags, blocker_severity, needs_help, mood
    )
    VALUES (
        auth.uid(), v_foundry_id, CURRENT_DATE,
        p_completed, p_planned, p_blockers,
        p_blocker_tags, p_blocker_severity, p_needs_help, p_mood
    )
    ON CONFLICT (user_id, standup_date)
    DO UPDATE SET
        completed = COALESCE(EXCLUDED.completed, standups.completed),
        planned = COALESCE(EXCLUDED.planned, standups.planned),
        blockers = COALESCE(EXCLUDED.blockers, standups.blockers),
        blocker_tags = COALESCE(EXCLUDED.blocker_tags, standups.blocker_tags),
        blocker_severity = COALESCE(EXCLUDED.blocker_severity, standups.blocker_severity),
        needs_help = COALESCE(EXCLUDED.needs_help, standups.needs_help),
        mood = COALESCE(EXCLUDED.mood, standups.mood),
        submitted_at = now()
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_my_today_standup TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_standup TO authenticated;

COMMENT ON TABLE public.standups IS 'Daily async standup responses from team members';
COMMENT ON TABLE public.standup_summaries IS 'AI-generated daily summaries of team standups';
