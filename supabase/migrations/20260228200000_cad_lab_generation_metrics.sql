-- R3: Quality metrics persistence for CAD Lab generation pipeline.
-- Tracks per-module generation outcomes for trend analysis and regression detection.

CREATE TABLE public.cad_lab_generation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_id UUID NOT NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  model_used TEXT,
  seed_template_slug TEXT,
  first_attempt_success BOOLEAN,
  repair_attempts INTEGER,
  vision_score INTEGER,
  generation_time_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER
);

-- INTENT: Query by project (dashboard) and by model (cross-project quality comparison).
CREATE INDEX idx_cad_lab_metrics_project ON public.cad_lab_generation_metrics (project_id, created_at DESC);
CREATE INDEX idx_cad_lab_metrics_model ON public.cad_lab_generation_metrics (model_used, created_at DESC);
