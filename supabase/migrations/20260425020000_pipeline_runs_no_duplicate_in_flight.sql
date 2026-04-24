-- Partial unique index: at most one in-flight pipeline_run per (project, specialist, stage).
-- A stage is "in flight" when status is queued or running. Done/failed/cancelled
-- rows are historical + can stack freely.
--
-- Observed 2026-04-23 on BESS dc8c1def -- concurrent autopilot tick + user re-click
-- produced two bom.generate rows at started_at=17:22:07, both status=running. One
-- finished, one busted 300s. Autopilot's waitForStage couldn't disambiguate.
--
-- With this index: the second concurrent insert fails with 23505 unique_violation.
-- The startPipelineRun helper catches that + returns the existing in-flight row's
-- id, making the call idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_runs_no_duplicate_in_flight
  ON public.pipeline_runs (project_id, specialist_id, stage)
  WHERE status IN ('queued', 'running');
