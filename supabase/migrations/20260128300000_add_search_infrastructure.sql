-- Search Infrastructure Migration
-- Creates tables and functions for marketplace search functionality

-- ==========================================
-- 1. SEARCH HISTORY TABLES
-- ==========================================

-- Recent searches table
CREATE TABLE IF NOT EXISTS recent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate recent searches per user
  CONSTRAINT unique_recent_search UNIQUE (user_id, query)
);

CREATE INDEX IF NOT EXISTS idx_recent_searches_user_id 
  ON recent_searches (user_id, created_at DESC);

-- Saved searches table
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT,
  filters JSONB DEFAULT '{}',
  is_alert_enabled BOOLEAN DEFAULT FALSE,
  alert_frequency TEXT CHECK (alert_frequency IN ('daily', 'weekly', 'instant')),
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id 
  ON saved_searches (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_searches_alerts 
  ON saved_searches (is_alert_enabled, alert_frequency) 
  WHERE is_alert_enabled = TRUE;

-- Popular searches table (aggregated)
CREATE TABLE IF NOT EXISTS popular_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL UNIQUE,
  category TEXT,
  search_count INTEGER DEFAULT 1,
  last_searched_at TIMESTAMPTZ DEFAULT NOW(),
  trending BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_popular_searches_count 
  ON popular_searches (search_count DESC);

CREATE INDEX IF NOT EXISTS idx_popular_searches_trending 
  ON popular_searches (trending, search_count DESC) 
  WHERE trending = TRUE;

-- ==========================================
-- 2. PROVIDER PROFILE SEARCH COLUMNS
-- ==========================================

-- Add columns to provider_profiles if they don't exist
DO $$ 
BEGIN
  -- Response metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_profiles' AND column_name = 'response_rate') THEN
    ALTER TABLE provider_profiles ADD COLUMN response_rate NUMERIC(5,2) DEFAULT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_profiles' AND column_name = 'avg_response_time_hours') THEN
    ALTER TABLE provider_profiles ADD COLUMN avg_response_time_hours NUMERIC(6,2) DEFAULT NULL;
  END IF;
  
  -- Completion metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_profiles' AND column_name = 'completion_rate') THEN
    ALTER TABLE provider_profiles ADD COLUMN completion_rate NUMERIC(5,2) DEFAULT NULL;
  END IF;
  
  -- Centaur discount
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_profiles' AND column_name = 'centaur_discount_percent') THEN
    ALTER TABLE provider_profiles ADD COLUMN centaur_discount_percent NUMERIC(5,2) DEFAULT 0;
  END IF;
END $$;

-- ==========================================
-- 3. SEARCH HELPER FUNCTIONS
-- ==========================================

-- Function to increment search count
CREATE OR REPLACE FUNCTION increment_search_count(search_query TEXT)
RETURNS void AS $$
BEGIN
  UPDATE popular_searches
  SET 
    search_count = search_count + 1,
    last_searched_at = NOW()
  WHERE query = search_query;
END;
$$ LANGUAGE plpgsql;

-- Function to update trending searches (call periodically)
CREATE OR REPLACE FUNCTION update_trending_searches()
RETURNS void AS $$
BEGIN
  -- Reset all trending flags
  UPDATE popular_searches SET trending = FALSE;
  
  -- Mark top 20 searches from last 7 days as trending
  UPDATE popular_searches
  SET trending = TRUE
  WHERE id IN (
    SELECT id
    FROM popular_searches
    WHERE last_searched_at > NOW() - INTERVAL '7 days'
    ORDER BY search_count DESC
    LIMIT 20
  );
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 4. FULL-TEXT SEARCH INDEX ON LISTINGS
-- ==========================================

-- Add full-text search column to marketplace_listings if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketplace_listings' AND column_name = 'search_vector') THEN
    ALTER TABLE marketplace_listings ADD COLUMN search_vector tsvector;
  END IF;
END $$;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_search_vector 
  ON marketplace_listings USING GIN (search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_listing_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.subcategory, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update search vector
DROP TRIGGER IF EXISTS trigger_update_listing_search_vector ON marketplace_listings;
CREATE TRIGGER trigger_update_listing_search_vector
  BEFORE INSERT OR UPDATE OF title, description, subcategory
  ON marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_listing_search_vector();

-- Update existing rows
UPDATE marketplace_listings
SET search_vector = 
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(subcategory, '')), 'C')
WHERE search_vector IS NULL;

-- ==========================================
-- 5. SEARCH RANKING MATERIALIZED VIEW
-- ==========================================

-- Create materialized view for optimized search (if provider tables exist)
CREATE MATERIALIZED VIEW IF NOT EXISTS supplier_search_ranking AS
SELECT 
  ml.id AS listing_id,
  pp.id AS provider_id,
  ml.title,
  ml.description,
  ml.category,
  ml.subcategory,
  ml.attributes,
  ml.image_url,
  ml.is_verified,
  ml.created_at AS listing_created_at,
  ml.search_vector,
  
  -- Provider data
  pp.tier,
  pp.is_active,
  pp.day_rate,
  pp.currency,
  pp.response_rate,
  pp.avg_response_time_hours,
  pp.completion_rate,
  pp.centaur_discount_percent,
  pp.created_at AS provider_created_at,
  
  -- Computed tier score
  CASE pp.tier
    WHEN 'verified_partner' THEN 1.0
    WHEN 'approved' THEN 0.7
    WHEN 'pending' THEN 0.4
    ELSE 0.0
  END AS tier_score,
  
  -- Rating data (from reviews table)
  COALESCE(
    (SELECT AVG(rating)::numeric(3,2) FROM reviews WHERE reviewee_id = pp.id),
    0
  ) AS avg_rating,
  COALESCE(
    (SELECT COUNT(*) FROM reviews WHERE reviewee_id = pp.id),
    0
  ) AS total_reviews,
  
  -- Order count
  COALESCE(
    (SELECT COUNT(*) FROM orders WHERE seller_id = pp.id AND status = 'completed'),
    0
  ) AS total_orders

FROM marketplace_listings ml
LEFT JOIN provider_profiles pp ON ml.id = pp.listing_id
WHERE ml.is_verified = TRUE OR pp.is_active = TRUE;

-- Create indexes on materialized view
CREATE INDEX IF NOT EXISTS idx_search_ranking_listing_id 
  ON supplier_search_ranking (listing_id);

CREATE INDEX IF NOT EXISTS idx_search_ranking_provider_id 
  ON supplier_search_ranking (provider_id);

CREATE INDEX IF NOT EXISTS idx_search_ranking_category 
  ON supplier_search_ranking (category);

CREATE INDEX IF NOT EXISTS idx_search_ranking_tier 
  ON supplier_search_ranking (tier);

CREATE INDEX IF NOT EXISTS idx_search_ranking_search_vector 
  ON supplier_search_ranking USING GIN (search_vector);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_search_ranking()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY supplier_search_ranking;
EXCEPTION
  WHEN OTHERS THEN
    -- Fall back to non-concurrent refresh if concurrent fails
    REFRESH MATERIALIZED VIEW supplier_search_ranking;
END;
$$ LANGUAGE plpgsql;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_ranking_unique 
  ON supplier_search_ranking (listing_id, COALESCE(provider_id, '00000000-0000-0000-0000-000000000000'));

-- ==========================================
-- 6. ROW LEVEL SECURITY
-- ==========================================

-- Enable RLS on search tables
ALTER TABLE recent_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- Users can only see their own recent searches
CREATE POLICY "Users can view own recent searches"
  ON recent_searches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recent searches"
  ON recent_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recent searches"
  ON recent_searches FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own recent searches"
  ON recent_searches FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only see their own saved searches
CREATE POLICY "Users can view own saved searches"
  ON saved_searches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved searches"
  ON saved_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved searches"
  ON saved_searches FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own saved searches"
  ON saved_searches FOR UPDATE
  USING (auth.uid() = user_id);

-- Popular searches are readable by all
ALTER TABLE popular_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view popular searches"
  ON popular_searches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert popular searches"
  ON popular_searches FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update popular searches"
  ON popular_searches FOR UPDATE
  TO authenticated
  USING (true);

-- ==========================================
-- 7. INITIAL DATA
-- ==========================================

-- Seed some popular searches
INSERT INTO popular_searches (query, category, search_count, trending) VALUES
  ('AI coding assistant', 'AI', 50, true),
  ('CFO fractional', 'People', 45, true),
  ('CNC machining', 'Products', 40, true),
  ('legal advisor startup', 'Services', 35, true),
  ('automation', 'AI', 30, true),
  ('marketing consultant', 'People', 28, false),
  ('3D printing', 'Products', 25, false),
  ('accounting services', 'Services', 22, false),
  ('product designer', 'People', 20, false),
  ('customer support AI', 'AI', 18, false)
ON CONFLICT (query) DO NOTHING;
