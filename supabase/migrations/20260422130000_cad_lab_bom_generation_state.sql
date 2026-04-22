-- 20260422130000_cad_lab_bom_generation_state.sql
--
-- Adds bom_generation_state JSONB column for distributed BOM orchestration.
--
-- Context: the monolithic generateBomFromModules() in src/actions/bom.ts did
-- skeleton + all batches + merge + persist inside a single lambda. Industrial
-- projects (BESS, HV switchgear, 40ft battery storage) with 8 modules produce
-- a dense skeleton (~60-70 parts), and the batch expansions plus catalogue
-- injection pushed total wall-clock past Vercel's 300s lambda cap. When the
-- lambda died at 300s, the pipeline_runs row stayed 'running' forever — no
-- code ran to stamp it failed.
--
-- The fix splits BOM into chained stages (skeleton → batch 1..N → merge),
-- each its own lambda invocation via after(), mirroring the pattern in
-- forge-v2-render-all-modules.ts (migration 20260425000000 added
-- image_render_state for the same reason).
--
-- Shape:
--   {
--     started_at: iso,
--     finished_at: iso | null,
--     skeleton_parts: SkeletonPart[],
--     expansions: Record<skeletonId, Expansion>,
--     pending_batches: string[][],   -- each inner array is a batch of skeleton ids
--     failed_batch_count: number,
--     error: string | null,
--     pipeline_run_id: string | null
--   }
--
-- Null when idle. Set by runBomGenerator on start; cleared to null by merge
-- stage on successful completion. On failure, finished_at is stamped and
-- error is filled; founder can retry via the Generate BOM CTA which seeds
-- a fresh state.

ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS bom_generation_state jsonb;

COMMENT ON COLUMN cad_lab_projects.bom_generation_state IS
  'Distributed BOM generation state. Populated by chained stages (skeleton -> batch -> merge) to avoid the 300s Vercel lambda cap on industrial projects. Shape: {started_at, finished_at, skeleton_parts, expansions, pending_batches, failed_batch_count, error, pipeline_run_id}. Null when idle.';
