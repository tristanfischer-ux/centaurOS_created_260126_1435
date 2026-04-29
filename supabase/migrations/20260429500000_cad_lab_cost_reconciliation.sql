-- Migration: add cost_reconciliation JSONB column to cad_lab_projects
--
-- Stores the output of the post-Finn cost reconciliation step so both
-- the PDF renderer and the UI consume a single pre-calculated result
-- rather than recomputing independently (which could produce different
-- totals from different code paths — the very problem this solves).
--
-- Column is nullable — projects that pre-date this migration, or that
-- have not yet run Finn, will have a NULL here. Callers must handle NULL
-- gracefully (skip reconciliation rendering).

ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS cost_reconciliation JSONB NULL;

-- Add a comment so future readers understand the shape.
-- Full TypeScript type is CostReconciliationResult in
-- src/lib/cost/cost-reconciliation.ts.
COMMENT ON COLUMN cad_lab_projects.cost_reconciliation IS
  'Post-Finn independent cost cross-check. Shape: CostReconciliationResult '
  '(src/lib/cost/cost-reconciliation.ts). Null = not yet computed or '
  'pre-reconciliation-feature project. Written by runCostReconciliation '
  '(src/actions/specialists/run-cost-reconciliation.ts) immediately after '
  'Finn completes.';
