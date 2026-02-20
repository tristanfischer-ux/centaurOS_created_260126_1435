-- Fix report_snapshots for the new report generation system
--
-- Issues:
-- 1. CHECK constraint only allows 'daily', 'weekly', 'monthly' but we now
--    generate 'weekly-update', 'board-pack', 'custom' report types.
-- 2. Missing INSERT policy — users can read but not create snapshots.
-- 3. UNIQUE constraint on (foundry_id, profile_id, report_type, report_date)
--    is too strict — users should be able to generate multiple reports per day.

-- Drop the restrictive CHECK constraint
ALTER TABLE public.report_snapshots
  DROP CONSTRAINT IF EXISTS report_snapshots_report_type_check;

-- Add a wider CHECK constraint that includes all report types
ALTER TABLE public.report_snapshots
  ADD CONSTRAINT report_snapshots_report_type_check
  CHECK (report_type IN ('daily', 'weekly', 'monthly', 'weekly-update', 'board-pack', 'custom'));

-- Drop the UNIQUE constraint so users can generate multiple reports per day
ALTER TABLE public.report_snapshots
  DROP CONSTRAINT IF EXISTS report_snapshots_foundry_id_profile_id_report_type_report_da_key;

-- Add INSERT policy so authenticated users can save report snapshots
CREATE POLICY "Users can insert reports for their foundry"
  ON public.report_snapshots FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND foundry_id IN (
      SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
    )
  );
