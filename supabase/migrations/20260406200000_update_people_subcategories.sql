-- Migration: Update People listing subcategories from role-based to function-based
-- INTENT: Replace meaningless 'Executive'/'Apprentice' subcategories with the person's
-- actual function category (Engineering, Finance, Operations, etc.) derived from their
-- attributes.function_category or role text.
--
-- The function_category attribute is already set on all 29 demo listings from the
-- 20260306100000_reseed_marketplace_people.sql seed migration.
-- Real executive listings from 20260327300000 all have function_category='operations' (default).

-- Step 1: Update listings that have function_category in attributes
-- Map the stored function_category to a proper label
UPDATE marketplace_listings
SET subcategory = CASE
  WHEN (attributes->>'function_category') = 'finance' THEN 'Finance'
  WHEN (attributes->>'function_category') = 'operations' THEN 'Operations'
  WHEN (attributes->>'function_category') = 'engineering' THEN 'Engineering'
  WHEN (attributes->>'function_category') = 'sales' THEN 'Sales'
  WHEN (attributes->>'function_category') = 'marketing' THEN 'Marketing'
  WHEN (attributes->>'function_category') = 'hr' THEN 'HR'
  WHEN (attributes->>'function_category') = 'legal' THEN 'Legal'
  WHEN (attributes->>'function_category') = 'product' THEN 'Product'
  WHEN (attributes->>'function_category') = 'strategy' THEN 'Strategy'
  ELSE 'General'
END
WHERE category = 'People'
  AND (attributes->>'function_category') IS NOT NULL;

-- Step 2: Update remaining People listings that don't have function_category
-- Derive from the role attribute text
UPDATE marketplace_listings
SET subcategory = CASE
  WHEN (attributes->>'role') ILIKE '%cto%' OR (attributes->>'role') ILIKE '%engineer%'
    OR (attributes->>'role') ILIKE '%developer%' OR (attributes->>'role') ILIKE '%architect%'
    THEN 'Engineering'
  WHEN (attributes->>'role') ILIKE '%cfo%' OR (attributes->>'role') ILIKE '%finance%'
    OR (attributes->>'role') ILIKE '%fundrais%'
    THEN 'Finance'
  WHEN (attributes->>'role') ILIKE '%coo%' OR (attributes->>'role') ILIKE '%operations%'
    OR (attributes->>'role') ILIKE '%supply chain%' OR (attributes->>'role') ILIKE '%manufacturing%'
    THEN 'Operations'
  WHEN (attributes->>'role') ILIKE '%sales%' OR (attributes->>'role') ILIKE '%business development%'
    OR (attributes->>'role') ILIKE '%revenue%'
    THEN 'Sales'
  WHEN (attributes->>'role') ILIKE '%marketing%' OR (attributes->>'role') ILIKE '%growth%'
    OR (attributes->>'role') ILIKE '%cmo%' OR (attributes->>'role') ILIKE '%content%'
    THEN 'Marketing'
  WHEN (attributes->>'role') ILIKE '%hr%' OR (attributes->>'role') ILIKE '%people%'
    OR (attributes->>'role') ILIKE '%talent%' OR (attributes->>'role') ILIKE '%chro%'
    THEN 'HR'
  WHEN (attributes->>'role') ILIKE '%legal%' OR (attributes->>'role') ILIKE '%counsel%'
    OR (attributes->>'role') ILIKE '%ip %' OR (attributes->>'role') ILIKE '%attorney%'
    THEN 'Legal'
  WHEN (attributes->>'role') ILIKE '%cpo%' OR (attributes->>'role') ILIKE '%product%'
    OR (attributes->>'role') ILIKE '%ux%' OR (attributes->>'role') ILIKE '%design%'
    THEN 'Product'
  ELSE 'General'
END
WHERE category = 'People'
  AND (attributes->>'function_category') IS NULL
  AND subcategory IN ('Executive', 'Apprentice', 'Fractional Executive', 'Founder');
