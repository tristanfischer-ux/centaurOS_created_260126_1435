-- Migration: Scheduled report delivery columns
--
-- Purpose:
-- Add scheduling configuration to report_preferences so the cron job
-- (/api/cron/reports) can find users who opted into automatic report
-- delivery and determine when to send each one.
--
-- The cron delivers the most recently generated report snapshot for the
-- user's foundry — it does NOT re-generate reports. This keeps the cron
-- lightweight and avoids needing an auth context for AI generation.
--
-- Related:
-- - src/app/api/cron/reports/route.ts — Cron endpoint that reads these columns
-- - supabase/migrations/20260202200000_reporting_engine.sql — Original table
-- - src/actions/report-email.ts — Email composition (reused by cron)
--
-- Rollback:
--   ALTER TABLE public.report_preferences
--     DROP COLUMN IF EXISTS schedule_enabled,
--     DROP COLUMN IF EXISTS schedule_frequency,
--     DROP COLUMN IF EXISTS schedule_day_of_week,
--     DROP COLUMN IF EXISTS schedule_day_of_month,
--     DROP COLUMN IF EXISTS schedule_recipients,
--     DROP COLUMN IF EXISTS schedule_template,
--     DROP COLUMN IF EXISTS schedule_tone,
--     DROP COLUMN IF EXISTS schedule_detail_level,
--     DROP COLUMN IF EXISTS last_scheduled_at;

-- Master toggle — disabled by default so existing users aren't affected
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT false;

-- Weekly or monthly cadence
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_frequency TEXT DEFAULT 'weekly'
    CHECK (schedule_frequency IN ('weekly', 'monthly'));

-- 0 = Sunday, 1 = Monday … 6 = Saturday  (matches JS Date.getUTCDay())
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_day_of_week INTEGER DEFAULT 1
    CHECK (schedule_day_of_week BETWEEN 0 AND 6);

-- Day of month for monthly schedules (capped at 28 to avoid month-length issues)
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_day_of_month INTEGER DEFAULT 1
    CHECK (schedule_day_of_month BETWEEN 1 AND 28);

-- Email addresses that receive the scheduled report
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_recipients TEXT[] DEFAULT '{}';

-- Which report template to deliver
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_template TEXT DEFAULT 'weekly-update'
    CHECK (schedule_template IN ('weekly-update', 'board-pack', 'custom'));

-- Narrative tone for the AI-generated executive summary
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_tone TEXT DEFAULT 'internal'
    CHECK (schedule_tone IN ('internal', 'board', 'investor'));

-- How much detail to include
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS schedule_detail_level TEXT DEFAULT 'standard'
    CHECK (schedule_detail_level IN ('brief', 'standard', 'detailed'));

-- Prevents double-delivery when the cron fires more than once per window
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS last_scheduled_at TIMESTAMPTZ;
