-- Fix investor search returning 57014 statement_timeout for some prose queries.
--
-- Diagnostic chain (2026-04-26 evening, after Tristan flagged "search was
-- working before, why not now?"):
--
-- 1. UI showed "Investor search is temporarily unavailable" (the
--    semanticFailed branch from commit 2f7a7e2b) for the prose query
--    "Climate tech hardware startup, Pre-Seed, UK, hydrogen electrolyser".
--    Reproduced via direct REST call to match_marketplace_listings_v2:
--    HTTP 500 with code=57014 'canceling statement due to statement timeout'
--    after 3.1s. Other queries ("Hardware startup raising Seed round") ran
--    in 1.0s.
--
-- 2. Statement_timeout for the anon role is 3s (authenticated is 8s, but
--    even 8s wasn't enough for the slow embeddings — confirmed via Vercel
--    logs).
--
-- 3. Root cause: pgvector's HNSW post-filter pathology. The base HNSW
--    index covers all 27,053 embedded marketplace_listings rows (Services
--    13,864 + Finance 8,264 + Products 4,804 + People 100 + AI 21).
--    For a query like "Climate tech hardware startup hydrogen electrolyser",
--    the nearest neighbours in vector space are mostly Services + Products
--    (climate-tech SUPPLIERS), not Finance investors. HNSW has to traverse
--    the graph deep to find 200 Finance-category neighbours, blowing past
--    the 3s timeout. For "Hardware startup raising Seed round" the
--    neighbourhood is Finance-dense, finishes fast.
--
-- 4. Tried: partial HNSW index on category='Finance' alone
--    (idx_marketplace_listings_embedding_hnsw_finance from this earlier in
--    the session). Helped but ef_search default of 40 still meant only 40
--    rows returned for some queries, with the graph traversal still slow
--    for sparse query embeddings.
--
-- The fix: bake hnsw.ef_search = 300 into the RPC via set_config(). Direct
-- SET hnsw.ef_search requires superuser on Supabase (denied), but
-- set_config('hnsw.ef_search','300', true) works inside a plpgsql function
-- as a transaction-local GUC. ef_search=300 with match_count=100 default
-- gives:
--   - climate-tech query: 0.42s, 100 climate-relevant Finance rows
--   - hardware-seed query: <1s, 100 generic VC rows
--   - industrial-robotics: <1s, populated robotics-relevant Finance rows
--
-- Trade-off: 300 ef_search vs the previous unset default — slightly more
-- candidate buffer at search time, marginal latency cost on easy queries.
-- Worth it: prior behaviour silently dropped slow queries entirely.
--
-- Caller change: NONE. The RPC's match_count default dropped from 200 to
-- 100, but searchInvestorsCore still passes match_count=200 explicitly,
-- which works (tested 200-row return at 0.58s). Downstream UI shows
-- top-50; 100 candidates is plenty for the ranker.
--
-- @memory: forgeos_pgvector_statement_timeout.md (existing entry covers
-- the 8x parallel scan trigger; this adds ef_search/HNSW post-filter as a
-- separate cause). Update memory after deploy.

CREATE OR REPLACE FUNCTION public.match_marketplace_listings_v2(
  query_embedding vector,
  filter_category text DEFAULT NULL,
  match_threshold double precision DEFAULT 0.0,
  match_count integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  category text,
  subcategory text,
  title text,
  description text,
  attributes jsonb,
  similarity double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('hnsw.ef_search', '300', true);
  RETURN QUERY
  SELECT ml.id, ml.category::text, ml.subcategory, ml.title, ml.description, ml.attributes,
         1 - (ml.embedding <=> query_embedding) AS similarity
  FROM marketplace_listings ml
  WHERE ml.embedding IS NOT NULL
    AND (filter_category IS NULL OR ml.category = filter_category::marketplace_category)
    AND (match_threshold <= 0.0 OR (1 - (ml.embedding <=> query_embedding)) >= match_threshold)
  ORDER BY ml.embedding <=> query_embedding
  OFFSET p_offset
  LIMIT match_count;
END;
$function$;

-- Partial HNSW index on Finance only — additional safety net so that even
-- if the planner misses ef_search tuning, queries that filter by
-- category='Finance' use a pre-filtered graph (8,264 vectors instead of
-- 27,053). idx_marketplace_listings_embedding_hnsw_finance was created
-- earlier in the session via execute_sql; this is a no-op IF EXISTS.
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_embedding_hnsw_finance
  ON marketplace_listings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE category = 'Finance' AND embedding IS NOT NULL;
