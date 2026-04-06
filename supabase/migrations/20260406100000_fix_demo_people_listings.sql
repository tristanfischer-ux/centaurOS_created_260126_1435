-- Migration: Fix is_demo flag on seeded People listings
-- INTENT: The 29 seed People listings from 20260306100000_reseed_marketplace_people.sql
-- were inserted WITHOUT is_demo=true. This means they mix with real user listings
-- on the Recruits page with no distinction.
--
-- Real executive listings (created by 20260327300000) have attributes->>'profile_id' set.
-- Seed data does NOT have profile_id in attributes. This is the reliable differentiator.

UPDATE marketplace_listings
SET is_demo = true
WHERE category = 'People'
  AND is_demo IS NOT TRUE
  AND (attributes->>'profile_id') IS NULL;
