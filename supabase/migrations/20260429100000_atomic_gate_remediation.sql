-- ============================================================
-- Quality Gates v2.0 — Atomic Gate Remediation Transaction (P0)
-- ============================================================
-- migration: 20260429100000_atomic_gate_remediation
-- Applied: 2026-04-29
--
-- PURPOSE
-- -------
-- The previous triggerRemediation() implementation issued three
-- separate Supabase JS calls in sequence:
--
--   1. INSERT/UPDATE gate_remediation_context on cad_lab_projects
--   2. UPDATE pipeline_runs (supersede stale rows)
--   3. UPDATE autopilot_state.stage on cad_lab_projects
--
-- A container kill (SIGKILL from Vercel) between any two steps
-- produces split-brain state:
--
--   * Steps 1+2 succeed, step 3 skipped → pipeline advances past
--     a gate that just FAILed (the tracking row is superseded but
--     autopilot_state.stage is still the completed stage, so the
--     next tick calls advance() as if the gate PASSed).
--
--   * Step 1 skipped, steps 2+3 succeed → specialist re-fires with
--     no remediation override → guaranteed identical FAIL on attempt
--     2 → attempts exhausted → uncertainty marker shipped.
--
-- This migration creates apply_gate_remediation(), a SECURITY
-- DEFINER PL/pgSQL function that wraps all three mutations inside
-- a single BEGIN…COMMIT block. The Supabase JS client calls it via
-- .rpc() — either all three writes land or none do.
--
-- The old gate_stash_remediation_context() helper RPC is also
-- created here for backward compatibility with any callers that
-- survived the split-brain window (it is idempotent; calling it
-- twice sets the same value).
--
-- SCHEMA DEPENDENCIES
-- -------------------
--   - cad_lab_projects.gate_remediation_context JSONB (migration 20260428300000)
--   - cad_lab_projects.autopilot_state           JSONB (pre-existing)
--   - pipeline_runs.status / error_code / error_message / finished_at (pre-existing)
--   - gate_verdicts.id UUID (migration 20260428100000)
-- ============================================================

-- ── 1. apply_gate_remediation — the atomic three-step function ──
--
-- All three writes execute inside a single implicit transaction
-- (PL/pgSQL functions run inside the caller's transaction; since
-- the Supabase JS client issues each .rpc() call as its own
-- auto-commit transaction, the entire function body is one atomic
-- unit from the client's perspective).
--
-- Parameters
--   p_project_id        cad_lab_projects.id (UUID)
--   p_target_stage      stage key to reset autopilot_state.stage to
--   p_context_json      the structured failure-context string to stash
--   p_verdict_id        UUID of the gate_verdicts row (audit trail, nullable)
--
-- Returns TEXT — 'ok' on success; raises EXCEPTION on any step failure
-- so the caller's transaction is rolled back automatically.

CREATE OR REPLACE FUNCTION apply_gate_remediation(
    p_project_id   UUID,
    p_target_stage TEXT,
    p_context_json TEXT,
    p_verdict_id   UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_state   JSONB;
    v_new_state       JSONB;
    v_supersede_reason TEXT;
BEGIN
    -- ── Step 1: stash remediation context ────────────────────────────────
    -- Use jsonb_set with create_missing=true so we touch ONLY the key for
    -- p_target_stage. All other stage keys in the JSONB map are preserved.
    -- This is atomic: a single UPDATE touching one cell.
    UPDATE cad_lab_projects
    SET gate_remediation_context = jsonb_set(
            COALESCE(gate_remediation_context, '{}'::jsonb),
            ARRAY[p_target_stage],
            to_jsonb(p_context_json),
            true  -- create_missing
        )
    WHERE id = p_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'apply_gate_remediation: project % not found', p_project_id;
    END IF;

    -- ── Step 2: supersede stale pipeline_runs for the target stage ────────
    -- Mark any done/running/queued rows for (project, target_stage) as
    -- failed with a stable error_code so the next cron tick does not treat
    -- them as "done" and advance() past the gate.
    v_supersede_reason := CASE
        WHEN p_verdict_id IS NOT NULL
            THEN 'Gate remediation triggered by verdict_id=' || p_verdict_id::TEXT || '. Stage reset to re-fire.'
        ELSE 'Gate remediation triggered. Stage reset to ' || p_target_stage || ' for re-fire.'
    END;

    UPDATE pipeline_runs
    SET
        status        = 'failed',
        error_code    = 'SUPERSEDED_BY_GATE',
        error_message = v_supersede_reason,
        finished_at   = NOW()
    WHERE
        project_id = p_project_id
        AND stage  = p_target_stage
        AND status IN ('done', 'running', 'queued');
    -- No FOUND check: it is valid for there to be zero rows to supersede
    -- on the very first gate iteration (no prior specialist run exists for
    -- this stage yet in the current pipeline_run_iteration).

    -- ── Step 3: reset autopilot_state.stage ──────────────────────────────
    -- Read the current JSONB blob, patch only the 'stage' key, write back.
    -- All other keys (started_at, completed_stages, pipeline_run_iteration,
    -- finished_at) are preserved unchanged.
    SELECT autopilot_state INTO v_current_state
    FROM cad_lab_projects
    WHERE id = p_project_id
    FOR UPDATE;  -- lock the row for this transaction to prevent concurrent update races

    IF v_current_state IS NULL THEN
        RAISE EXCEPTION 'apply_gate_remediation: autopilot_state is NULL for project %', p_project_id;
    END IF;

    v_new_state := jsonb_set(
        v_current_state,
        '{stage}',
        to_jsonb(p_target_stage),
        false  -- do NOT create the key if missing (should always exist)
    );

    UPDATE cad_lab_projects
    SET autopilot_state = v_new_state
    WHERE id = p_project_id;

    RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION apply_gate_remediation(UUID, TEXT, TEXT, UUID) IS
'Atomically wire a Quality Gate FAIL into an upstream specialist re-fire.
Steps (all within one transaction):
  1. Stash p_context_json at cad_lab_projects.gate_remediation_context[p_target_stage]
  2. Supersede done/running/queued pipeline_runs for (project, p_target_stage)
  3. Reset cad_lab_projects.autopilot_state.stage to p_target_stage
Called by triggerRemediation() in src/lib/forge-v2/stage-gates/remediation.ts.
Replaces the previous three-separate-JS-calls pattern that produced split-brain
state on container kill between steps (P0 from gates-council 2026-04-29).';


-- ── 2. gate_stash_remediation_context — backward-compat helper ────────
--
-- The TypeScript fallback path in remediation.ts calls this RPC for step 1
-- only (it pre-dates the atomic apply_gate_remediation function). Keeping
-- it means: if any in-flight code path still references it, it still works;
-- new code goes through apply_gate_remediation instead.
--
-- Also used by consumeRemediationContext as a JSONB-path-delete primitive
-- that the Supabase JS client cannot express natively.

CREATE OR REPLACE FUNCTION gate_stash_remediation_context(
    p_project_id UUID,
    p_stage      TEXT,
    p_context    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE cad_lab_projects
    SET gate_remediation_context = jsonb_set(
            COALESCE(gate_remediation_context, '{}'::jsonb),
            ARRAY[p_stage],
            to_jsonb(p_context),
            true
        )
    WHERE id = p_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'gate_stash_remediation_context: project % not found', p_project_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION gate_stash_remediation_context(UUID, TEXT, TEXT) IS
'Single-step JSONB patch for gate_remediation_context. Kept for backward
compatibility. New callers should use apply_gate_remediation() for the
full atomic three-step remediation sequence.';
