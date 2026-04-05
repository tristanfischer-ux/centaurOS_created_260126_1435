-- ============================================================================
-- SECURITY FIX: Clean up forge-guild cross-contamination
-- ============================================================================
-- Context: Users who signed up without a company were all in 'forge-guild'.
-- Migration 20260327200000 moved most to personal sandboxes, but missed
-- 2 real profiles (Tristan's accounts) and left cross-contaminated AI memory.
-- A tester reported seeing other users' progress data via the AI agent.
--
-- This migration:
-- 1. Moves 2 real profiles to personal sandboxes
-- 2. Purges cross-contaminated AI agent memory for forge-guild
-- 3. Cleans up cross-foundry conversation_participants
-- 4. Keeps all demo data intact
-- ============================================================================

BEGIN;

-- ── 1. Move real profiles to personal sandboxes ──

-- Create sandbox foundries for the 2 real profiles if they don't exist
INSERT INTO foundries (id, name, slug, is_sandbox)
SELECT
    'sandbox-' || substring(p.id::text from 1 for 8),
    COALESCE(split_part(p.full_name, ' ', 1), 'User') || '''s Company',
    'sandbox-' || substring(p.id::text from 1 for 8),
    true
FROM profiles p
WHERE p.email IN ('tristan.fischer@gmail.com', 'tristan.fischer+qatest@gmail.com')
AND p.foundry_id = 'forge-guild'
ON CONFLICT (id) DO NOTHING;

-- Create foundry_memberships for the sandbox foundries
INSERT INTO foundry_memberships (user_id, foundry_id, role, is_primary)
SELECT
    p.id,
    'sandbox-' || substring(p.id::text from 1 for 8),
    'Executive',
    true
FROM profiles p
WHERE p.email IN ('tristan.fischer@gmail.com', 'tristan.fischer+qatest@gmail.com')
AND p.foundry_id = 'forge-guild'
ON CONFLICT DO NOTHING;

-- Update profiles to point to their new sandbox
UPDATE profiles
SET foundry_id = 'sandbox-' || substring(id::text from 1 for 8),
    active_foundry_id = 'sandbox-' || substring(id::text from 1 for 8)
WHERE email IN ('tristan.fischer@gmail.com', 'tristan.fischer+qatest@gmail.com')
AND (foundry_id = 'forge-guild' OR active_foundry_id = 'forge-guild');

-- Remove old forge-guild memberships for these profiles
DELETE FROM foundry_memberships
WHERE foundry_id = 'forge-guild'
AND user_id IN (
    SELECT id FROM profiles
    WHERE email IN ('tristan.fischer@gmail.com', 'tristan.fischer+qatest@gmail.com')
);

-- ── 2. Purge cross-contaminated AI agent memory ──
-- The AI learned about multiple users' progress when they were all in forge-guild.
-- This knowledge MUST be deleted to prevent cross-user data leakage.

DELETE FROM agent_memory_messages WHERE foundry_id = 'forge-guild';
DELETE FROM agent_memory_threads WHERE foundry_id = 'forge-guild';

-- Also purge agent insights if they exist
DELETE FROM agent_insights WHERE foundry_id = 'forge-guild';

-- Purge agent action log (may contain cross-user actions)
DELETE FROM agent_action_log WHERE foundry_id = 'forge-guild';

-- ── 3. Clean up cross-foundry conversation participants ──
-- After sandbox migration, some conversation_participants records still link
-- users from different foundries to the same conversation.

-- Find and delete participants in conversations that span multiple foundries
-- (these are forge-guild-era shared conversations)
DELETE FROM conversation_participants
WHERE conversation_id IN (
    SELECT cp.conversation_id
    FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.profile_id
    GROUP BY cp.conversation_id
    HAVING COUNT(DISTINCT p.foundry_id) > 1
);

-- Delete messages in now-orphaned conversations (no participants left)
DELETE FROM messages
WHERE conversation_id NOT IN (
    SELECT DISTINCT conversation_id FROM conversation_participants
);

-- Delete the orphaned conversations themselves
DELETE FROM conversations
WHERE id NOT IN (
    SELECT DISTINCT conversation_id FROM conversation_participants
);

COMMIT;
