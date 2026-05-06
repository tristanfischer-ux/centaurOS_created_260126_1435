/**
 * @file match-types.ts
 *
 * Shared types for the Money investor-match pipeline. Lives outside the
 * `"use server"` action files so both the pure scorer (`match-score.ts`) and
 * the UI can import them. Types-only module — no runtime side-effects.
 */

import type { Database } from '@/types/database.types'

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Thesis signal used by `scoreListing`. Mirrors the foundry's active
 * `investor_thesis` row, plus a couple of optional fields the legacy
 * `calculateMatchScore` used.
 */
export type MatchThesis = {
  stage_tags: string[]
  sector_tags: string[]
  geography?: string[]
  cheque_min_cents?: number | null
  cheque_max_cents?: number | null
  keywords?: string[]
  instrument?: string | null
  lead_or_follower?: 'lead' | 'follower' | 'both' | null
}

/**
 * 5-pillar breakdown.
 * Composite weights: thesis 30% / geography 20% / stage 20% / cheque 15% / confidence 15%.
 */
export type MatchBreakdown = {
  /** 0-100 composite */
  total: number
  pillars: {
    thesis: number
    geography: number
    stage: number
    cheque: number
    confidence: number
  }
  /** Top 3 human-readable reasons for the score. */
  reasons: string[]
}

// ---------------------------------------------------------------------------
// Raise server-action shapes
// ---------------------------------------------------------------------------

/**
 * Rich filter shape used by scoreInvestorsAgainstThesis / searchInvestorsSemantic.
 * All fields optional — an empty filter returns everything.
 */
export type RichInvestorFilters = {
  subcategory?: string[]
  /** ISO-2 codes (GB / DE / CN …). Matches `marketplace_listings.country_iso`. */
  country?: string[]
  stage?: string[]
  sector?: string[]
  cheque_min_cents?: number
  cheque_max_cents?: number
  firm_type?: string[]
  fund_size_min_cents?: number
  fund_size_max_cents?: number
}

/** Convenience alias for the Row type used by the trimmed scorer payload. */
export type MarketplaceListingRow =
  Database['public']['Tables']['marketplace_listings']['Row']

/**
 * Trimmed listing payload sent to the client — avoids shipping the massive
 * `attributes`, `products`, `materials`, `key_equipment` JSONB blobs through
 * React Flight. Matches the fields `/money/raise/browse` + `/money/raise/for-you`
 * actually need to render a card.
 */
export type ScoredListingRow = {
  id: string
  title: string | null
  subcategory: string | null
  description: string | null
  image_url: string | null
  website_url: string | null
  city: string | null
  country: string | null
  country_iso: string | null
  data_quality_score: number | null
  last_enriched_at: string | null
  /** Selected attributes we surface for match explainers. Never the full blob. */
  highlights: {
    investment_thesis: string | null
    ideal_company_profile: string | null
    firm_type: string | null
    fund_size_gbp: number | null
    cheque_range_gbp: { min: number | null; max: number | null } | null
    stage_focus: string[]
    sectors: string[]
    geo_focus: string[]
    is_active_deploying: boolean | null
  }
}

// ---------------------------------------------------------------------------
// Business-plan extraction
// ---------------------------------------------------------------------------

/**
 * Structured thesis output from `extractThesisFromBusinessPlan`. Shaped so
 * `saveExtractedThesis` can translate it directly to the `investor_thesis`
 * insert row (via `saveThesisVersion`).
 */
export type ExtractedThesis = {
  stage_tags: string[]
  sector_tags: string[]
  geography: string[]
  cheque_min_cents: number | null
  cheque_max_cents: number | null
  instrument: string | null
  keywords: string[]
  /** 1-2 sentence plain-language summary of the plan. */
  summary: string
}
