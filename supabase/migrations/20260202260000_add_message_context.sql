-- =============================================
-- MIGRATION: Add Message Context (Task & Objective)
-- =============================================
-- Allow messages to reference tasks and objectives for better context
-- in the inbox redesign. Messages can now be associated with work items
-- for richer conversation threading.

-- Add task_id column to messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Add objective_id column to messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS objective_id uuid REFERENCES public.objectives(id) ON DELETE SET NULL;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_messages_task_id 
    ON public.messages(task_id) 
    WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_objective_id 
    ON public.messages(objective_id) 
    WHERE objective_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.messages.task_id IS 'Optional reference to a task for contextual messaging';
COMMENT ON COLUMN public.messages.objective_id IS 'Optional reference to an objective for contextual messaging';

-- Note: Existing RLS policies on messages table already cover access control
-- No additional policies needed as context columns don't change visibility rules
