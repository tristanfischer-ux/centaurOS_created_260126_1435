-- Migration: Assembly & Fulfillment Foundation
--
-- INTENT: ForgeOS decomposes products into modules with unstructured keyParts[],
-- but lacks structured BOM, assembly tracking, or multi-supplier manufacturing
-- support. This migration adds the database foundation: structured parts, hierarchical
-- BOM, fulfillment capabilities, manufacturing orders, and assembly convergence tracking.
--
-- Tables: parts, bom_lines, fulfillment_capabilities, manufacturing_orders,
--         manufacturing_order_lines, assembly_jobs, assembly_job_parts
--
-- Rollback: DROP TABLE public.assembly_job_parts, public.assembly_jobs,
--           public.manufacturing_order_lines, public.manufacturing_orders,
--           public.fulfillment_capabilities, public.bom_lines, public.parts CASCADE;
--           DROP TYPE manufacturing_process_type, fulfillment_capability_type,
--           manufacturing_order_status, order_line_status, assembly_job_status, qc_status;

-- ============================================================
-- 1. Enums
-- ============================================================

CREATE TYPE public.manufacturing_process_type AS ENUM (
    'cnc', 'injection_molding', 'sheet_metal',
    '3d_print_fdm', '3d_print_sla', '3d_print_sls',
    'casting', 'forging', 'machining',
    'purchased_cots', 'other'
);

CREATE TYPE public.fulfillment_capability_type AS ENUM (
    'make', 'assemble', 'kit_and_ship'
);

CREATE TYPE public.manufacturing_order_status AS ENUM (
    'draft', 'quoting', 'confirmed', 'in_production',
    'assembling', 'shipping', 'delivered', 'cancelled'
);

CREATE TYPE public.order_line_status AS ENUM (
    'pending_quote', 'quoted', 'accepted', 'in_production',
    'shipped', 'received_at_node', 'rejected', 'cancelled'
);

CREATE TYPE public.assembly_job_status AS ENUM (
    'awaiting_parts', 'parts_received', 'in_assembly',
    'qc_check', 'packed', 'shipped', 'delivered'
);

CREATE TYPE public.qc_status AS ENUM (
    'pending', 'passed', 'failed', 'waived'
);

-- ============================================================
-- 2. parts — structured part definitions linked to cad_lab_projects
-- ============================================================

CREATE TABLE public.parts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cad_lab_project_id UUID NOT NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,

    -- Identity
    part_number     TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,

    -- Traceability back to decomposition module
    source_module_id TEXT,

    -- Manufacturing specification
    process         public.manufacturing_process_type,
    material        TEXT,
    material_spec   TEXT,
    finish          TEXT,
    tolerance       TEXT,

    -- Physical properties
    mass_kg         NUMERIC(10, 4),
    envelope_x_mm   NUMERIC(10, 2),
    envelope_y_mm   NUMERIC(10, 2),
    envelope_z_mm   NUMERIC(10, 2),

    -- Cost estimate
    estimated_unit_cost_gbp NUMERIC(10, 2),

    -- CAD file references
    step_url        TEXT,
    stl_url         TEXT,
    drawing_url     TEXT,

    -- AI generation metadata
    ai_generated    BOOLEAN NOT NULL DEFAULT FALSE,
    ai_confidence   NUMERIC(3, 2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    is_purchased    BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Part numbers are unique within a project
    UNIQUE (cad_lab_project_id, part_number)
);

CREATE INDEX idx_parts_project ON public.parts(cad_lab_project_id);
CREATE INDEX idx_parts_source_module ON public.parts(cad_lab_project_id, source_module_id);

-- ============================================================
-- 3. bom_lines — hierarchical BOM (parent→child with quantity)
-- ============================================================

CREATE TABLE public.bom_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cad_lab_project_id UUID NOT NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,

    -- Hierarchy: NULL parent = top-level line
    parent_part_id  UUID REFERENCES public.parts(id) ON DELETE CASCADE,
    child_part_id   UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,

    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    reference_designator TEXT,
    notes           TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent duplicate parent→child links within a project
    UNIQUE (cad_lab_project_id, parent_part_id, child_part_id)
);

CREATE INDEX idx_bom_lines_project ON public.bom_lines(cad_lab_project_id);
CREATE INDEX idx_bom_lines_parent ON public.bom_lines(parent_part_id);
CREATE INDEX idx_bom_lines_child ON public.bom_lines(child_part_id);

-- ============================================================
-- 4. fulfillment_capabilities — extends provider_profiles
-- ============================================================

CREATE TABLE public.fulfillment_capabilities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_profile_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,

    capability          public.fulfillment_capability_type NOT NULL,
    processes           public.manufacturing_process_type[] DEFAULT '{}',
    materials           TEXT[] DEFAULT '{}',
    certifications      TEXT[] DEFAULT '{}',

    max_concurrent_jobs INTEGER DEFAULT 5,
    typical_lead_days   INTEGER,
    location_country    TEXT,
    location_postcode   TEXT,

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fulfillment_cap_provider ON public.fulfillment_capabilities(provider_profile_id);
CREATE INDEX idx_fulfillment_cap_active ON public.fulfillment_capabilities(is_active) WHERE is_active = TRUE;

-- ============================================================
-- 5. manufacturing_orders — multi-line manufacturing orders
-- ============================================================

CREATE TABLE public.manufacturing_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number    TEXT NOT NULL UNIQUE,
    foundry_id      TEXT NOT NULL,
    cad_lab_project_id UUID REFERENCES public.cad_lab_projects(id) ON DELETE SET NULL,
    created_by      UUID NOT NULL REFERENCES auth.users(id),

    status          public.manufacturing_order_status NOT NULL DEFAULT 'draft',
    title           TEXT,
    notes           TEXT,

    required_by     TIMESTAMPTZ,
    shipping_address JSONB,
    total_estimated_cost_gbp NUMERIC(12, 2),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mfg_orders_foundry ON public.manufacturing_orders(foundry_id);
CREATE INDEX idx_mfg_orders_project ON public.manufacturing_orders(cad_lab_project_id);
CREATE INDEX idx_mfg_orders_status ON public.manufacturing_orders(status);

-- ============================================================
-- 6. manufacturing_order_lines — per-part line items
-- ============================================================

CREATE TABLE public.manufacturing_order_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturing_order_id UUID NOT NULL REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE,
    part_id             UUID NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,

    status              public.order_line_status NOT NULL DEFAULT 'pending_quote',
    quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

    -- Assignment
    assigned_provider_id UUID REFERENCES public.provider_profiles(id),
    destination_node_id  UUID REFERENCES public.fulfillment_capabilities(id),

    -- Quoting
    quoted_unit_price_gbp NUMERIC(10, 2),
    quoted_lead_days      INTEGER,

    -- Shipping
    tracking_reference  TEXT,
    shipped_at          TIMESTAMPTZ,
    received_at         TIMESTAMPTZ,

    -- Quality
    qc_status           public.qc_status NOT NULL DEFAULT 'pending',
    qc_notes            TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mfg_order_lines_order ON public.manufacturing_order_lines(manufacturing_order_id);
CREATE INDEX idx_mfg_order_lines_part ON public.manufacturing_order_lines(part_id);
CREATE INDEX idx_mfg_order_lines_provider ON public.manufacturing_order_lines(assigned_provider_id);

-- ============================================================
-- 7. assembly_jobs — convergence tracking at assembly nodes
-- ============================================================

CREATE TABLE public.assembly_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturing_order_id UUID NOT NULL REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE,
    assembler_id        UUID NOT NULL REFERENCES public.fulfillment_capabilities(id),

    status              public.assembly_job_status NOT NULL DEFAULT 'awaiting_parts',
    assembly_part_id    UUID REFERENCES public.parts(id),

    notes               TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    shipped_at          TIMESTAMPTZ,
    tracking_reference  TEXT,

    qc_status           public.qc_status NOT NULL DEFAULT 'pending',
    qc_notes            TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assembly_jobs_order ON public.assembly_jobs(manufacturing_order_id);
CREATE INDEX idx_assembly_jobs_assembler ON public.assembly_jobs(assembler_id);

-- ============================================================
-- 8. assembly_job_parts — incoming parts tracking
-- ============================================================

CREATE TABLE public.assembly_job_parts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assembly_job_id     UUID NOT NULL REFERENCES public.assembly_jobs(id) ON DELETE CASCADE,
    order_line_id       UUID NOT NULL REFERENCES public.manufacturing_order_lines(id) ON DELETE CASCADE,

    expected_quantity   INTEGER NOT NULL DEFAULT 1 CHECK (expected_quantity > 0),
    received_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    received_at         TIMESTAMPTZ,

    qc_status           public.qc_status NOT NULL DEFAULT 'pending',
    qc_notes            TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One tracking entry per job + line
    UNIQUE (assembly_job_id, order_line_id)
);

CREATE INDEX idx_assembly_job_parts_job ON public.assembly_job_parts(assembly_job_id);
CREATE INDEX idx_assembly_job_parts_line ON public.assembly_job_parts(order_line_id);

-- ============================================================
-- 9. RLS Policies
-- ============================================================

-- SECURITY: foundry isolation via cad_lab_projects subquery for parts and bom_lines.
-- fulfillment_capabilities: marketplace-visible SELECT for all authenticated users.
-- manufacturing_orders: foundry_id column for direct isolation.
-- assembly_jobs/assembly_job_parts: isolated via manufacturing_orders join.

-- ── parts ──

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_select_own_foundry" ON public.parts FOR SELECT USING (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "parts_insert_own_foundry" ON public.parts FOR INSERT WITH CHECK (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "parts_update_own_foundry" ON public.parts FOR UPDATE USING (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "parts_delete_own_foundry" ON public.parts FOR DELETE USING (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- ── bom_lines ──

ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bom_lines_select_own_foundry" ON public.bom_lines FOR SELECT USING (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "bom_lines_insert_own_foundry" ON public.bom_lines FOR INSERT WITH CHECK (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "bom_lines_update_own_foundry" ON public.bom_lines FOR UPDATE USING (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "bom_lines_delete_own_foundry" ON public.bom_lines FOR DELETE USING (
    cad_lab_project_id IN (
        SELECT id FROM public.cad_lab_projects
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- ── fulfillment_capabilities ──

ALTER TABLE public.fulfillment_capabilities ENABLE ROW LEVEL SECURITY;

-- SECURITY: Marketplace visibility — all authenticated users can browse capabilities
CREATE POLICY "fulfillment_cap_select_authenticated" ON public.fulfillment_capabilities
FOR SELECT USING (auth.uid() IS NOT NULL);

-- SECURITY: Only the provider's own user can write their capabilities
CREATE POLICY "fulfillment_cap_insert_own" ON public.fulfillment_capabilities
FOR INSERT WITH CHECK (
    provider_profile_id IN (
        SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
);

CREATE POLICY "fulfillment_cap_update_own" ON public.fulfillment_capabilities
FOR UPDATE USING (
    provider_profile_id IN (
        SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
);

CREATE POLICY "fulfillment_cap_delete_own" ON public.fulfillment_capabilities
FOR DELETE USING (
    provider_profile_id IN (
        SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
);

-- ── manufacturing_orders ──

ALTER TABLE public.manufacturing_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mfg_orders_select_own_foundry" ON public.manufacturing_orders FOR SELECT USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "mfg_orders_insert_own_foundry" ON public.manufacturing_orders FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "mfg_orders_update_own_foundry" ON public.manufacturing_orders FOR UPDATE USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "mfg_orders_delete_own_foundry" ON public.manufacturing_orders FOR DELETE USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- ── manufacturing_order_lines ──

ALTER TABLE public.manufacturing_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mfg_order_lines_select_own_foundry" ON public.manufacturing_order_lines FOR SELECT USING (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "mfg_order_lines_insert_own_foundry" ON public.manufacturing_order_lines FOR INSERT WITH CHECK (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "mfg_order_lines_update_own_foundry" ON public.manufacturing_order_lines FOR UPDATE USING (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "mfg_order_lines_delete_own_foundry" ON public.manufacturing_order_lines FOR DELETE USING (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- ── assembly_jobs ──

ALTER TABLE public.assembly_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assembly_jobs_select_own_foundry" ON public.assembly_jobs FOR SELECT USING (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "assembly_jobs_insert_own_foundry" ON public.assembly_jobs FOR INSERT WITH CHECK (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "assembly_jobs_update_own_foundry" ON public.assembly_jobs FOR UPDATE USING (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "assembly_jobs_delete_own_foundry" ON public.assembly_jobs FOR DELETE USING (
    manufacturing_order_id IN (
        SELECT id FROM public.manufacturing_orders
        WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- ── assembly_job_parts ──

ALTER TABLE public.assembly_job_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assembly_job_parts_select_own_foundry" ON public.assembly_job_parts FOR SELECT USING (
    assembly_job_id IN (
        SELECT aj.id FROM public.assembly_jobs aj
        JOIN public.manufacturing_orders mo ON mo.id = aj.manufacturing_order_id
        WHERE mo.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "assembly_job_parts_insert_own_foundry" ON public.assembly_job_parts FOR INSERT WITH CHECK (
    assembly_job_id IN (
        SELECT aj.id FROM public.assembly_jobs aj
        JOIN public.manufacturing_orders mo ON mo.id = aj.manufacturing_order_id
        WHERE mo.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "assembly_job_parts_update_own_foundry" ON public.assembly_job_parts FOR UPDATE USING (
    assembly_job_id IN (
        SELECT aj.id FROM public.assembly_jobs aj
        JOIN public.manufacturing_orders mo ON mo.id = aj.manufacturing_order_id
        WHERE mo.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "assembly_job_parts_delete_own_foundry" ON public.assembly_job_parts FOR DELETE USING (
    assembly_job_id IN (
        SELECT aj.id FROM public.assembly_jobs aj
        JOIN public.manufacturing_orders mo ON mo.id = aj.manufacturing_order_id
        WHERE mo.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- ============================================================
-- 10. Updated-at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_parts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parts_updated_at
    BEFORE UPDATE ON public.parts
    FOR EACH ROW EXECUTE FUNCTION public.update_parts_updated_at();

CREATE OR REPLACE FUNCTION public.update_bom_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bom_lines_updated_at
    BEFORE UPDATE ON public.bom_lines
    FOR EACH ROW EXECUTE FUNCTION public.update_bom_lines_updated_at();

CREATE OR REPLACE FUNCTION public.update_fulfillment_capabilities_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fulfillment_capabilities_updated_at
    BEFORE UPDATE ON public.fulfillment_capabilities
    FOR EACH ROW EXECUTE FUNCTION public.update_fulfillment_capabilities_updated_at();

CREATE OR REPLACE FUNCTION public.update_manufacturing_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manufacturing_orders_updated_at
    BEFORE UPDATE ON public.manufacturing_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_manufacturing_orders_updated_at();

CREATE OR REPLACE FUNCTION public.update_manufacturing_order_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manufacturing_order_lines_updated_at
    BEFORE UPDATE ON public.manufacturing_order_lines
    FOR EACH ROW EXECUTE FUNCTION public.update_manufacturing_order_lines_updated_at();

CREATE OR REPLACE FUNCTION public.update_assembly_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assembly_jobs_updated_at
    BEFORE UPDATE ON public.assembly_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_assembly_jobs_updated_at();

CREATE OR REPLACE FUNCTION public.update_assembly_job_parts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assembly_job_parts_updated_at
    BEFORE UPDATE ON public.assembly_job_parts
    FOR EACH ROW EXECUTE FUNCTION public.update_assembly_job_parts_updated_at();
