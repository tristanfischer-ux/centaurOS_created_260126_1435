/**
 * Migration: Recommendation feedback for engineering and marketplace
 *
 * Purpose: Store thumbs up/down, component swaps, and module built/skipped
 * so we can improve future prompts with few-shot examples.
 *
 * Related: src/actions/recommendation-feedback.ts, UI in marketplace and CAD Lab
 * Rollback: DROP TABLE recommendation_feedback CASCADE;
 */

CREATE TABLE IF NOT EXISTS public.recommendation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- What was this feedback about?
  source_type text NOT NULL CHECK (source_type IN (
    'marketplace_recommendation',
    'cad_research_report',
    'cad_module',
    'cad_diagnostics',
    'component_recommendation'
  )),
  source_id text, -- id of the recommendation, module id, or listing id

  -- Kind of feedback
  feedback_type text NOT NULL CHECK (feedback_type IN (
    'thumbs_up',
    'thumbs_down',
    'component_swap',
    'module_built',
    'module_skipped'
  )),

  -- Optional free-text or structured payload
  comment text,
  metadata jsonb DEFAULT '{}'::jsonb, -- e.g. { "original_component_id": "...", "replacement_component_id": "..." }

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_foundry
  ON public.recommendation_feedback(foundry_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_source
  ON public.recommendation_feedback(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_created
  ON public.recommendation_feedback(created_at DESC);

ALTER TABLE public.recommendation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert feedback in their foundry" ON public.recommendation_feedback;
CREATE POLICY "Users can insert feedback in their foundry"
  ON public.recommendation_feedback FOR INSERT
  WITH CHECK (
    foundry_id IN (
      SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can read feedback in their foundry" ON public.recommendation_feedback;
CREATE POLICY "Users can read feedback in their foundry"
  ON public.recommendation_feedback FOR SELECT
  USING (
    foundry_id IN (
      SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE public.recommendation_feedback IS 'Thumbs up/down, component swaps, and module built/skipped for improving recommendations';
