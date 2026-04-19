-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Forge redesign · PR #1 — Shared primitives
-- B.4 · foundry_memberships additive columns for SHARED-SCHEMA §1.2
--
-- IMPORTANT: SHARED-SCHEMA §1.2 calls this table `memberships`. The existing
-- `foundry_memberships` table IS this entity — do not create a parallel table.
--
-- Existing table (unchanged):
--   id (uuid), user_id, foundry_id, role (member_role enum), invited_by,
--   is_primary, joined_at. Unique (user_id, foundry_id) enforced.
--   Auto-sync trigger profiles_ensure_membership (from migration
--   20260330200000) already creates membership rows when profile.foundry_id
--   is set/changed — no new trigger needed.
--
-- Added columns mandated by SHARED-SCHEMA §1.2:
--   active      : soft-revoke flag. Default true preserves current behaviour.
--   active_at   : last time the user had this foundry active in the switcher.
--   updated_at  : maintained by trigger using public.update_updated_at_column().
--
-- Explicitly NOT in scope (deferred to later PR):
--   - Role enum expansion. Existing member_role values (Founder / Executive /
--     Apprentice / AI_Agent / Supplier, CapitalCase) differ from SHARED-SCHEMA's
--     9 snake_case values. Touching the enum cascades to every consumer and is
--     material refactor work, not Phase 1 PR #1 scope.
--
-- All additive. Existing columns, constraints, triggers, and RLS policies
-- untouched.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.foundry_memberships
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.foundry_memberships
  ADD COLUMN IF NOT EXISTS active_at timestamptz;

ALTER TABLE public.foundry_memberships
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.foundry_memberships.active IS
  'SHARED-SCHEMA §1.2 — soft-revoke flag. False = membership revoked without row delete '
  '(preserves audit). Default true for all existing rows at land.';
COMMENT ON COLUMN public.foundry_memberships.active_at IS
  'SHARED-SCHEMA §1.2 — timestamp of the user''s most recent foundry-switcher '
  'selection of this foundry. Null until the switcher writes it.';
COMMENT ON COLUMN public.foundry_memberships.updated_at IS
  'Maintained by trigger foundry_memberships_set_updated_at.';

-- ── 2. updated_at trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS foundry_memberships_set_updated_at ON public.foundry_memberships;

CREATE TRIGGER foundry_memberships_set_updated_at
  BEFORE UPDATE ON public.foundry_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3. Keep foundries.member_count_cached in sync with active memberships ────

CREATE OR REPLACE FUNCTION public.refresh_foundry_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_foundry_id text;
BEGIN
  -- Recalc the affected foundry's active-member count.
  IF (TG_OP = 'DELETE') THEN
    target_foundry_id := OLD.foundry_id;
  ELSE
    target_foundry_id := NEW.foundry_id;
  END IF;

  UPDATE public.foundries f
  SET member_count_cached = (
    SELECT count(*)::int
    FROM public.foundry_memberships fm
    WHERE fm.foundry_id = target_foundry_id AND fm.active = true
  )
  WHERE f.id = target_foundry_id;

  -- Handle the (rare) case where a membership row moves foundry_id.
  IF (TG_OP = 'UPDATE') AND (OLD.foundry_id IS DISTINCT FROM NEW.foundry_id) THEN
    UPDATE public.foundries f
    SET member_count_cached = (
      SELECT count(*)::int
      FROM public.foundry_memberships fm
      WHERE fm.foundry_id = OLD.foundry_id AND fm.active = true
    )
    WHERE f.id = OLD.foundry_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS foundry_memberships_refresh_count ON public.foundry_memberships;

CREATE TRIGGER foundry_memberships_refresh_count
  AFTER INSERT OR UPDATE OR DELETE ON public.foundry_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_foundry_member_count();

-- ── 4. Seed member_count_cached from active rows (B.2 seeded with all rows; now refine) ─

UPDATE public.foundries f
SET member_count_cached = (
  SELECT count(*)::int
  FROM public.foundry_memberships fm
  WHERE fm.foundry_id = f.id AND fm.active = true
);
