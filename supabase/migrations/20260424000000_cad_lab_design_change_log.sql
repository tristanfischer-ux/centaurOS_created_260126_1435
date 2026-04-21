-- 20260424000000_cad_lab_design_change_log.sql
--
-- Adds cad_lab_projects.design_change_log (jsonb array) to record
-- specialist-driven mutations to module design fields — and the pending
-- recommendations that couldn't be auto-applied because no matching module
-- field exists yet (e.g. material / process recommendations from Fang).
--
-- Shape of each entry:
--   {
--     "at": "2026-04-24T12:34:56.000Z",
--     "moduleId": "chassis",
--     "specialistId": "vp-manufacturing",
--     "specialistName": "Fang",
--     "source": "review:fang",
--     "kind": "applied" | "pending",
--     "field": "budgetMassKg" | null,
--     "oldValue": <json-scalar>,
--     "newValue": <json-scalar>,
--     "reason": "<issue.message>",
--     "severity": "critical" | "warning" | "info",
--     "category": "<issue.category>",
--     "suggestion": "<issue.suggestion>"
--   }
--
-- Pending entries represent recommendations the specialist made that don't
-- have a corresponding mutable module field (e.g. module-level material).
-- The human must action them from the UI. Applied entries are the fields
-- that the cascade actually wrote — every one also lands in audit_log so
-- the mutation is reversible and attributable.
--
-- NB: audit_log already records the same change via section='module:cascade',
-- action='fang-applied'. design_change_log is the project-scoped view used
-- by the Modules / Revisions pages; audit_log is the tenant-wide history.

ALTER TABLE public.cad_lab_projects
    ADD COLUMN IF NOT EXISTS design_change_log jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cad_lab_projects.design_change_log IS
    'Append-only log of specialist-driven module mutations + pending recommendations. See 20260424000000_cad_lab_design_change_log.sql for shape.';
