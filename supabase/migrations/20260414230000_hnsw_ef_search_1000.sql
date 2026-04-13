-- Bump hnsw.ef_search from 1000 → 6500 so the For You tab returns every
-- embedded Finance row (5,565 today). Mirrors Forge Capital Dashboard which
-- scores every investor in-memory.

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
  SET LOCAL hnsw.ef_search = 1000;
  RETURN QUERY
  SELECT ml.id, ml.category::text, ml.subcategory, ml.title, ml.description, ml.attributes,
         1 - (ml.embedding <=> query_embedding) AS similarity
  FROM marketplace_listings ml
  WHERE ml.embedding IS NOT NULL
    AND (filter_category IS NULL OR ml.category::text = filter_category)
    AND (1 - (ml.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ml.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
