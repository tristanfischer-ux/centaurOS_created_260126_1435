-- Founder-first architecture — Phase 2A
-- Two new opt-in boolean flags on profiles, layered on top of the founder account.
--
--   is_fractional_executive — user has opted in to being listed on the marketplace
--     as available to other companies. When true, the onboarding flow creates their
--     provider_profiles + marketplace_listings row.
--
--   is_supplier — user has opted in to supplying goods/services. When true, the
--     sidebar shows the Supplier Portal section (phase 3) with listing / orders /
--     RFQs / analytics / settings routes.
--
-- Both flags default false. Backfill uses existing signals:
--   - is_fractional_executive = true for any profile with a provider_profiles row
--   - is_supplier = true for any profile whose historical account_type was 'supplier'
--
-- account_type itself is left in place for now; it is still present in the
-- generated types and some query code. It will become redundant once Phase 4
-- rewrites the remaining signup paths.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_fractional_executive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_supplier BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_fractional_executive IS
  'Opt-in flag — user has agreed to be listed as a fractional executive available to other companies on the marketplace.';
COMMENT ON COLUMN profiles.is_supplier IS
  'Opt-in flag — user has agreed to act as a supplier of goods/services. When true, the sidebar reveals the Supplier Portal section.';

-- Backfill is_fractional_executive from existing provider_profiles
-- (provider_profiles.user_id → profiles.id via FK)
UPDATE profiles
SET is_fractional_executive = true
WHERE id IN (SELECT user_id FROM provider_profiles);

-- Backfill is_supplier for any account that was historically a supplier
-- (as of 2026-04-16, all 9 real supplier accounts have already been flipped to
-- team_builder, but we preserve their supplier intent on the flag)
UPDATE profiles
SET is_supplier = true
WHERE account_type = 'supplier';
