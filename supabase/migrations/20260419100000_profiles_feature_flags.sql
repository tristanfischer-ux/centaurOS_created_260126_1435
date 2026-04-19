-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Forge redesign · PR #1 — Shared primitives
-- B.1 · profiles.feature_flags
--
-- Adds a JSONB column to `profiles` for per-user feature gating. Used by the
-- Phase 1 flag `new_forge_experience` (gates sidebar Forge nav target between
-- /the-forge and /the-forge-v2) and by later phases (`new_products_experience`,
-- `new_plan_experience`, `new_money_experience`).
--
-- Follows the same NOT NULL DEFAULT '{}' pattern as the existing
-- `profiles.onboarding_data` column.
--
-- Rollback: DROP COLUMN feature_flags — safe, read paths evaluate absent keys
-- as "flag off".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.feature_flags IS
  'Per-user feature-flag bag. Keys evaluated by src/lib/features/flags.ts. '
  'Absent key = flag off. Phase 1: new_forge_experience. '
  'Future phases: new_products_experience, new_plan_experience, new_money_experience.';
