-- Add reference_dossier column to cad_lab_projects
-- Stores Stage 0 reference harvest output: real-world prior art from
-- multi-model queries, used as ground-truth anchor for downstream stages.
ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS reference_dossier text;

COMMENT ON COLUMN cad_lab_projects.reference_dossier IS
  'Stage 0 reference harvest dossier — real-world prior art from 10-12 large language models, used as constraint anchor for Chase and downstream stages';
