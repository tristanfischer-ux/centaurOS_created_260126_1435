-- Migration: Add composite index for daily feature cap queries
--
-- The checkDailyFeatureCap() function queries ai_usage_log filtered by
-- (foundry_id, feature, created_at >= today). Without this index, the query
-- scans all of a foundry's rows for the day, then filters by feature in memory.
-- This composite index allows an index-only scan for the daily cap check.

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_foundry_feature_created
    ON public.ai_usage_log (foundry_id, feature, created_at DESC);
