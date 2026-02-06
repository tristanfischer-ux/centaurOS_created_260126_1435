/**
 * Migration: Remove AI category from marketplace
 * 
 * Purpose: AI Tools are now handled by the dedicated Agents feature.
 * The AI category in the marketplace is redundant and should be removed.
 * 
 * Changes:
 * 1. Delete all marketplace listings with category = 'AI'
 * 2. Delete saved listings referencing AI listings
 * 3. Delete recommendations with category = 'AI'
 * 4. Remove 'AI' value from marketplace_category enum
 * 
 * Rollback: Would require re-adding 'AI' to enum and re-seeding data
 */

-- Step 1: Delete saved listings that reference AI marketplace listings
DELETE FROM saved_marketplace_listings
WHERE listing_id IN (
    SELECT id FROM marketplace_listings WHERE category = 'AI'
);

-- Step 2: Delete marketplace recommendations with AI category
DELETE FROM marketplace_recommendations
WHERE category = 'AI';

-- Step 3: Delete AI marketplace listings
DELETE FROM marketplace_listings
WHERE category = 'AI';

-- Step 4: Remove 'AI' from the marketplace_category enum
-- PostgreSQL doesn't support DROP VALUE from enum directly,
-- so we need to recreate the enum
ALTER TYPE marketplace_category RENAME TO marketplace_category_old;

CREATE TYPE marketplace_category AS ENUM ('People', 'Products', 'Services');

-- Update columns to use new enum
ALTER TABLE marketplace_listings 
    ALTER COLUMN category TYPE marketplace_category 
    USING category::text::marketplace_category;

ALTER TABLE marketplace_recommendations 
    ALTER COLUMN category TYPE marketplace_category 
    USING category::text::marketplace_category;

-- Drop old enum
DROP TYPE marketplace_category_old;

-- Step 5: Update the CHECK constraint on marketplace_recommendations
-- Drop old constraint if it exists and recreate without 'AI'
DO $$
BEGIN
    -- Try to drop the old check constraint (may have different names)
    BEGIN
        ALTER TABLE marketplace_recommendations DROP CONSTRAINT IF EXISTS marketplace_recommendations_category_check;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignore if doesn't exist
    END;
END $$;
