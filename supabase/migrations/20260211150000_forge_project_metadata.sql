-- Migration: Add project metadata columns to xray_scans for multi-page Forge
--
-- Purpose: Evolve xray_scans into a proper "Forge Project" entity by adding:
-- - name: Display name for project list cards
-- - stage: Current pipeline stage for sub-nav progress
-- - thumbnail_url: System blueprint image for project list
--
-- The existing table structure is preserved; this is additive only.
--
-- Security: No RLS changes needed — existing policies cover these columns.
--
-- Related:
-- - Frontend: src/app/(platform)/the-forge/
-- - Actions: src/actions/xray.ts
--
-- Rollback: ALTER TABLE public.xray_scans DROP COLUMN name, DROP COLUMN stage, DROP COLUMN thumbnail_url;

-- Add project display name (derived from idea text)
ALTER TABLE public.xray_scans
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add pipeline stage tracking
ALTER TABLE public.xray_scans
ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'concept'
CHECK (stage IN ('concept', 'dossier', 'people', 'supply_chain', 'contracting'));

-- Add thumbnail for project list cards
ALTER TABLE public.xray_scans
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Backfill: Set name from first 60 chars of idea for existing rows
UPDATE public.xray_scans
SET name = LEFT(idea, 60)
WHERE name IS NULL;

-- Expand status CHECK to include 'refined' (already used in code but not in constraint)
ALTER TABLE public.xray_scans DROP CONSTRAINT IF EXISTS xray_scans_status_check;
ALTER TABLE public.xray_scans ADD CONSTRAINT xray_scans_status_check
CHECK (status IN ('draft', 'scanned', 'refined', 'diagnostic_complete'));

-- Index for stage filtering on project list
CREATE INDEX IF NOT EXISTS idx_xray_scans_stage ON public.xray_scans(stage);
