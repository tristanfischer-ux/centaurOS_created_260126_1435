-- =============================================
-- MIGRATION: Add missing database indexes
-- Improves query performance for common lookups
-- =============================================

-- Index on profiles.foundry_id for team/foundry queries
CREATE INDEX IF NOT EXISTS idx_profiles_foundry_id ON public.profiles(foundry_id);

-- Index on tasks.foundry_id for filtering tasks by foundry
CREATE INDEX IF NOT EXISTS idx_tasks_foundry_id ON public.tasks(foundry_id);

-- Index on tasks.assignee_id for finding tasks by assignee
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON public.tasks(assignee_id);

-- Index on objectives.foundry_id for filtering objectives by foundry
CREATE INDEX IF NOT EXISTS idx_objectives_foundry_id ON public.objectives(foundry_id);

-- Index on task_comments.foundry_id for filtering comments by foundry
CREATE INDEX IF NOT EXISTS idx_task_comments_foundry_id ON public.task_comments(foundry_id);

-- Additional useful composite indexes
CREATE INDEX IF NOT EXISTS idx_tasks_foundry_status ON public.tasks(foundry_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON public.tasks(assignee_id, status);
