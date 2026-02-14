-- Migration: Add module_count generated column to xray_scans
--
-- Purpose: Avoid over-fetching full spec in listScansAction. The list view
-- only needs module count; fetching the entire spec JSONB is expensive.
--
-- Related: src/actions/xray.ts listScansAction

ALTER TABLE public.xray_scans
ADD COLUMN IF NOT EXISTS module_count integer
GENERATED ALWAYS AS (jsonb_array_length(COALESCE(spec->'modules', '[]'::jsonb))) STORED;

COMMENT ON COLUMN public.xray_scans.module_count IS 'Cached count of modules in spec; avoids fetching full spec in list views.';
