-- Per-specialist sweep scheduling: add index for efficient last-run lookups
-- INTENT: The sweep orchestrator needs to quickly find the last sweep time
-- per (foundry_id, specialist_id) pair. This index enables that without
-- scanning the full table.

create index if not exists idx_sweep_log_foundry_specialist_time
  on agent_sweep_log (foundry_id, specialist_id, started_at desc);
