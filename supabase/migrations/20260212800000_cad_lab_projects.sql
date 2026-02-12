/**
 * Migration: Create cad_lab_projects table for persistent CAD Lab sessions.
 *
 * Purpose: Allow CAD Lab users to save, load, and resume their work.
 * Each project stores the 3-step pipeline state (research, interface
 * definition, and generation results) so work is never lost.
 *
 * This table will eventually absorb Forge features (modules, analysis,
 * timeline, risks, people, supply chain, contracting) as they are
 * incrementally added to CAD Lab.
 *
 * Security:
 * - RLS ensures users can only access projects in their own foundry
 * - created_by tracks ownership for audit
 *
 * Related:
 * - Frontend: src/app/(platform)/the-forge/cad-lab/page.tsx
 * - Actions: src/actions/cad-lab-projects.ts
 *
 * Rollback: DROP TABLE public.cad_lab_projects CASCADE;
 */

-- ─── Table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cad_lab_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),

    -- Core project identity
    name TEXT NOT NULL DEFAULT 'Untitled Project',
    subject TEXT NOT NULL,
    model_id TEXT NOT NULL DEFAULT 'claude-opus-4-6',

    -- Step 1: Research results
    research JSONB DEFAULT NULL,
    -- Structure: { report: string, sources: [{uri, title}], referenceModels: [{name, url}], researchTime: number }

    -- Step 2: Interface definition (plain text)
    interface_definition TEXT DEFAULT NULL,

    -- Step 3: Generation results (excludes large binary STL/STEP data)
    result JSONB DEFAULT NULL,
    -- Structure: { code, codeLines, generationTime, modalTime, bbox, fillRatio, massGrams,
    --   volumeMm3, dfm, massProperties, tokensIn, tokensOut, modelUsed, validationWarnings,
    --   svgIso (thumbnail only) }

    -- Generated code preserved separately for easy access
    generated_code TEXT DEFAULT NULL,

    -- Thumbnail SVG (isometric view data URI) for project list cards
    thumbnail_svg TEXT DEFAULT NULL,

    -- Pipeline stage for future Forge feature integration
    stage TEXT NOT NULL DEFAULT 'design'
        CHECK (stage IN ('design', 'analysis', 'people', 'supply_chain', 'contracting')),

    -- Lifecycle status
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'researched', 'interface_ready', 'generated', 'complete')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cad_lab_projects_foundry ON public.cad_lab_projects(foundry_id);
CREATE INDEX IF NOT EXISTS idx_cad_lab_projects_created_by ON public.cad_lab_projects(created_by);
CREATE INDEX IF NOT EXISTS idx_cad_lab_projects_updated_at ON public.cad_lab_projects(updated_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.cad_lab_projects ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view projects in their own foundry
CREATE POLICY "view_cad_lab_projects_in_own_foundry"
ON public.cad_lab_projects
FOR SELECT
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS: Users can create projects in their own foundry
CREATE POLICY "create_cad_lab_projects_in_own_foundry"
ON public.cad_lab_projects
FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS: Users can update projects in their own foundry
CREATE POLICY "update_cad_lab_projects_in_own_foundry"
ON public.cad_lab_projects
FOR UPDATE
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS: Users can delete projects in their own foundry
CREATE POLICY "delete_cad_lab_projects_in_own_foundry"
ON public.cad_lab_projects
FOR DELETE
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- ─── Updated_at trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_cad_lab_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cad_lab_projects_updated_at
    BEFORE UPDATE ON public.cad_lab_projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_cad_lab_projects_updated_at();
