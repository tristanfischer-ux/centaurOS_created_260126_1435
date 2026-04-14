-- Add p_offset parameter to match_marketplace_listings_v2 so we can
-- paginate around PostgREST's 1000-row response cap. Client calls the
-- RPC multiple times in parallel with different offsets and concatenates.

DROP FUNCTION IF EXISTS match_marketplace_listings_v2(vector, text, float, int);
DROP FUNCTION IF EXISTS match_marketplace_listings_v2(vector, text, float, int, int);

CREATE OR REPLACE FUNCTION match_marketplace_listings_v2(
  query_embedding vector(768),
  filter_category text DEFAULT NULL,
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 200,
  p_offset int DEFAULT 0
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
  OFFSET p_offset
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_marketplace_listings_v2 IS
  'Semantic search over marketplace_listings (nomic-embed-text-v1.5 768-dim). '
  'p_offset enables pagination to work around PostgREST 1000-row response cap.';
