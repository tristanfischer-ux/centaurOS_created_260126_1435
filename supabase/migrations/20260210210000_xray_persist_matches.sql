-- Migration: Add cached match columns to xray_scans
--
-- Purpose: Persist people matches, supplier matches, and inspiration
-- enrichments so they don't re-query every tab switch. Each column
-- stores the full result array as JSONB.
--
-- Rollback: ALTER TABLE public.xray_scans DROP COLUMN people_matches, DROP COLUMN supplier_matches, DROP COLUMN enrichments;

ALTER TABLE public.xray_scans
  ADD COLUMN IF NOT EXISTS people_matches JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supplier_matches JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS enrichments JSONB DEFAULT NULL;

COMMENT ON COLUMN public.xray_scans.people_matches IS 'Cached PersonMatch[] from marketplace_listings + provider_profiles';
COMMENT ON COLUMN public.xray_scans.supplier_matches IS 'Cached Record<moduleId, SupplierMatch[]> from suppliers table';
COMMENT ON COLUMN public.xray_scans.enrichments IS 'Cached ModuleEnrichment[] from inspiration bridge';
