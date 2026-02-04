-- Migration: Add message_id to task_comments for bidirectional linking
-- This enables reliable duplicate detection and proper message-comment linking

ALTER TABLE task_comments
ADD COLUMN message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
ADD COLUMN synced_from_message BOOLEAN DEFAULT false;

CREATE INDEX idx_task_comments_message_id ON task_comments(message_id);

COMMENT ON COLUMN task_comments.message_id IS 'Foreign key to messages table for synced comments';
COMMENT ON COLUMN task_comments.synced_from_message IS 'True if comment was created from a message';
