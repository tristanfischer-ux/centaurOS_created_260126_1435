-- Fix: is_verified defaults to true, causing all imported companies to appear verified.
-- Reset all existing listings to unverified and change the default to false.

ALTER TABLE marketplace_listings ALTER COLUMN is_verified SET DEFAULT false;

UPDATE marketplace_listings SET is_verified = false WHERE is_verified = true;
