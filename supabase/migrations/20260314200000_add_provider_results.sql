-- Add provider_results JSONB column for A/B comparison of 3D generation providers.
-- Shape: Record<ABProvider, ProviderResult> — same JSONB-map pattern as reviews, ai_cost_estimates.
ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS provider_results jsonb DEFAULT '{}';
