-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 — Plan redesign · Chunk A.2 — Additive columns on existing tables
--
-- Per PLAN-SCHEMA §A.5 + §3 + §4 + §5, Phase 3 is purely additive at the
-- database layer: no DROP TABLE, no DROP COLUMN, no destructive migration.
-- This migration:
--
--   1. Adds objectives.strategic_goal_id  — links objectives to their parent
--      Strategic Goal. NULL-safe: old rows unaffected; new Plan workspace reads
--      WHERE strategic_goal_id IS NOT NULL to build the goal-grouped view.
--   2. Adds tasks.(strategic_goal_id, is_draft, is_pinned, horizon, origin,
--      origin_ref) — all nullable / defaulted, no behaviour change for legacy
--      /new-tasks.
--   3. Adds task_assignees.fractional_id IF ABSENT — wrapped in DO block that
--      checks information_schema first so re-running is a no-op.
--
-- All ADDs use IF NOT EXISTS. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. objectives.strategic_goal_id ─────────────────────────────────────────
-- PLAN-SCHEMA §3 — the FK that lets the new Plan workspace group objectives
-- under their Strategic Goal without touching legacy /new-objectives reads.

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS strategic_goal_id uuid NULL
    REFERENCES public.strategic_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS objectives_strategic_goal_idx
  ON public.objectives (strategic_goal_id)
  WHERE strategic_goal_id IS NOT NULL;

COMMENT ON COLUMN public.objectives.strategic_goal_id IS
  'PLAN-SCHEMA §3 — links objective to its parent Strategic Goal. NULL on '
  'legacy rows; populated when objectives are authored from /plan/goal/[id].';

-- ── 2. tasks additive columns ───────────────────────────────────────────────
-- PLAN-SCHEMA §A.5 — 6 nullable / defaulted columns; no row migration.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS strategic_goal_id uuid NULL
    REFERENCES public.strategic_goals(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS horizon text NULL
    CHECK (horizon IS NULL OR horizon IN ('this_week','this_month','later','done'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS origin text NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS origin_ref text NULL;

-- Indexes supporting the Plan workspace filters (goal-scoped, horizon buckets,
-- pinned-this-week signal rail).
CREATE INDEX IF NOT EXISTS tasks_strategic_goal_idx
  ON public.tasks (strategic_goal_id)
  WHERE strategic_goal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_foundry_horizon_idx
  ON public.tasks (foundry_id, horizon)
  WHERE horizon IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_foundry_pinned_idx
  ON public.tasks (foundry_id, is_pinned)
  WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS tasks_foundry_draft_idx
  ON public.tasks (foundry_id, is_draft)
  WHERE is_draft = true;

COMMENT ON COLUMN public.tasks.strategic_goal_id IS
  'PLAN-SCHEMA §A.5 — links task to its parent Strategic Goal for the new Plan workspace.';
COMMENT ON COLUMN public.tasks.is_draft IS
  'PLAN-SCHEMA §A.5 — Review-queue draft flag. Backfilled from legacy "[Draft]%" title pattern.';
COMMENT ON COLUMN public.tasks.is_pinned IS
  'PLAN-SCHEMA §A.5 — pin-to-week flag. Drives "Close the week" event on Fridays (§14.1).';
COMMENT ON COLUMN public.tasks.horizon IS
  'PLAN-SCHEMA §A.5 — this_week | this_month | later | done. App-derived initially from due_date.';
COMMENT ON COLUMN public.tasks.origin IS
  'PLAN-SCHEMA §A.5 — where the task came from (specialist_rec, manual, objective, pressure_test, etc).';
COMMENT ON COLUMN public.tasks.origin_ref IS
  'PLAN-SCHEMA §A.5 — free-form ref (e.g. specialist_recommendation.id) anchoring the origin.';

-- ── 3. task_assignees.fractional_id (guarded) ───────────────────────────────
-- PLAN-SCHEMA §5 — verify shape first; add only if absent. Wrapped in a DO
-- block so re-runs are no-ops. We do NOT modify existing task_assignees
-- columns (profile_id, team_id) because legacy Review/Tasks code still reads
-- them; Plan writes new task_assignees rows without touching the existing
-- CHECK constraints.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'task_assignees'
      AND column_name  = 'fractional_id'
  ) THEN
    ALTER TABLE public.task_assignees
      ADD COLUMN fractional_id uuid NULL
        REFERENCES public.fractional_executives(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS task_assignees_fractional_idx
      ON public.task_assignees (fractional_id)
      WHERE fractional_id IS NOT NULL;

    COMMENT ON COLUMN public.task_assignees.fractional_id IS
      'PLAN-SCHEMA §5 — optional link to a fractional executive when the '
      'assignee is an external human. NULL for built-in users/specialists/teams. '
      'Coexists with legacy profile_id + team_id columns; Plan-authored rows '
      'populate this when the assignee is a fractional, otherwise NULL.';
  END IF;
END $$;
