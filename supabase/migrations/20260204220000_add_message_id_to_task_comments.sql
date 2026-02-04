-- Migration: Add message tracking to task_comments for reliable sync
-- This allows us to track which comments came from messages and prevent duplicates

ALTER TABLE task_comments
ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS synced_from_message BOOLEAN DEFAULT false;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_task_comments_message_id ON task_comments(message_id);

COMMENT ON COLUMN task_comments.message_id IS 
  'Reference to source message if comment was synced from messaging';
COMMENT ON COLUMN task_comments.synced_from_message IS 
  'True if this comment was auto-created from a message';
