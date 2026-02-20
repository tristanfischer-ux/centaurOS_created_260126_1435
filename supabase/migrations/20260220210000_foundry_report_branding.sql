-- Migration: Report branding columns on foundries table
--
-- Purpose:
-- Allow each foundry to customise the visual branding of generated reports
-- (cover page, headers, email templates, PPTX slides). The existing logo_url
-- column is reused for the company logo; these new columns add palette control.
--
-- Related:
-- - src/actions/report-generator.ts — Fetches branding to embed in ReportDocument
-- - src/lib/reports/export-pptx.ts — Uses branding colors in slides
-- - src/components/reports/ReportDocument.tsx — Uses branding in rendered report
--
-- Rollback:
--   ALTER TABLE public.foundries
--     DROP COLUMN IF EXISTS report_primary_color,
--     DROP COLUMN IF EXISTS report_accent_color;

-- Primary brand color for report headers and accents (hex, e.g. '#FF4500')
ALTER TABLE public.foundries
  ADD COLUMN IF NOT EXISTS report_primary_color TEXT;

-- Secondary accent color for charts, trend lines, highlights (hex)
ALTER TABLE public.foundries
  ADD COLUMN IF NOT EXISTS report_accent_color TEXT;
