-- AI-powered cost estimation results (keyed by moduleId → AiCostEstimate)
ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS ai_cost_estimates JSONB DEFAULT NULL;
