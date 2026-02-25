-- Add visual_style JSONB column to persist AI-generated visual style specs
-- for cohesive module illustrations across retries and page reloads.
ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS visual_style JSONB DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.visual_style IS
  'AI-generated visual style spec for cohesive module illustrations';
