-- Add diagnostic_enrichment JSONB column for AI reasoning + ranked alternatives
-- Parallel sidecar to diagnostic_answers — carries WHY each option was selected
ALTER TABLE cad_lab_projects ADD COLUMN IF NOT EXISTS diagnostic_enrichment JSONB DEFAULT NULL;
