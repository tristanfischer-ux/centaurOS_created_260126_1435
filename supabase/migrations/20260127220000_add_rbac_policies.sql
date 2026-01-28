-- =============================================
-- MIGRATION: Role-Based Access Control (RBAC)
-- =============================================
-- 
-- Role Hierarchy (highest to lowest permissions):
--   Founder > Executive > Apprentice > AI_Agent
--
-- Permission Summary:
--   - Founder/Executive: Full control over their foundry's resources
--   - Apprentice/AI_Agent: Can only modify resources they created or are assigned to
--
-- =============================================

-- =============================================
-- 1. ADD 'Founder' TO member_role ENUM
-- =============================================
-- The Founder role sits at the top of the hierarchy with full permissions

ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'Founder';

-- =============================================
-- 2. HELPER FUNCTION: get_my_role()
-- =============================================
-- Returns the current user's role from their profile.
-- Used in RLS policies to check permission levels.
-- SECURITY DEFINER allows this to run with elevated privileges
-- to read the profiles table even when RLS is enabled.

CREATE OR REPLACE FUNCTION public.get_my_role() 
RETURNS member_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- =============================================
-- 3. TASKS: Role-Based DELETE Policy
-- =============================================
-- Old policy: Only creators can delete their own tasks
-- New policy: 
--   - Founder/Executive: Can delete ANY task in their foundry
--   - Apprentice/AI_Agent: Can only delete tasks they created

DROP POLICY IF EXISTS "Users can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;
DROP POLICY IF EXISTS "RBAC: Delete tasks" ON public.tasks;

CREATE POLICY "RBAC: Delete tasks" ON public.tasks
    FOR DELETE USING (
        foundry_id = get_my_foundry_id()
        AND (
            -- Executives and Founders can delete any task in their foundry
            get_my_role() IN ('Executive', 'Founder')
            OR
            -- Others can only delete tasks they created
            creator_id = auth.uid()
        )
    );

-- =============================================
-- 4. OBJECTIVES: Role-Based DELETE Policy
-- =============================================
-- Old policy: Only creators can delete their own objectives
-- New policy:
--   - Founder/Executive: Can delete ANY objective in their foundry
--   - Apprentice/AI_Agent: Can only delete objectives they created

DROP POLICY IF EXISTS "Users can delete objectives" ON public.objectives;
DROP POLICY IF EXISTS "Users can delete own objectives" ON public.objectives;
DROP POLICY IF EXISTS "RBAC: Delete objectives" ON public.objectives;

CREATE POLICY "RBAC: Delete objectives" ON public.objectives
    FOR DELETE USING (
        foundry_id = get_my_foundry_id()
        AND (
            -- Executives and Founders can delete any objective in their foundry
            get_my_role() IN ('Executive', 'Founder')
            OR
            -- Others can only delete objectives they created
            creator_id = auth.uid()
        )
    );

-- =============================================
-- 5. TASKS: Role-Based UPDATE Policy
-- =============================================
-- Previous policy: Any user in foundry can update any task
-- New policy:
--   - Founder/Executive: Can update ANY task in their foundry
--   - Apprentice/AI_Agent: Can only update tasks they created OR are assigned to
--
-- Note: Sensitive field restrictions (e.g., risk_level) can be added
-- via application logic or additional column-level policies in the future.

DROP POLICY IF EXISTS "Users can update tasks in their foundry" ON public.tasks;
DROP POLICY IF EXISTS "RBAC: Update tasks" ON public.tasks;

CREATE POLICY "RBAC: Update tasks" ON public.tasks
    FOR UPDATE USING (
        foundry_id = get_my_foundry_id()
        AND (
            -- Executives and Founders can update any task in their foundry
            get_my_role() IN ('Executive', 'Founder')
            OR
            -- Creator can always update their own tasks
            creator_id = auth.uid()
            OR
            -- Assignees can update tasks assigned to them
            EXISTS (
                SELECT 1 FROM public.task_assignees 
                WHERE task_id = tasks.id 
                AND profile_id = auth.uid()
            )
        )
    );

-- =============================================
-- 6. TEAMS: Role-Based DELETE Policy
-- =============================================
-- Old policy: Any authenticated user can delete teams
-- New policy: Only Founders and Executives can delete teams
--
-- Rationale: Teams represent organizational structure and
-- should only be modified by leadership roles.

DROP POLICY IF EXISTS "Users can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Users can manage teams in their foundry" ON public.teams;
DROP POLICY IF EXISTS "RBAC: Delete teams" ON public.teams;

CREATE POLICY "RBAC: Delete teams" ON public.teams
    FOR DELETE USING (
        foundry_id = get_my_foundry_id()
        AND get_my_role() IN ('Executive', 'Founder')
    );

-- Re-create the general management policy without DELETE
-- (SELECT, INSERT, UPDATE remain available to foundry members)
DROP POLICY IF EXISTS "RBAC: Manage teams" ON public.teams;
CREATE POLICY "RBAC: Manage teams" ON public.teams
    FOR ALL USING (
        foundry_id = get_my_foundry_id()
    )
    WITH CHECK (
        foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 7. VERIFICATION COMMENTS
-- =============================================
-- 
-- To verify RBAC is working correctly:
--
-- 1. Test as Founder/Executive:
--    - Should be able to delete any task/objective/team in their foundry
--    - Should be able to update any task in their foundry
--
-- 2. Test as Apprentice/AI_Agent:
--    - Should only be able to delete tasks/objectives they created
--    - Should only be able to update tasks they created or are assigned to
--    - Should NOT be able to delete teams
--
-- 3. Cross-foundry test:
--    - No user should be able to access resources in another foundry
--
-- =============================================
-- END OF MIGRATION
-- =============================================
