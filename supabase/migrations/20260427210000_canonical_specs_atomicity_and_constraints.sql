-- @file 20260427210000_canonical_specs_atomicity_and_constraints.sql
-- @description Block G follow-up — close the architectural holes flagged by
-- the GPT-5.5 + Gemini 3.1 Pro council on 2026-04-27.
--
-- Six fixes land in this migration:
--
-- 1. `apply_canonical_patch_atomic` Postgres function:
--    Wraps the canonical_specs UPDATE (with optimistic-lock on
--    canonical_specs_revision) and the cad_lab_design_patches INSERT in one
--    BEGIN ... COMMIT block so the audit row never claims `applied=true`
--    before the spec actually persists. Replaces the dangerous interleaving
--    in apply-design-patches.ts where logPatch fired before saveCanonicalSpecs.
--
-- 2. Returns a typed result that distinguishes:
--      OPTIMISTIC_LOCK_CONFLICT (zero rows updated)
--      APPLIED (one row updated + audit row inserted, returns new revision/digest)
--    The TypeScript caller no longer relies on PGRST116 / .single() heuristics.
--
-- 3. CHECK constraint on cad_lab_design_patches.source_rank that mirrors the
--    SOURCE_RANK enum in src/lib/cad-lab/source-rank.ts. Catches future
--    "hardcoded source_rank: 90" regressions at write time rather than
--    silently corrupting the audit log.
--
-- 4. Backfill — every cad_lab_projects row gets canonical_specs_revision = 0
--    where currently NULL. The previous migration's NOT NULL DEFAULT 0
--    handled new rows but pre-migration rows on a fresh deploy would have
--    inherited NULL until rewritten; this guarantees every project row has
--    a usable revision for optimistic-lock UPDATE matching.
--
-- 5. Unique constraint on (project_id, patch_hash, iteration) so a duplicate
--    audit insert in the same iteration is a hard error rather than a silent
--    second row.
--
-- 6. CHECK constraint on canonical_specs_revision >= 0.

-- ─── Backfill (must run before NOT NULL is depended on) ───────────────
UPDATE cad_lab_projects
SET canonical_specs_revision = 0
WHERE canonical_specs_revision IS NULL;

-- The column is already NOT NULL DEFAULT 0 from migration 20260427180000
-- but we re-assert it defensively.
ALTER TABLE cad_lab_projects
  ALTER COLUMN canonical_specs_revision SET NOT NULL,
  ALTER COLUMN canonical_specs_revision SET DEFAULT 0;

-- ─── Sanity CHECK on revision ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cad_lab_projects_canonical_specs_revision_nonneg'
  ) THEN
    ALTER TABLE cad_lab_projects
      ADD CONSTRAINT cad_lab_projects_canonical_specs_revision_nonneg
      CHECK (canonical_specs_revision >= 0);
  END IF;
END $$;

-- ─── Source-rank CHECK on cad_lab_design_patches ──────────────────────
-- Pinned to the values in src/lib/cad-lab/source-rank.ts. Adding a new
-- canonical source requires a paired migration + code change.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cad_lab_design_patches_source_rank_valid'
  ) THEN
    ALTER TABLE cad_lab_design_patches
      ADD CONSTRAINT cad_lab_design_patches_source_rank_valid
      CHECK (source_rank IN (0, 10, 30, 50, 70, 75, 80, 90, 100));
  END IF;
END $$;

-- ─── Source CHECK that mirrors CanonicalSource union ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cad_lab_design_patches_source_valid'
  ) THEN
    ALTER TABLE cad_lab_design_patches
      ADD CONSTRAINT cad_lab_design_patches_source_valid
      CHECK (source IN (
        'human_override',
        'applied_review_patch',
        'sizing_solver',
        'supplier_matcher',
        'bom_generator',
        'max_decomposition',
        'chase_research',
        'finn_cost',
        'proofreader'
      ));
  END IF;
END $$;

-- ─── Unique audit row per (project, hash, iteration) ──────────────────
-- Prevents duplicate INSERTs in a re-fired stage from looking like two
-- successful applications of the same patch.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_design_patches_project_hash_iter
  ON cad_lab_design_patches (project_id, patch_hash, iteration);

-- ─── Atomic apply RPC ─────────────────────────────────────────────────
-- Returns a single-row JSON object describing the outcome. The TypeScript
-- caller switches on `outcome` instead of decoding Postgres error codes.
CREATE OR REPLACE FUNCTION apply_canonical_patch_atomic(
  p_project_id        UUID,
  p_expected_revision INTEGER,
  p_new_specs         JSONB,
  p_new_digest        TEXT,
  p_patch_payload     JSONB,
  p_patch_hash        TEXT,
  p_source            TEXT,
  p_source_rank       SMALLINT,
  p_iteration         SMALLINT,
  p_cost_impact_pence BIGINT,
  p_applied           BOOLEAN,
  p_rejection_reason  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER;
  v_new_revision  INTEGER;
BEGIN
  -- Audit row first when this is a rejection — no spec mutation needed.
  IF p_applied = FALSE THEN
    INSERT INTO cad_lab_design_patches (
      project_id, patch_payload, patch_hash, source, source_rank,
      iteration, cost_impact_gbp_pence, applied, applied_at, rejection_reason
    ) VALUES (
      p_project_id, p_patch_payload, p_patch_hash, p_source, p_source_rank,
      p_iteration, p_cost_impact_pence, FALSE, NULL, p_rejection_reason
    )
    ON CONFLICT (project_id, patch_hash, iteration) DO NOTHING;

    RETURN jsonb_build_object(
      'outcome', 'REJECTED_LOGGED',
      'revision', p_expected_revision,
      'digest', NULL
    );
  END IF;

  -- Applied path — atomic UPDATE with optimistic-lock match.
  v_new_revision := p_expected_revision + 1;

  UPDATE cad_lab_projects
  SET canonical_specs           = p_new_specs,
      canonical_specs_revision  = v_new_revision,
      canonical_specs_digest    = p_new_digest
  WHERE id = p_project_id
    AND canonical_specs_revision = p_expected_revision;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    -- Either project missing or revision mismatched. Distinguish.
    IF NOT EXISTS (SELECT 1 FROM cad_lab_projects WHERE id = p_project_id) THEN
      RETURN jsonb_build_object(
        'outcome', 'PROJECT_NOT_FOUND',
        'revision', NULL,
        'digest', NULL
      );
    END IF;
    RETURN jsonb_build_object(
      'outcome', 'OPTIMISTIC_LOCK_CONFLICT',
      'revision', NULL,
      'digest', NULL
    );
  END IF;

  -- Spec UPDATE succeeded — now the audit row in the SAME transaction.
  -- A failure here rolls back the spec UPDATE too (function is atomic).
  INSERT INTO cad_lab_design_patches (
    project_id, patch_payload, patch_hash, source, source_rank,
    iteration, cost_impact_gbp_pence, applied, applied_at, rejection_reason
  ) VALUES (
    p_project_id, p_patch_payload, p_patch_hash, p_source, p_source_rank,
    p_iteration, p_cost_impact_pence, TRUE, NOW(), NULL
  );

  RETURN jsonb_build_object(
    'outcome', 'APPLIED',
    'revision', v_new_revision,
    'digest', p_new_digest
  );
END;
$$;

COMMENT ON FUNCTION apply_canonical_patch_atomic IS
  'L16-G atomic patch application: UPDATE canonical_specs (optimistic-lock matched on canonical_specs_revision) + INSERT cad_lab_design_patches audit row in one transaction. Returns jsonb { outcome, revision, digest } where outcome IN (APPLIED, REJECTED_LOGGED, OPTIMISTIC_LOCK_CONFLICT, PROJECT_NOT_FOUND).';

-- Service-role only — server actions reach this via createAdminClient().
REVOKE EXECUTE ON FUNCTION apply_canonical_patch_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_canonical_patch_atomic TO service_role;
