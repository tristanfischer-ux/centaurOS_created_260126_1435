-- ============================================================================
-- EXECUTION PLANS & SITE SETTINGS
-- ============================================================================
-- Execution plans coordinate multi-specialist task execution from strategy
-- decomposition. Site settings enable config-driven features (analytics,
-- newsletter) without code deployment.
--
-- DECISION: execution_plans is a lightweight coordinator — not a full workflow
-- engine. It piggybacks on the existing task system. Plans link tasks via
-- plan_id FK and track overall progress via metadata.
-- ============================================================================

-- 1. Execution Plans table
CREATE TABLE IF NOT EXISTS public.execution_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    source_artifact_id UUID REFERENCES public.agent_artifacts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'active', 'paused', 'completed')),
    specialist_owner_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_plans ENABLE ROW LEVEL SECURITY;

-- RLS: Foundry members can view plans in their foundry
CREATE POLICY "view_own_foundry_plans" ON public.execution_plans
    FOR SELECT USING (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

-- RLS: Founders can create/update plans
CREATE POLICY "founders_manage_plans" ON public.execution_plans
    FOR ALL USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Founder'
        )
    );

-- Index for foundry lookup
CREATE INDEX IF NOT EXISTS idx_execution_plans_foundry
    ON public.execution_plans (foundry_id, status);

-- 2. Add plan_id and task_type to tasks table
-- GOTCHA: tasks table may not have these columns yet. Use IF NOT EXISTS.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'plan_id'
    ) THEN
        ALTER TABLE public.tasks ADD COLUMN plan_id UUID REFERENCES public.execution_plans(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'task_type'
    ) THEN
        ALTER TABLE public.tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'general'
            CHECK (task_type IN ('general', 'content', 'configuration', 'code_change', 'external_action'));
    END IF;
END $$;

-- Index for plan task lookup
CREATE INDEX IF NOT EXISTS idx_tasks_plan_id
    ON public.tasks (plan_id) WHERE plan_id IS NOT NULL;

-- 3. Site Settings table (config-driven features)
CREATE TABLE IF NOT EXISTS public.site_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE UNIQUE,
    analytics_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    newsletter_enabled BOOLEAN NOT NULL DEFAULT false,
    custom_head_scripts TEXT[] DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Foundry members can view settings
CREATE POLICY "view_own_foundry_settings" ON public.site_settings
    FOR SELECT USING (
        foundry_id IN (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

-- RLS: Founders can manage settings
CREATE POLICY "founders_manage_settings" ON public.site_settings
    FOR ALL USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Founder'
        )
    );

-- 4. RPC: Get plan progress (task counts by status)
CREATE OR REPLACE FUNCTION public.get_plan_progress(p_plan_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT jsonb_build_object(
        'total', COUNT(*),
        'completed', COUNT(*) FILTER (WHERE status::text IN ('Completed')),
        'in_progress', COUNT(*) FILTER (WHERE status::text IN ('Accepted')),
        'pending', COUNT(*) FILTER (WHERE status::text IN ('Pending', 'Amended', 'Amended_Pending_Approval')),
        'plan_status', (SELECT ep.status FROM execution_plans ep WHERE ep.id = p_plan_id)
    )
    FROM tasks
    WHERE plan_id = p_plan_id AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_plan_progress(UUID) TO authenticated;
