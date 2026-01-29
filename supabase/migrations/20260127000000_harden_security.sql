-- =============================================
-- MIGRATION: Harden Security (Zero-Trust Multi-Tenancy)
-- =============================================

-- 1. Helper Function to get current user's foundry_id associated with their profile
-- This reduces repetition in RLS policies and centralization logic
CREATE OR REPLACE FUNCTION public.get_my_foundry_id()
RETURNS text AS $$
SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 2. DROP INSECURE POLICIES & PREPARE FOR NEW ONES
-- =============================================
-- Drop broad "authenticated" policies that allow cross-tenant access

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all objectives" ON public.objectives;
DROP POLICY IF EXISTS "Users can view all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can view comments" ON public.task_comments;
DROP POLICY IF EXISTS "Users can view all teams" ON public.teams;
DROP POLICY IF EXISTS "Users can view team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can view task assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "Users can manage teams" ON public.teams; -- Potential legacy name

-- =============================================
-- 3. PROFILES: Strict Foundry Isolation
-- =============================================
-- Users can see profiles only within their own Foundry.

DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
CREATE POLICY "Users can view profiles in their foundry" ON public.profiles
    FOR SELECT USING (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()) 
    );

-- Users can only update their OWN profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- 4. OBJECTIVES: Strict Foundry Isolation
-- =============================================

DROP POLICY IF EXISTS "Users can view objectives in their foundry" ON public.objectives;
CREATE POLICY "Users can view objectives in their foundry" ON public.objectives
    FOR SELECT USING (
        foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can create objectives in their foundry" ON public.objectives;
CREATE POLICY "Users can create objectives in their foundry" ON public.objectives
    FOR INSERT WITH CHECK (
        foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 5. TASKS: Strict Foundry Isolation
-- =============================================

DROP POLICY IF EXISTS "Users can view tasks in their foundry" ON public.tasks;
CREATE POLICY "Users can view tasks in their foundry" ON public.tasks
    FOR SELECT USING (
        foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can insert tasks in their foundry" ON public.tasks;
CREATE POLICY "Users can insert tasks in their foundry" ON public.tasks
    FOR INSERT WITH CHECK (
        foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can update tasks in their foundry" ON public.tasks;
CREATE POLICY "Users can update tasks in their foundry" ON public.tasks
    FOR UPDATE USING (
        foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 6. TASK COMMENTS: Strict Foundry Isolation
-- =============================================

DROP POLICY IF EXISTS "Users can view comments in their foundry" ON public.task_comments;
CREATE POLICY "Users can view comments in their foundry" ON public.task_comments
    FOR SELECT USING (
        foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can insert comments in their foundry" ON public.task_comments;
CREATE POLICY "Users can insert comments in their foundry" ON public.task_comments
    FOR INSERT WITH CHECK (
        foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 7. TEAMS: Strict Foundry Isolation
-- =============================================

DROP POLICY IF EXISTS "Users can view teams in their foundry" ON public.teams;
CREATE POLICY "Users can view teams in their foundry" ON public.teams
    FOR SELECT USING (
        foundry_id = get_my_foundry_id()
    );

DROP POLICY IF EXISTS "Users can manage teams in their foundry" ON public.teams;
CREATE POLICY "Users can manage teams in their foundry" ON public.teams
    FOR ALL USING (
        foundry_id = get_my_foundry_id()
    );

-- =============================================
-- 8. JUNCTION TABLES (Inherited Security)
-- =============================================

-- TEAM MEMBERS
DROP POLICY IF EXISTS "Users can view team members in their foundry" ON public.team_members;
CREATE POLICY "Users can view team members in their foundry" ON public.team_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.teams 
            WHERE id = team_members.team_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

DROP POLICY IF EXISTS "Users can manage team members in their foundry" ON public.team_members;
CREATE POLICY "Users can manage team members in their foundry" ON public.team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.teams 
            WHERE id = team_members.team_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

-- TASK ASSIGNEES
DROP POLICY IF EXISTS "Users can view task assignees in their foundry" ON public.task_assignees;
CREATE POLICY "Users can view task assignees in their foundry" ON public.task_assignees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tasks 
            WHERE id = task_assignees.task_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

DROP POLICY IF EXISTS "Users can manage task assignees in their foundry" ON public.task_assignees;
CREATE POLICY "Users can manage task assignees in their foundry" ON public.task_assignees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tasks 
            WHERE id = task_assignees.task_id 
            AND foundry_id = get_my_foundry_id()
        )
    );

-- =============================================
-- 9. MARKETPLACE (Public Read / Restricted Write)
-- =============================================

-- SERVICE PROVIDERS
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Global Read for Service Providers" ON public.service_providers;
CREATE POLICY "Global Read for Service Providers" ON public.service_providers
    FOR SELECT USING (auth.role() = 'authenticated');

-- AI TOOLS
-- Note: ai_tools table doesn't exist yet - commented out
-- ALTER TABLE public.ai_tools ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Global Read for AI Tools" ON public.ai_tools;
-- CREATE POLICY "Global Read for AI Tools" ON public.ai_tools
--     FOR SELECT USING (auth.role() = 'authenticated');

-- MANUFACTURING RFQS
-- Note: manufacturing_rfqs table doesn't exist yet - commented out
-- ALTER TABLE public.manufacturing_rfqs ENABLE ROW LEVEL SECURITY;

-- DROP POLICY IF EXISTS "Users can view own RFQs" ON public.manufacturing_rfqs;
-- CREATE POLICY "Users can view own RFQs" ON public.manufacturing_rfqs
--     FOR SELECT USING (
--         foundry_id = get_my_foundry_id()
--     );

-- DROP POLICY IF EXISTS "Users can create RFQs" ON public.manufacturing_rfqs;
-- CREATE POLICY "Users can create RFQs" ON public.manufacturing_rfqs
--     FOR INSERT WITH CHECK (
--         foundry_id = get_my_foundry_id()
--     );

-- =============================================
-- END OF MIGRATION
-- =============================================
