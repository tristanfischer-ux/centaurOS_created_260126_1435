-- =============================================
-- MIGRATION: Add task_files table
-- Creates the task_files table for file attachments
-- =============================================

-- Create task_files table for file attachments
CREATE TABLE IF NOT EXISTS public.task_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups by task_id (this is what PostgREST uses for the relationship)
CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON public.task_files(task_id);

-- Enable RLS
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view task files in their foundry
DROP POLICY IF EXISTS "Users can view task files in their foundry" ON public.task_files;
CREATE POLICY "Users can view task files in their foundry" ON public.task_files
    FOR SELECT USING (
        task_id IN (
            SELECT id FROM public.tasks WHERE foundry_id IN (
                SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

-- Policy: Users can insert task files  
DROP POLICY IF EXISTS "Users can insert task files" ON public.task_files;
CREATE POLICY "Users can insert task files" ON public.task_files
    FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- Policy: Users can delete their own uploads
DROP POLICY IF EXISTS "Users can delete own task files" ON public.task_files;
CREATE POLICY "Users can delete own task files" ON public.task_files
    FOR DELETE USING (uploaded_by = auth.uid());

-- Policy: Users can update their own uploads
DROP POLICY IF EXISTS "Users can update own task files" ON public.task_files;
CREATE POLICY "Users can update own task files" ON public.task_files
    FOR UPDATE USING (uploaded_by = auth.uid()) 
    WITH CHECK (uploaded_by = auth.uid());
