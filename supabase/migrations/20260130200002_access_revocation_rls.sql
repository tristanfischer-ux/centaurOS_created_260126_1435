-- Migration: Access Revocation RLS Policies
-- Updates RLS policies to block deactivated users from accessing data

-- =============================================
-- 1. UPDATE GET_MY_FOUNDRY_ID FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION public.get_my_foundry_id()
RETURNS text AS $$
SELECT foundry_id FROM public.profiles 
WHERE id = auth.uid() AND is_active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 2. CREATE ACTIVE USER CHECK FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean AS $$
SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE id = auth.uid()),
    false
)
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 3. UPDATE PROFILES RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
CREATE POLICY "Active users can view profiles in their foundry" ON public.profiles
    FOR SELECT USING (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Active users can update own profile" ON public.profiles
    FOR UPDATE USING (
        auth.uid() = id 
        AND is_active_user()
    );

-- =============================================
-- 4. UPDATE OBJECTIVES RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view objectives in their foundry" ON public.objectives;
CREATE POLICY "Active users can view objectives in their foundry" ON public.objectives
    FOR SELECT USING (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can create objectives in their foundry" ON public.objectives;
CREATE POLICY "Active users can create objectives in their foundry" ON public.objectives
    FOR INSERT WITH CHECK (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 5. UPDATE TASKS RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view tasks in their foundry" ON public.tasks;
CREATE POLICY "Active users can view tasks in their foundry" ON public.tasks
    FOR SELECT USING (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can insert tasks in their foundry" ON public.tasks;
CREATE POLICY "Active users can insert tasks in their foundry" ON public.tasks
    FOR INSERT WITH CHECK (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can update tasks in their foundry" ON public.tasks;
CREATE POLICY "Active users can update tasks in their foundry" ON public.tasks
    FOR UPDATE USING (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 6. UPDATE TASK_COMMENTS RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view comments in their foundry" ON public.task_comments;
CREATE POLICY "Active users can view comments in their foundry" ON public.task_comments
    FOR SELECT USING (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can insert comments in their foundry" ON public.task_comments;
CREATE POLICY "Active users can insert comments in their foundry" ON public.task_comments
    FOR INSERT WITH CHECK (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 7. UPDATE TEAMS RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view teams in their foundry" ON public.teams;
CREATE POLICY "Active users can view teams in their foundry" ON public.teams
    FOR SELECT USING (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can manage teams in their foundry" ON public.teams;
CREATE POLICY "Active users can manage teams in their foundry" ON public.teams
    FOR ALL USING (
        is_active_user()
        AND foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 8. UPDATE TEAM_MEMBERS RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view team members in their foundry" ON public.team_members;
CREATE POLICY "Active users can view team members in their foundry" ON public.team_members
    FOR SELECT USING (
        is_active_user()
        AND EXISTS (
            SELECT 1 FROM public.teams 
            WHERE id = team_members.team_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

DROP POLICY IF EXISTS "Users can manage team members in their foundry" ON public.team_members;
CREATE POLICY "Active users can manage team members in their foundry" ON public.team_members
    FOR ALL USING (
        is_active_user()
        AND EXISTS (
            SELECT 1 FROM public.teams 
            WHERE id = team_members.team_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

-- =============================================
-- 9. UPDATE TASK_ASSIGNEES RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view task assignees in their foundry" ON public.task_assignees;
CREATE POLICY "Active users can view task assignees in their foundry" ON public.task_assignees
    FOR SELECT USING (
        is_active_user()
        AND EXISTS (
            SELECT 1 FROM public.tasks 
            WHERE id = task_assignees.task_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

DROP POLICY IF EXISTS "Users can manage task assignees in their foundry" ON public.task_assignees;
CREATE POLICY "Active users can manage task assignees in their foundry" ON public.task_assignees
    FOR ALL USING (
        is_active_user()
        AND EXISTS (
            SELECT 1 FROM public.tasks 
            WHERE id = task_assignees.task_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

-- =============================================
-- 10. COMMENTS
-- =============================================

COMMENT ON FUNCTION public.is_active_user() IS 'Returns true if the current authenticated user has is_active = true';
COMMENT ON FUNCTION public.get_my_foundry_id() IS 'Returns foundry_id for current user, but only if active';

-- =============================================
-- END OF MIGRATION
-- =============================================
