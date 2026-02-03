-- Migration: Fix mention notifications to use profiles.foundry_id
-- 
-- Purpose: Fix the foundry_members reference error by using profiles table directly
-- The profiles table has foundry_id column - no need for a join table

-- Drop old function with UUID parameter to avoid duplicate
DROP FUNCTION IF EXISTS extract_mentioned_user_ids(TEXT, UUID);

-- Function to extract mentions from message text (FIXED)
CREATE OR REPLACE FUNCTION extract_mentioned_user_ids(
  message_text TEXT,
  foundry_id_param TEXT  -- Changed from UUID to TEXT to match profiles.foundry_id
)
RETURNS UUID[]
LANGUAGE plpgsql
AS $$
DECLARE
  mentioned_ids UUID[];
  mention_pattern TEXT;
  mention_name TEXT;
  user_id UUID;
BEGIN
  mentioned_ids := ARRAY[]::UUID[];
  
  -- Pattern 1: Match @"Full Name" (quoted names with spaces)
  FOR mention_name IN 
    SELECT regexp_matches[1]
    FROM regexp_matches(message_text, '@"([^"]+)"', 'g')
  LOOP
    -- Find user by full name (case-insensitive) in the same foundry
    SELECT p.id INTO user_id
    FROM profiles p
    WHERE LOWER(p.full_name) = LOWER(mention_name)
      AND p.foundry_id = foundry_id_param
    LIMIT 1;
    
    IF user_id IS NOT NULL AND NOT (user_id = ANY(mentioned_ids)) THEN
      mentioned_ids := array_append(mentioned_ids, user_id);
    END IF;
  END LOOP;
  
  -- Pattern 2: Match @username (single word, backwards compatibility)
  FOR mention_name IN 
    SELECT regexp_matches[1]
    FROM regexp_matches(message_text, '@([a-zA-Z0-9_]+)', 'g')
  LOOP
    -- Skip special mentions
    IF mention_name IN ('here', 'channel', 'everyone') THEN
      CONTINUE;
    END IF;
    
    -- Find user by full name or email prefix (case-insensitive)
    SELECT p.id INTO user_id
    FROM profiles p
    WHERE (
      LOWER(p.full_name) = LOWER(mention_name) OR
      LOWER(split_part(p.email, '@', 1)) = LOWER(mention_name)
    )
      AND p.foundry_id = foundry_id_param
    LIMIT 1;
    
    IF user_id IS NOT NULL AND NOT (user_id = ANY(mentioned_ids)) THEN
      mentioned_ids := array_append(mentioned_ids, user_id);
    END IF;
  END LOOP;
  
  RETURN mentioned_ids;
END;
$$;

-- Trigger function to create mention notifications (FIXED)
CREATE OR REPLACE FUNCTION notify_message_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mentioned_user_ids UUID[];
  mentioned_user_id UUID;
  sender_name TEXT;
  conversation_type TEXT;
  foundry_id_param TEXT;  -- Changed from UUID to TEXT
  message_preview TEXT;
BEGIN
  -- Get sender name and foundry_id directly from profiles
  SELECT full_name, foundry_id INTO sender_name, foundry_id_param
  FROM profiles
  WHERE id = NEW.sender_id;
  
  -- If we couldn't get foundry_id from sender, try conversation participants
  IF foundry_id_param IS NULL THEN
    SELECT p.foundry_id INTO foundry_id_param
    FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.profile_id
    WHERE cp.conversation_id = NEW.conversation_id
    LIMIT 1;
  END IF;
  
  -- If still no foundry_id, skip mention processing
  IF foundry_id_param IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract mentioned user IDs
  mentioned_user_ids := extract_mentioned_user_ids(NEW.content, foundry_id_param);
  
  -- Create truncated preview (first 100 chars)
  message_preview := CASE
    WHEN LENGTH(NEW.content) > 100 THEN LEFT(NEW.content, 97) || '...'
    ELSE NEW.content
  END;
  
  -- Create notification for each mentioned user
  FOREACH mentioned_user_id IN ARRAY mentioned_user_ids
  LOOP
    -- Skip self-mentions
    IF mentioned_user_id = NEW.sender_id THEN
      CONTINUE;
    END IF;
    
    -- Create notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      metadata
    ) VALUES (
      mentioned_user_id,
      'mention',
      sender_name || ' mentioned you',
      message_preview,
      '/inbox',
      jsonb_build_object(
        'message_id', NEW.id,
        'conversation_id', NEW.conversation_id,
        'sender_id', NEW.sender_id,
        'sender_name', sender_name
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Re-create trigger on messages table
DROP TRIGGER IF EXISTS trigger_notify_message_mentions ON messages;
CREATE TRIGGER trigger_notify_message_mentions
  AFTER INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.content IS NOT NULL AND NEW.content LIKE '%@%')
  EXECUTE FUNCTION notify_message_mentions();

COMMENT ON FUNCTION extract_mentioned_user_ids(TEXT, TEXT) IS 'Extracts user IDs from @mentions in message text, supports @"Full Name" and @username formats';
COMMENT ON FUNCTION notify_message_mentions() IS 'Creates notifications when users are mentioned in messages';
