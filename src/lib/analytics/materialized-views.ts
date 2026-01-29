/**
 * Materialized Views for Analytics
 * 
 * SQL definitions and refresh functions for analytics materialized views.
 * These views pre-compute statistics for fast dashboard loading.
 */

import { createClient } from "@/lib/supabase/server"

// ==========================================
// SQL DEFINITIONS
// ==========================================

/**
 * Provider stats materialized view SQL
 */
export const CREATE_PROVIDER_STATS_VIEW = `
CREATE MATERIALIZED VIEW IF NOT EXISTS provider_stats AS
SELECT 
  pp.id AS provider_id,
  
  -- Order counts
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'completed') AS completed_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  
  -- Financial metrics
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'completed'), 0) AS lifetime_gmv,
  COALESCE(AVG(o.total_amount) FILTER (WHERE o.status = 'completed'), 0) AS average_order_value,
  
  -- Review metrics
  COALESCE(AVG(pr.rating), 0) AS average_rating,
  COUNT(pr.id) AS total_reviews,
  
  -- Performance metrics
  COALESCE(pp.response_rate, 0) AS response_rate,
  COALESCE(pp.avg_response_time_hours, 0) AS avg_response_time_hours,
  
  -- Calculated completion rate
  CASE 
    WHEN COUNT(o.id) > 0 THEN 
      ROUND(
        (COUNT(o.id) FILTER (WHERE o.status = 'completed')::numeric / 
        NULLIF(COUNT(o.id) FILTER (WHERE o.status IN ('completed', 'cancelled')), 0)::numeric) * 100, 
        2
      )
    ELSE 0
  END AS completion_rate,
  
  -- Timestamps
  MAX(o.created_at) AS last_order_at,
  NOW() AS updated_at

FROM provider_profiles pp
LEFT JOIN orders o ON o.seller_id = pp.id
LEFT JOIN provider_reviews pr ON pr.reviewee_id = pp.id
GROUP BY pp.id, pp.response_rate, pp.avg_response_time_hours;
`

/**
 * Buyer stats materialized view SQL
 */
export const CREATE_BUYER_STATS_VIEW = `
CREATE MATERIALIZED VIEW IF NOT EXISTS buyer_stats AS
SELECT 
  p.id AS buyer_id,
  
  -- Order counts
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'completed') AS completed_orders,
  
  -- Financial metrics
  COALESCE(SUM(o.total_amount), 0) AS total_spend,
  COALESCE(AVG(o.total_amount), 0) AS average_order_value,
  
  -- Provider diversity
  COUNT(DISTINCT o.seller_id) AS unique_providers,
  
  -- Timestamps
  MAX(o.created_at) AS last_order_at,
  NOW() AS updated_at

FROM profiles p
LEFT JOIN orders o ON o.buyer_id = p.id
GROUP BY p.id;
`

/**
 * Platform daily stats materialized view SQL
 */
export const CREATE_PLATFORM_STATS_VIEW = `
CREATE MATERIALIZED VIEW IF NOT EXISTS platform_daily_stats AS
SELECT 
  d.stat_date,
  
  -- GMV and Fees
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'completed'), 0) AS total_gmv,
  COALESCE(SUM(o.platform_fee) FILTER (WHERE o.status = 'completed'), 0) AS total_fees,
  
  -- Order metrics
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'completed') AS completed_orders,
  
  -- Active users
  COUNT(DISTINCT o.seller_id) AS active_providers,
  COUNT(DISTINCT o.buyer_id) AS active_buyers,
  
  -- Calculated metrics
  COALESCE(AVG(o.total_amount), 0) AS average_order_value,
  
  NOW() AS updated_at

FROM (
  SELECT generate_series(
    CURRENT_DATE - INTERVAL '365 days',
    CURRENT_DATE,
    '1 day'::interval
  )::date AS stat_date
) d
LEFT JOIN orders o ON o.created_at::date = d.stat_date
GROUP BY d.stat_date
ORDER BY d.stat_date DESC;
`

/**
 * Category stats materialized view SQL
 */
export const CREATE_CATEGORY_STATS_VIEW = `
CREATE MATERIALIZED VIEW IF NOT EXISTS category_stats AS
SELECT 
  ml.category,
  COUNT(o.id) AS total_orders,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'completed'), 0) AS total_gmv,
  COUNT(DISTINCT pp.id) AS provider_count,
  COUNT(DISTINCT o.buyer_id) AS buyer_count,
  COALESCE(AVG(pr.rating), 0) AS average_rating,
  NOW() AS updated_at
FROM marketplace_listings ml
LEFT JOIN provider_profiles pp ON pp.listing_id = ml.id
LEFT JOIN orders o ON o.seller_id = pp.id
LEFT JOIN provider_reviews pr ON pr.reviewee_id = pp.id
GROUP BY ml.category;
`

/**
 * Create indexes for the materialized views
 */
export const CREATE_ANALYTICS_INDEXES = `
-- Provider stats indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_stats_provider_id 
  ON provider_stats (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_stats_gmv 
  ON provider_stats (lifetime_gmv DESC);
CREATE INDEX IF NOT EXISTS idx_provider_stats_rating 
  ON provider_stats (average_rating DESC);

-- Buyer stats indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_stats_buyer_id 
  ON buyer_stats (buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_stats_spend 
  ON buyer_stats (total_spend DESC);

-- Platform stats indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_daily_stats_date 
  ON platform_daily_stats (stat_date);

-- Category stats indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_stats_category 
  ON category_stats (category);
`

/**
 * Refresh functions SQL
 */
export const CREATE_REFRESH_FUNCTIONS = `
CREATE OR REPLACE FUNCTION refresh_provider_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY provider_stats;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_buyer_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY buyer_stats;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_platform_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY platform_daily_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY category_stats;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_all_analytics()
RETURNS void AS $$
BEGIN
  PERFORM refresh_provider_stats();
  PERFORM refresh_buyer_stats();
  PERFORM refresh_platform_stats();
END;
$$ LANGUAGE plpgsql;
`

// ==========================================
// REFRESH FUNCTIONS
// ==========================================

/**
 * Refresh provider stats materialized view
 */
export async function refreshProviderStats(): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { error } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ error: Error | null }>
    }).rpc('refresh_provider_stats')
    
    if (error) {
      console.error('Error refreshing provider stats:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to refresh provider stats:', err)
    return { success: false, error: 'Failed to refresh provider stats' }
  }
}

/**
 * Refresh buyer stats materialized view
 */
export async function refreshBuyerStats(): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { error } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ error: Error | null }>
    }).rpc('refresh_buyer_stats')
    
    if (error) {
      console.error('Error refreshing buyer stats:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to refresh buyer stats:', err)
    return { success: false, error: 'Failed to refresh buyer stats' }
  }
}

/**
 * Refresh platform stats materialized view
 */
export async function refreshPlatformStats(): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { error } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ error: Error | null }>
    }).rpc('refresh_platform_stats')
    
    if (error) {
      console.error('Error refreshing platform stats:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to refresh platform stats:', err)
    return { success: false, error: 'Failed to refresh platform stats' }
  }
}

/**
 * Refresh all analytics materialized views
 */
export async function refreshAllAnalytics(): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { error } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ error: Error | null }>
    }).rpc('refresh_all_analytics')
    
    if (error) {
      console.error('Error refreshing all analytics:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to refresh all analytics:', err)
    return { success: false, error: 'Failed to refresh all analytics' }
  }
}

// ==========================================
// QUERY FUNCTIONS
// ==========================================

/**
 * Get provider stats from materialized view
 */
export async function getProviderStatsFromView(providerId: string) {
  try {
    const supabase = await createClient()
    
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            single: () => Promise<{ data: unknown; error: Error | null }>
          }
        }
      }
    }).from('provider_stats')
      .select('*')
      .eq('provider_id', providerId)
      .single()
    
    if (error) {
      // View might not exist, return null gracefully
      return { data: null, error: null }
    }
    
    return { data, error: null }
  } catch (err) {
    console.error('Failed to get provider stats:', err)
    return { data: null, error: 'Failed to get provider stats' }
  }
}

/**
 * Get buyer stats from materialized view
 */
export async function getBuyerStatsFromView(buyerId: string) {
  try {
    const supabase = await createClient()
    
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            single: () => Promise<{ data: unknown; error: Error | null }>
          }
        }
      }
    }).from('buyer_stats')
      .select('*')
      .eq('buyer_id', buyerId)
      .single()
    
    if (error) {
      return { data: null, error: null }
    }
    
    return { data, error: null }
  } catch (err) {
    console.error('Failed to get buyer stats:', err)
    return { data: null, error: 'Failed to get buyer stats' }
  }
}

/**
 * Get platform daily stats from materialized view
 */
export async function getPlatformDailyStats(days: number = 30) {
  try {
    const supabase = await createClient()
    
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          gte: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[]; error: Error | null }>
          }
        }
      }
    }).from('platform_daily_stats')
      .select('*')
      .gte('stat_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('stat_date', { ascending: true })
    
    if (error) {
      return { data: [], error: null }
    }
    
    return { data: data || [], error: null }
  } catch (err) {
    console.error('Failed to get platform daily stats:', err)
    return { data: [], error: 'Failed to get platform daily stats' }
  }
}

/**
 * Get category stats from materialized view
 */
export async function getCategoryStats() {
  try {
    const supabase = await createClient()
    
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[]; error: Error | null }>
        }
      }
    }).from('category_stats')
      .select('*')
      .order('total_gmv', { ascending: false })
    
    if (error) {
      return { data: [], error: null }
    }
    
    return { data: data || [], error: null }
  } catch (err) {
    console.error('Failed to get category stats:', err)
    return { data: [], error: 'Failed to get category stats' }
  }
}

// ==========================================
// MIGRATION HELPER
// ==========================================

/**
 * Get all SQL statements needed to set up analytics infrastructure
 */
export function getAnalyticsMigrationSQL(): string {
  return [
    '-- Analytics Infrastructure Migration',
    '',
    '-- 1. Create provider stats view',
    CREATE_PROVIDER_STATS_VIEW,
    '',
    '-- 2. Create buyer stats view',
    CREATE_BUYER_STATS_VIEW,
    '',
    '-- 3. Create platform stats view',
    CREATE_PLATFORM_STATS_VIEW,
    '',
    '-- 4. Create category stats view',
    CREATE_CATEGORY_STATS_VIEW,
    '',
    '-- 5. Create indexes',
    CREATE_ANALYTICS_INDEXES,
    '',
    '-- 6. Create refresh functions',
    CREATE_REFRESH_FUNCTIONS,
  ].join('\n')
}
