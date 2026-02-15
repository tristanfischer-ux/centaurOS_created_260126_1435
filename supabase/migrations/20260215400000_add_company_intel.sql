/**
 * Migration: Add company_intel JSONB column to foundries
 *
 * Purpose: Store enriched company intelligence (website analysis, competitor
 * data, founder background) that powers contextually-aware specialist
 * conversations via the AI Context Builder.
 *
 * Structure: CompanyIntelligence interface (see src/types/foundry.ts)
 * - website_summary, products_services, target_customers, value_proposition
 * - team_bios, pricing_model
 * - competitors (populated by Phase 3)
 * - founder_background (populated by Phase 4)
 * - last_enriched_at, enrichment_source
 *
 * Security: Inherits existing foundries RLS policies. Column is JSONB,
 * readable by authenticated members, writable by Founder/Executive only
 * (enforced at application level in src/actions/enrichment.ts).
 *
 * Rollback: ALTER TABLE foundries DROP COLUMN IF EXISTS company_intel;
 */

-- Add company_intel JSONB column
ALTER TABLE foundries
  ADD COLUMN IF NOT EXISTS company_intel JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN foundries.company_intel IS 'Enriched company intelligence from website scraping, competitor analysis, and founder enrichment. See CompanyIntelligence type in src/types/foundry.ts.';
