/**
 * Migration: Add is_demo flag to marketplace_listings
 * 
 * Purpose: Distinguish demo/sample marketplace data from real user-created
 * listings during the trial period. All existing listings are marked as demo
 * since they were seeded before real users signed up.
 * 
 * Rollback: ALTER TABLE marketplace_listings DROP COLUMN IF EXISTS is_demo;
 */

-- Add is_demo column with default false (new listings from real users are not demo)
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Mark ALL existing listings as demo (they pre-date real trial users)
UPDATE marketplace_listings SET is_demo = true WHERE is_demo = false;

-- Index for filtering demo vs real listings
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_is_demo
  ON marketplace_listings (is_demo);

COMMENT ON COLUMN marketplace_listings.is_demo IS 
  'Whether this listing is demo/sample data. True for seed data, false for real user-created listings.';
