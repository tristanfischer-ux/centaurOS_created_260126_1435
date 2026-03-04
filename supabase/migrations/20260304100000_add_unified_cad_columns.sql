-- Add columns for persisting unified CAD model generation results.
-- unified_result stores the CadLabResult (minus binary data) as JSONB.
-- unified_code stores the generated CadQuery Python source.

ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS unified_result JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unified_code TEXT DEFAULT NULL;
