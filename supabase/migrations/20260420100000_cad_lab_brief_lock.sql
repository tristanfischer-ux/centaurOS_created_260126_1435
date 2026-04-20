-- Adds brief lock-state support to cad_lab_projects + documents the extended
-- CadLabDesignBrief shape that the V2 Brief page now expects.
--
-- INTENT: The Brief page (/the-forge-v2/projects/:id/brief) renders lock chip,
-- mission / target customers / why-now narrative, declared constraints, and
-- per-project regulatory posture. Lock state needs a real column. The other
-- fields live inside the existing research JSONB column (no schema change
-- needed) — we document the expected shape here so future readers don't have
-- to reverse-engineer it from TypeScript.
--
-- ROLLBACK:
--   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS brief_locked_at;
--   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS brief_locked_by;

BEGIN;

-- Lock state columns
ALTER TABLE public.cad_lab_projects
    ADD COLUMN IF NOT EXISTS brief_locked_at  TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS brief_locked_by  UUID        DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cad_lab_projects.brief_locked_at IS
    'Timestamp when the current brief revision was locked. When set, suppliers cite this revision on RFQs and edits create a new revision proposal. Null = draft.';

COMMENT ON COLUMN public.cad_lab_projects.brief_locked_by IS
    'User who locked the current brief revision. Null while brief_locked_at is null.';

-- Extended CadLabDesignBrief JSONB shape — the V2 Brief page reads these
-- fields out of research->designBrief. Legacy readers only use the original
-- six fields (useCase/targetProcess/targetMaterial/toleranceTarget/
-- quantityTarget/complianceNotes) and stay backward-compatible.
--
-- Expected shape (TypeScript source: src/lib/cad-lab-types.ts):
-- {
--   // Legacy fields (unchanged):
--   useCase: string
--   targetProcess: string
--   targetMaterial: string
--   toleranceTarget: string
--   quantityTarget: string
--   complianceNotes: string
--   // Brief-page additions (optional):
--   mission?: string
--   targetCustomers?: string
--   whyNow?: string
--   constraints?: {
--     unitCostCeilingGbp?: number
--     firstShipDate?: string       // ISO date
--     maxMassKg?: number
--     batchSize?: number
--     markets?: string[]
--     productionRegion?: string
--   }
--   regulatory?: Array<{
--     code: string
--     name: string
--     summary: string
--     status: "met" | "in-progress" | "not-started"
--   }>
-- }
COMMENT ON COLUMN public.cad_lab_projects.research IS
    'JSONB: { report, sources, referenceModels, researchTime, designBrief }. designBrief carries the legacy six-field CadLabDesignBrief plus optional V2 fields: mission, targetCustomers, whyNow, constraints { unitCostCeilingGbp, firstShipDate, maxMassKg, batchSize, markets, productionRegion }, and regulatory[] { code, name, summary, status }. See src/lib/cad-lab-types.ts for the canonical TypeScript shape.';

COMMIT;
