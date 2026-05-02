-- Heartbeat-based stale detection for pipeline_runs.
-- The heartbeat_at column already existed on the table; this migration
-- is a no-op DDL marker so the migration history is complete.
-- Specialists call updatePipelineHeartbeat() every 60s during execution.
-- Cron marks rows stale if no heartbeat for 3 minutes (vs fixed age-based check).
-- Falls back to started_at for rows that pre-date heartbeat tracking.

-- heartbeat_at is already present; ADD COLUMN IF NOT EXISTS is safe to re-run.
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz DEFAULT now();
