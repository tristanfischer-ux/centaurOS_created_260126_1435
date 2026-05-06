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
// Thesis matching helpers (synonym expansion)
// ---------------------------------------------------------------------------

const SYNONYM_CLUSTERS: string[][] = [
  ["hardware", "deeptech", "deep-tech", "deep tech", "physical", "tangible", "atoms"],
  ["climate", "cleantech", "clean-tech", "clean tech", "sustainability", "green", "net-zero", "net zero", "decarbonisation", "decarbonization"],
  ["energy", "renewable", "renewables", "solar", "wind", "battery", "batteries", "storage", "grid"],
  ["biotech", "biology", "bio", "life sciences", "life-sciences", "pharmaceutical", "pharma"],
  ["healthtech", "health-tech", "health tech", "digital health", "medtech", "med-tech", "medical"],
  ["fintech", "fin-tech", "financial technology", "payments", "banking", "insurtech"],
  ["agtech", "ag-tech", "agriculture", "farming", "food tech", "foodtech", "agri"],
  ["proptech", "prop-tech", "property technology", "real estate tech"],
  ["robotics", "automation", "autonomous", "drones", "unmanned"],
  ["saas", "software", "platform", "cloud", "enterprise software"],
  ["mobility", "transport", "automotive", "vehicles", "electric vehicles", "evs"],
  ["aerospace", "space", "defence", "defense", "aviation"],
  ["manufacturing", "industrial", "factory", "production"],
  ["materials", "advanced materials", "composites", "nanomaterials"],
  ["iot", "internet of things", "sensors", "connected devices", "embedded"],
  ["data", "analytics", "machine learning", "artificial intelligence"],
];

function tokenise(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  const stopwords = new Set([
    "the","a","an","and","or","but","of","to","in","on","for","with","by","at","is","are","was","were","be","been","being","we","you","our","your","their","they","this","that","these","those","it","its","from","as","has","have","had","not","no","do","does","will","can","may","so","if","when","where","why","how","who","what","than","then","also","just","more","most","some","any","all","into","out","over","under","up","down",
  ]);
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9€£$\-\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopwords.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function thesisCoverage(heroTokens: Set<string>, investorBag: Set<string>): number {
  if (heroTokens.size === 0) return 0;

  let covered = 0;
  for (const token of heroTokens) {
    if (investorBag.has(token)) {
      covered++;
      continue;
    }
    let found = false;
    for (const inv of investorBag) {
      if (inv.includes(token) || token.includes(inv)) {
        found = true;
        break;
      }
    }
    if (found) {
      covered++;
      continue;
    }
    for (const cluster of SYNONYM_CLUSTERS) {
      const heroInCluster = cluster.some((syn) => {
        const synTokens = syn.split(/\s+/);
        return synTokens.some((st) => st === token || token.includes(st) || st.includes(token));
      });
      if (!heroInCluster) continue;
      const investorInCluster = cluster.some((syn) => {
        const synTokens = syn.split(/\s+/);
        return synTokens.some((st) => investorBag.has(st) || Array.from(investorBag).some((inv) => inv.includes(st) || st.includes(inv)));
      });
      if (investorInCluster) {
        covered++;
        break;
      }
    }
  }

  return covered / heroTokens.size;
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

  // ---- 2 & 5. Unified Thesis (Sector + Keywords) --------------------------
  const heroTokens = new Set([
    ...(thesis.sector_tags ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean),
    ...(thesis.keywords ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean),
  ])
  
  const investorText = [
    attrs.sectors.join(' '),
    attrs.investment_thesis ?? '',
    attrs.ideal_company_profile ?? '',
    attrs.portfolio_text ?? '',
    attrs.notable_portfolio.join(' '),
  ].join(' ')
  
  const investorBag = tokenise(investorText)
  const coverage = thesisCoverage(heroTokens, investorBag)
  const jaccardScore = jaccard(heroTokens, investorBag)
  const lexicalBlended = coverage * 0.7 + jaccardScore * 0.3
  
  // Base score 20, max 100. Matches Outreach.
  const thesisPillar = heroTokens.size === 0 ? 0 : Math.min(100, Math.round(lexicalBlended * 100 * 1.2 + 20))
  if (thesisPillar >= 80) {
    reasons.push('Strong thesis fit')
  } else if (thesisPillar >= 50) {
    reasons.push('Sector overlap')
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
  let geoScore = 2 // 0-5, default neutral (no thesis geo preference)
  let hasGeoData = false // whether the firm has ANY geo signal at all
  {
    const thesisGeo = (thesis.geography ?? []).map((g) => g.toLowerCase().trim())
    const firmGeo = attrs.geo_focus.map((g) => g.toLowerCase())
    const listingCountry = listing.country?.toLowerCase() ?? ''
    const listingIso = listing.country_iso?.toLowerCase() ?? ''
    // HQ city as last-resort geo signal — if we know where the firm is based,
    // we can assume it invests in its own country.
    const hqCity = (attrs.hq_city ?? attrs.location ?? '').toLowerCase()

    // Firm has geo data if: geo_focus populated, OR country set, OR hq_city set
    hasGeoData = firmGeo.length > 0 || !!listingCountry || !!hqCity

    if (thesisGeo.length > 0) {
      // Check firm geo_focus, country, country_iso, AND hq-derived country
      const hit =
        firmGeo.some((fg) => thesisGeo.some((tg) => fg.includes(tg) || tg.includes(fg))) ||
        (listingCountry && thesisGeo.some((tg) => listingCountry.includes(tg) || tg.includes(listingCountry))) ||
        (listingIso && thesisGeo.some((tg) => tg === listingIso || tg.includes(listingIso))) ||
        // HQ city fallback: if thesis wants "united kingdom" and firm is HQ'd in "london", match
        (hqCity && thesisGeo.some((tg) => {
          if (hqCity.includes(tg) || tg.includes(hqCity)) return true
          // Common city→country mapping
          if (tg === 'united kingdom' && (hqCity.includes('london') || hqCity.includes('uk') || hqCity.includes('britain'))) return true
          if (tg === 'united states' && (hqCity.includes('new york') || hqCity.includes('san francisco') || hqCity.includes('boston') || hqCity.includes('usa'))) return true
          if (tg === 'europe' && (hqCity.includes('berlin') || hqCity.includes('paris') || hqCity.includes('amsterdam') || hqCity.includes('stockholm') || hqCity.includes('helsinki') || hqCity.includes('zurich') || hqCity.includes('london'))) return true
          return false
        }))
      if (hit) {
        geoScore = 5
        reasons.push('Geography match')
      } else {
        geoScore = 0 // Explicit mismatch
      }
    } else if (hasGeoData) {
      geoScore = 3 // Firm has geo data, thesis doesn't specify — slight credit
    }
  }

  // ---- 4. Geo focus (removed: confidence was here) ------------------------

  // ---- Pillar translation (legacy parity) --------------------------------
  const stagePillar = Math.round((stageScore / 25) * 100)
  const geoPillar = Math.round((geoScore / 5) * 100)
  const chequePillar = Math.round((chequeScore / 15) * 100)

  // ---- Composite --------------------------------------------------------
  // thesis 25% / stage 25% / geography 25% / cheque 25%
  // Missing-pillar renormalisation: if the firm has NO DATA for a pillar
  // (e.g. no geo_focus, no country, no hq_city, no cheque_range), drop it
  // and renormalise. But if the firm HAS data and the score is 0 (mismatch),
  // include it — a mismatch is a real signal, not missing data.
  let composite = 0
  let weight = 0

  // Thesis is always present (even if 0)
  composite += thesisPillar * 0.25
  weight += 0.25

  // Stage: has data if firm has stage_focus
  const hasStageData = attrs.stage_focus.length > 0
  if (hasStageData) {
    composite += stagePillar * 0.25
    weight += 0.25
  }

  // Geography: has data if firm has geo_focus, country, or hq_city
  if (hasGeoData) {
    composite += geoPillar * 0.25
    weight += 0.25
  }

  // Cheque: has data if firm has cheque_range_gbp with min or max
  const hasChequeData = attrs.cheque_range_gbp?.min != null || attrs.cheque_range_gbp?.max != null
  if (hasChequeData) {
    composite += chequePillar * 0.25
    weight += 0.25
  }

  const result = weight > 0 ? Math.round(Math.max(0, Math.min(100, composite / weight))) : 0

  return {
    total: result,
    pillars: {
      thesis: thesisPillar,
      geography: hasGeoData ? geoPillar : null,
      stage: hasStageData ? stagePillar : null,
      cheque: hasChequeData ? chequePillar : null,
    },
    reasons: reasons.slice(0, 3),
  }
}
