-- ============================================================================
-- FIX: Infinite Recursion in conversations RLS Policy
-- ============================================================================
--
-- Problem: The policy "Users can view conversations they participate in" 
-- creates a circular reference:
--   1. conversations SELECT policy references conversation_participants
--   2. conversation_participants INSERT policy references conversations
--   3. When inserting a conversation with a trigger that adds participants,
--      infinite recursion occurs.
--
-- Solution: Create a SECURITY DEFINER function to check participation that
-- bypasses RLS, then use that in the policy.
-- ============================================================================

-- 1. Create a SECURITY DEFINER function to check if user is a conversation participant
-- This bypasses RLS to avoid the circular reference
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = conv_id 
        AND cp.profile_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;

-- 2. Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;

-- 3. Also drop conflicting policies from other migrations
DROP POLICY IF EXISTS "view_own_conversations" ON public.conversations;

-- 4. Create a single, non-recursive SELECT policy using the helper function
CREATE POLICY "Users can view their conversations"
    ON public.conversations
    FOR SELECT
    USING (
        -- Direct ownership (buyer/seller for marketplace)
        buyer_id = auth.uid()
        OR seller_id = auth.uid()
        -- Creator access
        OR creator_id = auth.uid()
        -- Participant-based access via SECURITY DEFINER function (avoids RLS recursion)
        OR is_conversation_participant(id)
    );

-- 5. Also fix the conversation_participants INSERT policy to avoid referencing conversations SELECT
DROP POLICY IF EXISTS "Users can be added to conversations" ON public.conversation_participants;

CREATE POLICY "Users can be added to conversations"
    ON public.conversation_participants
    FOR INSERT
    WITH CHECK (
        -- Users can add themselves
        profile_id = auth.uid()
        -- Or check creator/buyer via SECURITY DEFINER function
        OR EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id 
            AND (
                c.creator_id = auth.uid() 
                OR c.buyer_id = auth.uid()
                OR c.seller_id = auth.uid()
            )
        )
    );

-- 6. Ensure the messages policy also doesn't cause recursion
DROP POLICY IF EXISTS "view_conversation_messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;

CREATE POLICY "Users can view messages in their conversations"
    ON public.messages
    FOR SELECT
    USING (
        -- Direct ownership check (sender)
        sender_id = auth.uid()
        -- Or use the safe participant function
        OR is_conversation_participant(conversation_id)
        -- Or direct conversation ownership
        OR EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
            AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid() OR c.creator_id = auth.uid())
        )
    );

-- 7. Ensure INSERT policy for conversations doesn't cause issues
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "create_conversations" ON public.conversations;

CREATE POLICY "Users can create conversations"
    ON public.conversations
    FOR INSERT
    WITH CHECK (
        -- User must be buyer, seller, or creator
        buyer_id = auth.uid()
        OR seller_id = auth.uid()
        OR creator_id = auth.uid()
    );

-- 8. Verify the fix
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'conversations' 
        AND policyname = 'Users can view their conversations'
    ) THEN
        RAISE EXCEPTION 'Failed to create RLS policy for conversations';
    END IF;
    
    RAISE NOTICE 'Conversations RLS recursion fix applied successfully';
END $$;
