-- =============================================================================
-- Referral System Hardening (Red Team Fixes)
-- Atomic referral_count increment + duplicate referral guard
-- =============================================================================

-- 1. Atomic increment for referral_count (prevents read-then-write race)
CREATE OR REPLACE FUNCTION increment_referral_count(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles
  SET referral_count = COALESCE(referral_count, 0) + 1
  WHERE id = p_user_id;
$$;

-- 2. Unique constraint: a user can only be referred once
-- (referred_by is already a single column, but ensure no double credit grants)
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_credits_unique_received
  ON referral_credits (granted_to, reason)
  WHERE reason = 'referral_received';

-- 3. Unique constraint: founding member credit granted once per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_credits_unique_founding
  ON referral_credits (granted_to, reason)
  WHERE reason = 'founding_member';
