-- Fix: Replace old permissive UPDATE policy that allowed any conversation
-- participant to update any message. New policy restricts to sender only.
DROP POLICY IF EXISTS "update_own_messages" ON public.messages;
CREATE POLICY "update_own_messages" ON public.messages
  FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());
