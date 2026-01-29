/**
 * Materialized Views for Search Optimization
 * 
 * These SQL definitions create pre-computed search indices for fast marketplace search.
 * The materialized view combines listing, provider, and rating data with full-text search vectors.
 */

// ==========================================
// MATERIALIZED VIEW SQL
// ==========================================

/**
 * SQL to create the supplier_search_ranking materialized view
 */
export const CREATE_SEARCH_RANKING_VIEW = `
-- Create materialized view for optimized marketplace search
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
  
  -- Provider data
  pp.tier,
  pp.is_active,
  pp.day_rate,
  pp.currency,
  pp.timezone,
  pp.headline AS provider_headline,
  pp.bio AS provider_bio,
  pp.centaur_discount_percent,
  pp.stripe_onboarding_complete,
  
  -- Computed scores
  CASE pp.tier
    WHEN 'premium' THEN 1.0
    WHEN 'verified' THEN 0.7
    WHEN 'standard' THEN 0.4
    ELSE 0.0
  END AS tier_score,
  
  -- Rating data (from provider_reviews)
  COALESCE(pr.avg_rating, 0) AS avg_rating,
  COALESCE(pr.total_reviews, 0) AS total_reviews,
  CASE 
    WHEN pr.total_reviews >= 50 THEN 1.0
    WHEN pr.total_reviews >= 20 THEN 0.8
    WHEN pr.total_reviews >= 10 THEN 0.6
    WHEN pr.total_reviews >= 5 THEN 0.4
    WHEN pr.total_reviews >= 1 THEN 0.2
    ELSE 0.0
  END AS rating_score,
  
  -- Response metrics
  pp.avg_response_time_hours,
  pp.response_rate,
  CASE 
    WHEN pp.response_rate >= 95 THEN 1.0
    WHEN pp.response_rate >= 90 THEN 0.9
    WHEN pp.response_rate >= 80 THEN 0.7
    WHEN pp.response_rate >= 70 THEN 0.5
    WHEN pp.response_rate >= 50 THEN 0.3
    ELSE 0.1
  END AS response_score,
  
  -- Completion metrics
  pp.completion_rate,
  COALESCE(orders.total_orders, 0) AS total_orders,
  CASE 
    WHEN pp.completion_rate >= 98 THEN 1.0
    WHEN pp.completion_rate >= 95 THEN 0.9
    WHEN pp.completion_rate >= 90 THEN 0.8
    WHEN pp.completion_rate >= 80 THEN 0.6
    WHEN pp.completion_rate >= 70 THEN 0.4
    ELSE 0.2
  END AS completion_score,
  
  -- Discount score
  COALESCE(pp.centaur_discount_percent, 0) / 50.0 AS discount_score,
  
  -- Recency score (based on last activity)
  CASE 
    WHEN pp.updated_at > NOW() - INTERVAL '1 day' THEN 1.0
    WHEN pp.updated_at > NOW() - INTERVAL '3 days' THEN 0.9
    WHEN pp.updated_at > NOW() - INTERVAL '7 days' THEN 0.8
    WHEN pp.updated_at > NOW() - INTERVAL '14 days' THEN 0.7
    WHEN pp.updated_at > NOW() - INTERVAL '30 days' THEN 0.5
    WHEN pp.updated_at > NOW() - INTERVAL '60 days' THEN 0.3
    ELSE 0.1
  END AS recency_score,
  
  -- Full-text search vector
  to_tsvector('english', 
    COALESCE(ml.title, '') || ' ' || 
    COALESCE(ml.description, '') || ' ' || 
    COALESCE(ml.subcategory, '') || ' ' ||
    COALESCE(pp.headline, '') || ' ' ||
    COALESCE(
      (SELECT string_agg(value::text, ' ') 
       FROM jsonb_array_elements_text(
         CASE 
           WHEN ml.attributes ? 'skills' THEN ml.attributes->'skills'
           WHEN ml.attributes ? 'expertise' THEN ml.attributes->'expertise'
           ELSE '[]'::jsonb
         END
       )
      ), ''
    )
  ) AS search_vector,
  
  -- Combined base score (without relevance - that's query-dependent)
  (
    (CASE pp.tier
      WHEN 'premium' THEN 1.0
      WHEN 'verified' THEN 0.7
      WHEN 'standard' THEN 0.4
      ELSE 0.0
    END) * 0.20 +
    (CASE 
      WHEN pr.total_reviews >= 50 THEN 1.0
      WHEN pr.total_reviews >= 20 THEN 0.8
      WHEN pr.total_reviews >= 10 THEN 0.6
      WHEN pr.total_reviews >= 5 THEN 0.4
      WHEN pr.total_reviews >= 1 THEN 0.2
      ELSE 0.0
    END * (COALESCE(pr.avg_rating, 0) / 5.0)) * 0.15 +
    (CASE 
      WHEN pp.response_rate >= 95 THEN 1.0
      WHEN pp.response_rate >= 90 THEN 0.9
      WHEN pp.response_rate >= 80 THEN 0.7
      ELSE 0.3
    END) * 0.15 +
    (CASE 
      WHEN pp.completion_rate >= 98 THEN 1.0
      WHEN pp.completion_rate >= 90 THEN 0.8
      ELSE 0.4
    END) * 0.10 +
    (COALESCE(pp.centaur_discount_percent, 0) / 50.0) * 0.05 +
    (CASE 
      WHEN pp.updated_at > NOW() - INTERVAL '7 days' THEN 1.0
      WHEN pp.updated_at > NOW() - INTERVAL '30 days' THEN 0.5
      ELSE 0.1
    END) * 0.05
  ) AS base_score

FROM marketplace_listings ml
LEFT JOIN provider_profiles pp ON ml.id = pp.listing_id
LEFT JOIN LATERAL (
  SELECT 
    AVG(rating)::numeric(3,2) AS avg_rating,
    COUNT(*) AS total_reviews
  FROM provider_reviews
  WHERE reviewee_id = pp.id
) pr ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_orders
  FROM orders
  WHERE seller_id = pp.id AND status = 'completed'
) orders ON TRUE
WHERE ml.is_verified = TRUE OR pp.is_active = TRUE;
`;

/**
 * SQL to create indexes on the materialized view
 */
export const CREATE_SEARCH_INDEXES = `
-- Create indexes for fast search
CREATE INDEX IF NOT EXISTS idx_search_ranking_listing_id 
  ON supplier_search_ranking (listing_id);

CREATE INDEX IF NOT EXISTS idx_search_ranking_provider_id 
  ON supplier_search_ranking (provider_id);

CREATE INDEX IF NOT EXISTS idx_search_ranking_category 
  ON supplier_search_ranking (category);

CREATE INDEX IF NOT EXISTS idx_search_ranking_subcategory 
  ON supplier_search_ranking (subcategory);

CREATE INDEX IF NOT EXISTS idx_search_ranking_tier 
  ON supplier_search_ranking (tier);

CREATE INDEX IF NOT EXISTS idx_search_ranking_is_active 
  ON supplier_search_ranking (is_active);

CREATE INDEX IF NOT EXISTS idx_search_ranking_base_score 
  ON supplier_search_ranking (base_score DESC);

CREATE INDEX IF NOT EXISTS idx_search_ranking_avg_rating 
  ON supplier_search_ranking (avg_rating DESC);

CREATE INDEX IF NOT EXISTS idx_search_ranking_day_rate 
  ON supplier_search_ranking (day_rate);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_search_ranking_search_vector 
  ON supplier_search_ranking USING GIN (search_vector);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_search_ranking_category_score 
  ON supplier_search_ranking (category, base_score DESC);

CREATE INDEX IF NOT EXISTS idx_search_ranking_category_tier_score 
  ON supplier_search_ranking (category, tier, base_score DESC);
`;

/**
 * SQL to refresh the materialized view
 */
export const REFRESH_SEARCH_RANKING = `
REFRESH MATERIALIZED VIEW CONCURRENTLY supplier_search_ranking;
`;

/**
 * SQL to create a function that refreshes the view
 */
export const CREATE_REFRESH_FUNCTION = `
CREATE OR REPLACE FUNCTION refresh_search_ranking()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY supplier_search_ranking;
END;
$$ LANGUAGE plpgsql;
`;

/**
 * SQL to create a scheduled job to refresh the view (requires pg_cron)
 */
export const CREATE_REFRESH_SCHEDULE = `
-- Schedule refresh every 15 minutes (requires pg_cron extension)
-- SELECT cron.schedule('refresh-search-ranking', '*/15 * * * *', 'SELECT refresh_search_ranking()');
`;

// ==========================================
// SEARCH HISTORY TABLES
// ==========================================

/**
 * SQL to create tables for search history and saved searches
 */
export const CREATE_SEARCH_TABLES = `
-- Recent searches table
CREATE TABLE IF NOT EXISTS recent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate recent searches
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
`;

// ==========================================
// REFRESH FUNCTION (JavaScript)
// ==========================================

import { createClient } from "@/lib/supabase/server"

/**
 * Refresh the search ranking materialized view
 * Call this periodically or after significant data changes
 */
export async function refreshSearchRanking(): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Call the refresh function
    // Using any cast since the function may not be in generated types
    const { error } = await (supabase as any).rpc('refresh_search_ranking')
    
    if (error) {
      console.error('Error refreshing search ranking:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to refresh search ranking:', err)
    return { success: false, error: 'Failed to refresh search ranking' }
  }
}

/**
 * Full-text search using the materialized view
 */
export async function fullTextSearch(
  query: string,
  options?: {
    category?: string
    limit?: number
    offset?: number
  }
): Promise<{
  data: unknown[] | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Convert query to tsquery format
    const searchTerms = query
      .trim()
      .split(/\s+/)
      .filter(t => t.length > 1)
      .map(t => `${t}:*`)
      .join(' & ')
    
    if (!searchTerms) {
      return { data: [], error: null }
    }
    
    // Using any cast since supplier_search_ranking view may not be in generated types
    let queryBuilder = (supabase as any)
      .from('supplier_search_ranking')
      .select('*')
      .textSearch('search_vector', searchTerms, {
        type: 'websearch',
        config: 'english'
      })
    
    if (options?.category) {
      queryBuilder = queryBuilder.eq('category', options.category)
    }
    
    queryBuilder = queryBuilder
      .order('base_score', { ascending: false })
      .limit(options?.limit || 20)
      .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 20) - 1)
    
    const { data, error } = await queryBuilder
    
    if (error) {
      console.error('Full-text search error:', error)
      return { data: null, error: error.message }
    }
    
    return { data, error: null }
  } catch (err) {
    console.error('Full-text search failed:', err)
    return { data: null, error: 'Search failed' }
  }
}

// ==========================================
// MIGRATION HELPER
// ==========================================

/**
 * Get all SQL statements needed to set up search infrastructure
 */
export function getSearchMigrationSQL(): string {
  return [
    '-- Search Infrastructure Migration',
    '',
    '-- 1. Create search history tables',
    CREATE_SEARCH_TABLES,
    '',
    '-- 2. Create materialized view for search ranking',
    CREATE_SEARCH_RANKING_VIEW,
    '',
    '-- 3. Create indexes',
    CREATE_SEARCH_INDEXES,
    '',
    '-- 4. Create refresh function',
    CREATE_REFRESH_FUNCTION,
    '',
    '-- 5. Initial refresh',
    REFRESH_SEARCH_RANKING,
  ].join('\n')
}
