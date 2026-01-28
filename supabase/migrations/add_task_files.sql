-- =============================================
-- MIGRATION: Add task_files table
-- Run this in Supabase SQL Editor
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

-- Enable RLS
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view task files in their foundry
CREATE POLICY "Users can view task files in their foundry" ON public.task_files
    FOR SELECT USING (
        task_id IN (
            SELECT id FROM public.tasks WHERE foundry_id IN (
                SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

-- Policy: Users can insert task files  
CREATE POLICY "Users can insert task files" ON public.task_files
    FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- Policy: Users can delete their own uploads
CREATE POLICY "Users can delete own task files" ON public.task_files
    FOR DELETE USING (uploaded_by = auth.uid());

-- =============================================
-- STORAGE BUCKET (run these one at a time)
-- =============================================

-- Create the storage bucket via Supabase Dashboard:
-- 1. Go to Storage in your Supabase dashboard
-- 2. Click "New bucket"
-- 3. Name: task-files
-- 4. Public: No (private)
-- 5. Click Create

-- Then add RLS policies for the bucket:
-- (run in SQL editor after bucket is created)

-- Allow authenticated users to upload to their foundry folder
-- INSERT INTO storage.policies (name, bucket_id, expression, definition)
-- VALUES (
--     'Allow upload to task-files',
--     'task-files',
--     '(bucket_id = ''task-files''::text)',
--     '(auth.role() = ''authenticated''::text)'
-- );
