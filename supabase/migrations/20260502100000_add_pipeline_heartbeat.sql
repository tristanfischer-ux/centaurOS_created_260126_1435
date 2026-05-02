-- Add heartbeat_at column to pipeline_runs for improved stale-run detection.
--
-- The existing stale-detection (commit a7a33c83) uses `started_at` to decide
-- whether a running row is a zombie (container killed mid-flight). That works
-- for short specialists but is unreliable for long-running ones like Chase
-- (9-12 min) or Fang reviews: a legitimate run looks stale after 5 minutes
-- even when it is actively making progress.
--
-- heartbeat_at is refreshed every ~60 seconds by updatePipelineHeartbeat().
-- The stale check now uses MAX(heartbeat_at, started_at) so:
--   - rows without a heartbeat fall back to the original started_at logic
--   - rows with a recent heartbeat are never marked stale mid-run
--   - rows whose heartbeat is >5 min stale (container died) are recovered as before

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Index so the stale-detection query can scan quickly
CREATE INDEX IF NOT EXISTS pipeline_runs_heartbeat_at_idx
  ON pipeline_runs (heartbeat_at)
  WHERE status IN ('queued', 'running');
