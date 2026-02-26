-- Migration: Tighten assembly/fulfillment constraints and add provider visibility
--
-- INTENT: Red-team review found several gaps in the assembly foundation migration:
-- 1. bom_lines UNIQUE constraint doesn't work for NULL parent_part_id (PG NULL != NULL)
-- 2. No self-referencing cycle prevention on bom_lines
-- 3. No non-negative checks on costs, mass, dimensions, lead days
-- 4. Providers can't see manufacturing_order_lines or assembly_jobs assigned to them
-- 5. FK cascade behavior needs explicit ON DELETE SET NULL for provider references
--
-- Rollback: DROP INDEX IF EXISTS idx_bom_lines_unique_top_level;
--           ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_no_self_ref;
--           (etc. — reverse each ALTER)

-- ============================================================
-- 1. Fix NULL parent unique constraint on bom_lines
-- ============================================================

-- GOTCHA: PostgreSQL treats NULL != NULL in UNIQUE constraints, so
-- (project, NULL, child) can have duplicates. This partial index
-- covers the NULL parent case specifically.
CREATE UNIQUE INDEX idx_bom_lines_unique_top_level
ON public.bom_lines (cad_lab_project_id, child_part_id)
WHERE parent_part_id IS NULL;

-- ============================================================
-- 2. Prevent self-referencing BOM lines
-- ============================================================

ALTER TABLE public.bom_lines
ADD CONSTRAINT bom_lines_no_self_ref
CHECK (parent_part_id IS NULL OR parent_part_id != child_part_id);

-- ============================================================
-- 3. Non-negative constraints on costs, mass, dimensions
-- ============================================================

-- parts
ALTER TABLE public.parts
ADD CONSTRAINT parts_mass_non_negative CHECK (mass_kg IS NULL OR mass_kg >= 0);

ALTER TABLE public.parts
ADD CONSTRAINT parts_cost_non_negative CHECK (estimated_unit_cost_gbp IS NULL OR estimated_unit_cost_gbp >= 0);

ALTER TABLE public.parts
ADD CONSTRAINT parts_envelope_x_non_negative CHECK (envelope_x_mm IS NULL OR envelope_x_mm >= 0);

ALTER TABLE public.parts
ADD CONSTRAINT parts_envelope_y_non_negative CHECK (envelope_y_mm IS NULL OR envelope_y_mm >= 0);

ALTER TABLE public.parts
ADD CONSTRAINT parts_envelope_z_non_negative CHECK (envelope_z_mm IS NULL OR envelope_z_mm >= 0);

-- manufacturing_orders
ALTER TABLE public.manufacturing_orders
ADD CONSTRAINT mfg_orders_cost_non_negative CHECK (total_estimated_cost_gbp IS NULL OR total_estimated_cost_gbp >= 0);

-- manufacturing_order_lines
ALTER TABLE public.manufacturing_order_lines
ADD CONSTRAINT mfg_order_lines_price_non_negative CHECK (quoted_unit_price_gbp IS NULL OR quoted_unit_price_gbp >= 0);

ALTER TABLE public.manufacturing_order_lines
ADD CONSTRAINT mfg_order_lines_lead_positive CHECK (quoted_lead_days IS NULL OR quoted_lead_days > 0);

-- fulfillment_capabilities
ALTER TABLE public.fulfillment_capabilities
ADD CONSTRAINT fulfillment_cap_lead_positive CHECK (typical_lead_days IS NULL OR typical_lead_days > 0);

ALTER TABLE public.fulfillment_capabilities
ADD CONSTRAINT fulfillment_cap_max_jobs_positive CHECK (max_concurrent_jobs IS NULL OR max_concurrent_jobs > 0);

-- ============================================================
-- 4. Provider-side SELECT policies for manufacturing visibility
-- ============================================================

-- SECURITY: Providers assigned to order lines need to see their assignments.
-- Without this, the multi-supplier workflow is broken — providers in other
-- foundries cannot see order lines assigned to them.

CREATE POLICY "mfg_order_lines_select_assigned_provider"
ON public.manufacturing_order_lines
FOR SELECT USING (
    assigned_provider_id IN (
        SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
);

-- Providers who are assemblers need to see their assembly jobs
CREATE POLICY "assembly_jobs_select_assembler"
ON public.assembly_jobs
FOR SELECT USING (
    assembler_id IN (
        SELECT id FROM public.fulfillment_capabilities
        WHERE provider_profile_id IN (
            SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
        )
    )
);

-- Assembly job parts visible to the assembler
CREATE POLICY "assembly_job_parts_select_assembler"
ON public.assembly_job_parts
FOR SELECT USING (
    assembly_job_id IN (
        SELECT aj.id FROM public.assembly_jobs aj
        JOIN public.fulfillment_capabilities fc ON fc.id = aj.assembler_id
        JOIN public.provider_profiles pp ON pp.id = fc.provider_profile_id
        WHERE pp.user_id = auth.uid()
    )
);

-- ============================================================
-- 5. Fix FK cascade for provider references
-- ============================================================

-- DECISION: When a provider_profile is deleted (cascades from profiles),
-- order lines and assembly jobs should survive with NULL provider/node.
-- Default NO ACTION would block the cascade chain.

ALTER TABLE public.manufacturing_order_lines
DROP CONSTRAINT IF EXISTS manufacturing_order_lines_assigned_provider_id_fkey;

ALTER TABLE public.manufacturing_order_lines
ADD CONSTRAINT manufacturing_order_lines_assigned_provider_id_fkey
FOREIGN KEY (assigned_provider_id) REFERENCES public.provider_profiles(id)
ON DELETE SET NULL;

ALTER TABLE public.manufacturing_order_lines
DROP CONSTRAINT IF EXISTS manufacturing_order_lines_destination_node_id_fkey;

ALTER TABLE public.manufacturing_order_lines
ADD CONSTRAINT manufacturing_order_lines_destination_node_id_fkey
FOREIGN KEY (destination_node_id) REFERENCES public.fulfillment_capabilities(id)
ON DELETE SET NULL;
