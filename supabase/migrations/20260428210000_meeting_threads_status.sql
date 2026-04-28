-- Migration: meeting_threads_status
-- Purpose: Add status column to meeting_threads for progressive session
-- persistence. Allows in-progress sessions to be recovered after navigation
-- away mid-brainstorm. Default 'complete' so existing rows are unaffected.

ALTER TABLE meeting_threads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'complete'
  CHECK (status IN ('in_progress', 'complete', 'failed'));

CREATE INDEX IF NOT EXISTS meeting_threads_status_idx ON meeting_threads (status);
CREATE INDEX IF NOT EXISTS meeting_threads_foundry_status_idx ON meeting_threads (foundry_id, status, created_at DESC);
