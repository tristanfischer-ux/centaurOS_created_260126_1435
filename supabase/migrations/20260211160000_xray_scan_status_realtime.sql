-- Migration: Add scan_status column and enable Realtime on xray_scans
--
-- Purpose: Supports background scanning by tracking whether a scan is
-- currently in progress. Combined with Supabase Realtime, the frontend
-- auto-updates when a background scan completes — users no longer need
-- to stay on the page during a scan.
--
-- Security:
-- - Existing RLS policies on xray_scans cover this column automatically
-- - Only the scan owner's foundry can see the status change
--
-- Related:
-- - Actions: src/actions/xray.ts (sets scan_status before/after AI call)
-- - Context: forge-project-context.tsx (subscribes to Realtime)
--
-- Rollback: ALTER TABLE public.xray_scans DROP COLUMN scan_status;

-- ─── Add scan_status column ──────────────────────────────────────────

ALTER TABLE public.xray_scans
ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'idle'
CHECK (scan_status IN ('idle', 'scanning', 'complete'));

COMMENT ON COLUMN public.xray_scans.scan_status IS 'Background scan lifecycle: idle → scanning → complete. Used with Realtime to push updates to the frontend.';

-- ─── Enable Realtime on xray_scans ──────────────────────────────────

-- REPLICA IDENTITY FULL is needed so Realtime sends the full row on UPDATE
ALTER TABLE public.xray_scans REPLICA IDENTITY FULL;

-- Add to the Realtime publication so subscribers receive change events
ALTER PUBLICATION supabase_realtime ADD TABLE public.xray_scans;
