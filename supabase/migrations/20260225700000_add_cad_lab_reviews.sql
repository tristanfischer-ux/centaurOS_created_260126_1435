-- Add specialist reviews column to cad_lab_projects.
-- Reviews are stored as JSONB keyed by moduleId → array of SpecialistReview objects.
-- This allows specialists to review individual modules with structured verdicts.

ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS reviews JSONB DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.reviews IS
  'Specialist reviews per module. Structure: { [moduleId]: SpecialistReview[] }';
