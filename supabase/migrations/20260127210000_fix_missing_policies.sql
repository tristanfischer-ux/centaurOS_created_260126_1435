-- =============================================
-- MIGRATION: Fix Missing RLS Policies
-- =============================================
-- This migration adds missing UPDATE/DELETE policies and fixes overly permissive policies.

-- =============================================
-- 1. OBJECTIVES: Add missing UPDATE policy
-- =============================================
-- Currently has: SELECT, INSERT, DELETE
-- Missing: UPDATE

DROP POLICY IF EXISTS "Users can update objectives in their foundry" ON public.objectives;
CREATE POLICY "Users can update objectives in their foundry" ON public.objectives
    FOR UPDATE USING (
        foundry_id = get_my_foundry_id()
    ) WITH CHECK (
        foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 2. TASK_COMMENTS: Add missing UPDATE/DELETE policies
-- =============================================
-- Currently has: SELECT, INSERT (foundry-scoped)
-- Missing: UPDATE, DELETE
-- Users can only update/delete their own comments within their foundry

DROP POLICY IF EXISTS "Users can update own comments" ON public.task_comments;
CREATE POLICY "Users can update own comments" ON public.task_comments
    FOR UPDATE USING (
        user_id = auth.uid()
        AND foundry_id = get_my_foundry_id()
    ) WITH CHECK (
        user_id = auth.uid()
        AND foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can delete own comments" ON public.task_comments;
CREATE POLICY "Users can delete own comments" ON public.task_comments
    FOR DELETE USING (
        user_id = auth.uid()
        AND foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 3. TASK_FILES: Add missing UPDATE policy
-- =============================================
-- Currently has: SELECT (foundry-scoped), INSERT, DELETE (own files)
-- Missing: UPDATE
-- Users can only update files they uploaded

DROP POLICY IF EXISTS "Users can update own task files" ON public.task_files;
CREATE POLICY "Users can update own task files" ON public.task_files
    FOR UPDATE USING (
        uploaded_by = auth.uid()
    ) WITH CHECK (
        uploaded_by = auth.uid()
    );

-- =============================================
-- 4. MANUFACTURING_RFQS: Add missing UPDATE/DELETE policies
-- =============================================
-- Currently has: SELECT, INSERT (foundry-scoped)
-- Missing: UPDATE, DELETE
-- Users can update/delete RFQs in their foundry

DROP POLICY IF EXISTS "Users can update RFQs in their foundry" ON public.manufacturing_rfqs;
CREATE POLICY "Users can update RFQs in their foundry" ON public.manufacturing_rfqs
    FOR UPDATE USING (
        foundry_id = get_my_foundry_id()
    ) WITH CHECK (
        foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can delete RFQs in their foundry" ON public.manufacturing_rfqs;
CREATE POLICY "Users can delete RFQs in their foundry" ON public.manufacturing_rfqs
    FOR DELETE USING (
        foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 5. TASK_HISTORY: Fix overly permissive SELECT policy
-- =============================================
-- Current policy uses auth.role() = 'authenticated' which allows cross-tenant access
-- New policy scopes access via the parent task's foundry_id

DROP POLICY IF EXISTS "Users can view history of tasks they can view" ON public.task_history;
CREATE POLICY "Users can view history of tasks in their foundry" ON public.task_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tasks t 
            WHERE t.id = task_history.task_id 
            AND t.foundry_id = get_my_foundry_id()
        )
    );

-- Also fix INSERT policy to be foundry-scoped
DROP POLICY IF EXISTS "Users can insert history" ON public.task_history;
CREATE POLICY "Users can insert history for tasks in their foundry" ON public.task_history
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tasks t 
            WHERE t.id = task_history.task_id 
            AND t.foundry_id = get_my_foundry_id()
        )
    );

-- =============================================
-- 6. OBJECTIVE_PACKS & PACK_ITEMS: Restrict write access to service_role
-- =============================================
-- These are system templates that should only be managed via admin/service operations
-- Regular authenticated users should only be able to READ templates

-- Drop overly permissive ALL policies for authenticated users
DROP POLICY IF EXISTS "Authenticated users can manage packs" ON public.objective_packs;
DROP POLICY IF EXISTS "Authenticated users can manage pack items" ON public.pack_items;

-- Keep SELECT for authenticated users (already exists, but recreate for clarity)
DROP POLICY IF EXISTS "Authenticated users can view packs" ON public.objective_packs;
CREATE POLICY "Authenticated users can view packs" ON public.objective_packs
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view pack items" ON public.pack_items;
CREATE POLICY "Authenticated users can view pack items" ON public.pack_items
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create write policies restricted to service_role only
-- service_role bypasses RLS by default, but explicit policies provide documentation
-- and allow for future role-based access if needed

DROP POLICY IF EXISTS "Service role can manage packs" ON public.objective_packs;
CREATE POLICY "Service role can manage packs" ON public.objective_packs
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage pack items" ON public.pack_items;
CREATE POLICY "Service role can manage pack items" ON public.pack_items
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
