/**
 * Migration: Add modules column to cad_lab_projects for module decomposition.
 *
 * Purpose: After research, products can be decomposed into modules where
 * each module goes through its own CAD pipeline. The modules JSONB column
 * stores the array of module definitions and their individual pipeline state.
 *
 * Rollback: ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS modules;
 */

ALTER TABLE public.cad_lab_projects
ADD COLUMN IF NOT EXISTS modules JSONB DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.modules IS 'Array of CadLabModule objects. Each module has: id, name, purpose, inputs, outputs, keyParts, leadWeeks, description, research, interfaceDefinition, result, code.';
