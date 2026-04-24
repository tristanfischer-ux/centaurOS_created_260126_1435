-- Extend pipeline_runs_no_duplicate_in_flight to include module_id for per-
-- module fanout stages (module.review.fang + any future per-module stage).
--
-- Bug observed 2026-04-24 run 16: stepRunFangReviews fires 10 parallel
-- runFangReviewBackground calls (Promise.allSettled, one per module). Each
-- tries startPipelineRun with (project, specialist='vp-manufacturing',
-- stage='module.review.fang'). First call succeeds; siblings 23505-dedupe
-- and reuse the first runId. All 10 LLM calls fire anyway (the code
-- continues past startPipelineRun), but pipeline_runs only has 1 row and
-- all 10 calls try to completePipelineRun on it — first wins, others
-- clobber a done row. More importantly, the row's output_ref ends up
-- pointing to whichever module completed first; observability is broken.
--
-- Fix: include a 4th discriminator column derived from input_ref->>moduleId.
-- Postgres partial-unique indexes can't index JSONB subfields directly,
-- so we extract moduleId into a generated text column and include it in
-- the index. For stages without a moduleId the column is NULL — and
-- NULLs are distinct in B-tree unique indexes, so non-fanout stages
-- (brief.decompose, bom.generate, cost.estimate etc.) are unaffected.

-- 1. Add generated column for moduleId extraction. IMMUTABLE-safe because
--    input_ref is set at insert and never updated in this schema.
ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS input_ref_module_id text
  GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_typeof(input_ref) = 'object' THEN input_ref->>'moduleId'
      ELSE NULL
    END
  ) STORED;

-- 2. Drop old partial unique index.
DROP INDEX IF EXISTS public.pipeline_runs_no_duplicate_in_flight;

-- 3. Recreate with input_ref_module_id as the 4th discriminator. Rows
--    without a moduleId get NULL, which B-tree treats as distinct — so
--    per-module fanout stages now allow one in-flight row per module,
--    while single-row stages still dedupe correctly.
CREATE UNIQUE INDEX pipeline_runs_no_duplicate_in_flight
  ON public.pipeline_runs (project_id, specialist_id, stage, input_ref_module_id)
  WHERE status IN ('queued', 'running');

COMMENT ON COLUMN public.pipeline_runs.input_ref_module_id IS
  'Extracted from input_ref->>moduleId. Participates in pipeline_runs_no_duplicate_in_flight so per-module fanout stages (module.review.fang) can have concurrent in-flight rows per module. NULL for non-fanout stages, which treats NULLs as distinct in the partial unique index — so legacy single-row stages still dedupe correctly.';
