-- Messaging Power Features Migration
-- Adds support for:
-- 1. Message reactions (emoji)
-- 2. Starred/bookmarked messages
-- 3. Pinned messages
-- 4. Thread replies (parent_message_id)
-- 5. User reminders
-- 6. Custom slash commands

-- ============================================
-- 1. Thread Replies
-- ============================================

-- Add parent_message_id for thread replies
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Add reply tracking columns
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0;

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;

-- Index for efficient thread queries
CREATE INDEX IF NOT EXISTS idx_messages_parent 
ON messages(parent_message_id) 
WHERE parent_message_id IS NOT NULL;

-- ============================================
-- 2. Message Reactions
-- ============================================

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,  -- Unicode emoji or :shortcode:
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Index for fetching reactions by message
CREATE INDEX IF NOT EXISTS idx_reactions_message 
ON message_reactions(message_id);

-- Index for user's reactions
CREATE INDEX IF NOT EXISTS idx_reactions_user 
ON message_reactions(user_id);

-- ============================================
-- 3. Starred Messages
-- ============================================

CREATE TABLE IF NOT EXISTS message_stars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Index for user's starred messages
CREATE INDEX IF NOT EXISTS idx_stars_user 
ON message_stars(user_id);

-- ============================================
-- 4. Pinned Messages
-- ============================================

CREATE TABLE IF NOT EXISTS pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  pinned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, conversation_id)
);

-- Index for conversation's pinned messages
CREATE INDEX IF NOT EXISTS idx_pinned_conversation 
ON pinned_messages(conversation_id);

-- ============================================
-- 5. User Reminders
-- ============================================

CREATE TABLE IF NOT EXISTS user_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  foundry_id TEXT REFERENCES foundries(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for pending reminders
CREATE INDEX IF NOT EXISTS idx_reminders_pending 
ON user_reminders(user_id, remind_at) 
WHERE completed_at IS NULL;

-- ============================================
-- 6. Custom Slash Commands
-- ============================================

CREATE TABLE IF NOT EXISTS custom_slash_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT REFERENCES foundries(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  usage TEXT,
  icon TEXT DEFAULT 'terminal',
  action_type TEXT NOT NULL CHECK (action_type IN ('webhook', 'create_task', 'navigate', 'message')),
  action_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  required_roles TEXT[],
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(foundry_id, name)
);

-- Index for fetching commands by foundry
CREATE INDEX IF NOT EXISTS idx_commands_foundry 
ON custom_slash_commands(foundry_id) 
WHERE enabled = true;

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_slash_commands ENABLE ROW LEVEL SECURITY;

-- Message Reactions Policies
CREATE POLICY "Users can view reactions in conversations they participate in"
ON message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id 
    AND cp.profile_id = auth.uid()
  )
);

CREATE POLICY "Users can add their own reactions"
ON message_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reactions"
ON message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Message Stars Policies
CREATE POLICY "Users can view their own stars"
ON message_stars FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can star messages in their conversations"
ON message_stars FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_stars.message_id 
    AND cp.profile_id = auth.uid()
  )
);

CREATE POLICY "Users can unstar their own stars"
ON message_stars FOR DELETE
USING (auth.uid() = user_id);

-- Pinned Messages Policies
CREATE POLICY "Users can view pins in conversations they participate in"
ON pinned_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = pinned_messages.conversation_id 
    AND cp.profile_id = auth.uid()
  )
);

CREATE POLICY "Users can pin messages in their conversations"
ON pinned_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = pinned_messages.conversation_id 
    AND cp.profile_id = auth.uid()
  )
);

CREATE POLICY "Users can unpin messages they pinned or any admin"
ON pinned_messages FOR DELETE
USING (
  pinned_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
    AND p.role = 'Executive'
  )
);

-- User Reminders Policies
CREATE POLICY "Users can view their own reminders"
ON user_reminders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reminders"
ON user_reminders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reminders"
ON user_reminders FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reminders"
ON user_reminders FOR DELETE
USING (auth.uid() = user_id);

-- Custom Slash Commands Policies
CREATE POLICY "Users can view commands in their foundry"
ON custom_slash_commands FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
    AND p.foundry_id = custom_slash_commands.foundry_id
  )
);

CREATE POLICY "Admins can manage commands in their foundry"
ON custom_slash_commands FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
    AND p.foundry_id = custom_slash_commands.foundry_id
    AND p.role = 'Executive'
  )
);

-- ============================================
-- Trigger to update reply count
-- ============================================

CREATE OR REPLACE FUNCTION update_message_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_message_id IS NOT NULL THEN
    UPDATE messages 
    SET reply_count = reply_count + 1,
        last_reply_at = NEW.created_at
    WHERE id = NEW.parent_message_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_message_id IS NOT NULL THEN
    UPDATE messages 
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = OLD.parent_message_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reply_count ON messages;
CREATE TRIGGER trigger_update_reply_count
AFTER INSERT OR DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_message_reply_count();

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE message_reactions IS 'Emoji reactions on messages (like Slack reacji)';
COMMENT ON TABLE message_stars IS 'User-specific starred/bookmarked messages';
COMMENT ON TABLE pinned_messages IS 'Messages pinned to a conversation (visible to all participants)';
COMMENT ON TABLE user_reminders IS 'User reminders created via /remind command';
COMMENT ON TABLE custom_slash_commands IS 'Custom slash commands defined per foundry';
COMMENT ON COLUMN messages.parent_message_id IS 'Parent message ID for threaded replies';
COMMENT ON COLUMN messages.reply_count IS 'Cached count of replies to this message';
COMMENT ON COLUMN messages.last_reply_at IS 'Timestamp of the most recent reply';
