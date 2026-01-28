-- =============================================
-- MIGRATION: Secure Storage Policies for task-files bucket
-- =============================================
-- 
-- SECURITY FIX: The previous storage policies were too permissive.
-- Issue: Any authenticated user could DELETE any file in the bucket.
-- 
-- This migration tightens the policies to:
-- 1. DELETE: Only the file owner (uploader) can delete their files
-- 2. SELECT: Only users in the same foundry can view files
-- 3. INSERT: Only authenticated users uploading to tasks in their foundry
--
-- The fix leverages the task_files table which tracks:
--   - file_path: The storage path (matches storage.objects.name)
--   - uploaded_by: The user who uploaded the file (UUID)
--   - task_id: Links to the task (for foundry verification)
-- =============================================

-- =============================================
-- Step 1: Drop existing permissive policies
-- =============================================
-- These policies were too broad - allowing any authenticated user
-- to perform operations on any file in the bucket.

DROP POLICY IF EXISTS "Users can view task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete task files" ON storage.objects;

-- Also drop any legacy policy names
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated selects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Users can view task files in their foundry" ON storage.objects;

-- =============================================
-- Step 2: Create secure SELECT policy
-- =============================================
-- Users can only view files that belong to tasks in their foundry.
-- This prevents cross-foundry file access.
--
-- The check: File must exist in task_files, linked to a task
-- that belongs to the user's foundry.

CREATE POLICY "Foundry members can view task files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'task-files'
        AND auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 
            FROM public.task_files tf
            INNER JOIN public.tasks t ON tf.task_id = t.id
            WHERE tf.file_path = storage.objects.name
            AND t.foundry_id = get_my_foundry_id()
        )
    );

-- =============================================
-- Step 3: Create secure INSERT policy
-- =============================================
-- Users can only upload files to the bucket if:
-- 1. They are authenticated
-- 2. The upload path corresponds to a task in their foundry
--
-- Note: The file path structure is "taskId/timestamp.ext"
-- We extract the task_id from the first path segment using split_part().
--
-- Security: This prevents users from uploading files to tasks
-- belonging to other foundries.

CREATE POLICY "Foundry members can upload to their tasks" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'task-files'
        AND auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 
            FROM public.tasks t
            WHERE t.id::text = split_part(storage.objects.name, '/', 1)
            AND t.foundry_id = get_my_foundry_id()
        )
    );

-- =============================================
-- Step 4: Create secure DELETE policy
-- =============================================
-- CRITICAL SECURITY FIX: Only file owners can delete their files.
--
-- Previous policy allowed ANY authenticated user to delete ANY file,
-- which is a significant security vulnerability.
--
-- The fix: Check that the file exists in task_files table
-- and was uploaded by the current user (auth.uid()).
--
-- This ensures:
-- - Users cannot delete files uploaded by others
-- - Even within the same foundry, deletion is owner-restricted
-- - Admins/executives don't have special delete privileges via RLS
--   (this can be extended if needed via role checks)

CREATE POLICY "File owners can delete their uploads" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'task-files'
        AND auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 
            FROM public.task_files tf
            WHERE tf.file_path = storage.objects.name
            AND tf.uploaded_by = auth.uid()
        )
    );

-- =============================================
-- Optional: Allow executives to delete any file in their foundry
-- =============================================
-- Uncomment the following policy if executives should be able to
-- delete any file within their foundry (not just their own uploads).
-- This provides administrative override capability.

/*
CREATE POLICY "Executives can delete foundry files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'task-files'
        AND auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 
            FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('Executive', 'Founder')
        )
        AND EXISTS (
            SELECT 1 
            FROM public.task_files tf
            INNER JOIN public.tasks t ON tf.task_id = t.id
            WHERE tf.file_path = storage.objects.name
            AND t.foundry_id = get_my_foundry_id()
        )
    );
*/

-- =============================================
-- Notes on implementation
-- =============================================
-- 
-- 1. The task_files table serves as the source of truth for ownership.
--    Every file upload should create a corresponding task_files record.
--
-- 2. If a file exists in storage but NOT in task_files:
--    - It will NOT be viewable (SELECT blocked)
--    - It will NOT be deletable (DELETE blocked)
--    This is intentional - orphan files should be cleaned up separately.
--
-- 3. The get_my_foundry_id() function is SECURITY DEFINER, allowing
--    it to bypass RLS on the profiles table to get the user's foundry.
--
-- 4. Performance: The EXISTS checks add overhead, but security > speed.
--    Consider adding indexes if performance becomes an issue:
--    - CREATE INDEX IF NOT EXISTS idx_task_files_file_path ON task_files(file_path);
--    - CREATE INDEX IF NOT EXISTS idx_task_files_uploaded_by ON task_files(uploaded_by);
--
-- 5. For the task-attachments bucket (if different), apply similar policies.
-- =============================================
