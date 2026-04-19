-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Forge redesign · PR #1 — Shared primitives
-- B.2 · foundries additive columns for SHARED-SCHEMA §1.1
--
-- `foundries` already exists with richer domain columns (owner_id, slug, stage,
-- industry, sector, company_intel, company_profile, purpose_data, report_*).
-- This migration adds ONLY the columns SHARED-SCHEMA mandates and that are
-- currently missing:
--
--   - tier                  : foundry-level plan tier (separate from profiles.tier
--                              which is user-level). Nullable until UI wires it.
--   - member_count_cached   : denormalised count of active foundry_memberships;
--                              updated by trigger on foundry_memberships.
--   - updated_at            : standard timestamp; maintained by trigger using
--                              the existing public.update_updated_at_column().
--
-- All additive. No existing columns touched.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.foundries
  ADD COLUMN IF NOT EXISTS tier text
    CHECK (tier IS NULL OR tier IN ('free', 'explorer', 'starter', 'pro', 'enterprise'));

ALTER TABLE public.foundries
  ADD COLUMN IF NOT EXISTS member_count_cached integer NOT NULL DEFAULT 0;

ALTER TABLE public.foundries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.foundries.tier IS
  'Foundry-level plan tier per SHARED-SCHEMA §1.1. '
  'Null until a billing wire-up is in place; distinct from profiles.tier (user-level).';
COMMENT ON COLUMN public.foundries.member_count_cached IS
  'Denormalised count of active foundry_memberships. Maintained by trigger '
  'after B.4 adds foundry_memberships.active.';
COMMENT ON COLUMN public.foundries.updated_at IS
  'Maintained by trigger foundries_set_updated_at using public.update_updated_at_column().';

-- ── 2. updated_at trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS foundries_set_updated_at ON public.foundries;

CREATE TRIGGER foundries_set_updated_at
  BEFORE UPDATE ON public.foundries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3. Backfill member_count_cached ──────────────────────────────────────────
-- Count existing foundry_memberships. `active` column doesn't exist yet
-- (added in B.4); for now count all rows (effectively all active at PR #1 land).
-- B.4 will refresh the count to only count active=true rows.

UPDATE public.foundries f
SET member_count_cached = (
  SELECT count(*)::int
  FROM public.foundry_memberships fm
  WHERE fm.foundry_id = f.id
);
