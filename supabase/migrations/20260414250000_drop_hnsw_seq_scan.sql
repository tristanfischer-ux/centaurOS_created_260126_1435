-- Drop the HNSW index so the RPC sequential-scans every embedded row.
-- HNSW caps ef_search at 1000 (this pgvector version) which capped match_count.
-- At 5,565 embedded rows, a sequential scan runs in well under a second —
-- faster than the dashboard's in-memory JS sort. No caps on row count.

DROP INDEX IF EXISTS idx_marketplace_listings_embedding;

-- Rewrite the RPC without HNSW-specific directives. STABLE is fine again
-- because we no longer need SET LOCAL.
DROP FUNCTION IF EXISTS match_marketplace_listings_v2(vector, text, float, int);

CREATE OR REPLACE FUNCTION match_marketplace_listings_v2(
  query_embedding vector(768),
  filter_category text DEFAULT NULL,
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 200
)
RETURNS TABLE (
  id uuid, category text, subcategory text, title text, description text,
  attributes jsonb, similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ml.id, ml.category::text, ml.subcategory, ml.title, ml.description, ml.attributes,
         1 - (ml.embedding <=> query_embedding) AS similarity
  FROM marketplace_listings ml
  WHERE ml.embedding IS NOT NULL
    AND (filter_category IS NULL OR ml.category::text = filter_category)
    AND (1 - (ml.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ml.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_marketplace_listings_v2 IS
  'Semantic search over marketplace_listings, nomic-embed-text-v1.5 (768-dim). '
  'Sequential scan — no HNSW cap. Dashboard-parity for breadth + ranking.';
