/**
 * Migration: Add start_date and end_date to objectives table
 *
 * Purpose: Allow objectives to have explicit date ranges for timeline
 * drag-and-drop scheduling. Previously, objective dates were derived
 * from the min/max of their child task dates. With explicit dates,
 * users can drag objective bars on the Gantt chart to reschedule them.
 *
 * Rollback: ALTER TABLE objectives DROP COLUMN start_date, DROP COLUMN end_date;
 */

-- Add date columns (nullable — objectives without dates still derive from tasks)
ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz;

-- Index for timeline queries that filter/sort by date range
CREATE INDEX IF NOT EXISTS idx_objectives_date_range
  ON objectives (foundry_id, start_date, end_date)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN objectives.start_date IS 'Explicit start date for timeline scheduling. If NULL, derived from earliest task start_date.';
COMMENT ON COLUMN objectives.end_date IS 'Explicit end/due date for timeline scheduling. If NULL, derived from latest task end_date.';
