-- 20260423180000_cad_lab_spatial_plan.sql
--
-- Adds spatial_plan JSONB column on cad_lab_projects.
--
-- INTENT: every project gets a 2D (or 2.5D) spatial plan that places every
-- module at a specific position inside the envelope. Becomes the SOURCE OF
-- TRUTH for module positions, drives image generation (the plan SVG is fed
-- to gpt-image-2 as a multimodal reference so renders match exactly), and
-- is exported as a section in the PDF.
--
-- Generalises across domains:
--   - container / room              → floor plan (top-down)
--   - aircraft fuselage / cabinet   → cross-section (side elevation)
--   - cubesat / PCBA                → exploded stack (isometric)
--   - heat pump / outdoor unit      → cabinet elevation
--
-- Shape: see src/lib/layout/types.ts::SpatialPlan.
--   {
--     plan_type: 'floor' | 'elevation' | 'cross_section' | 'stack',
--     view: 'top_down' | 'side_elevation' | 'isometric_exploded' | 'cutaway',
--     envelope: Envelope,
--     placements: Array<{ module_id, x_mm, y_mm, z_mm?, w_mm, d_mm, h_mm,
--                          orientation_deg, mount, layer? }>,
--     features: Array<{ kind, geometry, coords, width_mm?, label }>,
--     constraints: Array<{ kind, a, b, min_mm?, max_mm?, reason }>,
--     notes: string[],
--     generated_at: iso,
--     authored_by: 'fang' | 'founder' | 'hybrid',
--     rules_domain: string,
--     rules_version: string
--   }
--
-- Persisted by runFangLayout (next migration's specialist) and read by:
--   1. Image prompt builders (system illustration + per-module renders)
--      to inject the plan SVG as gpt-image-2 multimodal reference.
--   2. PDF export — new "Spatial plan" section.
--   3. BOM auto-insert (future) — adjacency drives cable / duct / pipe
--      runs between placed modules.
--
-- Null when no rules library matches the industry domain or when sizing
-- hasn't run yet. Downstream consumers must handle null gracefully.
--
-- ROLLBACK:
--   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS spatial_plan;

BEGIN;

ALTER TABLE public.cad_lab_projects
    ADD COLUMN IF NOT EXISTS spatial_plan JSONB DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.spatial_plan IS
    'Output of the Forge layout engine — per-module placement (x/y/z + dims + orientation + mount), envelope-relative aisles/doors/vents, adjacency constraints, and view metadata for SVG rendering. Shape defined in src/lib/layout/types.ts::SpatialPlan. Computed by runFangLayout() after Fang sizing. Source of truth for image-prompt spatial references + PDF spatial-plan section.';

COMMIT;
