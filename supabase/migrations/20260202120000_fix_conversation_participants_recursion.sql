-- ============================================================================
-- FIX: Infinite Recursion in conversation_participants RLS Policy
-- ============================================================================
--
-- Problem: The policy "Users can view participants of their conversations"
-- creates a circular reference by querying conversation_participants within
-- a policy defined ON conversation_participants.
--
-- Solution: Combine the two SELECT policies into one that checks both:
-- 1. User viewing their own participation record
-- 2. User viewing other participants in conversations they're in
-- 
-- We check the conversations table directly to avoid the circular reference.
-- ============================================================================

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view own participation" ON public.conversation_participants;

-- Create a single, non-recursive SELECT policy
-- CRITICAL: Do NOT reference conversation_participants in the USING clause to avoid recursion
CREATE POLICY "Users can view conversation participants"
    ON public.conversation_participants
    FOR SELECT
    USING (
        -- Can view own participation record
        profile_id = auth.uid()
        -- Can view other participants if you're a participant/creator/buyer/seller of the conversation
        -- Check via conversations table ONLY (no subquery on conversation_participants)
        OR EXISTS (
            SELECT 1 
            FROM public.conversations c
            WHERE c.id = conversation_participants.conversation_id
            AND (
                -- Legacy buyer/seller access
                c.buyer_id = auth.uid()
                OR c.seller_id = auth.uid()
                -- Creator access
                OR c.creator_id = auth.uid()
            )
        )
    );

-- Verify the policy was created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'conversation_participants' 
        AND policyname = 'Users can view conversation participants'
    ) THEN
        RAISE EXCEPTION 'Failed to create RLS policy';
    END IF;
    
    RAISE NOTICE 'RLS policy "Users can view conversation participants" created successfully';
END $$;
