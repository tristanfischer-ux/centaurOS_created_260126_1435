-- H6: Enrich generation metrics with error and context columns
-- Adds diagnostic columns for deeper failure analysis and design brief tracking.

ALTER TABLE cad_lab_generation_metrics
  ADD COLUMN IF NOT EXISTS error_category TEXT,
  ADD COLUMN IF NOT EXISTS modal_error_snippet TEXT,
  ADD COLUMN IF NOT EXISTS pre_exec_critical_count INTEGER,
  ADD COLUMN IF NOT EXISTS pre_exec_warning_count INTEGER,
  ADD COLUMN IF NOT EXISTS has_design_brief BOOLEAN,
  ADD COLUMN IF NOT EXISTS domain TEXT;

-- Index on error_category for "what % of failures are TypeError?" queries
CREATE INDEX IF NOT EXISTS idx_cad_lab_metrics_error_category
  ON cad_lab_generation_metrics (error_category)
  WHERE error_category IS NOT NULL;
