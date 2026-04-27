-- @file 20260427180000_canonical_specs_ledger.sql
-- @description L16-A1 — canonical specs ledger.
--
-- Council unanimity (8/8 models) flagged the missing single-source-of-truth as
-- the architectural blocker between Loop 14 (7/10) and 9/10. Today every
-- specialist (Max, BOM generator, Sizing, Finn, Fang) writes its own view of
-- canonical numbers; reconciliation gate flags the contradictions at the end
-- but cannot repair them.
--
-- This migration adds a JSONB column `canonical_specs` on cad_lab_projects.
-- Every specialist UPSERTs through src/lib/cad-lab/canonical-ledger.ts (with
-- source-rank gating) so a Fang patch can supersede a BOM-generator estimate
-- which can supersede a Max-decomposition guess. The PDF renderer reads only
-- from this column.
--
-- Why JSONB on the existing row (not a normalised table):
--   * The pipeline already centres on cad_lab_projects rows.
--   * Atomic UPDATE locks work without cross-table coordination.
--   * Migration to a normalised table (Loop 17+) is straightforward when 10k
--     projects make GIN-index hot-path queries necessary; today we have <100
--     active projects.
--   * Consensus on the storage shape was 5/8 normalised vs 3/8 JSONB. Picking
--     JSONB ships in this loop; normalised ships in a future loop.
--
-- Companion code: src/lib/cad-lab/canonical-ledger.ts (Zod schema + helpers).

ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS canonical_specs JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS canonical_specs_revision INTEGER NOT NULL DEFAULT 0;

-- Optional digest column for fixed-point detection (Loop 16 review-revise loop
-- halts when canonical_specs_digest equals the previous iteration's digest).
ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS canonical_specs_digest TEXT;

-- Audit trail for Fang patches. Every applied patch is INSERTed here before
-- canonical_specs is mutated. Lets us replay history, detect oscillating
-- patches via SHA-1 of (target, value), and surface unresolved patches in
-- the rendered report.
CREATE TABLE IF NOT EXISTS cad_lab_design_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES cad_lab_projects(id) ON DELETE CASCADE,
  patch_payload JSONB NOT NULL,
  patch_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  source_rank SMALLINT NOT NULL,
  iteration SMALLINT NOT NULL DEFAULT 0,
  cost_impact_gbp_pence BIGINT,
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cad_lab_design_patches_project
  ON cad_lab_design_patches(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cad_lab_design_patches_hash
  ON cad_lab_design_patches(project_id, patch_hash);

-- RLS: same rules as cad_lab_projects (read your foundry, write through
-- service-role + server actions). Server actions use admin client so we
-- bypass RLS for writes; users-only SELECT policy mirrors cad_lab_projects.
ALTER TABLE cad_lab_design_patches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "design_patches_foundry_select" ON cad_lab_design_patches;
CREATE POLICY "design_patches_foundry_select" ON cad_lab_design_patches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM cad_lab_projects p
      WHERE p.id = cad_lab_design_patches.project_id
        AND p.foundry_id IN (
          SELECT foundry_id FROM profiles WHERE id = auth.uid()
        )
    )
  );

-- Service-role (server actions, cron jobs, autopilot) writes patches via
-- createAdminClient(). RLS is bypassed by service_role automatically; no
-- INSERT/UPDATE policy needed for the agent.

COMMENT ON COLUMN cad_lab_projects.canonical_specs IS
  'L16-A1 canonical ledger. {modules: {moduleId: {specs: {key: {value, unit, source, sourceRank, updatedAt}}}}, parts: {partId: {unitCostGbp: {value, source, sourceRank}, ...}}, costRollup: {bomTotalGbp, finnTotalGbp, projectTotalGbp}}.';

COMMENT ON COLUMN cad_lab_projects.canonical_specs_revision IS
  'Increments on every UPSERT through canonical-ledger.ts. Used as optimistic-lock token by review-revise loop.';

COMMENT ON COLUMN cad_lab_projects.canonical_specs_digest IS
  'SHA-256 of stable-stringified canonical_specs. Used for fixed-point detection in the Fang review-revise loop (halt when digest unchanged between iterations).';
