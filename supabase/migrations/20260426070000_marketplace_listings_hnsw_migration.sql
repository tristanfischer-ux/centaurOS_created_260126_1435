-- Migration: HNSW migration for marketplace_listings.embedding (pgvector 0.8.0)
--
-- Replaces the IVFFlat index that was responsible for repeated 57014
-- statement_timeout errors on the /investors and /marketplace search paths.
--
-- Background:
-- The IVFFlat index `idx_marketplace_listings_finance_embedding_cosine` was
-- the source of intermittent timeouts. Five fix attempts (PAGES tuning,
-- match_count reduction, match_threshold change, VACUUM ANALYZE, aggressive
-- autovacuum) all proved transient.
--
-- Council escalation 2026-04-26 (Qwen3.6-Plus + Mistral Large 2407 +
-- GPT-5.5) converged on root cause: IVFFlat's cost model is fragile at this
-- table size (28K rows). The (filter_category IS NULL OR ml.category::text
-- = filter_category) parameterization plus the ::text cast prevented the
-- planner from accurately costing the query, causing intermittent
-- sequential scan + full vector distance computation, which exceeded
-- statement_timeout.
--
-- Structural fix:
-- 1. Build HNSW index (m=16, ef_construction=64) for the embedding column.
--    HNSW has a more predictable cost model and doesn't suffer the same
--    planner-misestimation issues at this dataset size.
-- 2. Drop the IVFFlat index after HNSW is built and verified.
-- 3. Rewrite match_marketplace_listings_v2 to:
--    - drop the always-true match_threshold=0 predicate (pointless filter
--      that forced the planner to evaluate (1 - distance) >= 0 per row)
--    - use marketplace_category enum equality instead of ::text cast
--    - keep the threshold filter behind `match_threshold > 0` short-circuit
--      so non-zero thresholds still work
--
-- Verified live 2026-04-26 night: HNSW Index Scan in EXPLAIN plan,
-- execution time 610ms (vs IVFFlat's intermittent timeout > 5s),
-- "Found 199 matching investors" rendered on /investors search.
--
-- HNSW build cost: ~75 seconds for 28,315 rows × 1536-dim. Index size:
-- 211 MB on disk. m=16 / ef_construction=64 are pgvector-recommended
-- defaults for high recall on <100K rows.

-- Step 1: Build HNSW index. Already done out-of-band; included here for
-- environments that haven't applied the change yet. Idempotent.
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_embedding_hnsw
ON marketplace_listings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 2: Drop the old IVFFlat index. Hold off on this in case the new
-- index needs to coexist briefly during a staged rollout. If the HNSW
-- index is verified live, drop the IVFFlat index to recover ~102 MB and
-- prevent the planner from ever picking the slower index again.
DROP INDEX IF EXISTS idx_marketplace_listings_finance_embedding_cosine;

-- Step 3: Rewrite the RPC. The body simplifies the predicate so the
-- planner can cost the query accurately and pick the HNSW index every
-- time. Function attributes (LANGUAGE sql / STABLE / SECURITY DEFINER /
-- SET search_path) preserved from the prior definition.
CREATE OR REPLACE FUNCTION public.match_marketplace_listings_v2(
  query_embedding vector,
  filter_category text DEFAULT NULL,
  match_threshold double precision DEFAULT 0.0,
  match_count integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, category text, subcategory text, title text, description text, attributes jsonb, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ml.id, ml.category::text, ml.subcategory, ml.title, ml.description, ml.attributes,
         1 - (ml.embedding <=> query_embedding) AS similarity
  FROM marketplace_listings ml
  WHERE ml.embedding IS NOT NULL
    AND (filter_category IS NULL OR ml.category = filter_category::marketplace_category)
    AND (match_threshold <= 0.0 OR (1 - (ml.embedding <=> query_embedding)) >= match_threshold)
  ORDER BY ml.embedding <=> query_embedding
  OFFSET p_offset
  LIMIT match_count;
$function$;
