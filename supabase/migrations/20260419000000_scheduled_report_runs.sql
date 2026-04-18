-- Audit log of scheduled-report cron executions (Phase 1.2C infrastructure).
--
-- INTENT: one row per time the hourly cron processes a due scheduled_reports
-- row. Gives Tristan a way to answer "did the cron actually run?" and "why
-- didn't that report go out?" without grep'ing Vercel logs.
--
-- STATUS values:
-- - 'success'  — report generated + emailed, schedule advanced normally.
-- - 'failed'   — exception mid-run; next_run_at bumped +1h so we retry.
-- - 'skipped'  — cron detected the row but chose not to send (e.g. 1.2C
--                currently has no report-generator path from a service-role
--                context, so every run is 'skipped' with error='pending_dispatch'
--                until Phase 1.2D lands the refactor).
--
-- ROLLBACK:
--   BEGIN;
--   DROP INDEX IF EXISTS public.idx_scheduled_report_runs_schedule;
--   DROP TABLE IF EXISTS public.scheduled_report_runs;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_report_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id       uuid NOT NULL REFERENCES public.scheduled_reports(id) ON DELETE CASCADE,
  foundry_id        text NOT NULL,
  template_id       text NOT NULL,
  run_at            timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL CHECK (status IN ('success','failed','skipped')),
  error             text,
  recipients_count  int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Newest-first scan per schedule (UI: "last 10 runs for this schedule").
CREATE INDEX IF NOT EXISTS idx_scheduled_report_runs_schedule
  ON public.scheduled_report_runs (schedule_id, run_at DESC);

ALTER TABLE public.scheduled_report_runs ENABLE ROW LEVEL SECURITY;

-- Reuse the foundry-scoped template from public.products + public.scheduled_reports.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_report_runs' AND policyname = 'scheduled_report_runs_select') THEN
    CREATE POLICY "scheduled_report_runs_select" ON public.scheduled_report_runs FOR SELECT
      USING (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

-- No insert/update/delete policies for authenticated users — cron writes only,
-- and cron uses the service-role client which bypasses RLS. A user-side UI
-- that shows run history reads via SELECT only.

COMMENT ON TABLE public.scheduled_report_runs IS 'One row per cron execution of a scheduled_reports row. Cron writes only (service-role); users read via the select policy. FK cascade: deleting a schedule wipes its run log.';
COMMENT ON COLUMN public.scheduled_report_runs.status IS 'success = report sent. failed = exception; next_run_at advanced by +1h so cron retries. skipped = cron detected the row but report dispatch not wired yet (pending_dispatch) — remove this meaning once Phase 1.2D lands.';

COMMIT;
