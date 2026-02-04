-- Migration: Add message_id column to task_comments for bidirectional linking
-- Purpose: Enable reliable duplicate detection and proper message-comment relationships

-- Add message_id foreign key column
ALTER TABLE task_comments
ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id) ON DELETE CASCADE;

-- Add flag to identify synced comments
ALTER TABLE task_comments
ADD COLUMN IF NOT EXISTS synced_from_message BOOLEAN DEFAULT false;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_task_comments_message_id ON task_comments(message_id)
WHERE message_id IS NOT NULL;

-- Update existing synced comments (those with the sync marker in content)
UPDATE task_comments
SET synced_from_message = true
WHERE content LIKE '%[Synced from conversation - Message ID:%'
AND synced_from_message = false;

-- Add comment for documentation
COMMENT ON COLUMN task_comments.message_id IS 'Foreign key to messages table for comments synced from conversations';
COMMENT ON COLUMN task_comments.synced_from_message IS 'Flag indicating this comment was created from a message';
