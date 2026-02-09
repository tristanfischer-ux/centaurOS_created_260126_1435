/**
 * Migration: Canvas Strategic Timeline
 *
 * Purpose: Extend objectives and tasks tables to support the Canvas strategic
 * timeline feature. Canvas visualises existing objectives and tasks on a
 * time-based horizontal axis, working backwards from dated strategic goals.
 *
 * Integration model (no new entity tables — extends existing ones):
 *   Strategic Goal = objective with is_strategic_goal = true
 *   Milestone       = objective with is_milestone = true AND parent_objective_id → goal
 *   Objective       = objective with parent_objective_id → milestone
 *   Task            = task with objective_id → objective
 *
 * Changes:
 *   1. Adds milestone / ghost / workstream / soft-delete columns to objectives
 *   2. Adds ghost / workstream / soft-delete columns to tasks
 *   3. Creates work_edges table for cross-item dependencies (hard & soft)
 *   4. Adds performance indexes
 *   5. Applies updated_at triggers to objectives and tasks
 *   6. RLS on work_edges follows the foundry-scoped pattern from strategic planner
 *
 * Related:
 *   - Frontend: src/app/(platform)/canvas/
 *   - Actions:  (to be created)
 *
 * Rollback:
 *   ALTER TABLE objectives DROP COLUMN IF EXISTS is_milestone,
 *     DROP COLUMN IF EXISTS milestone_order_index,
 *     DROP COLUMN IF EXISTS goal_type,
 *     DROP COLUMN IF EXISTS workstream,
 *     DROP COLUMN IF EXISTS is_ghost,
 *     DROP COLUMN IF EXISTS ghost_source,
 *     DROP COLUMN IF EXISTS ghost_rationale,
 *     DROP COLUMN IF EXISTS deleted_at;
 *   ALTER TABLE tasks DROP COLUMN IF EXISTS is_ghost,
 *     DROP COLUMN IF EXISTS ghost_source,
 *     DROP COLUMN IF EXISTS ghost_rationale,
 *     DROP COLUMN IF EXISTS workstream,
 *     DROP COLUMN IF EXISTS deleted_at;
 *   DROP TABLE IF EXISTS work_edges CASCADE;
 */


-- ============================================================
-- 1. Objectives — Canvas columns
-- ============================================================

-- Flag to mark an objective as a milestone (child of a strategic goal)
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN NOT NULL DEFAULT false;

-- Ordering index for milestones within a strategic goal
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS milestone_order_index INTEGER NOT NULL DEFAULT 0;

-- Categorisation of strategic goals
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS goal_type TEXT
    CHECK (goal_type IN ('Fundraise', 'Launch', 'Hiring', 'Revenue', 'Other'));

-- Free-text workstream label for grouping on the canvas
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS workstream TEXT;

-- Ghost items are AI/template-suggested items not yet confirmed by the user
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS ghost_source TEXT
    CHECK (ghost_source IN ('ai', 'template', 'user'));

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS ghost_rationale TEXT;

-- Soft-delete support (null = active, timestamped = deleted)
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;


-- ============================================================
-- 2. Tasks — Canvas columns
-- ============================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ghost_source TEXT
    CHECK (ghost_source IN ('ai', 'template', 'user'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ghost_rationale TEXT;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS workstream TEXT;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;


-- ============================================================
-- 3. Work Edges — cross-item dependency graph
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL,
  from_item_id UUID NOT NULL,
  from_item_type TEXT NOT NULL CHECK (from_item_type IN ('objective', 'task')),
  to_item_id UUID NOT NULL,
  to_item_type TEXT NOT NULL CHECK (to_item_type IN ('objective', 'task')),
  dep_type TEXT NOT NULL DEFAULT 'hard' CHECK (dep_type IN ('hard', 'soft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE public.work_edges IS 'Dependency graph edges between objectives and/or tasks for the Canvas strategic timeline. dep_type=hard means blocking; dep_type=soft means advisory.';

-- Enable RLS
ALTER TABLE public.work_edges ENABLE ROW LEVEL SECURITY;

-- RLS: Foundry-scoped read access
DROP POLICY IF EXISTS "foundry_members_view_work_edges" ON public.work_edges;
CREATE POLICY "foundry_members_view_work_edges" ON public.work_edges
  FOR SELECT USING (
    foundry_id IN (
      SELECT COALESCE(active_foundry_id, foundry_id)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- RLS: Foundry-scoped write access (insert, update, delete)
DROP POLICY IF EXISTS "foundry_members_manage_work_edges" ON public.work_edges;
CREATE POLICY "foundry_members_manage_work_edges" ON public.work_edges
  FOR ALL USING (
    foundry_id IN (
      SELECT COALESCE(active_foundry_id, foundry_id)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- RLS: Service role full access
DROP POLICY IF EXISTS "service_role_full_access_work_edges" ON public.work_edges;
CREATE POLICY "service_role_full_access_work_edges" ON public.work_edges
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================================
-- 4. Indexes
-- ============================================================

-- work_edges indexes
CREATE INDEX IF NOT EXISTS idx_work_edges_foundry_id
  ON public.work_edges(foundry_id);

CREATE INDEX IF NOT EXISTS idx_work_edges_from_item_id
  ON public.work_edges(from_item_id);

CREATE INDEX IF NOT EXISTS idx_work_edges_to_item_id
  ON public.work_edges(to_item_id);

-- objectives indexes for canvas queries
CREATE INDEX IF NOT EXISTS idx_objectives_is_milestone
  ON public.objectives(foundry_id, is_milestone)
  WHERE is_milestone = true;

CREATE INDEX IF NOT EXISTS idx_objectives_milestone_date
  ON public.objectives(foundry_id, milestone_date)
  WHERE milestone_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_objectives_deleted_at
  ON public.objectives(deleted_at)
  WHERE deleted_at IS NULL;

-- tasks indexes for canvas queries
CREATE INDEX IF NOT EXISTS idx_tasks_is_ghost
  ON public.tasks(foundry_id, is_ghost)
  WHERE is_ghost = true;

CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at
  ON public.tasks(deleted_at)
  WHERE deleted_at IS NULL;


-- ============================================================
-- 5. updated_at triggers for objectives and tasks
-- ============================================================

-- Reuse the shared trigger function (created in 20260201000000_blueprint_integration.sql)
-- CREATE OR REPLACE is idempotent so safe to call again
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Objectives: auto-update updated_at on row change
DROP TRIGGER IF EXISTS trigger_objectives_updated_at ON public.objectives;
CREATE TRIGGER trigger_objectives_updated_at
  BEFORE UPDATE ON public.objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tasks: auto-update updated_at on row change
DROP TRIGGER IF EXISTS trigger_tasks_updated_at ON public.tasks;
CREATE TRIGGER trigger_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
