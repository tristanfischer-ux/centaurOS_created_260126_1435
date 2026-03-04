-- get_investor_stats: Server-side aggregation RPC for the investor directory
-- insights panel. Replaces the previous approach of fetching all 600+ Finance
-- rows into JS and aggregating client-side.
--
-- Returns a single JSON object matching the InvestorStats TypeScript interface.
-- Uses category::text comparison to avoid enum cast issues (Finance not yet
-- in the marketplace_category enum).
--
-- DECISION: STABLE + SECURITY INVOKER — read-only function, no elevated
-- privilege needed, result can be cached by the planner within a transaction.

CREATE OR REPLACE FUNCTION public.get_investor_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total', COUNT(*)::int,

    -- Capital-deployer firm types (mirrors INVESTOR_FIRM_TYPES in investors.ts)
    'investorCount', COUNT(*) FILTER (
      WHERE attributes->>'firm_type' = ANY(ARRAY[
        'VC', 'PE', 'Growth', 'Growth Equity', 'Family Office', 'CVC',
        'Corporate VC', 'Accelerator', 'Angel', 'Angel Network',
        'Debt Fund', 'Impact Fund', 'EIS Fund', 'SEIS Fund'
      ])
    )::int,

    'serviceProviderCount', COUNT(*) FILTER (
      WHERE NOT (attributes->>'firm_type' = ANY(ARRAY[
        'VC', 'PE', 'Growth', 'Growth Equity', 'Family Office', 'CVC',
        'Corporate VC', 'Accelerator', 'Angel', 'Angel Network',
        'Debt Fund', 'Impact Fund', 'EIS Fund', 'SEIS Fund'
      ])) OR attributes->>'firm_type' IS NULL
    )::int,

    'withWebsiteCount', COUNT(*) FILTER (
      WHERE (attributes->>'website_url') IS NOT NULL
        AND (attributes->>'website_url') <> ''
    )::int,

    'activeDeployingCount', COUNT(*) FILTER (
      WHERE (attributes->>'is_active_deploying')::boolean IS TRUE
    )::int,

    'subcategoryBreakdown', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT subcategory::text AS name, COUNT(*)::int AS count
        FROM public.marketplace_listings
        WHERE category::text = 'Finance'
          AND subcategory IS NOT NULL
        GROUP BY subcategory
        ORDER BY count DESC
        LIMIT 10
      ) t
    ), '[]'::json),

    'cityBreakdown', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT attributes->>'hq_city' AS name, COUNT(*)::int AS count
        FROM public.marketplace_listings
        WHERE category::text = 'Finance'
          AND (attributes->>'hq_city') IS NOT NULL
          AND (attributes->>'hq_city') <> ''
        GROUP BY attributes->>'hq_city'
        ORDER BY count DESC
        LIMIT 10
      ) t
    ), '[]'::json)
  )
  FROM public.marketplace_listings
  WHERE category::text = 'Finance'
$$;
