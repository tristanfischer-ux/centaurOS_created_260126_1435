-- Remove the 14-day free-tier trial layer.
--
-- Rationale: the "trial" was a hidden bonus layer of paid-tier features given
-- to every new account for 14 days, after which they silently dropped to
-- Explorer. Never advertised, created a stealth downgrade moment. The intended
-- free tier (Explorer) is indefinite with 50 AI assists — that is unchanged.
--
-- This migration:
--   1. Drops the insert trigger that set trial_ends_at = now() + 14 days on
--      every new profile
--   2. Drops the set_trial_end() function
--   3. Clears trial_ends_at on all free-tier profiles (no live trial in effect)
--   4. Keeps the column in place — no destructive schema change; future paid
--      trials (e.g. a deliberate 14-day preview of Seed) can reuse it without
--      a migration
--
-- src/lib/billing/trial.ts is deleted in the same commit — it was unused.

DROP TRIGGER IF EXISTS trg_set_trial_end ON profiles;
DROP FUNCTION IF EXISTS set_trial_end();

UPDATE profiles
SET trial_ends_at = NULL
WHERE tier = 'free';

COMMENT ON COLUMN profiles.trial_ends_at IS
  'Reserved for future paid trial flows. Not in use as of 2026-04-16 — free tier is indefinite.';
