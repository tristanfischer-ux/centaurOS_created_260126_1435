-- 20260423120000_cad_lab_dimension_sheet.sql
--
-- Adds dimension_sheet JSONB column on cad_lab_projects.
--
-- Shape: see src/lib/sizing/types.ts::DimensionSheet.
--   {
--     feasible: boolean,
--     rules_domain: string,     -- "battery_energy_storage" / "vertical_farm" / "heat_pump"
--     rules_version: string,    -- "1.0.0"
--     envelope: Envelope,       -- { kind, label, interior_w/d/h_mm, interior_floor_m2, ... }
--     target: Record<string, number>,           -- domain-specific: { kwh, kw } or { canopy_m2, tiers }
--     floor_budget_m2: number,
--     module_dimensions: Record<moduleId | slotName, ModuleDimensions>,
--     unmatched_module_ids: string[],
--     unmatched_slot_ids: string[],
--     conflicts: string[],
--     recommendations: string[],
--     notes: string[],
--     iterations: SolverIteration[],
--     generated_at: iso
--   }
--
-- Produced by `runFangSizing(projectId)` after Max completes decomposition.
-- Consumed by:
--   1. Image prompt builders (buildModulePrompt, buildInteriorExplodedPrompt)
--      — injects W×D×H + mount + neighbour awareness into prompts so modules
--      render at correct proportions.
--   2. BOM generator — cross-checks part envelopes against module envelopes.
--   3. Fang review cascade — flags modules that exceed their allocated
--      footprint.
--   4. Forge UI — renders a sizing report on the project page.
--
-- Null when sizing hasn't been run yet OR when the project's domain has no
-- registered rule library.
--
-- ROLLBACK:
--   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS dimension_sheet;

BEGIN;

ALTER TABLE public.cad_lab_projects
    ADD COLUMN IF NOT EXISTS dimension_sheet JSONB DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.dimension_sheet IS
    'Output of the Forge sizing engine — per-module W×D×H, floor budget, conflicts, and feasibility. Shape defined in src/lib/sizing/types.ts::DimensionSheet. Computed by runFangSizing() post-Max decomposition. Consumed by image prompts + BOM + Fang review.';

COMMIT;
