/**
 * @file match-score.ts
 *
 * Pure deterministic 0-100 match scorer for a `marketplace_listings` Finance
 * row against the foundry's active `investor_thesis`. Adapted from the legacy
 * `src/lib/investor-match.ts` `calculateMatchScore` (8-factor → 6-pillar).
 *
 * No DB calls, no `"use server"` — callers pass the row in. Safe to unit test.
 *
 * ## What changed from legacy
 *
 * Legacy read thesis signal from a `FoundryProfile` (stage / sector / product
 * readiness). Money reads it from the structured `investor_thesis` row.
 * The stage / sector / cheque math is otherwise identical.
 *
 * The `hardware_fit_score` pillar is dropped (Money is not Forge-Capital-
 * specific). Its weight (2pt of 100) rolls into `confidence` so data-freshness
 * still affects the composite.
 */

import type { Database } from '@/types/database.types'
import type { MatchBreakdown, MatchThesis } from './match-types'

// ---------------------------------------------------------------------------
// Stage mapping — from legacy investor-match.ts
// ---------------------------------------------------------------------------

const STAGE_MAP: Record<string, { exact: string[]; adjacent: string[] }> = {
  pre_seed: { exact: ['pre-seed', 'seed'], adjacent: ['angel'] },
  seed: { exact: ['seed', 'pre-seed'], adjacent: ['series a'] },
  series_a: { exact: ['series a'], adjacent: ['seed', 'growth'] },
  series_b: { exact: ['series b', 'growth'], adjacent: ['series a', 'late stage'] },
  growth: { exact: ['growth', 'late stage'], adjacent: ['series b'] },
  late_stage: { exact: ['late stage', 'growth'], adjacent: ['series b'] },
}

function normaliseStageTag(tag: string): string {
  return tag.toLowerCase().replace(/[\s_-]+/g, '_').trim()
}

function stageLabelToLower(s: unknown): string | null {
  if (typeof s !== 'string') return null
  return s.toLowerCase().trim()
}

// ---------------------------------------------------------------------------
// Attribute plucker — marketplace_listings.attributes is loose JSON
// ---------------------------------------------------------------------------

type AttrBag = {
  investment_thesis: string | null
  ideal_company_profile: string | null
  stage_focus: string[]
  sectors: string[]
  geo_focus: string[]
  cheque_range_gbp: { min: number | null; max: number | null } | null
  is_active_deploying: boolean | null
  data_quality_score: number | null
  portfolio_text: string | null
  notable_portfolio: string[]
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function asNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function pluckAttrs(
  attributes: unknown,
  fallbackPortfolioText: string | null,
): AttrBag {
  const a =
    attributes && typeof attributes === 'object' && !Array.isArray(attributes)
      ? (attributes as Record<string, unknown>)
      : {}

  const cheque = a.cheque_range_gbp
  const chequeBag =
    cheque && typeof cheque === 'object' && !Array.isArray(cheque)
      ? {
          min: asNumberOrNull((cheque as Record<string, unknown>).min),
          max: asNumberOrNull((cheque as Record<string, unknown>).max),
        }
      : null

  return {
    investment_thesis: asStringOrNull(a.investment_thesis),
    ideal_company_profile: asStringOrNull(a.ideal_company_profile),
    stage_focus: asStringArray(a.stage_focus),
    sectors: asStringArray(a.sectors),
    geo_focus: asStringArray(a.geo_focus),
    cheque_range_gbp: chequeBag,
    is_active_deploying:
      typeof a.is_active_deploying === 'boolean' ? a.is_active_deploying : null,
    data_quality_score: asNumberOrNull(a.data_quality_score),
    portfolio_text: asStringOrNull(a.portfolio_text) ?? fallbackPortfolioText,
    notable_portfolio: asStringArray(a.notable_portfolio),
  }
}

// ---------------------------------------------------------------------------
// scoreListing
// ---------------------------------------------------------------------------

/**
 * Fields `scoreListing` reads from a marketplace_listings row. Callers can
 * pass the full `Row` type (it satisfies this shape via structural typing).
 */
export type ScoreableListing = Pick<
  Database['public']['Tables']['marketplace_listings']['Row'],
  | 'id'
  | 'title'
  | 'subcategory'
  | 'country'
  | 'country_iso'
  | 'attributes'
  | 'data_quality_score'
  | 'last_enriched_at'
> & {
  /** Optional — not a column on the Row today but supported if added later. */
  portfolio_text?: string | null
} & Record<string, unknown>

/**
 * Scores a Finance marketplace_listings row against the foundry's active
 * thesis. Deterministic, pure. Returns a 0-100 composite + pillar breakdown
 * + the top 3 reasons (e.g. "Strong sector fit", "Actively deploying").
 */
export function scoreListing(
  listing: ScoreableListing,
  thesis: MatchThesis,
  options?: { now?: Date },
): MatchBreakdown {
  const now = options?.now ?? new Date()
  const fallbackPortfolioText =
    typeof listing.portfolio_text === 'string' ? listing.portfolio_text : null
  const attrs = pluckAttrs(listing.attributes, fallbackPortfolioText)
  const reasons: string[] = []

  // ---- 1. Stage alignment ------------------------------------------------
  let stageScore = 0 // 0-25
  {
    const thesisStages = (thesis.stage_tags ?? [])
      .map(normaliseStageTag)
      .filter(Boolean)
    const firmStages = attrs.stage_focus
      .map(stageLabelToLower)
      .filter((s): s is string => !!s)

    if (thesisStages.length > 0 && firmStages.length > 0) {
      let hasExact = false
      let hasAdjacent = false
      for (const t of thesisStages) {
        const cfg = STAGE_MAP[t]
        if (!cfg) {
          // Unknown stage tag — fall back to direct string match.
          const direct = t.replace(/_/g, ' ')
          if (firmStages.some((fs) => fs === direct || fs.includes(direct))) {
            hasExact = true
          }
          continue
        }
        if (cfg.exact.some((e) => firmStages.some((fs) => fs === e || fs.includes(e)))) {
          hasExact = true
        } else if (
          cfg.adjacent.some((e) => firmStages.some((fs) => fs === e || fs.includes(e)))
        ) {
          hasAdjacent = true
        }
      }
      if (hasExact) {
        stageScore = 25
        reasons.push('Stage match')
      } else if (hasAdjacent) {
        stageScore = 12
      }
    }
  }

  // ---- 2. Sector overlap -------------------------------------------------
  let sectorScore = 0 // 0-25
  {
    const thesisSectors = (thesis.sector_tags ?? [])
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean)
    const firmSectors = attrs.sectors.map((s) => s.toLowerCase())
    if (thesisSectors.length > 0 && firmSectors.length > 0) {
      const hitCount = thesisSectors.filter((ts) =>
        firmSectors.some((fs) => fs.includes(ts) || ts.includes(fs)),
      ).length
      if (hitCount >= 2) {
        sectorScore = 25
        reasons.push('Strong sector fit')
      } else if (hitCount >= 1) {
        sectorScore = 15
        reasons.push('Sector overlap')
      }
    }
  }

  // ---- 3. Cheque range ---------------------------------------------------
  let chequeScore = 0 // 0-15
  {
    const thesisMinCents = thesis.cheque_min_cents ?? null
    const thesisMaxCents = thesis.cheque_max_cents ?? null
    const firmRange = attrs.cheque_range_gbp
    if (
      firmRange &&
      (thesisMinCents != null || thesisMaxCents != null)
    ) {
      // Firm cheque is stored in GBP whole units. Thesis is in cents (GBP pence).
      // Convert firm → pence for comparison.
      const firmMinPence =
        firmRange.min != null ? firmRange.min * 100 : null
      const firmMaxPence =
        firmRange.max != null ? firmRange.max * 100 : null

      const thesisMid =
        thesisMinCents != null && thesisMaxCents != null
          ? (thesisMinCents + thesisMaxCents) / 2
          : (thesisMinCents ?? thesisMaxCents ?? 0)

      if (firmMinPence != null && firmMaxPence != null) {
        if (thesisMid >= firmMinPence && thesisMid <= firmMaxPence) {
          chequeScore = 15
          reasons.push('Cheque size match')
        } else if (thesisMid >= firmMinPence / 2 && thesisMid <= firmMaxPence * 2) {
          chequeScore = 10
        }
      } else if (firmMinPence != null && thesisMid >= firmMinPence / 2) {
        chequeScore = 10
      } else if (firmMaxPence != null && thesisMid <= firmMaxPence * 2) {
        chequeScore = 10
      }
    }
  }

  // ---- 4. Geo focus ------------------------------------------------------
  let geoScore = 2 // 0-5, default neutral (no data)
  {
    const thesisGeo = (thesis.geography ?? []).map((g) => g.toLowerCase().trim())
    const firmGeo = attrs.geo_focus.map((g) => g.toLowerCase())
    const listingCountry = listing.country?.toLowerCase() ?? ''
    const listingIso = listing.country_iso?.toLowerCase() ?? ''

    if (thesisGeo.length > 0) {
      // Check firm geo_focus, country, and country_iso — any overlap counts.
      const hit =
        firmGeo.some((fg) => thesisGeo.some((tg) => fg.includes(tg) || tg.includes(fg))) ||
        (listingCountry && thesisGeo.some((tg) => listingCountry.includes(tg) || tg.includes(listingCountry))) ||
        (listingIso && thesisGeo.some((tg) => tg === listingIso || tg.includes(listingIso)))
      if (hit) {
        geoScore = 5
        reasons.push('Geography match')
      } else {
        geoScore = 0
      }
    } else if (firmGeo.length > 0 || listingCountry) {
      geoScore = 3 // Firm has data, thesis doesn't — slight credit.
    }
  }

  // ---- 5. Thesis keyword bonus ------------------------------------------
  let thesisBonus = 0 // 0-10
  {
    const kws = (thesis.keywords ?? [])
      .map((k) => k.toLowerCase().trim())
      .filter(Boolean)
    if (kws.length > 0) {
      const investorText = [
        attrs.investment_thesis ?? '',
        attrs.ideal_company_profile ?? '',
        attrs.portfolio_text ?? '',
        attrs.notable_portfolio.join(' '),
      ]
        .join(' ')
        .toLowerCase()
      if (investorText) {
        const hits = kws.filter((k) => investorText.includes(k)).length
        if (hits >= 4) {
          thesisBonus = 10
          reasons.push('Thesis alignment')
        } else if (hits >= 2) {
          thesisBonus = 5
        }
      }
    }
  }

  // ---- 6. Activity (active deploying + recency) --------------------------
  let activityScore = 0 // 0-5
  {
    if (attrs.is_active_deploying) {
      activityScore = 5
      reasons.push('Actively deploying')
    } else if (attrs.is_active_deploying === false) {
      activityScore = 0
    } else {
      activityScore = 2
    }
    // Freshness boost — if enriched in last 90d, +up to 2 (capped at 5).
    if (listing.last_enriched_at) {
      const enrichedAt = new Date(listing.last_enriched_at).getTime()
      const days = (now.getTime() - enrichedAt) / (1000 * 60 * 60 * 24)
      if (Number.isFinite(days)) {
        if (days < 30) activityScore = Math.min(5, activityScore + 2)
        else if (days < 90) activityScore = Math.min(5, activityScore + 1)
      }
    }
  }

  // ---- 7. Confidence / data quality --------------------------------------
  // Data quality is stored top-level (data_quality_score 0-10) and also in
  // attributes.data_quality_score on legacy rows. Prefer top-level.
  const dq =
    typeof listing.data_quality_score === 'number'
      ? listing.data_quality_score
      : attrs.data_quality_score ?? 0
  const confidencePillar = Math.max(0, Math.min(100, dq * 10))

  // ---- Pillar translation (legacy parity) --------------------------------
  const thesisPillar = Math.round(
    Math.min(100, (sectorScore / 25) * 70 + (thesisBonus / 10) * 30),
  )
  const stagePillar = Math.round((stageScore / 25) * 100)
  const geoPillar = Math.round((geoScore / 5) * 100)
  const chequePillar = Math.round((chequeScore / 15) * 100)
  const activityPillar = Math.round((activityScore / 5) * 100)

  // ---- Composite --------------------------------------------------------
  // thesis 55% / geography 15% / stage 10% / cheque 10% / activity 3% / confidence 7%
  // Missing-pillar renormalisation (same as legacy): if a pillar has no
  // signal (zero and its input was empty), drop it + renormalise.
  let composite = thesisPillar * 0.55 + confidencePillar * 0.07 + activityPillar * 0.03
  let weight = 0.55 + 0.07 + 0.03
  if (geoPillar > 0) {
    composite += geoPillar * 0.15
    weight += 0.15
  }
  if (stagePillar > 0) {
    composite += stagePillar * 0.1
    weight += 0.1
  }
  if (chequePillar > 0) {
    composite += chequePillar * 0.1
    weight += 0.1
  }
  const total = weight > 0 ? Math.round(Math.max(0, Math.min(100, composite / weight))) : 0

  return {
    total,
    pillars: {
      thesis: thesisPillar,
      geography: geoPillar,
      stage: stagePillar,
      cheque: chequePillar,
      activity: activityPillar,
      confidence: Math.round(confidencePillar),
    },
    reasons: reasons.slice(0, 3),
  }
}
