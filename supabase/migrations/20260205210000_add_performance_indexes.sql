-- Migration: Add performance indexes for common query patterns
--
-- Purpose: Speed up the most frequently executed queries across tasks,
-- objectives, task_comments, and task_history tables. These are additive
-- indexes that don't change query results -- only make them faster.
--
-- Rollback: DROP INDEX IF EXISTS each index name below.

-- =============================================================
-- 1. task_comments: No indexes existed on foreign keys
-- =============================================================

-- Used when loading comments for a task (ordered by time)
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id_created
  ON public.task_comments(task_id, created_at DESC);

-- Used when querying comments by author
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id
  ON public.task_comments(user_id);

-- =============================================================
-- 2. task_history: No indexes existed on foreign keys
-- =============================================================

-- Used when loading history for a specific task (ordered by time)
CREATE INDEX IF NOT EXISTS idx_task_history_task_id_created
  ON public.task_history(task_id, created_at DESC);

-- Used in daily pulse function and user activity queries
CREATE INDEX IF NOT EXISTS idx_task_history_user_id
  ON public.task_history(user_id);

-- =============================================================
-- 3. tasks: Composite indexes for common query patterns
-- =============================================================

-- Most common query: tasks by foundry, filtered by status, ordered by date
-- Used on: tasks page, home page, objectives detail
CREATE INDEX IF NOT EXISTS idx_tasks_foundry_status_created
  ON public.tasks(foundry_id, status, created_at DESC);

-- Assignee dashboard: my tasks filtered by status with due dates
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status_enddate
  ON public.tasks(assignee_id, status, end_date);

-- Creator lookup (no existing index)
CREATE INDEX IF NOT EXISTS idx_tasks_creator_id
  ON public.tasks(creator_id);

-- Objective drill-down: tasks belonging to an objective
CREATE INDEX IF NOT EXISTS idx_tasks_objective_id
  ON public.tasks(objective_id) WHERE objective_id IS NOT NULL;

-- =============================================================
-- 4. objectives: Composite index for common listing query
-- =============================================================

-- Objectives page: list by foundry, ordered by last update
CREATE INDEX IF NOT EXISTS idx_objectives_foundry_status_updated
  ON public.objectives(foundry_id, status, updated_at DESC);

-- Creator lookup (no existing index)
CREATE INDEX IF NOT EXISTS idx_objectives_creator_id
  ON public.objectives(creator_id);

-- =============================================================
-- 5. messages: Composite index for conversation threads
-- =============================================================

-- Message thread loading: messages in a conversation ordered by time
-- Existing idx_messages_conversation_id is single-column; this composite
-- lets Postgres satisfy the ORDER BY from the index directly.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);
