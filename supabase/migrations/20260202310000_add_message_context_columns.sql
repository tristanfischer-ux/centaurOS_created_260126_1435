-- Add task and objective context columns to messages table
-- This allows messages to be linked to specific tasks or objectives for context-aware messaging

-- Add task_id column
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Add objective_id column  
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL;

-- Add index for querying messages by task
CREATE INDEX IF NOT EXISTS idx_messages_task_id ON public.messages(task_id) WHERE task_id IS NOT NULL;

-- Add index for querying messages by objective
CREATE INDEX IF NOT EXISTS idx_messages_objective_id ON public.messages(objective_id) WHERE objective_id IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.messages.task_id IS 'Optional link to a task this message relates to, enabling context-aware discussions';
COMMENT ON COLUMN public.messages.objective_id IS 'Optional link to an objective this message relates to, enabling context-aware discussions';
