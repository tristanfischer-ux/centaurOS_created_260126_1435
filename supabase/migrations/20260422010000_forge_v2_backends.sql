-- Forge v2 backends — persistence for /brief-lock, /fork, /archive,
-- /assumption-test, and /bom (real parts spec).
--
-- NOTE: foundry_memberships uses `user_id`, not `profile_id`. RLS policies
-- below join on fm.user_id = auth.uid().

-- 1. brief_locked_at
ALTER TABLE public.cad_lab_projects ADD COLUMN IF NOT EXISTS brief_locked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_cad_lab_projects_brief_locked
    ON public.cad_lab_projects (foundry_id, brief_locked_at)
    WHERE brief_locked_at IS NOT NULL;
COMMENT ON COLUMN public.cad_lab_projects.brief_locked_at IS
    'When the design brief was locked. NULL = editable. Set via lockCadLabBrief action.';

-- 2. archived_at
ALTER TABLE public.cad_lab_projects ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_cad_lab_projects_archived
    ON public.cad_lab_projects (foundry_id, archived_at);
COMMENT ON COLUMN public.cad_lab_projects.archived_at IS
    'Soft-archive timestamp. Archived rows stay queryable but filtered out of default workspace list.';

-- 3. forked_from_id
ALTER TABLE public.cad_lab_projects ADD COLUMN IF NOT EXISTS forked_from_id uuid REFERENCES public.cad_lab_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cad_lab_projects_forked_from
    ON public.cad_lab_projects (forked_from_id) WHERE forked_from_id IS NOT NULL;
COMMENT ON COLUMN public.cad_lab_projects.forked_from_id IS
    'Source project this was forked from. NULL = original. Set via forkCadLabProject action.';

-- 4. cad_lab_parts
CREATE TABLE IF NOT EXISTS public.cad_lab_parts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,
    module_id text NOT NULL,
    foundry_id text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    name text NOT NULL,
    display_name text,
    description text,
    quantity integer,
    material text,
    process text,
    tolerance text,
    finish text,
    dimensions text,
    mass_grams numeric,
    preferred_supplier_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
    typical_lead_weeks integer,
    estimated_cost_gbp numeric,
    source_key_part text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cad_lab_parts_project ON public.cad_lab_parts (project_id);
CREATE INDEX IF NOT EXISTS idx_cad_lab_parts_module ON public.cad_lab_parts (project_id, module_id);
CREATE INDEX IF NOT EXISTS idx_cad_lab_parts_foundry ON public.cad_lab_parts (foundry_id);
CREATE INDEX IF NOT EXISTS idx_cad_lab_parts_supplier ON public.cad_lab_parts (preferred_supplier_id) WHERE preferred_supplier_id IS NOT NULL;

ALTER TABLE public.cad_lab_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read parts in their foundry" ON public.cad_lab_parts;
CREATE POLICY "Members can read parts in their foundry" ON public.cad_lab_parts FOR SELECT
    USING (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can insert parts in their foundry" ON public.cad_lab_parts;
CREATE POLICY "Members can insert parts in their foundry" ON public.cad_lab_parts FOR INSERT
    WITH CHECK (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can update parts in their foundry" ON public.cad_lab_parts;
CREATE POLICY "Members can update parts in their foundry" ON public.cad_lab_parts FOR UPDATE
    USING (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can delete parts in their foundry" ON public.cad_lab_parts;
CREATE POLICY "Members can delete parts in their foundry" ON public.cad_lab_parts FOR DELETE
    USING (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

COMMENT ON TABLE public.cad_lab_parts IS
    'Per-part specifications for cad_lab_projects modules. Each row = one buildable part.';

-- 5. assumption_tests
CREATE TABLE IF NOT EXISTS public.assumption_tests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.cad_lab_projects(id) ON DELETE SET NULL,
    product_id uuid,
    foundry_id text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    hypothesis text NOT NULL,
    expected_outcome text NOT NULL,
    actual_outcome text,
    decision text,
    rationale text,
    tested_at timestamptz,
    logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assumption_tests_project ON public.assumption_tests (project_id);
CREATE INDEX IF NOT EXISTS idx_assumption_tests_foundry ON public.assumption_tests (foundry_id);
CREATE INDEX IF NOT EXISTS idx_assumption_tests_decision ON public.assumption_tests (foundry_id, decision) WHERE decision IS NOT NULL;

ALTER TABLE public.assumption_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read assumptions in their foundry" ON public.assumption_tests;
CREATE POLICY "Members can read assumptions in their foundry" ON public.assumption_tests FOR SELECT
    USING (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can insert assumptions in their foundry" ON public.assumption_tests;
CREATE POLICY "Members can insert assumptions in their foundry" ON public.assumption_tests FOR INSERT
    WITH CHECK (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can update assumptions in their foundry" ON public.assumption_tests;
CREATE POLICY "Members can update assumptions in their foundry" ON public.assumption_tests FOR UPDATE
    USING (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can delete assumptions in their foundry" ON public.assumption_tests;
CREATE POLICY "Members can delete assumptions in their foundry" ON public.assumption_tests FOR DELETE
    USING (foundry_id IN (SELECT fm.foundry_id FROM public.foundry_memberships fm WHERE fm.user_id = (SELECT auth.uid())));

COMMENT ON TABLE public.assumption_tests IS
    'Hypothesis / expected / actual / decision log. Wires /the-forge-v2/projects/[id]/assumption-test UI.';

-- Updated-at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cad_lab_parts_updated_at ON public.cad_lab_parts;
CREATE TRIGGER trg_cad_lab_parts_updated_at BEFORE UPDATE ON public.cad_lab_parts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_assumption_tests_updated_at ON public.assumption_tests;
CREATE TRIGGER trg_assumption_tests_updated_at BEFORE UPDATE ON public.assumption_tests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
