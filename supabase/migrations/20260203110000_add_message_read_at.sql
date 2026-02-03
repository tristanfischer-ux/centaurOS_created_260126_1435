/**
 * Migration: Add read_at timestamp to messages table
 * 
 * Purpose: Track when messages were read to show "seen at" timestamps in UI.
 * Currently only tracks is_read boolean, now adds read_at timestamp for better UX.
 * 
 * Changes:
 * - Add read_at column to messages table
 * - Update existing read messages to have read_at = updated_at (best estimate)
 * - Create index on read_at for efficient queries
 */

-- Add read_at column to messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- For existing messages that are marked as read, set read_at to created_at
-- (we don't have the actual read time, so this is our best estimate)
UPDATE public.messages
SET read_at = created_at
WHERE is_read = true AND read_at IS NULL;

-- Create index for querying by read status
CREATE INDEX IF NOT EXISTS idx_messages_read_at 
ON public.messages(conversation_id, read_at) 
WHERE read_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.messages.read_at IS 'Timestamp when the message was marked as read. NULL means unread.';
