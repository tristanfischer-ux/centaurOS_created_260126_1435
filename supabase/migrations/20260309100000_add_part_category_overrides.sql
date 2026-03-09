-- Add part_category_overrides JSONB column to cad_lab_projects.
-- Stores user overrides for part classification (type/process/material)
-- keyed by "${moduleId}::${partName}".
ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS part_category_overrides JSONB DEFAULT '{}';
