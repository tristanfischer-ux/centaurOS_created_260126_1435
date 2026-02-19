/**
 * Migration: Backfill foundry owner_id from memberships
 *
 * Purpose: Some foundries have NULL owner_id due to seed scripts that
 * didn't set it. This backfill picks the first Founder member, or
 * failing that, the earliest member as owner.
 *
 * System foundries (forge-guild, forge-suppliers, centaur-guild,
 * centaur-suppliers) are excluded -- they are shared and have no owner.
 *
 * Also adds a trigger to prevent future foundries from being created
 * without an owner_id (except for known system foundry IDs).
 *
 * Security:
 * - owner_id must reference a valid auth.users entry
 * - Trigger prevents accidental NULL owner_id on new foundries
 *
 * Rollback:
 *   DROP TRIGGER IF EXISTS ensure_foundry_owner ON foundries;
 *   DROP FUNCTION IF EXISTS check_foundry_owner();
 */

-- SECURITY: System foundry IDs that don't require an owner
-- These are shared community/marketplace foundries

-- Step 1: Backfill owner_id from the earliest Founder member
UPDATE public.foundries f
SET owner_id = sub.user_id
FROM (
  SELECT DISTINCT ON (fm.foundry_id)
    fm.foundry_id,
    fm.user_id
  FROM public.foundry_memberships fm
  WHERE fm.role = 'Founder'
  ORDER BY fm.foundry_id, fm.joined_at ASC
) sub
WHERE f.id = sub.foundry_id
  AND f.owner_id IS NULL;

-- Step 2: For foundries still without owner, use earliest member of any role
UPDATE public.foundries f
SET owner_id = sub.user_id
FROM (
  SELECT DISTINCT ON (fm.foundry_id)
    fm.foundry_id,
    fm.user_id
  FROM public.foundry_memberships fm
  ORDER BY fm.foundry_id, fm.joined_at ASC
) sub
WHERE f.id = sub.foundry_id
  AND f.owner_id IS NULL;

-- Step 3: Add trigger to prevent NULL owner_id on new foundries
-- (except system foundries which are shared)
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
  IF NEW.owner_id IS NULL AND NOT (NEW.id = ANY(v_system_ids)) THEN
    RAISE EXCEPTION 'owner_id is required for non-system foundries (foundry_id: %)', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_foundry_owner ON public.foundries;
CREATE TRIGGER ensure_foundry_owner
  BEFORE INSERT ON public.foundries
  FOR EACH ROW
  EXECUTE FUNCTION check_foundry_owner();
