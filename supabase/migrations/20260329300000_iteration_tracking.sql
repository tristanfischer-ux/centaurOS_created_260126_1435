-- ═══════════════════════════════════════════════════════════════════════
-- Product Iteration Tracking + Design Briefs
-- Enables the circular optimization loop: track iterations, generate
-- design briefs from assessments/suggestions, convert to Forge projects.
-- ═══════════════════════════════════════════════════════════════════════

-- Product iterations: tracks each loop cycle with Pareto scores
CREATE TABLE IF NOT EXISTS public.product_iterations (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  foundry_id        text NOT NULL,
  iteration_number  integer NOT NULL DEFAULT 1,

  -- Pareto scores across 4 dimensions (0-100 each)
  pareto_scores     jsonb NOT NULL DEFAULT '{"market":0,"financial":0,"fundability":0,"manufacturing":0}',

  -- What changed in this iteration
  changes_made      jsonb DEFAULT '[]',
  hypothesis        text,
  outcome           text,

  -- Convergence tracking
  convergence_delta float DEFAULT 0,
  convergence_status text DEFAULT 'initial'
    CHECK (convergence_status IN ('initial', 'improving', 'moderate', 'plateauing', 'regressing', 'converged')),

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_iterations_product ON public.product_iterations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_iterations_number ON public.product_iterations(product_id, iteration_number);

ALTER TABLE public.product_iterations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iterations_select" ON public.product_iterations FOR SELECT
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "iterations_insert" ON public.product_iterations FOR INSERT
  WITH CHECK (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
  ));

-- Design briefs: engineering requirements generated from market or fundability data
CREATE TABLE IF NOT EXISTS public.design_briefs (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  foundry_id        text NOT NULL,

  -- Brief content
  brief_content     jsonb NOT NULL DEFAULT '{}',
  -- Structure: {
  --   product_category, target_cost_pence, target_weight_kg, target_dimensions,
  --   key_requirements[], materials_guidance[], manufacturing_constraints[],
  --   competitive_benchmarks[{product, price, key_specs}],
  --   design_priorities[], certification_requirements[],
  --   source_context (what triggered this brief)
  -- }

  source            text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('market_assessment', 'fundability_suggestion', 'manual', 'synthesis')),

  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'approved', 'sent_to_forge', 'rejected')),

  -- Feasibility review
  reviewed_by       text,  -- specialist ID who reviewed (e.g., 'cto')
  review_notes      text,

  -- Link to Forge project (set when "Send to Forge" is clicked)
  cad_lab_project_id uuid,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_briefs_product ON public.design_briefs(product_id);

ALTER TABLE public.design_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefs_select" ON public.design_briefs FOR SELECT
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "briefs_insert" ON public.design_briefs FOR INSERT
  WITH CHECK (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "briefs_update" ON public.design_briefs FOR UPDATE
  USING (foundry_id IN (
    SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
  ));

-- Auto-update updated_at
CREATE TRIGGER trg_design_briefs_updated_at
  BEFORE UPDATE ON public.design_briefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add product_synthesis JSONB to products for cross-system synthesis results
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_synthesis jsonb;
