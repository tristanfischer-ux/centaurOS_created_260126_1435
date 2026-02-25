-- Deduplicate marketplace listings and add unique constraint on (title, category).
-- Keeps the earliest row (by created_at) for each duplicate group.
-- Idempotent: if no dupes exist, DELETE removes nothing; CREATE INDEX IF NOT EXISTS is safe.

-- Step 1: Remove duplicates, keeping the earliest row per (title, category)
-- DECISION: Using DISTINCT ON + ORDER BY created_at since id is UUID (no MIN support).
DELETE FROM marketplace_listings
WHERE id NOT IN (
  SELECT DISTINCT ON (title, category) id
  FROM marketplace_listings
  ORDER BY title, category, created_at ASC
);

-- Step 2: Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_title_category
  ON marketplace_listings (title, category);
