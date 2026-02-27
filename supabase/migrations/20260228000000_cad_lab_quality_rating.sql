-- P4: Add quality_ratings JSONB column to cad_lab_projects for per-module
-- thumbs up/down quality signal. Schema: { [moduleId]: { rating, timestamp, notes? } }
ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS quality_ratings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cad_lab_projects.quality_ratings IS
  'Per-module quality ratings: { [moduleId]: { rating: "good"|"bad", timestamp: ISO8601, notes?: string } }';
