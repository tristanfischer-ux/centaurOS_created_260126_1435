/**
 * Migration: Add agent_workflow_runs and agent_artifacts tables
 *
 * Purpose: Store workflow execution history and generated outputs as
 * first-class artifacts that users can browse, search, export, share,
 * and send to external tools (Google Docs, email, Gamma).
 *
 * Security:
 * - RLS policies enforce foundry isolation (same pattern as agent_workflows)
 * - Users can only view artifacts in their own foundry
 * - Only the creator can update/delete their own artifacts
 * - Shared artifacts visible to shared_with users (Phase 3)
 *
 * Related:
 * - src/actions/agent-artifacts.ts - Server actions
 * - src/app/(platform)/agents/artifacts/page.tsx - Listing page
 * - supabase/migrations/20260206500000_agent_workflows.sql - Parent schema
 *
 * Rollback: DROP TABLE agent_artifacts CASCADE; DROP TABLE agent_workflow_runs CASCADE;
 */

-- ============================================================================
-- AGENT WORKFLOW RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES public.agent_workflows(id) ON DELETE SET NULL,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    run_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'partial')),
    workflow_name TEXT NOT NULL DEFAULT 'Untitled Workflow',
    node_count INTEGER NOT NULL DEFAULT 0,
    nodes_completed INTEGER NOT NULL DEFAULT 0,
    node_outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_workflow_runs ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view runs in their own foundry
CREATE POLICY "view_own_foundry_runs" ON public.agent_workflow_runs
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Users can create runs in their own foundry
CREATE POLICY "create_own_foundry_runs" ON public.agent_workflow_runs
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Only the runner can update their runs
CREATE POLICY "update_own_runs" ON public.agent_workflow_runs
    FOR UPDATE USING (
        run_by = auth.uid()
        AND foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_foundry_id ON public.agent_workflow_runs(foundry_id);
CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_workflow_id ON public.agent_workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_run_by ON public.agent_workflow_runs(run_by);
CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_created_at ON public.agent_workflow_runs(created_at DESC);

-- ============================================================================
-- AGENT ARTIFACTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.agent_workflow_runs(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES public.agent_workflows(id) ON DELETE SET NULL,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'document'
        CHECK (content_type IN ('document', 'email', 'report', 'presentation', 'checklist')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_starred BOOLEAN NOT NULL DEFAULT false,
    -- Phase 3: Sharing
    shared_with UUID[] DEFAULT '{}',
    is_shared_with_foundry BOOLEAN NOT NULL DEFAULT false,
    -- Phase 3: Versioning
    version_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_artifacts ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view artifacts in their own foundry
-- Also allows viewing artifacts shared with them specifically
CREATE POLICY "view_own_foundry_artifacts" ON public.agent_artifacts
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
        OR auth.uid() = ANY(shared_with)
    );

-- RLS: Users can create artifacts in their own foundry
CREATE POLICY "create_own_foundry_artifacts" ON public.agent_artifacts
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Only the creator can update their artifacts
CREATE POLICY "update_own_artifacts" ON public.agent_artifacts
    FOR UPDATE USING (
        created_by = auth.uid()
        AND foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Only the creator can delete their artifacts
CREATE POLICY "delete_own_artifacts" ON public.agent_artifacts
    FOR DELETE USING (
        created_by = auth.uid()
        AND foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_foundry_id ON public.agent_artifacts(foundry_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_created_by ON public.agent_artifacts(created_by);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_workflow_id ON public.agent_artifacts(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_id ON public.agent_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_content_type ON public.agent_artifacts(content_type);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_is_starred ON public.agent_artifacts(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_created_at ON public.agent_artifacts(created_at DESC);

-- Full-text search on title and content
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_search ON public.agent_artifacts
    USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

-- ============================================================================
-- AGENT ARTIFACT VERSIONS (Phase 3)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_artifact_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID NOT NULL REFERENCES public.agent_artifacts(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_artifact_versions ENABLE ROW LEVEL SECURITY;

-- RLS: Same foundry can view versions
CREATE POLICY "view_own_foundry_artifact_versions" ON public.agent_artifact_versions
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- RLS: Foundry members can create versions (editing creates a version)
CREATE POLICY "create_own_foundry_artifact_versions" ON public.agent_artifact_versions
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_artifact_versions_artifact_id ON public.agent_artifact_versions(artifact_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifact_versions_created_at ON public.agent_artifact_versions(created_at DESC);
