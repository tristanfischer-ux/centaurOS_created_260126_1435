-- ============================================================================
-- ADD specialist_id TEXT COLUMN TO TASKS
-- ============================================================================
-- DECISION: The existing owner_agent_id/created_by_agent_id columns are UUID
-- with FK to profiles. But specialist IDs are strings like 'growth-marketer'.
-- This mismatch means the task portfolio feature in sweep-context.ts has been
-- silently failing (UUID column never matches string specialist IDs).
--
-- Fix: Add a dedicated specialist_id TEXT column that stores the specialist
-- string ID directly. No FK needed — specialist IDs are defined in code
-- (specialists-config.ts), not in the database.
-- ============================================================================

-- Add specialist_id column to tasks
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS specialist_id TEXT;

-- Index for sweep queries (specialist looks up their tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_specialist_id
    ON public.tasks (specialist_id, foundry_id)
    WHERE specialist_id IS NOT NULL AND deleted_at IS NULL;

-- Add specialist_id column to objectives too (for plan decomposition)
ALTER TABLE public.objectives
    ADD COLUMN IF NOT EXISTS specialist_id TEXT;

COMMENT ON COLUMN public.tasks.specialist_id IS 'String ID of the specialist assigned to this task (e.g., growth-marketer, sales-lead). Used by the autonomous execution loop.';
