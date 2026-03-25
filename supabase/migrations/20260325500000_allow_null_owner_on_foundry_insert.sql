/**
 * Migration: Allow NULL owner_id on foundry INSERT
 *
 * The check_foundry_owner trigger blocked NULL owner_id for non-system foundries.
 * This created a circular FK dependency during founder signup:
 *   - profiles.foundry_id → foundries.id (profile needs foundry)
 *   - foundries.owner_id → profiles.id (foundry needs profile)
 *
 * Fix: Allow NULL on INSERT. The owner_id is set immediately after profile creation
 * in setupNewUser(). The trigger now only enforces on UPDATE (owner_id must be set
 * before any subsequent foundry modifications).
 */

CREATE OR REPLACE FUNCTION check_foundry_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_system_ids TEXT[] := ARRAY[
    'forge-guild', 'forge-suppliers',
    'centaur-guild', 'centaur-suppliers'
  ];
BEGIN
  -- Allow NULL owner on INSERT (founder signup creates foundry before profile)
  -- Enforce on UPDATE — owner must be set before modifying foundry
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NULL AND NOT (NEW.id = ANY(v_system_ids)) THEN
    RAISE EXCEPTION 'owner_id is required for non-system foundries (foundry_id: %)', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
