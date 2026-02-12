/**
 * Migration: Add research_report column to xray_scans
 *
 * Purpose: Store concept research reports (from Gemini Search + Claude Opus synthesis)
 * alongside Forge projects. The research report captures product intelligence gathered
 * during the concept phase before module generation.
 *
 * Security:
 * - Inherits existing RLS policies on xray_scans (foundry-scoped)
 * - No new policies needed — data is part of the existing scan row
 *
 * Related:
 * - Action: src/actions/xray.ts (runConceptResearchAction, saveConceptResearchAction)
 * - UI: src/app/(platform)/the-forge/components/concept-research.tsx
 *
 * Rollback: ALTER TABLE xray_scans DROP COLUMN IF EXISTS research_report;
 */

-- Add JSONB column for storing the research report, sources, and metadata
ALTER TABLE public.xray_scans
ADD COLUMN IF NOT EXISTS research_report JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.xray_scans.research_report IS 'Concept research report from Gemini Search + Claude Opus synthesis. Structure: { report: string, sources: [{uri, title}], savedAt: string }';
