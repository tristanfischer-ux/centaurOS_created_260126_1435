-- ============================================================
-- Quality Gates v2.0 — Gate Iteration Loop infrastructure
-- ============================================================
-- migration: 20260428300000_gate_remediation_context
-- Applied: 2026-04-28
-- Purpose: Add gate_remediation_context JSONB column to
--          cad_lab_projects so the cron handler can stash
--          per-stage remediation context for upstream specialists
--          to consume on the next re-fire.
--
-- Shape: { "<stage>": "<remediation_context_string>" }
--   e.g. { "waiting_sizing": "Gate 3 sizing feasibility failure..." }
--
-- The column is always present; ENABLE_QUALITY_GATES=true in the
-- TS layer is the feature flag. Zero behaviour change until the
-- flag is set.
-- ============================================================

ALTER TABLE cad_lab_projects
    ADD COLUMN IF NOT EXISTS gate_remediation_context JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cad_lab_projects.gate_remediation_context IS
    'Per-stage gate remediation context stashed by the cron handler when a Quality Gate FAILs with attempts_remaining > 0. Shape: { stage: contextString }. Consumed and cleared by the upstream specialist on re-fire.';
