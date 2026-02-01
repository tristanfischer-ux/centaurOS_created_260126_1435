-- ============================================================================
-- MESSAGING ENHANCEMENT MIGRATION
-- Extends the messaging system to support Slack-style communication
-- ============================================================================

-- 1. Create conversation_type enum
DO $$ BEGIN
    CREATE TYPE conversation_type AS ENUM (
        'direct',      -- 1:1 DM between any users
        'task',        -- Discussion about a specific task
        'objective',   -- Discussion about an objective
        'expert',      -- Consultation with marketplace expert
        'marketplace'  -- Existing buyer/seller (backward compatible)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add new columns to conversations table
ALTER TABLE public.conversations 
    ADD COLUMN IF NOT EXISTS conversation_type conversation_type DEFAULT 'marketplace',
    ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Create conversation_participants table for flexible participant management
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    is_muted BOOLEAN DEFAULT FALSE,
    UNIQUE(conversation_id, profile_id)
);

-- 4. Create indexes for conversation_participants
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation 
    ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile 
    ON public.conversation_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_last_read 
    ON public.conversation_participants(last_read_at);

-- 5. Create indexes for new conversation columns
CREATE INDEX IF NOT EXISTS idx_conversations_type 
    ON public.conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_conversations_task 
    ON public.conversations(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_objective 
    ON public.conversations(objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_creator 
    ON public.conversations(creator_id);

-- 6. Enable RLS on conversation_participants
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for conversation_participants

-- Users can view their own participation records
DROP POLICY IF EXISTS "Users can view own participation" ON public.conversation_participants;
CREATE POLICY "Users can view own participation"
    ON public.conversation_participants
    FOR SELECT
    USING (profile_id = auth.uid());

-- Users can view participants of conversations they're in
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;
CREATE POLICY "Users can view participants of their conversations"
    ON public.conversation_participants
    FOR SELECT
    USING (
        conversation_id IN (
            SELECT conversation_id 
            FROM public.conversation_participants 
            WHERE profile_id = auth.uid()
        )
    );

-- Users can join conversations they're invited to (insert)
DROP POLICY IF EXISTS "Users can be added to conversations" ON public.conversation_participants;
CREATE POLICY "Users can be added to conversations"
    ON public.conversation_participants
    FOR INSERT
    WITH CHECK (
        -- Either adding themselves or conversation creator is adding them
        profile_id = auth.uid() 
        OR EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id 
            AND (c.creator_id = auth.uid() OR c.buyer_id = auth.uid())
        )
    );

-- Users can update their own participation (mute, last_read_at)
DROP POLICY IF EXISTS "Users can update own participation" ON public.conversation_participants;
CREATE POLICY "Users can update own participation"
    ON public.conversation_participants
    FOR UPDATE
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

-- Users can leave conversations (delete their own participation)
DROP POLICY IF EXISTS "Users can leave conversations" ON public.conversation_participants;
CREATE POLICY "Users can leave conversations"
    ON public.conversation_participants
    FOR DELETE
    USING (profile_id = auth.uid());

-- 8. Update conversations RLS to include participant-based access

-- Drop existing SELECT policy if it exists and recreate
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;

CREATE POLICY "Users can view conversations they participate in"
    ON public.conversations
    FOR SELECT
    USING (
        -- Original buyer/seller access (backward compat)
        buyer_id = auth.uid()
        OR seller_id = auth.uid()
        -- Creator access
        OR creator_id = auth.uid()
        -- Participant-based access
        OR id IN (
            SELECT conversation_id 
            FROM public.conversation_participants 
            WHERE profile_id = auth.uid()
        )
    );

-- Update INSERT policy to allow new conversation types
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

CREATE POLICY "Users can create conversations"
    ON public.conversations
    FOR INSERT
    WITH CHECK (
        -- User must be buyer, seller, or creator
        buyer_id = auth.uid()
        OR seller_id = auth.uid()
        OR creator_id = auth.uid()
    );

-- 9. Function to auto-add creator as participant
CREATE OR REPLACE FUNCTION auto_add_conversation_creator()
RETURNS TRIGGER AS $$
BEGIN
    -- Add creator as participant if creator_id is set
    IF NEW.creator_id IS NOT NULL THEN
        INSERT INTO public.conversation_participants (conversation_id, profile_id, last_read_at)
        VALUES (NEW.id, NEW.creator_id, NOW())
        ON CONFLICT (conversation_id, profile_id) DO NOTHING;
    END IF;
    
    -- For backward compat, also add buyer and seller as participants
    IF NEW.buyer_id IS NOT NULL THEN
        INSERT INTO public.conversation_participants (conversation_id, profile_id, last_read_at)
        VALUES (NEW.id, NEW.buyer_id, NOW())
        ON CONFLICT (conversation_id, profile_id) DO NOTHING;
    END IF;
    
    IF NEW.seller_id IS NOT NULL THEN
        INSERT INTO public.conversation_participants (conversation_id, profile_id)
        VALUES (NEW.id, NEW.seller_id)
        ON CONFLICT (conversation_id, profile_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-adding participants
DROP TRIGGER IF EXISTS auto_add_conversation_creator_trigger ON public.conversations;
CREATE TRIGGER auto_add_conversation_creator_trigger
    AFTER INSERT ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_conversation_creator();

-- 10. Function to get unread count for a user
CREATE OR REPLACE FUNCTION get_unread_message_count(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    unread_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO unread_count
    FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE cp.profile_id = user_id
    AND m.sender_id != user_id
    AND (
        cp.last_read_at IS NULL 
        OR m.created_at > cp.last_read_at
    );
    
    RETURN COALESCE(unread_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Function to mark conversation as read
CREATE OR REPLACE FUNCTION mark_conversation_read(conv_id UUID, user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.conversation_participants
    SET last_read_at = NOW()
    WHERE conversation_id = conv_id
    AND profile_id = user_id;
    
    -- Also mark individual messages as read (for backward compat)
    UPDATE public.messages
    SET is_read = TRUE
    WHERE conversation_id = conv_id
    AND sender_id != user_id
    AND is_read = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Enable realtime for conversation_participants (idempotent)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 13. Backfill existing conversations with participants
-- Add existing buyer/seller pairs to conversation_participants
INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at)
SELECT c.id, c.buyer_id, c.created_at
FROM public.conversations c
WHERE c.buyer_id IS NOT NULL
ON CONFLICT (conversation_id, profile_id) DO NOTHING;

INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at)
SELECT c.id, c.seller_id, c.created_at
FROM public.conversations c
WHERE c.seller_id IS NOT NULL
ON CONFLICT (conversation_id, profile_id) DO NOTHING;

-- 14. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_message_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_conversation_read(UUID, UUID) TO authenticated;
