-- Add review_skipped flag to cad_lab_projects
-- When TRUE, user explicitly chose to skip specialist reviews before finalization
ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS review_skipped BOOLEAN DEFAULT FALSE;
