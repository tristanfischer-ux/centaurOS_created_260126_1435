/**
 * Migration: Strategic Planner Foundation
 * 
 * Purpose: Add task dependencies, strategic goal support on objectives,
 * and resource suggestions storage to enable the Strategic Timeline Planner.
 * 
 * Changes:
 * 1. Creates task_dependencies table for finish-to-start/start-to-start/finish-to-finish deps
 * 2. Adds milestone_date, is_strategic_goal, resource_suggestions to objectives
 * 3. RLS policies enforce foundry isolation on all new data
 * 
 * Related:
 * - Frontend: src/app/(platform)/strategic-planner/
 * - Actions: src/actions/strategic-planner.ts
 * 
 * Rollback: DROP TABLE task_dependencies CASCADE; ALTER TABLE objectives DROP COLUMN milestone_date, DROP COLUMN is_strategic_goal, DROP COLUMN resource_suggestions;
 */

-- ============================================================
-- 1. Task Dependencies Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start'
    CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish')),
  foundry_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent self-dependencies and duplicate entries
  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
  CONSTRAINT unique_dependency UNIQUE (task_id, depends_on_task_id)
);

COMMENT ON TABLE public.task_dependencies IS 'Tracks dependencies between tasks for strategic planning. A row means task_id cannot start/finish until depends_on_task_id completes.';
COMMENT ON COLUMN public.task_dependencies.dependency_type IS 'finish_to_start: B starts after A finishes. start_to_start: B starts when A starts. finish_to_finish: B finishes when A finishes.';

-- Enable RLS
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

-- RLS: Foundry-scoped access
DROP POLICY IF EXISTS "foundry_members_view_dependencies" ON public.task_dependencies;
CREATE POLICY "foundry_members_view_dependencies" ON public.task_dependencies
  FOR SELECT USING (
    foundry_id IN (
      SELECT COALESCE(active_foundry_id, foundry_id)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "foundry_members_manage_dependencies" ON public.task_dependencies;
CREATE POLICY "foundry_members_manage_dependencies" ON public.task_dependencies
  FOR ALL USING (
    foundry_id IN (
      SELECT COALESCE(active_foundry_id, foundry_id)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_role_full_access_dependencies" ON public.task_dependencies;
CREATE POLICY "service_role_full_access_dependencies" ON public.task_dependencies
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON public.task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_foundry_id ON public.task_dependencies(foundry_id);

-- ============================================================
-- 2. Strategic Goal Support on Objectives
-- ============================================================

-- Flag to mark an objective as a strategic goal (top-level planning anchor)
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS is_strategic_goal BOOLEAN DEFAULT false;

-- Target milestone date (distinct from task due dates -- this is the strategic deadline)
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS milestone_date TIMESTAMPTZ;

-- AI-generated resource suggestions stored as JSONB array
-- Each entry: { role, reason, phase, marketplaceMatches: string[], priority }
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS resource_suggestions JSONB DEFAULT '[]'::jsonb;

-- AI-generated risk analysis stored as JSONB array
-- Each entry: { description, mitigation, severity }
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS strategic_risks JSONB DEFAULT '[]'::jsonb;

-- AI suggestions for the plan (tasks to add, reassignments, etc.)
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS ai_suggestions JSONB DEFAULT '[]'::jsonb;

-- Index for querying strategic goals
CREATE INDEX IF NOT EXISTS idx_objectives_strategic_goal 
  ON public.objectives(foundry_id, is_strategic_goal) 
  WHERE is_strategic_goal = true;
