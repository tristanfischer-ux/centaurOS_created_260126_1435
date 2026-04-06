-- Migration: Portfolio dedup RPC + investor stats RPC
-- Reduces round-trips and enables GROUP BY for portfolio deduplication

-- Portfolio companies grouped by company name with investor count
CREATE OR REPLACE FUNCTION search_portfolio_companies_deduped(
  p_query TEXT DEFAULT NULL,
  p_sector TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  company_name TEXT,
  sector TEXT,
  stage TEXT,
  amount_usd NUMERIC,
  description TEXT,
  investor_count BIGINT,
  investor_names TEXT[],
  investor_listing_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ipc.company_name,
    mode() WITHIN GROUP (ORDER BY ipc.sector) as sector,
    mode() WITHIN GROUP (ORDER BY ipc.stage) as stage,
    max(ipc.amount_usd) as amount_usd,
    max(ipc.description) as description,
    count(DISTINCT ipc.listing_id) as investor_count,
    array_agg(DISTINCT ml.title) as investor_names,
    array_agg(DISTINCT ipc.listing_id) as investor_listing_ids
  FROM investor_portfolio_companies ipc
  LEFT JOIN marketplace_listings ml ON ml.id = ipc.listing_id
  WHERE
    (p_query IS NULL OR ipc.company_name ILIKE '%' || p_query || '%')
    AND (p_sector IS NULL OR ipc.sector ILIKE '%' || p_sector || '%')
  GROUP BY ipc.company_name
  ORDER BY investor_count DESC, ipc.company_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Count of unique portfolio companies (for tab label)
CREATE OR REPLACE FUNCTION count_unique_portfolio_companies()
RETURNS BIGINT
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT count(DISTINCT company_name) FROM investor_portfolio_companies;
$$;

-- Investor overview stats in a single round-trip (replaces 8+ paginated queries)
CREATE OR REPLACE FUNCTION get_investor_overview_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total', (SELECT count(*) FROM marketplace_listings WHERE category = 'Finance'),
    'withWebsites', (SELECT count(*) FROM marketplace_listings WHERE category = 'Finance' AND attributes->>'website_url' IS NOT NULL AND attributes->>'website_url' != ''),
    'forgeCapitalCount', (SELECT count(*) FROM marketplace_listings WHERE category = 'Finance' AND attributes->>'data_source' = 'forge_capital'),
    'partnerCount', (SELECT count(*) FROM vc_pe_contacts),
    'portfolioCompanyCount', (SELECT count(DISTINCT company_name) FROM investor_portfolio_companies),
    'grantsCount', (SELECT count(*) FROM investor_grants),
    'activeDeployingCount', (SELECT count(*) FROM marketplace_listings WHERE category = 'Finance' AND (attributes->>'is_active_deploying')::boolean = true),
    'hwFit7PlusCount', (SELECT count(*) FROM marketplace_listings WHERE category = 'Finance' AND (attributes->>'hardware_fit_score')::numeric >= 7),
    'avgQuality', (SELECT round(avg((attributes->>'data_quality_score')::numeric)::numeric, 1) FROM marketplace_listings WHERE category = 'Finance' AND (attributes->>'data_quality_score')::numeric > 0)
  ) INTO result;
  RETURN result;
END;
$$;
