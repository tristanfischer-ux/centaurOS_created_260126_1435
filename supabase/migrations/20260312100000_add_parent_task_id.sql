-- Add parent_task_id to tasks table for subtask/checklist support
-- Subtasks are regular tasks with a parent_task_id reference.
-- RLS policies already cover subtasks since they're in the same table.

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;

-- Index for efficient subtask lookups
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)
WHERE parent_task_id IS NOT NULL;

COMMENT ON COLUMN tasks.parent_task_id IS 'References the parent task for subtask/checklist relationships. NULL for top-level tasks.';
