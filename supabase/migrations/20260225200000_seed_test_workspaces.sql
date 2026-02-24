-- Migration: Seed test workspaces for multi-company testing
-- Creates three foundries (Matter Machine, History Future Now, Fractional Forge dev)
-- and links them to the primary Founder account via foundry_memberships.

DO $$
DECLARE
  v_user_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- INTENT: Find the primary Founder user to attach these workspaces to.
  -- This looks for the first Founder with a team_builder account.
  SELECT p.id INTO v_user_id
  FROM profiles p
  WHERE p.role = 'Founder'
    AND p.account_type = 'team_builder'
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Could not find a Founder user to create workspaces for';
  END IF;

  -- Create the three foundries (idempotent)
  INSERT INTO foundries (id, name, slug, owner_id, industry, stage, created_at)
  VALUES
    ('matter-machine', 'Matter Machine', 'matter-machine', v_user_id, 'Deep Tech', 'Seed', v_now),
    ('history-future-now', 'History Future Now', 'history-future-now', v_user_id, 'Media & Culture', 'Pre-Seed', v_now),
    ('fractional-forge-dev', 'Fractional Forge', 'fractional-forge-dev', v_user_id, 'SaaS', 'Growth', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- Create memberships linking the user to all three foundries
  INSERT INTO foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES
    (v_user_id, 'matter-machine', 'Founder', false, v_now),
    (v_user_id, 'history-future-now', 'Founder', false, v_now),
    (v_user_id, 'fractional-forge-dev', 'Founder', false, v_now)
  ON CONFLICT (user_id, foundry_id) DO NOTHING;

  RAISE NOTICE 'Created 3 test workspaces for user %', v_user_id;
END;
$$;
