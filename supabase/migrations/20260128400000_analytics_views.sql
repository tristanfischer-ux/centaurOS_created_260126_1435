-- Analytics Materialized Views Migration
-- Creates materialized views for provider, buyer, and platform statistics

-- ==========================================
-- PROVIDER STATS MATERIALIZED VIEW
-- ==========================================

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
  
  -- Repeat client rate
  CASE 
    WHEN COUNT(DISTINCT o.buyer_id) > 0 THEN
      ROUND(
        (SELECT COUNT(DISTINCT o2.buyer_id)
         FROM orders o2
         WHERE o2.seller_id = pp.id
         GROUP BY o2.buyer_id
         HAVING COUNT(*) > 1)::numeric / 
        NULLIF(COUNT(DISTINCT o.buyer_id), 0)::numeric * 100,
        2
      )
    ELSE 0
  END AS repeat_client_rate,
  
  -- Timestamps
  MAX(o.created_at) AS last_order_at,
  NOW() AS updated_at

FROM provider_profiles pp
LEFT JOIN orders o ON o.seller_id = pp.id
LEFT JOIN reviews pr ON pr.reviewee_id = pp.id
GROUP BY pp.id, pp.response_rate, pp.avg_response_time_hours;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_stats_provider_id 
  ON provider_stats (provider_id);

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_provider_stats_gmv 
  ON provider_stats (lifetime_gmv DESC);

CREATE INDEX IF NOT EXISTS idx_provider_stats_rating 
  ON provider_stats (average_rating DESC);

CREATE INDEX IF NOT EXISTS idx_provider_stats_orders 
  ON provider_stats (total_orders DESC);


-- ==========================================
-- BUYER STATS MATERIALIZED VIEW
-- ==========================================

CREATE MATERIALIZED VIEW IF NOT EXISTS buyer_stats AS
SELECT 
  p.id AS buyer_id,
  
  -- Order counts
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'completed') AS completed_orders,
  
  -- Financial metrics
  COALESCE(SUM(o.total_amount), 0) AS total_spend,
  COALESCE(AVG(o.total_amount), 0) AS average_order_value,
  
  -- Savings from Centaur discounts
  COALESCE(
    SUM(
      CASE 
        WHEN pp.centaur_discount_percent > 0 THEN 
          o.total_amount * (pp.centaur_discount_percent / 100.0)
        ELSE 0
      END
    ), 
    0
  ) AS total_savings,
  
  -- Provider diversity
  COUNT(DISTINCT o.seller_id) AS unique_providers,
  
  -- Timestamps
  MAX(o.created_at) AS last_order_at,
  NOW() AS updated_at

FROM profiles p
LEFT JOIN orders o ON o.buyer_id = p.id
LEFT JOIN provider_profiles pp ON pp.id = o.seller_id
GROUP BY p.id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_stats_buyer_id 
  ON buyer_stats (buyer_id);

-- Additional indexes
CREATE INDEX IF NOT EXISTS idx_buyer_stats_spend 
  ON buyer_stats (total_spend DESC);

CREATE INDEX IF NOT EXISTS idx_buyer_stats_orders 
  ON buyer_stats (total_orders DESC);


-- ==========================================
-- PLATFORM STATS MATERIALIZED VIEW (Daily snapshots)
-- ==========================================

CREATE MATERIALIZED VIEW IF NOT EXISTS platform_daily_stats AS
SELECT 
  d.stat_date,
  
  -- GMV and Fees
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'completed'), 0) AS total_gmv,
  COALESCE(SUM(o.platform_fee) FILTER (WHERE o.status = 'completed'), 0) AS total_fees,
  
  -- Order metrics
  COUNT(o.id) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'completed') AS completed_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'disputed') AS disputed_orders,
  
  -- User metrics (cumulative up to this date)
  (SELECT COUNT(*) FROM profiles WHERE created_at::date <= d.stat_date) AS total_users,
  (SELECT COUNT(*) FROM provider_profiles WHERE created_at::date <= d.stat_date) AS total_providers,
  (SELECT COUNT(DISTINCT buyer_id) FROM orders WHERE created_at::date <= d.stat_date) AS total_buyers,
  
  -- Active users (had activity on this date)
  COUNT(DISTINCT o.seller_id) AS active_providers,
  COUNT(DISTINCT o.buyer_id) AS active_buyers,
  
  -- New users on this date
  (SELECT COUNT(*) FROM profiles WHERE created_at::date = d.stat_date) AS new_users,
  
  -- Calculated metrics
  COALESCE(AVG(o.total_amount), 0) AS average_order_value,
  
  CASE 
    WHEN COUNT(o.id) > 0 THEN 
      ROUND(COUNT(o.id) FILTER (WHERE o.status = 'disputed')::numeric / COUNT(o.id)::numeric * 100, 2)
    ELSE 0
  END AS dispute_rate,
  
  CASE 
    WHEN COUNT(o.id) FILTER (WHERE o.status IN ('completed', 'cancelled')) > 0 THEN 
      ROUND(
        COUNT(o.id) FILTER (WHERE o.status = 'completed')::numeric / 
        COUNT(o.id) FILTER (WHERE o.status IN ('completed', 'cancelled'))::numeric * 100, 
        2
      )
    ELSE 0
  END AS completion_rate,
  
  NOW() AS updated_at

FROM (
  -- Generate date series for the last 365 days
  SELECT generate_series(
    CURRENT_DATE - INTERVAL '365 days',
    CURRENT_DATE,
    '1 day'::interval
  )::date AS stat_date
) d
LEFT JOIN orders o ON o.created_at::date = d.stat_date
GROUP BY d.stat_date
ORDER BY d.stat_date DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_daily_stats_date 
  ON platform_daily_stats (stat_date);


-- ==========================================
-- CATEGORY STATS VIEW (for analytics breakdowns)
-- ==========================================

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
LEFT JOIN reviews pr ON pr.reviewee_id = pp.id
GROUP BY ml.category;

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_stats_category 
  ON category_stats (category);


-- ==========================================
-- REFRESH FUNCTIONS
-- ==========================================

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


-- ==========================================
-- MONTHLY AGGREGATION VIEW
-- ==========================================

CREATE OR REPLACE VIEW platform_monthly_stats AS
SELECT 
  DATE_TRUNC('month', stat_date)::date AS month,
  SUM(total_gmv) AS total_gmv,
  SUM(total_fees) AS total_fees,
  SUM(total_orders) AS total_orders,
  SUM(completed_orders) AS completed_orders,
  MAX(total_users) AS total_users,
  MAX(total_providers) AS total_providers,
  MAX(total_buyers) AS total_buyers,
  SUM(new_users) AS new_users,
  AVG(average_order_value) AS avg_order_value
FROM platform_daily_stats
GROUP BY DATE_TRUNC('month', stat_date)
ORDER BY month DESC;


-- ==========================================
-- HELPER FUNCTIONS FOR ANALYTICS
-- ==========================================

-- Get provider earnings for a specific period
CREATE OR REPLACE FUNCTION get_provider_earnings(
  p_provider_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  earnings NUMERIC,
  order_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.created_at::date AS date,
    SUM(o.total_amount - o.platform_fee) AS earnings,
    COUNT(o.id) AS order_count
  FROM orders o
  WHERE o.seller_id = p_provider_id
    AND o.status = 'completed'
    AND o.created_at::date BETWEEN p_start_date AND p_end_date
  GROUP BY o.created_at::date
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

-- Get buyer spend for a specific period
CREATE OR REPLACE FUNCTION get_buyer_spend(
  p_buyer_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  spend NUMERIC,
  order_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.created_at::date AS date,
    SUM(o.total_amount) AS spend,
    COUNT(o.id) AS order_count
  FROM orders o
  WHERE o.buyer_id = p_buyer_id
    AND o.created_at::date BETWEEN p_start_date AND p_end_date
  GROUP BY o.created_at::date
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;


-- ==========================================
-- INITIAL REFRESH
-- ==========================================

-- Perform initial refresh of all views
SELECT refresh_all_analytics();
