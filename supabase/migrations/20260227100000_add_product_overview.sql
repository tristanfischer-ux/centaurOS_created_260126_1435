-- Add product_overview column to cad_lab_projects for editable executive summary.
-- Stored separately from the research JSONB so user edits don't mutate the original report.

ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS product_overview TEXT;
