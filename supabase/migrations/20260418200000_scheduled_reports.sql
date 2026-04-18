-- Scheduled report deliveries (Phase 1.2A — migration only, no consuming code yet).
--
-- INTENT: Restore the Reports page Schedule button that was hidden in commit
-- 32390b98 because it was a Potemkin feature (UI collected input, handler only
-- fired a success toast, no persistence). This migration is the foundation; the
-- server action + UI wiring lands in 1.2B, the cron worker + email dispatch in
-- 1.2C. Shipping schema first so the code chunks have a real target.
--
-- SHAPE: one row per "deliver report X on schedule Y to recipients Z" rule.
-- frequency='weekly' uses day_of_week (0-6, Sunday=0). frequency='monthly' uses
-- day_of_month (1-31; cron will clamp 29/30/31 to the last real day of short
-- months when computing next_run_at). recipients are plain email strings —
-- validation happens in the action, not at schema level, so we can tolerate
-- future enrichment (names, unsubscribe keys) without a migration.
--
-- RLS: mirrors public.products — foundry-scoped via profiles.active_foundry_id
-- COALESCE profiles.foundry_id. A user can only see / insert / update / delete
-- their own foundry's rows. Cron worker uses service-role key which bypasses
-- RLS, so the hourly scan works across foundries.
--
-- ROLLBACK (if needed):
--   BEGIN;
--   DROP POLICY IF EXISTS "scheduled_reports_select" ON public.scheduled_reports;
--   DROP POLICY IF EXISTS "scheduled_reports_insert" ON public.scheduled_reports;
--   DROP POLICY IF EXISTS "scheduled_reports_update" ON public.scheduled_reports;
--   DROP POLICY IF EXISTS "scheduled_reports_delete" ON public.scheduled_reports;
--   DROP INDEX IF EXISTS public.idx_scheduled_reports_due;
--   DROP INDEX IF EXISTS public.idx_scheduled_reports_foundry;
--   DROP INDEX IF EXISTS public.idx_scheduled_reports_creator;
--   DROP TABLE IF EXISTS public.scheduled_reports;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id       text NOT NULL,
  created_by       uuid NOT NULL,
  template_id      text NOT NULL,
  config_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  frequency        text NOT NULL CHECK (frequency IN ('weekly','monthly')),
  day_of_week      int  CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month     int  CHECK (day_of_month BETWEEN 1 AND 31),
  recipients       text[] NOT NULL DEFAULT ARRAY[]::text[],
  enabled          bool NOT NULL DEFAULT true,
  last_run_at      timestamptz,
  next_run_at      timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Shape guard: the right "day" column must be set for the chosen frequency.
  CONSTRAINT scheduled_reports_day_matches_frequency CHECK (
    (frequency = 'weekly'  AND day_of_week  IS NOT NULL AND day_of_month IS NULL)
    OR
    (frequency = 'monthly' AND day_of_month IS NOT NULL AND day_of_week IS NULL)
  )
);

-- Cron scan path: hourly /api/cron/scheduled-reports looks for due rows.
-- Partial index so manual-disabled rows don't bloat it.
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_due
  ON public.scheduled_reports (next_run_at)
  WHERE enabled = true;

-- Foundry-scoped lookup ("show me my foundry's schedules").
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_foundry
  ON public.scheduled_reports (foundry_id);

-- "My schedules" / creator filter.
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_creator
  ON public.scheduled_reports (created_by);

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_reports' AND policyname = 'scheduled_reports_select') THEN
    CREATE POLICY "scheduled_reports_select" ON public.scheduled_reports FOR SELECT
      USING (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_reports' AND policyname = 'scheduled_reports_insert') THEN
    CREATE POLICY "scheduled_reports_insert" ON public.scheduled_reports FOR INSERT
      WITH CHECK (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_reports' AND policyname = 'scheduled_reports_update') THEN
    CREATE POLICY "scheduled_reports_update" ON public.scheduled_reports FOR UPDATE
      USING (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_reports' AND policyname = 'scheduled_reports_delete') THEN
    CREATE POLICY "scheduled_reports_delete" ON public.scheduled_reports FOR DELETE
      USING (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

COMMENT ON TABLE  public.scheduled_reports IS 'One row per recurring report delivery rule. Cron scans idx_scheduled_reports_due hourly and dispatches emails via Resend. Restores the Reports page Schedule feature in three chunks: 1.2A (this migration) / 1.2B (action + button) / 1.2C (cron worker).';
COMMENT ON COLUMN public.scheduled_reports.next_run_at IS 'Set by the action on create/update using day_of_week or day_of_month. Cron scan: next_run_at <= now() AND enabled.';
COMMENT ON COLUMN public.scheduled_reports.last_run_at IS 'Set by the cron worker after a successful delivery attempt.';
COMMENT ON COLUMN public.scheduled_reports.config_json IS 'Same shape as ad-hoc report config: { tone, detail_level, sections, date_range_preset, ... }. Jsonb so additions are free.';

COMMIT;
