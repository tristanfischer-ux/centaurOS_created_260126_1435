-- Add heartbeat column to pipeline_runs for stale-detection.
-- Specialists call updatePipelineHeartbeat() every 60s during execution.
-- Cron marks rows stale if no heartbeat for 3 minutes (vs. fixed age-based check).
-- Falls back to started_at/created_at for rows without heartbeat data.

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz DEFAULT now();
