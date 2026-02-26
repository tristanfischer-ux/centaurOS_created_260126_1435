-- Add checkpoints JSONB column to cad_lab_projects for decomposition checkpoint data.
-- Stores specialist checkpoint assessments (Max/CTO and Fang/VP Mfg) run at decomposition time.

ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS checkpoints JSONB DEFAULT NULL;
