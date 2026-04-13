-- ============================================================
-- Raise HNSW ef_search for match_marketplace_listings_v2
-- ============================================================
--
-- INTENT: The previous migration (20260414200000) recreated the embedding
-- index as HNSW with default `hnsw.ef_search = 40`. That caps the RPC to
-- 40 results no matter how large `match_count` is, because HNSW only walks
-- ef_search candidates during the index scan. The For You tab on /investors
-- needs dashboard-parity breadth (hundreds of matches), so we need to bump
-- ef_search well above match_count.
--
-- We use LANGUAGE plpgsql so we can SET LOCAL ef_search for the RPC call
-- only — doesn't affect other queries on the table.

DROP FUNCTION IF EXISTS match_marketplace_listings_v2(vector, text, float, int);

CREATE OR REPLACE FUNCTION match_marketplace_listings_v2(
  query_embedding vector(768),
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- GOTCHA: HNSW defaults ef_search to 40, which caps candidate rows returned
  -- from the index scan. Dashboard-parity match counts (200+) need this
  -- raised well above match_count. 1000 is a safe headroom.
  SET LOCAL hnsw.ef_search = 1000;

  RETURN QUERY
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
END;
$$;

COMMENT ON FUNCTION match_marketplace_listings_v2 IS
  'Semantic search over marketplace_listings at nomic-embed-text-v1.5 (768-dim). '
  'Sets hnsw.ef_search=1000 so that match_count up to ~500 is actually honoured. '
  'Aligns with Forge Capital Dashboard for parity.';
