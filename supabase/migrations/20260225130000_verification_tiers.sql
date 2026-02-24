-- Migration: verification_tiers
-- INTENT: Replace the binary is_verified boolean with a three-tier verification system.
-- Tiers: unverified (default), claimed (email confirmed), verified (independently checked).
-- The is_verified column is kept for backward compatibility during rollout.

-- 1. Create the enum type
DO $$ BEGIN
  CREATE TYPE verification_tier AS ENUM ('unverified', 'claimed', 'verified');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add the column with a safe default
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS verification_tier verification_tier NOT NULL DEFAULT 'unverified';

-- 3. Migrate existing data: is_verified = true becomes 'claimed' (NOT 'verified')
-- DECISION: Seeded data was auto-verified, so we downgrade to 'claimed' rather than 'verified'
UPDATE marketplace_listings
  SET verification_tier = 'claimed'
  WHERE is_verified = true AND verification_tier = 'unverified';

-- 4. Index for filtering
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_verification_tier
  ON marketplace_listings (verification_tier);
