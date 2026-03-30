-- Migration: Fix BUG-001 — time_entries (and other) RLS failures
-- for users missing foundry_memberships rows.
--
-- Problem: Users assigned to a foundry via profiles.foundry_id may not
-- have a corresponding foundry_memberships row, causing INSERT RLS
-- policies (which check foundry_memberships) to fail silently.
--
-- Fix:
--   1. Backfill missing foundry_memberships for ALL profiles
--   2. Add trigger to auto-create membership on profile foundry_id change

-- ── 1. Backfill missing memberships ───────────────────────────────────

INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
SELECT
    p.id,
    p.foundry_id,
    COALESCE(p.role::public.member_role, 'Apprentice'::public.member_role),
    true,
    COALESCE(p.created_at, now())
FROM public.profiles p
WHERE p.foundry_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.foundry_memberships fm
    WHERE fm.user_id = p.id AND fm.foundry_id = p.foundry_id
  )
ON CONFLICT (user_id, foundry_id) DO NOTHING;

-- ── 2. Auto-create membership when profile.foundry_id changes ─────────

CREATE OR REPLACE FUNCTION public.ensure_foundry_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- INTENT: When a user's foundry_id is set or changed, ensure they have
  -- a matching foundry_memberships row so RLS policies work.
  IF NEW.foundry_id IS NOT NULL
     AND (OLD.foundry_id IS NULL OR NEW.foundry_id != OLD.foundry_id)
  THEN
    INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
    VALUES (
      NEW.id,
      NEW.foundry_id,
      COALESCE(NEW.role::public.member_role, 'Apprentice'::public.member_role),
      true,
      now()
    )
    ON CONFLICT (user_id, foundry_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS profiles_ensure_membership ON public.profiles;

CREATE TRIGGER profiles_ensure_membership
  AFTER INSERT OR UPDATE OF foundry_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_foundry_membership();

COMMENT ON FUNCTION public.ensure_foundry_membership() IS
  'Auto-creates foundry_memberships row when profile.foundry_id is set/changed, '
  'ensuring RLS policies that check foundry_memberships always work.';
