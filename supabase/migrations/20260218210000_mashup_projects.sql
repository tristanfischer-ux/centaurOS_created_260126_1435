-- ============================================================
-- Mashup Projects — Store mashup concept, sources, plan, and results
-- Migration: 20260218210000_mashup_projects
-- ============================================================
-- Used by the Mashup Lab to persist mashup projects and their
-- generated hybrid STEP/STL. Owner-only access via RLS.

CREATE TABLE mashup_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name TEXT,
    description TEXT,

    -- Source STEPs used for this mashup
    -- Array of { name, source_type, source_id, step_url, metadata }
    source_steps JSONB NOT NULL DEFAULT '[]',

    -- AI-generated plan (strategy, steps, adapter_geometry, notes)
    mashup_plan JSONB,

    -- Generated CadQuery code
    mashup_code TEXT,

    -- Result files (after Modal execution)
    result_step_url TEXT,
    result_stl_url TEXT,
    result_analysis JSONB,

    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'planning',
        'generating',
        'complete',
        'failed'
    )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mashup_projects_creator ON mashup_projects(creator_id);
CREATE INDEX idx_mashup_projects_status ON mashup_projects(status);
CREATE INDEX idx_mashup_projects_created ON mashup_projects(created_at DESC);

ALTER TABLE mashup_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mashup_projects_owner" ON mashup_projects
    FOR ALL USING (auth.uid() = creator_id);

CREATE TRIGGER trg_mashup_projects_updated
    BEFORE UPDATE ON mashup_projects
    FOR EACH ROW EXECUTE FUNCTION update_component_updated_at();

COMMENT ON TABLE mashup_projects IS 'Mashup Lab projects: source STEPs + concept → plan + code → hybrid STEP/STL';
