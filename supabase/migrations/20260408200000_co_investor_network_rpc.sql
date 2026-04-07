-- Migration: Co-investor network discovery RPC
-- INTENT: Self-join on investor_portfolio_companies to find investors who share
-- portfolio companies. Returns co-investors ranked by shared company count.

CREATE OR REPLACE FUNCTION get_co_investors(
  p_listing_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  co_investor_listing_id UUID,
  co_investor_name TEXT,
  shared_company_count BIGINT,
  shared_company_names TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    other.listing_id AS co_investor_listing_id,
    ml.title AS co_investor_name,
    count(DISTINCT lower(trim(other.company_name))) AS shared_company_count,
    array_agg(DISTINCT other.company_name ORDER BY other.company_name) AS shared_company_names
  FROM investor_portfolio_companies self
  JOIN investor_portfolio_companies other
    ON lower(trim(self.company_name)) = lower(trim(other.company_name))
    AND other.listing_id != self.listing_id
  JOIN marketplace_listings ml ON ml.id = other.listing_id
  WHERE self.listing_id = p_listing_id
  GROUP BY other.listing_id, ml.title
  ORDER BY shared_company_count DESC, ml.title ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_co_investors IS
  'Find investors who share portfolio companies with the given investor. Returns co-investors ranked by number of shared companies.';
