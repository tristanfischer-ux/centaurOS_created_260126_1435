-- INTENT: Create the UKSHI (UK Specialty Herb Index) price tracking system.
-- Creates products table for individual herb/produce items and price_index
-- table for weekly price data at category, grade, and per-product levels.
--
-- Row semantics for price_index:
--   product_id IS NULL, quality_grade IS NULL  → category aggregate
--   product_id IS NULL, quality_grade IS NOT NULL → grade breakdown
--   product_id IS NOT NULL, quality_grade IS NULL → per-product aggregate

-- ─── Products table ───
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- ─── Price Index table ───
CREATE TABLE IF NOT EXISTS price_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  product_category TEXT NOT NULL,
  quality_grade TEXT,
  product_id UUID REFERENCES products(id),
  avg_price_per_kg NUMERIC(10,2) NOT NULL,
  volume_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Functional unique index covering all three row types via COALESCE
-- DECISION: COALESCE converts NULLs to sentinel values so the unique index
-- treats (NULL, NULL) as equal (standard UNIQUE treats NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_index_week_cat_grade_product
  ON price_index (
    week_start,
    product_category,
    COALESCE(quality_grade, '__none__'),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Lookup index for per-product queries
CREATE INDEX IF NOT EXISTS idx_price_index_product_week
  ON price_index (product_id, week_start DESC)
  WHERE product_id IS NOT NULL;

-- Lookup index for category queries
CREATE INDEX IF NOT EXISTS idx_price_index_category_week
  ON price_index (product_category, week_start DESC);
