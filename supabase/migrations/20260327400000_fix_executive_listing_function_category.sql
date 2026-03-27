-- Migration: Remove hardcoded function_category from auto-created executive listings
-- INTENT: Real executive marketplace listings were created with function_category
-- hardcoded to "operations" which is wrong for most executives. Remove it so the
-- orbit view doesn't misplace them. They'll set their function via their profile.
-- Seed data listings (Dr. Sarah Chen etc.) have correct categories and no profile_id.

UPDATE marketplace_listings
SET attributes = attributes - 'function_category'
WHERE category = 'People'
  AND subcategory = 'Executive'
  AND attributes->>'function_category' = 'operations'
  AND attributes ? 'profile_id';
