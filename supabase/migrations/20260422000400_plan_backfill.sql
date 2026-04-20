-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 — Plan redesign · Chunk A.4 — Idempotent backfill scripts
--
-- Three non-destructive backfills per PLAN-SCHEMA §A.4 + §A.5 + §A.2:
--
--   1. objectives WHERE is_strategic_goal=true   → strategic_goals rows
--      Idempotent via strategic_goals.source_objective_id UNIQUE FK.
--   2. tasks WHERE title LIKE '[Draft]%'         → tasks.is_draft = true
--      Idempotent via WHERE is_draft = false guard.
--   3. report_snapshots WHERE report_type=
--      'red-team-debate'                         → pressure_test_sessions rows
--      Idempotent via pressure_test_sessions.legacy_report_snapshot_id
--      UNIQUE partial index.
--
-- No DELETEs. No UPDATEs to legacy rows. Legacy readers keep working in their
-- original shape (§A.2 data-preservation contract).
--
-- The backfills are wrapped in per-section DO blocks so a missing legacy
-- column/table does not abort the migration — if the precondition is not met
-- the block logs a NOTICE and falls through.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. objectives.is_strategic_goal=true → strategic_goals · §A.4
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Guard: legacy column must exist.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'objectives'
      AND column_name  = 'is_strategic_goal'
  ) THEN
    RAISE NOTICE 'plan backfill: objectives.is_strategic_goal missing — skipping strategic_goals backfill';
    RETURN;
  END IF;

  INSERT INTO public.strategic_goals (
    id,
    foundry_id,
    title,
    description,
    state,
    is_pinned,
    pin_order,
    quarter,
    milestone_date,
    lead_user_id,
    created_by,
    created_at,
    updated_at,
    source_objective_id
  )
  SELECT
    gen_random_uuid(),
    o.foundry_id,
    COALESCE(NULLIF(o.title, ''), '(untitled goal)'),
    o.description,
    CASE o.status
      WHEN 'completed' THEN 'completed'::public.goal_state
      WHEN 'cancelled' THEN 'killed'::public.goal_state
      ELSE 'active'::public.goal_state
    END,
    false,
    NULL::smallint,
    COALESCE(o.metadata->>'quarter', to_char(now(), '"Q"Q YYYY')),
    COALESCE((o.metadata->>'target_date')::date, (now() + interval '90 days')::date),
    o.created_by,  -- lead defaults to creator; satisfies §1 "exactly one lead" check
    o.created_by,
    o.created_at,
    o.updated_at,
    o.id
  FROM public.objectives o
  WHERE o.is_strategic_goal = true
    AND o.deleted_at IS NULL
    AND o.created_by IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.strategic_goals sg
      WHERE sg.source_objective_id = o.id
    );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. tasks WHERE title LIKE '[Draft]%' → tasks.is_draft = true · §A.5
--    Legacy Review queue used the "[Draft]" title prefix convention.
--    WHERE is_draft = false keeps re-runs cheap (no row updated twice).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tasks'
      AND column_name  = 'is_draft'
  ) THEN
    RAISE NOTICE 'plan backfill: tasks.is_draft missing — skipping draft backfill';
    RETURN;
  END IF;

  UPDATE public.tasks
  SET is_draft = true
  WHERE title LIKE '[Draft]%'
    AND is_draft = false;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Legacy report_snapshots WHERE report_type='red-team-debate'
--    → pressure_test_sessions · §A.2 preservation table + §10
--
--    Legacy rows are NOT deleted — they remain readable at /reports until
--    decommission. Idempotency: pressure_test_sessions.legacy_report_snapshot_id
--    is UNIQUE (partial) per 20260422000100_plan_tables.sql.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  has_report_snapshots boolean;
  has_report_type      boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'report_snapshots'
  ) INTO has_report_snapshots;

  IF NOT has_report_snapshots THEN
    RAISE NOTICE 'plan backfill: report_snapshots table missing — skipping pressure_test_sessions backfill';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'report_snapshots'
      AND column_name  = 'report_type'
  ) INTO has_report_type;

  IF NOT has_report_type THEN
    RAISE NOTICE 'plan backfill: report_snapshots.report_type missing — skipping pressure_test_sessions backfill';
    RETURN;
  END IF;

  -- We do not assume any particular shape for `payload` / `content` on
  -- report_snapshots beyond it being jsonb; the whole row's jsonb payload
  -- becomes the subject_snapshot for provenance. Transcript is taken from
  -- payload->>'transcript' when present, else an empty array.
  EXECUTE $SQL$
    INSERT INTO public.pressure_test_sessions (
      id,
      foundry_id,
      goal_id,
      subject_type,
      subject_ref,
      subject_snapshot,
      personas_used,
      rounds,
      transcript_json,
      verdict,
      verdict_body,
      legacy_report_snapshot_id,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      rs.foundry_id,
      NULL::uuid,
      'custom'::public.pressure_subject_type,
      NULL::uuid,
      to_jsonb(rs.*),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(rs.payload->'personas_used')),
        ARRAY[]::text[]
      ),
      COALESCE((rs.payload->>'rounds')::smallint, 0),
      COALESCE(rs.payload->'transcript', '[]'::jsonb),
      NULL::public.pressure_verdict,
      rs.payload->>'verdict_body',
      rs.id,
      rs.created_at,
      COALESCE(rs.updated_at, rs.created_at)
    FROM public.report_snapshots rs
    WHERE rs.report_type = 'red-team-debate'
      AND rs.foundry_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.pressure_test_sessions pts
        WHERE pts.legacy_report_snapshot_id = rs.id
      );
  $SQL$;
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'plan backfill: report_snapshots shape mismatch (undefined_column) — skipped %', SQLERRM;
  WHEN undefined_table THEN
    RAISE NOTICE 'plan backfill: report_snapshots shape mismatch (undefined_table) — skipped %', SQLERRM;
END $$;
