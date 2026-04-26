-- Migration: aggressive autovacuum on marketplace_listings to prevent
-- pgvector statement_timeout (57014) recurrence.
--
-- Root cause (diagnosed 2026-04-26 night via 3-way LLM council —
-- Qwen3.6-Plus + Gemini-3.1-Pro + GPT-5.5):
--
-- The IVFFlat index `idx_marketplace_listings_finance_embedding_cosine`
-- covers all 28,315 marketplace_listings rows. The match_marketplace_listings_v2
-- RPC applies category='Finance' as a post-filter, which the Postgres planner
-- needs accurate row-count statistics for to choose the index scan. Postgres
-- default autovacuum_analyze_scale_factor=0.1 means stats only refresh after
-- ~2,800 row changes — easily enough drift to cause the planner to fall back
-- to seq scan + full vector distance computation, which then exceeds
-- statement_timeout under load. Symptom: 57014 returned to searchInvestors,
-- semantic search silently falls through to the keyword path, founders see
-- "No investors matched that description".
--
-- Fix history:
--   - PAGES 8 -> 2 (transient)
--   - PAGES 2 -> 1 + match_count 1500 -> 200 (transient, ~12 hours)
--   - match_threshold -1.0 -> 0.0 (transient, hours)
--   - VACUUM ANALYZE manually (immediate restore — confirmed root cause)
--   - This migration (structural — re-analyze every 2% changed instead of 10%)
--
-- Cost: minimal. Re-analyze on a 28K-row table with vector column is sub-second.
-- Even at 5x the default trigger frequency the autovacuum overhead is trivial
-- compared to the cost of a single semantic-search timeout.

ALTER TABLE marketplace_listings SET (
  autovacuum_analyze_scale_factor = 0.02,  -- analyze every ~566 row changes
  autovacuum_vacuum_scale_factor  = 0.05   -- vacuum every ~1,415 row changes
);

-- Run an analyze immediately so the new settings take effect without waiting
-- for the next ingestion churn to cross the 2% threshold.
ANALYZE marketplace_listings;
