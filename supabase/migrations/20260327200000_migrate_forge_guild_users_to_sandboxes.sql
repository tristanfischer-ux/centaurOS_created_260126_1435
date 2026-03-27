-- Migration: Move existing forge-guild users to personal sandbox foundries
-- INTENT: Users in forge-guild share data and appear on each other's Team pages.
-- This migration creates a personal sandbox for each forge-guild user and moves
-- their profile + membership so they are fully isolated.
--
-- DECISION: Only migrate profile/membership/foundry — user-created data in
-- forge-guild is likely minimal (demo data is NOT seeded for guild users).
-- Any orphaned forge-guild rows (from tables with foundry_id) will simply
-- stop being visible since the user's active foundry changes.

DO $$
DECLARE
  user_rec RECORD;
  sandbox_id text;
  first_name text;
  migrated_count int := 0;
BEGIN
  -- Loop through each user whose primary foundry is forge-guild
  FOR user_rec IN
    SELECT p.id as user_id, p.full_name, p.role
    FROM profiles p
    WHERE p.foundry_id = 'forge-guild'
      AND p.id IS NOT NULL
  LOOP
    -- Generate sandbox slug from user ID
    sandbox_id := 'sandbox-' || left(user_rec.user_id::text, 8);
    first_name := split_part(COALESCE(user_rec.full_name, 'My'), ' ', 1);

    -- Skip if sandbox already exists (idempotency)
    IF EXISTS (SELECT 1 FROM foundries WHERE id = sandbox_id) THEN
      RAISE NOTICE 'Sandbox % already exists, skipping user %', sandbox_id, user_rec.user_id;
      CONTINUE;
    END IF;

    -- Create the sandbox foundry
    INSERT INTO foundries (id, name, slug, owner_id, is_sandbox, created_at)
    VALUES (
      sandbox_id,
      first_name || '''s Workspace',
      sandbox_id,
      user_rec.user_id,
      true,
      now()
    );

    -- Create foundry membership
    INSERT INTO foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
    VALUES (user_rec.user_id, sandbox_id, COALESCE(user_rec.role, 'Executive')::member_role, true, now())
    ON CONFLICT (user_id, foundry_id) DO NOTHING;

    -- Update profile to point to the new sandbox
    UPDATE profiles
    SET foundry_id = sandbox_id,
        active_foundry_id = sandbox_id
    WHERE id = user_rec.user_id
      AND foundry_id = 'forge-guild';

    -- Remove old forge-guild membership (they now have their sandbox)
    DELETE FROM foundry_memberships
    WHERE user_id = user_rec.user_id AND foundry_id = 'forge-guild';

    migrated_count := migrated_count + 1;
    RAISE NOTICE 'Migrated user % (%) to sandbox %', user_rec.full_name, user_rec.user_id, sandbox_id;
  END LOOP;

  RAISE NOTICE 'Migration complete: % users moved from forge-guild to personal sandboxes', migrated_count;
END $$;
