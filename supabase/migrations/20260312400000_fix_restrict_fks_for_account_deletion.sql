-- Fix RESTRICT foreign keys that block account deletion (deleteUser cascade to profiles).
--
-- PROBLEM: Several columns reference profiles(id) with NOT NULL + no ON DELETE clause
-- (PostgreSQL default = RESTRICT). When auth.users is deleted, the cascade to profiles
-- is blocked by these RESTRICT constraints, causing a FK violation.
--
-- FIX: Make columns nullable + change FK to ON DELETE SET NULL.
-- This preserves the data (tasks, objectives, comments stay) while allowing the
-- user's profile to be deleted. UI should show "[Deleted user]" for null authors.
--
-- SECURITY: These are non-sensitive reference columns (who created/wrote something).
-- The actual data belongs to the foundry, not the user, so it should persist.

-- 1. tasks.creator_id — preserves tasks when creator is deleted
ALTER TABLE tasks ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_creator_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. objectives.creator_id — preserves objectives when creator is deleted
ALTER TABLE objectives ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE objectives DROP CONSTRAINT IF EXISTS objectives_creator_id_fkey;
ALTER TABLE objectives ADD CONSTRAINT objectives_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. task_comments.user_id — preserves comments when author is deleted
ALTER TABLE task_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE task_comments DROP CONSTRAINT IF EXISTS task_comments_user_id_fkey;
ALTER TABLE task_comments ADD CONSTRAINT task_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 4. objective_comments.user_id — preserves comments when author is deleted
ALTER TABLE objective_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE objective_comments DROP CONSTRAINT IF EXISTS objective_comments_user_id_fkey;
ALTER TABLE objective_comments ADD CONSTRAINT objective_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 5. guild_events.created_by — already nullable, just needs ON DELETE SET NULL
ALTER TABLE guild_events DROP CONSTRAINT IF EXISTS guild_events_created_by_fkey;
ALTER TABLE guild_events ADD CONSTRAINT guild_events_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 6. foundry_memberships.invited_by — already nullable, just needs ON DELETE SET NULL
ALTER TABLE foundry_memberships DROP CONSTRAINT IF EXISTS foundry_memberships_invited_by_fkey;
ALTER TABLE foundry_memberships ADD CONSTRAINT foundry_memberships_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 7. manufacturing_rfqs.created_by — already nullable, add ON DELETE SET NULL
--    (was being cleaned manually; this makes the cascade automatic)
ALTER TABLE manufacturing_rfqs DROP CONSTRAINT IF EXISTS manufacturing_rfqs_created_by_fkey;
ALTER TABLE manufacturing_rfqs ADD CONSTRAINT manufacturing_rfqs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 8. profiles.paired_ai_id — already nullable, add ON DELETE SET NULL
--    (was being cleaned manually; this makes the cascade automatic)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_paired_ai_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_paired_ai_id_fkey
  FOREIGN KEY (paired_ai_id) REFERENCES profiles(id) ON DELETE SET NULL;
