-- Typing indicators: add typing state to presence table
ALTER TABLE presence
  ADD COLUMN IF NOT EXISTS typing_in_conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS typing_since timestamptz;

CREATE INDEX IF NOT EXISTS idx_presence_typing
  ON presence(typing_in_conversation_id)
  WHERE typing_in_conversation_id IS NOT NULL;
