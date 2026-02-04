-- Fix tasks RLS policy and demo user foundry assignment
--
-- PROBLEM 1: Tasks RLS policy may have been dropped or is too restrictive
-- PROBLEM 2: Demo executive is in 'centaur-guild' foundry with no tasks
--
-- FIX: Restore simple tasks policy and move demo users to correct foundry

-- 1. Fix Tasks RLS Policy
DROP POLICY IF EXISTS "Users can view all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can view tasks in their foundry" ON public.tasks;
DROP POLICY IF EXISTS "Active users can view tasks in their foundry" ON public.tasks;
DROP POLICY IF EXISTS "authenticated_users_view_tasks" ON public.tasks;

-- Create simple policy for tasks viewing
CREATE POLICY "authenticated_users_view_tasks" ON public.tasks
    FOR SELECT TO authenticated
    USING (true);  -- Allow all authenticated users to view tasks

-- 2. Fix Demo User Foundries
-- Move demo users to 'foundry-demo' which has test data

UPDATE public.profiles
SET foundry_id = 'foundry-demo'
WHERE email IN (
    'demo.executive@forgeos.io',
    'demo.founder@forgeos.io',
    'demo.apprentice@forgeos.io'
)
AND foundry_id != 'foundry-demo';

-- Note: This allows cross-foundry viewing temporarily
-- Proper multi-tenant isolation should use JWT claims or session variables
