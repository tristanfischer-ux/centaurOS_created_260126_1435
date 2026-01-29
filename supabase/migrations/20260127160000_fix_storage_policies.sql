-- =============================================
-- MIGRATION: Fix Task Files Storage Policies
-- =============================================

-- 1. Ensure the bucket exists (idempotent insert)
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on objects if not already enabled
-- Note: storage.objects already has RLS enabled by Supabase - commented out
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to avoid conflicts/duplication
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated selects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Users can view task files in their foundry" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload task files" ON storage.objects;

-- 4. Create comprehensive policies for the 'task-files' bucket

-- Allow SELECT (Read) for any authenticated user
-- (In a real multi-tenant app, you might restrict this further by foundry_id path, 
-- but given the file path structure is foundry_id/task_id/..., strict RLS on `public.task_files` 
-- usually handles the metadata visibility. For storage, checking auth is a good baseline.)
CREATE POLICY "Users can view task files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'task-files' 
        AND auth.role() = 'authenticated'
    );

-- Allow INSERT (Upload) for authenticated users
CREATE POLICY "Users can upload task files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'task-files' 
        AND auth.role() = 'authenticated'
    );

-- Allow DELETE for authenticated users (own files or general permission)
-- For now allowing any auth user to delete from this bucket to support the "Delete" UI.
CREATE POLICY "Users can delete task files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'task-files' 
        AND auth.role() = 'authenticated'
    );
