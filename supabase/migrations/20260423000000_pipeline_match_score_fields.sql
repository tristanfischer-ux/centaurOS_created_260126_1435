-- Money Intel — Phase A backend
-- Adds fields on investor_pipeline_state so scoreInvestorsAgainstThesis can
-- cache a rich breakdown (reasons + pillars) alongside the existing numeric
-- match_score_cached column. Also adds match_scored_at so the UI can show
-- "Scored 3 days ago" without needing to compute from thesis version.
--
-- Additive only — IF NOT EXISTS guards ensure this migration re-runs safely.
-- Does NOT alter RLS. Existing row-level access rules still apply.

ALTER TABLE public.investor_pipeline_state
  ADD COLUMN IF NOT EXISTS match_breakdown_json jsonb,
  ADD COLUMN IF NOT EXISTS match_scored_at timestamptz;

COMMENT ON COLUMN public.investor_pipeline_state.match_breakdown_json IS
  'Cached 6-pillar breakdown + top-3 reasons from scoreListing(). Refreshed by scoreInvestorsAgainstThesis. Shape: { total, pillars: {thesis,geography,stage,cheque,activity,confidence}, reasons: string[] }.';

COMMENT ON COLUMN public.investor_pipeline_state.match_scored_at IS
  'Timestamp of the most recent scoreInvestorsAgainstThesis run for this pipeline row. Distinct from match_score_computed_at (legacy) so forward-migrations can preserve legacy values untouched.';
