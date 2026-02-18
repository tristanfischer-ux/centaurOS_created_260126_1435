/**
 * Migration: Add integrated assembly URLs to cad_lab_projects.
 *
 * Purpose: After all modules are generated, a systems integration step can
 * produce a single combined STEP/STL assembly. These columns store the result.
 *
 * Rollback: ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS integrated_assembly_stl_url, DROP COLUMN IF EXISTS integrated_assembly_step_url;
 */

ALTER TABLE public.cad_lab_projects
ADD COLUMN IF NOT EXISTS integrated_assembly_stl_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS integrated_assembly_step_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.integrated_assembly_stl_url IS 'URL to the combined system assembly STL (from integration step).';
COMMENT ON COLUMN public.cad_lab_projects.integrated_assembly_step_url IS 'URL to the combined system assembly STEP (from integration step).';
