/**
 * Migration: Investor query performance optimization
 *
 * Root cause: marketplace_listings.category has NO index, causing full table scans
 * on every investor query (80K+ rows). JSONB attribute sorting requires fetching
 * all matching rows client-side. This migration adds:
 *
 * 1. B-tree index on category (eliminates full table scans)
 * 2. Partial index on category='Finance' + data_quality_score for quality sort
 * 3. RPC for DB-level JSONB attribute sorting (eliminates 2000-row over-fetch)
 * 4. Updated match_marketplace_listings with category filter + attributes return
 *
 * Impact: Investor page load from ~minutes → <2 seconds
 */

-- ============================================================
-- 1. Missing indexes on marketplace_listings
-- ============================================================

-- CRITICAL: This index was never created. Every .eq('category', 'Finance') did a seq scan.
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category
  ON marketplace_listings (category);

-- Composite index for the most common investor query pattern: category + quality score
-- Partial index only for Finance rows (~7K of 80K total) to keep it small
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_finance_quality
  ON marketplace_listings ((attributes->>'data_quality_score'))
  WHERE category = 'Finance';

-- Partial index for finance + title sort (the default sort)
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_finance_title
  ON marketplace_listings (title)
  WHERE category = 'Finance';

-- ============================================================
-- 2. RPC: Search investors with DB-level JSONB sorting
-- ============================================================

-- INTENT: Replaces the 2000-row over-fetch pattern. PostgREST can't ORDER BY
-- nested JSONB paths, but a SQL function can. This lets us sort + paginate at
-- the database level for all JSONB attribute sorts.

CREATE OR REPLACE FUNCTION search_investors_sorted(
  sort_field text DEFAULT 'title',
  sort_direction text DEFAULT 'asc',
  page_offset int DEFAULT 0,
  page_limit int DEFAULT 24,
  -- Filters (all optional, NULL = skip)
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_query text;
  count_query text;
  where_clauses text[] := ARRAY['ml.category = ''Finance'''];
  order_clause text;
  total bigint;
BEGIN
  -- Build WHERE clauses from filters
  IF filter_firm_types IS NOT NULL AND array_length(filter_firm_types, 1) > 0 THEN
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

  IF filter_min_quality IS NOT NULL AND filter_min_quality > 0 THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->>''data_quality_score'')::numeric, 0) >= %s', filter_min_quality));
  END IF;

  IF filter_min_hardware_fit IS NOT NULL AND filter_min_hardware_fit > 0 THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->>''hardware_fit_score'')::numeric, 0) >= %s', filter_min_hardware_fit));
  END IF;

  IF filter_cheque_min IS NOT NULL THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->''cheque_range_gbp''->>''max'')::numeric, 0) >= %s', filter_cheque_min));
  END IF;

  IF filter_cheque_max IS NOT NULL THEN
    where_clauses := array_append(where_clauses,
      format('COALESCE((ml.attributes->''cheque_range_gbp''->>''min'')::numeric, 0) <= %s', filter_cheque_max));
  END IF;

  IF filter_hq_city IS NOT NULL AND length(trim(filter_hq_city)) > 0 THEN
    where_clauses := array_append(where_clauses,
      format('ml.attributes->>''hq_city'' ILIKE ''%%'' || %L || ''%%''', trim(filter_hq_city)));
  END IF;

  IF filter_priority IS NOT NULL AND filter_priority IN ('A', 'B', 'C') THEN
    where_clauses := array_append(where_clauses,
      format('ml.attributes->>''outreach_priority'' = %L', filter_priority));
  END IF;

  -- JSONB array containment filters (stage_focus, sectors, geo_focus)
  IF filter_stages IS NOT NULL AND array_length(filter_stages, 1) > 0 THEN
    -- OR logic: firm must contain at least one of the requested stages
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

  -- Text search (ilike on title and description)
  IF filter_query IS NOT NULL AND length(trim(filter_query)) > 0 THEN
    where_clauses := array_append(where_clauses,
      format('(ml.title ILIKE ''%%'' || %L || ''%%'' OR ml.description ILIKE ''%%'' || %L || ''%%'')',
        left(trim(filter_query), 200), left(trim(filter_query), 200)));
  END IF;

  -- Build ORDER BY clause based on sort_field
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
      -- Default: sort by title
      order_clause := format('ml.title %s',
        CASE WHEN sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END);
  END CASE;

  -- Get total count first
  count_query := 'SELECT count(*) FROM marketplace_listings ml WHERE '
    || array_to_string(where_clauses, ' AND ');
  EXECUTE count_query INTO total;

  -- Return paginated results with total_count on each row
  RETURN QUERY EXECUTE
    'SELECT ml.id, ml.title, ml.description, ml.subcategory, ml.attributes, '
    || total || '::bigint AS total_count'
    || ' FROM marketplace_listings ml WHERE '
    || array_to_string(where_clauses, ' AND ')
    || ' ORDER BY ' || order_clause || ', ml.title ASC'
    || ' LIMIT ' || page_limit
    || ' OFFSET ' || page_offset;
END;
$$;

COMMENT ON FUNCTION search_investors_sorted IS
  'Searches investor listings with DB-level JSONB sorting and filtering. '
  'Eliminates the need to fetch 2000+ rows client-side for JSONB attribute sorts.';

-- ============================================================
-- 3. Updated match_marketplace_listings with category filter
-- ============================================================

-- INTENT: The original RPC returns minimal columns, forcing a re-fetch of 200 rows
-- plus client-side filtering. This version accepts a category filter and returns
-- attributes so filtering can happen in a single query.

CREATE OR REPLACE FUNCTION match_marketplace_listings_v2(
  query_embedding vector(1536),
  filter_category text DEFAULT NULL,
  match_threshold float DEFAULT 0.4,
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
SECURITY DEFINER
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
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_marketplace_listings_v2 IS
  'Semantic search over marketplace_listings with optional category filter and attributes return. '
  'Eliminates the need for a separate re-fetch query after vector search.';
