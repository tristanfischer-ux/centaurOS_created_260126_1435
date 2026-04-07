/**
 * Migration: Red team hardening for investor query RPCs
 *
 * Fixes from security review of 20260407100000:
 * C-1: %s format specifiers → %L for numeric params (defense-in-depth)
 * C-2: SECURITY DEFINER → SECURITY INVOKER (respect RLS)
 * H-2: Unbounded page_limit/page_offset → capped at 100/10000
 * H-3: Unbounded array filters → capped at 50 elements
 * M-1: Separate count+data queries → window function COUNT(*) OVER()
 * M-5: Text index on quality score → numeric cast for sort matching
 * L-2: Unbounded match_count → capped at 500
 */

-- ============================================================
-- Fix M-5: Recreate quality index with numeric cast for sort matching
-- ============================================================

DROP INDEX IF EXISTS idx_marketplace_listings_finance_quality;
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_finance_quality
  ON marketplace_listings (((attributes->>'data_quality_score')::numeric))
  WHERE category = 'Finance';

-- ============================================================
-- Fix C-1, C-2, H-2, H-3, M-1: Recreate search_investors_sorted
-- ============================================================

CREATE OR REPLACE FUNCTION search_investors_sorted(
  sort_field text DEFAULT 'title',
  sort_direction text DEFAULT 'asc',
  page_offset int DEFAULT 0,
  page_limit int DEFAULT 24,
  filter_firm_types text[] DEFAULT NULL,
  filter_stages text[] DEFAULT NULL,
  filter_sectors text[] DEFAULT NULL,
  filter_geo_focus text[] DEFAULT NULL,
  filter_active_only boolean DEFAULT false,
  filter_bvca_only boolean DEFAULT false,
  filter_min_quality numeric DEFAULT NULL,
  filter_min_hardware_fit numeric DEFAULT NULL,
  filter_cheque_min numeric DEFAULT NULL,
  filter_cheque_max numeric DEFAULT NULL,
  filter_hq_city text DEFAULT NULL,
  filter_priority text DEFAULT NULL,
  filter_query text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  subcategory text,
  attributes jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
-- FIX C-2: Use SECURITY INVOKER to respect RLS policies
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  base_query text;
  order_clause text;
  -- FIX H-2: Cap pagination parameters
  safe_limit int := LEAST(GREATEST(page_limit, 1), 100);
  safe_offset int := LEAST(GREATEST(page_offset, 0), 10000);
  where_clauses text[] := ARRAY['ml.category = ''Finance'''];
BEGIN
  -- Build WHERE clauses from filters

  -- FIX H-3: Cap array lengths at 50 elements to prevent DoS
  IF filter_firm_types IS NOT NULL AND array_length(filter_firm_types, 1) > 0 THEN
    IF array_length(filter_firm_types, 1) > 50 THEN
      filter_firm_types := filter_firm_types[1:50];
    END IF;
    where_clauses := array_append(where_clauses,
      format('ml.attributes->>''firm_type'' = ANY(%L)', filter_firm_types));
  END IF;

  IF filter_active_only THEN
    where_clauses := array_append(where_clauses,
      'ml.attributes->''is_active_deploying'' = ''true''::jsonb');
  END IF;

  IF filter_bvca_only THEN
    where_clauses := array_append(where_clauses,
      'ml.attributes->''bvca_member'' = ''true''::jsonb');
  END IF;

  -- FIX C-1: Use %L instead of %s for all numeric parameters
  IF filter_min_quality IS NOT NULL AND filter_min_quality > 0 THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->>''data_quality_score'')::numeric, 0) >= %L::numeric', filter_min_quality));
  END IF;

  IF filter_min_hardware_fit IS NOT NULL AND filter_min_hardware_fit > 0 THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->>''hardware_fit_score'')::numeric, 0) >= %L::numeric', filter_min_hardware_fit));
  END IF;

  IF filter_cheque_min IS NOT NULL THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->''cheque_range_gbp''->>''max'')::numeric, 0) >= %L::numeric', filter_cheque_min));
  END IF;

  IF filter_cheque_max IS NOT NULL THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->''cheque_range_gbp''->>''min'')::numeric, 0) <= %L::numeric', filter_cheque_max));
  END IF;

  IF filter_hq_city IS NOT NULL AND length(trim(filter_hq_city)) > 0 THEN
    where_clauses := array_append(where_clauses,
      format('ml.attributes->>''hq_city'' ILIKE ''%%'' || %L || ''%%''', trim(filter_hq_city)));
  END IF;

  IF filter_priority IS NOT NULL AND filter_priority IN ('A', 'B', 'C') THEN
    where_clauses := array_append(where_clauses,
      format('ml.attributes->>''outreach_priority'' = %L', filter_priority));
  END IF;

  -- JSONB array containment filters with H-3 cap
  IF filter_stages IS NOT NULL AND array_length(filter_stages, 1) > 0 THEN
    IF array_length(filter_stages, 1) > 50 THEN
      filter_stages := filter_stages[1:50];
    END IF;
    DECLARE
      stage_conditions text[] := '{}';
      s text;
    BEGIN
      FOREACH s IN ARRAY filter_stages LOOP
        stage_conditions := array_append(stage_conditions,
          format('ml.attributes->''stage_focus'' @> ''[%s]''::jsonb', to_jsonb(s)));
      END LOOP;
      where_clauses := array_append(where_clauses,
        '(' || array_to_string(stage_conditions, ' OR ') || ')');
    END;
  END IF;

  IF filter_sectors IS NOT NULL AND array_length(filter_sectors, 1) > 0 THEN
    IF array_length(filter_sectors, 1) > 50 THEN
      filter_sectors := filter_sectors[1:50];
    END IF;
    DECLARE
      sector_conditions text[] := '{}';
      s text;
    BEGIN
      FOREACH s IN ARRAY filter_sectors LOOP
        sector_conditions := array_append(sector_conditions,
          format('ml.attributes->''sectors'' @> ''[%s]''::jsonb', to_jsonb(s)));
      END LOOP;
      where_clauses := array_append(where_clauses,
        '(' || array_to_string(sector_conditions, ' OR ') || ')');
    END;
  END IF;

  IF filter_geo_focus IS NOT NULL AND array_length(filter_geo_focus, 1) > 0 THEN
    IF array_length(filter_geo_focus, 1) > 50 THEN
      filter_geo_focus := filter_geo_focus[1:50];
    END IF;
    DECLARE
      geo_conditions text[] := '{}';
      g text;
    BEGIN
      FOREACH g IN ARRAY filter_geo_focus LOOP
        geo_conditions := array_append(geo_conditions,
          format('ml.attributes->''geo_focus'' @> ''[%s]''::jsonb', to_jsonb(g)));
      END LOOP;
      where_clauses := array_append(where_clauses,
        '(' || array_to_string(geo_conditions, ' OR ') || ')');
    END;
  END IF;

  IF filter_query IS NOT NULL AND length(trim(filter_query)) > 0 THEN
    where_clauses := array_append(where_clauses,
      format('(ml.title ILIKE ''%%'' || %L || ''%%'' OR ml.description ILIKE ''%%'' || %L || ''%%'')',
        left(trim(filter_query), 200), left(trim(filter_query), 200)));
  END IF;

  -- Build ORDER BY clause (validated via CASE — arbitrary values default to title)
  CASE sort_field
    WHEN 'quality' THEN
      order_clause := format('COALESCE((ml.attributes->>''data_quality_score'')::numeric, 0) %s',
        CASE WHEN sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END);
    WHEN 'fund_size' THEN
      order_clause := format('COALESCE((ml.attributes->>''fund_size_gbp'')::numeric, 0) %s',
        CASE WHEN sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END);
    WHEN 'hardware_fit' THEN
      order_clause := format('COALESCE((ml.attributes->>''hardware_fit_score'')::numeric, 0) %s',
        CASE WHEN sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END);
    WHEN 'cheque' THEN
      order_clause := format('COALESCE((ml.attributes->''cheque_range_gbp''->>''min'')::numeric, 0) %s',
        CASE WHEN sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END);
    WHEN 'priority' THEN
      order_clause := format(
        'CASE ml.attributes->>''outreach_priority'' WHEN ''A'' THEN 0 WHEN ''B'' THEN 1 WHEN ''C'' THEN 2 ELSE 99 END %s',
        CASE WHEN sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END);
    ELSE
      order_clause := format('ml.title %s',
        CASE WHEN sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END);
  END CASE;

  -- FIX M-1: Use window function COUNT(*) OVER() for atomic count+data
  -- instead of separate count query (eliminates race condition)
  RETURN QUERY EXECUTE
    'SELECT ml.id, ml.title, ml.description, ml.subcategory, ml.attributes, '
    || 'COUNT(*) OVER() AS total_count'
    || ' FROM marketplace_listings ml WHERE '
    || array_to_string(where_clauses, ' AND ')
    || ' ORDER BY ' || order_clause || ', ml.title ASC'
    || ' LIMIT ' || safe_limit
    || ' OFFSET ' || safe_offset;
END;
$$;

COMMENT ON FUNCTION search_investors_sorted IS
  'Searches investor listings with DB-level JSONB sorting and filtering. '
  'Hardened: SECURITY INVOKER, capped pagination, %L escaping, array length caps.';

-- ============================================================
-- Fix C-2, L-2: Recreate match_marketplace_listings_v2
-- ============================================================

CREATE OR REPLACE FUNCTION match_marketplace_listings_v2(
  query_embedding vector(1536),
  filter_category text DEFAULT NULL,
  match_threshold float DEFAULT 0.4,
  -- FIX L-2: Cap match_count at 500
  match_count int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  category text,
  subcategory text,
  title text,
  description text,
  attributes jsonb,
  similarity float
)
LANGUAGE sql
STABLE
-- FIX C-2: Use SECURITY INVOKER to respect RLS policies
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ml.id,
    ml.category::text,
    ml.subcategory,
    ml.title,
    ml.description,
    ml.attributes,
    1 - (ml.embedding <=> query_embedding) AS similarity
  FROM marketplace_listings ml
  WHERE ml.embedding IS NOT NULL
    AND (filter_category IS NULL OR ml.category::text = filter_category)
    AND (1 - (ml.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ml.embedding <=> query_embedding
  LIMIT LEAST(match_count, 500);
$$;

COMMENT ON FUNCTION match_marketplace_listings_v2 IS
  'Semantic search with category filter + attributes. Hardened: SECURITY INVOKER, capped match_count.';
