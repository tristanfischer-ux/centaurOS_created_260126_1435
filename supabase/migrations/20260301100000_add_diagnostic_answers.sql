-- Add diagnostic_answers column to cad_lab_projects
-- Persists per-module diagnostic answers from the Specify stage so they survive page reloads.

ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS diagnostic_answers JSONB DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.diagnostic_answers IS
  'Per-module diagnostic answers from Specify stage: { [moduleId]: { mfg_process, material, tolerance, finish, batch_size, environment } }';
