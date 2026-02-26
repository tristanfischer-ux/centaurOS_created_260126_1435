-- Add column to persist CadQuery assembly code for debugging
ALTER TABLE public.cad_lab_projects
ADD COLUMN IF NOT EXISTS integrated_assembly_code TEXT DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.integrated_assembly_code
IS 'CadQuery Python code used to generate the integrated assembly (for debugging).';
