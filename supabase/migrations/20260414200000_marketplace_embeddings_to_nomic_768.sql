-- ============================================================
-- Migrate marketplace_listings.embedding to nomic-embed-text 768-dim
-- ============================================================
--
-- INTENT: Forge Capital DB is the master source of investor data and
-- already uses nomic-embed-text-v1.5 (Ollama, 768-dim) to embed every
-- investor row. Previously ForgeOS re-embedded with OpenAI
-- text-embedding-3-small (1536-dim), which meant the two systems
-- produced different similarity rankings for the same query. Aligning
-- on the nomic model lets the Forge Capital sync script push embeddings
-- directly from SQLite into Supabase — no re-embedding, no divergence.
--
-- GOTCHA: pgvector cannot cast vector(1536) → vector(768). We null the
-- column as part of the type change; the sync script immediately
-- backfills with the canonical nomic vectors from Forge Capital DB.

-- 1. Drop the existing index (IVFFlat or HNSW, name from 20260218110000)
DROP INDEX IF EXISTS idx_marketplace_listings_embedding;

-- 2. Null all existing 1536-dim embeddings and alter the column type
ALTER TABLE marketplace_listings
  ALTER COLUMN embedding DROP DEFAULT;

UPDATE marketplace_listings SET embedding = NULL;

ALTER TABLE marketplace_listings
  ALTER COLUMN embedding TYPE vector(768);

-- 3. Recreate the index at 768-dim. HNSW gives better recall/throughput
-- than IVFFlat for pgvector 0.5+ and doesn't need a re-train after inserts.
CREATE INDEX idx_marketplace_listings_embedding
  ON marketplace_listings
  USING hnsw (embedding vector_cosine_ops);

-- 4. Drop and recreate the RPC with a vector(768) signature. Body is
-- identical to the 1536-dim version at 20260407100000 — only the type
-- of the query_embedding parameter changes.
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
  'Semantic search over marketplace_listings using nomic-embed-text-v1.5 (768-dim). '
  'Embeddings are synced from Forge Capital DB — do not regenerate locally. '
  'Aligns ranking with Forge Capital Dashboard for parity.';
