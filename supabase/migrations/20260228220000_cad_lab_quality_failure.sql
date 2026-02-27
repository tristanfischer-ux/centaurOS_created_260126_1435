-- J4: Add quality_failure boolean to cad_lab_generation_metrics
-- Tracks when vision scoring indicates the final render doesn't match
-- the product description (score < 5/10).
ALTER TABLE cad_lab_generation_metrics
  ADD COLUMN IF NOT EXISTS quality_failure BOOLEAN;
