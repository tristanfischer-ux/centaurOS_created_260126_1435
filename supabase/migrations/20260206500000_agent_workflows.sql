/**
 * Migration: Add agent_workflows and agent_custom_prompts tables
 *
 * Purpose: Persist agent workflows and custom prompts to the database
 * instead of localStorage. Ensures data survives browser data clears,
 * syncs across devices, and is properly isolated per foundry.
 *
 * Security:
 * - RLS policies enforce foundry isolation (same pattern as blueprints)
 * - Users can only view workflows in their own foundry
 * - Only the creator can update/delete their own workflows
 *
 * Rollback: DROP TABLE agent_custom_prompts CASCADE; DROP TABLE agent_workflows CASCADE;
 */

-- ============================================================================
-- AGENT WORKFLOWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL DEFAULT 'Untitled Workflow',
    description TEXT DEFAULT '',
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    edges JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_template BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view workflows in their own foundry
CREATE POLICY "view_own_foundry_workflows" ON public.agent_workflows
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Users can create workflows in their own foundry
CREATE POLICY "create_own_foundry_workflows" ON public.agent_workflows
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Users can update their own workflows
CREATE POLICY "update_own_workflows" ON public.agent_workflows
    FOR UPDATE USING (
        created_by = auth.uid()
        AND foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Users can delete their own workflows
CREATE POLICY "delete_own_workflows" ON public.agent_workflows
    FOR DELETE USING (
        created_by = auth.uid()
        AND foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_workflows_foundry_id ON public.agent_workflows(foundry_id);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_created_by ON public.agent_workflows(created_by);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_updated_at ON public.agent_workflows(updated_at DESC);

-- ============================================================================
-- AGENT CUSTOM PROMPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_custom_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT NOT NULL DEFAULT 'strategy',
    icon TEXT NOT NULL DEFAULT 'Sparkles',
    default_prompt TEXT NOT NULL DEFAULT '',
    input_label TEXT DEFAULT 'Your input',
    output_label TEXT DEFAULT 'AI output',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_next JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_custom_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view custom prompts in their own foundry
CREATE POLICY "view_own_foundry_custom_prompts" ON public.agent_custom_prompts
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Users can create custom prompts in their own foundry
CREATE POLICY "create_own_foundry_custom_prompts" ON public.agent_custom_prompts
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Users can update their own custom prompts
CREATE POLICY "update_own_custom_prompts" ON public.agent_custom_prompts
    FOR UPDATE USING (
        created_by = auth.uid()
        AND foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Users can delete their own custom prompts
CREATE POLICY "delete_own_custom_prompts" ON public.agent_custom_prompts
    FOR DELETE USING (
        created_by = auth.uid()
        AND foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_custom_prompts_foundry_id ON public.agent_custom_prompts(foundry_id);
CREATE INDEX IF NOT EXISTS idx_agent_custom_prompts_created_by ON public.agent_custom_prompts(created_by);

