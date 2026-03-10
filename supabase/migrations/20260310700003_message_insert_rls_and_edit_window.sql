-- SECURITY: Ensure messages can only be inserted by conversation participants
-- This prevents authenticated users from inserting messages into conversations
-- they don't belong to via direct Supabase client calls (optimistic updates).
DO $$
BEGIN
  -- Only create if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'insert_messages_as_participant'
  ) THEN
    CREATE POLICY "insert_messages_as_participant" ON public.messages
      FOR INSERT
      WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM conversation_participants
          WHERE conversation_id = messages.conversation_id
          AND profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Enforce 15-minute edit window at database level
-- Prevents bypassing application-level time check via direct client calls
CREATE OR REPLACE FUNCTION check_message_edit_window()
RETURNS trigger AS $$
BEGIN
  IF OLD.created_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'Messages can only be edited within 15 minutes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only fire when content actually changes (not for is_read, is_deleted, etc.)
DROP TRIGGER IF EXISTS enforce_edit_window ON messages;
CREATE TRIGGER enforce_edit_window
  BEFORE UPDATE OF content ON messages
  FOR EACH ROW
  WHEN (OLD.content IS DISTINCT FROM NEW.content AND NEW.content IS NOT NULL)
  EXECUTE FUNCTION check_message_edit_window();
