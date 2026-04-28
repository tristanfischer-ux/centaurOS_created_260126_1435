-- ============================================================
-- Quality Gates v2.0 — Phase 1 infrastructure
-- ============================================================
-- migration: 20260428100000_quality_gates_v2
-- Applied: 2026-04-28
-- Purpose: Gate verdicts table, stage locks, and immutable
--          founder_raw_brief column needed by Gate 1.
--
-- DESIGN NOTE: ENABLE_QUALITY_GATES env-var gates the TS runner.
-- These schema objects are always present; the TS layer is the
-- flag-check. Zero behaviour change until the flag is set to 'true'.
-- ============================================================

-- ── 1. gate_verdicts — one row per gate evaluation attempt ──

CREATE TABLE IF NOT EXISTS gate_verdicts (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id                 UUID NOT NULL REFERENCES cad_lab_projects(id) ON DELETE CASCADE,
    gate_id                    INT  NOT NULL CHECK (gate_id BETWEEN 1 AND 7),
    -- bumped on user-triggered re-regen (matches the pipeline iteration concept)
    pipeline_run_iteration     INT  NOT NULL DEFAULT 1,
    attempt                    SMALLINT NOT NULL CHECK (attempt BETWEEN 1 AND 2),
    verdict                    TEXT NOT NULL CHECK (verdict IN ('PASS', 'FAIL', 'WARN')),
    severity                   TEXT CHECK (severity IN ('P0', 'P1') OR severity IS NULL),
    failure_details            TEXT,
    -- array of {model, verdict, reasoning} — populated for LLM-voted gates (1, 4, 7)
    model_votes                JSONB,
    -- {check_name, passed, actual, expected} — populated for deterministic gates (2, 3, 5, 6)
    deterministic_result       JSONB,
    remediation_fired          BOOLEAN NOT NULL DEFAULT FALSE,
    remediation_target_stage   TEXT,
    remediation_context_injected TEXT,
    uncertainty_marker_required BOOLEAN NOT NULL DEFAULT FALSE,
    uncertainty_marker_text    TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: all verdicts for a project in a given pipeline iteration
CREATE INDEX IF NOT EXISTS idx_gate_verdicts_project_iteration_gate
    ON gate_verdicts (project_id, pipeline_run_iteration, gate_id, created_at DESC);

-- Secondary lookup: per-gate attempt counter (used by runner.ts to determine
-- whether a second attempt is still available)
CREATE INDEX IF NOT EXISTS idx_gate_verdicts_attempt_lookup
    ON gate_verdicts (project_id, gate_id, pipeline_run_iteration);

-- ── 2. pipeline_stage_locks — prevents re-fire races ───────────

CREATE TABLE IF NOT EXISTS pipeline_stage_locks (
    project_id UUID NOT NULL REFERENCES cad_lab_projects(id) ON DELETE CASCADE,
    stage      TEXT NOT NULL,
    locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- identifies the cron tick or gate that acquired the lock
    -- e.g. 'autopilot_tick', 'remediation_gate_3'
    locked_by  TEXT NOT NULL,
    PRIMARY KEY (project_id, stage)
);

-- Stale-lock detection: any row older than 10 min is presumed dead.
-- The runner queries: WHERE locked_at < NOW() - INTERVAL '10 minutes'
CREATE INDEX IF NOT EXISTS idx_stage_locks_stale
    ON pipeline_stage_locks (locked_at);

-- ── 3. founder_raw_brief — immutable ground truth for Gate 1 ──

ALTER TABLE cad_lab_projects
    ADD COLUMN IF NOT EXISTS founder_raw_brief TEXT;

-- Backfill: copy the existing `subject` into founder_raw_brief so
-- all in-flight projects have ground truth before Gate 1 can run.
UPDATE cad_lab_projects
    SET founder_raw_brief = subject
    WHERE founder_raw_brief IS NULL;

-- Enforce NOT NULL now that the backfill has run.
ALTER TABLE cad_lab_projects
    ALTER COLUMN founder_raw_brief SET NOT NULL;

-- ── Verification queries (used by the Phase 1 agent post-apply) ──
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('gate_verdicts', 'pipeline_stage_locks');
--
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'cad_lab_projects'
--   AND column_name = 'founder_raw_brief';
