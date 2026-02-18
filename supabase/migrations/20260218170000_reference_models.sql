/**
 * Migration: Create reference_models table for instant visual preview in CAD Lab.
 *
 * Purpose: When a user says "I want to build a rocket", show a reference 3D model
 * immediately before research runs. reference_models stores generic STEP/STL
 * files for common product categories (rocket, drone, ev, etc.) with keywords
 * for matching.
 *
 * Security:
 * - Table is read-only for all authenticated users (SELECT only).
 * - No RLS on INSERT/UPDATE/DELETE so only service role can modify (admin seed).
 *
 * Related:
 * - Frontend: src/app/(platform)/the-forge/cad-lab/
 * - Actions: src/actions/reference-models.ts
 *
 * Rollback: DROP TABLE public.reference_models CASCADE;
 */

-- ─── Table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reference_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Category slug for grouping (e.g. rocket, drone, ev, cubesat)
    category TEXT NOT NULL,
    -- Display name
    name TEXT NOT NULL,
    -- Optional: URL to STEP file (Supabase storage or external)
    step_url TEXT,
    -- Optional: URL to STL file for 3D viewer
    stl_url TEXT,
    -- Optional: inline SVG thumbnail (data URI or SVG markup)
    thumbnail_svg TEXT,
    -- Short description for matching and display
    description TEXT,
    -- Keywords/phrases for matching user input (e.g. rocket, launch vehicle, missile)
    search_keywords TEXT[] NOT NULL DEFAULT '{}',
    -- Pre-defined module breakdown template for this category (JSONB)
    -- Structure: [{ name, purpose, description?, inputs?, outputs? }]
    module_template JSONB DEFAULT '[]'::jsonb,
    -- Display order in lists
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(category)
);

CREATE INDEX IF NOT EXISTS idx_reference_models_category ON public.reference_models(category);
CREATE INDEX IF NOT EXISTS idx_reference_models_search_keywords ON public.reference_models USING GIN(search_keywords);

-- ─── RLS: allow SELECT for authenticated users only ───────────────────

ALTER TABLE public.reference_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reference_models_select_authenticated"
ON public.reference_models
FOR SELECT
TO authenticated
USING (true);

-- No INSERT/UPDATE/DELETE policies: only service role (migrations/seed) can write.

-- ─── Updated_at trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_reference_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reference_models_updated_at
    BEFORE UPDATE ON public.reference_models
    FOR EACH ROW
    EXECUTE FUNCTION public.update_reference_models_updated_at();
