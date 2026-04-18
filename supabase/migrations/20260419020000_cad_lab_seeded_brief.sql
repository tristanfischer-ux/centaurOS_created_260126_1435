-- Structural brief seeding on cad_lab_projects (Phase 1.4).
--
-- INTENT: When convertBriefToForge creates a CAD Lab project from a product's
-- design brief, the brief's structured fields (target_cost_pence,
-- target_weight_kg, materials_guidance[], manufacturing_constraints[], etc.)
-- currently get flattened into product_overview markdown. The CAD Lab Specify
-- stage can't render them structurally — they're just a text blob.
--
-- This migration adds one nullable JSONB column that carries the complete
-- DesignBriefContent object as-is. The Specify page reads it to show a
-- "Seeded from product brief" card with real structure. product_overview
-- stays populated for backward compat with every other reader.
--
-- Only one column — simpler than splaying (target_cost_pence, target_weight_kg,
-- certifications text[], etc.) and future-proof against brief shape changes.
--
-- ROLLBACK:
--   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS seeded_brief_content;

BEGIN;

ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS seeded_brief_content jsonb;

COMMENT ON COLUMN public.cad_lab_projects.seeded_brief_content IS 'When set, this project was created from a product design brief (convertBriefToForge 2026-04-18). Shape matches DesignBriefContent in src/types/product.ts: { target_cost_pence?, target_weight_kg?, target_dimensions?, key_requirements[], materials_guidance[], manufacturing_constraints[], competitive_benchmarks[], design_priorities[], certification_requirements[], product_category?, source_context? }. Specify stage renders it as a structured card; product_overview text stays populated for backward compat.';

COMMIT;
