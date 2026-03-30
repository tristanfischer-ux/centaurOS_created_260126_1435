/**
 * @file investor-match.ts
 *
 * @description Deterministic 0–100 match scoring for investor firms against a user's
 * foundry profile. Pure functions — no "use server", no DB calls. All data passed in.
 *
 * Scoring factors:
 *   Stage alignment     (25pts) — user's stage vs investor stage_focus
 *   Sector overlap      (25pts) — user's sector+industry vs investor sectors
 *   Product readiness   (15pts) — best product's margin, market size, traction scores
 *   Hardware fit        (10pts) — investor hardware_fit_score (0-10 scaled to 0-10)
 *   Cheque range        (15pts) — typical raise for stage vs investor cheque range
 *   Geo focus            (5pts) — UK presence in investor geo_focus
 *   Active deploying     (5pts) — is_active_deploying flag
 */

import type { InvestorFirm } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductReadiness {
  /** Best product's margin score (0-100) from fundability */
  marginScore: number | null
  /** Best product's market size score (0-100) from fundability */
  marketSizeScore: number | null
  /** Best product's traction score (0-100) from fundability */
  tractionScore: number | null
}

export interface FoundryProfile {
  stage: string | null
  sector: string | null
  industry: string | null
  /** Additional keywords from business plan, purpose, product description */
  businessKeywords?: string[]
  /** Best product's fundability sub-scores for investor matching */
  productReadiness?: ProductReadiness
}

export interface MatchBreakdown {
  total: number
  stageScore: number
  sectorScore: number
  hardwareScore: number
  chequeScore: number
  geoScore: number
  activeScore: number
  productReadinessScore: number
  topFactors: string[]
}

// ---------------------------------------------------------------------------
// Stage mapping
// ---------------------------------------------------------------------------

// DECISION: Map user stage slugs to investor stage labels they'd consider.
// Adjacent stages included at half weight (investors often look ±1 stage).
const STAGE_MAP: Record<string, { exact: string[]; adjacent: string[] }> = {
  pre_seed: { exact: ['Pre-Seed', 'Seed'], adjacent: ['Angel'] },
  seed: { exact: ['Seed', 'Pre-Seed'], adjacent: ['Series A'] },
  series_a: { exact: ['Series A'], adjacent: ['Seed', 'Growth'] },
  series_b: { exact: ['Series B', 'Growth'], adjacent: ['Series A', 'Late Stage'] },
  growth: { exact: ['Growth', 'Late Stage'], adjacent: ['Series B'] },
  late_stage: { exact: ['Late Stage', 'Growth'], adjacent: ['Series B'] },
}

// Typical raise ranges by stage (GBP) — used for cheque range scoring
const TYPICAL_RAISE: Record<string, { min: number; max: number }> = {
  pre_seed: { min: 100_000, max: 500_000 },
  seed: { min: 500_000, max: 2_000_000 },
  series_a: { min: 2_000_000, max: 10_000_000 },
  series_b: { min: 10_000_000, max: 50_000_000 },
  growth: { min: 20_000_000, max: 100_000_000 },
  late_stage: { min: 50_000_000, max: 200_000_000 },
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Calculates a deterministic 0–100 match score for an investor against a user profile.
 */
export function calculateMatchScore(
  firm: InvestorFirm,
  profile: FoundryProfile
): MatchBreakdown {
  const attrs = firm.attributes
  const topFactors: string[] = []

  // 1. Stage alignment (25 pts)
  let stageScore = 0
  const userStage = profile.stage?.toLowerCase().replace(/\s+/g, '_') ?? ''
  const stageConfig = STAGE_MAP[userStage]
  if (stageConfig && attrs.stage_focus && attrs.stage_focus.length > 0) {
    const hasExact = stageConfig.exact.some(s =>
      attrs.stage_focus!.some(sf => sf.toLowerCase() === s.toLowerCase())
    )
    const hasAdjacent = stageConfig.adjacent.some(s =>
      attrs.stage_focus!.some(sf => sf.toLowerCase() === s.toLowerCase())
    )
    if (hasExact) {
      stageScore = 25
      topFactors.push('Stage match')
    } else if (hasAdjacent) {
      stageScore = 12
    }
  }

  // 2. Sector overlap (25 pts)
  let sectorScore = 0
  const userTerms: string[] = []
  if (profile.sector) userTerms.push(profile.sector.toLowerCase())
  if (profile.industry) userTerms.push(profile.industry.toLowerCase())
  const sectorsList = Array.isArray(attrs.sectors) ? attrs.sectors : []
  if (userTerms.length > 0 && sectorsList.length > 0) {
    const matches = userTerms.filter(ut =>
      sectorsList.some(s => s.toLowerCase().includes(ut) || ut.includes(s.toLowerCase()))
    ).length
    if (matches >= 2) {
      sectorScore = 25
      topFactors.push('Strong sector fit')
    } else if (matches >= 1) {
      sectorScore = 15
      topFactors.push('Sector overlap')
    }
  }

  // 3. Hardware fit (10 pts) — 0-10 scaled to 0-10, clamped to prevent overflow
  const hwRaw = attrs.hardware_fit_score
  const hwClamped = hwRaw != null ? Math.min(10, Math.max(0, hwRaw)) : null
  const hardwareScore = hwClamped != null ? Math.round(hwClamped) : 5 // Null = neutral

  // 4. Cheque range (15 pts)
  let chequeScore = 0
  const typicalRaise = TYPICAL_RAISE[userStage]
  if (typicalRaise && attrs.cheque_range_gbp) {
    const { min, max } = attrs.cheque_range_gbp
    const raiseMid = (typicalRaise.min + typicalRaise.max) / 2
    if (min != null && max != null) {
      if (raiseMid >= min && raiseMid <= max) {
        chequeScore = 15
        topFactors.push('Cheque size match')
      } else if (raiseMid >= min / 2 && raiseMid <= max * 2) {
        chequeScore = 10
      }
    } else if (min != null && raiseMid >= min / 2) {
      chequeScore = 10
    } else if (max != null && raiseMid <= max * 2) {
      chequeScore = 10
    }
  }

  // 5. Geo focus (5 pts)
  let geoScore = 2 // Default: neutral (no data)
  if (attrs.geo_focus && attrs.geo_focus.length > 0) {
    const hasUK = attrs.geo_focus.some(g =>
      g.toLowerCase().includes('uk') || g.toLowerCase().includes('united kingdom')
    )
    geoScore = hasUK ? 5 : 0
    if (hasUK) topFactors.push('UK focus')
  }

  // 6. Active deploying (5 pts)
  const activeScore = attrs.is_active_deploying ? 5 : 0
  if (attrs.is_active_deploying) topFactors.push('Actively deploying')

  // 7. Product readiness (15 pts) — best product's fundability sub-scores
  let productReadinessScore = 0
  const pr = profile.productReadiness
  if (pr) {
    if (pr.marginScore != null && pr.marginScore > 70) productReadinessScore += 5
    if (pr.marketSizeScore != null && pr.marketSizeScore > 70) productReadinessScore += 5
    if (pr.tractionScore != null && pr.tractionScore > 50) productReadinessScore += 5
    if (productReadinessScore >= 10) topFactors.push('Strong product readiness')
  }

  // 8. Business plan / thesis alignment (bonus 0-10 pts)
  // INTENT: If the founder's business plan keywords appear in the investor's
  // thesis or portfolio descriptions, boost the score. This uses the rich
  // text data that stage/sector matching misses.
  let thesisBonus = 0
  if (profile.businessKeywords && profile.businessKeywords.length > 0) {
    const investorText = [
      attrs.investment_thesis || '',
      attrs.ideal_company_profile || '',
      ...(attrs.notable_portfolio || []),
      ...(attrs.portfolio_companies?.map(pc => `${pc.company_name} ${pc.sector || ''} ${pc.description || ''}`) || []),
    ].join(' ').toLowerCase()

    const matchCount = profile.businessKeywords.filter(kw =>
      investorText.includes(kw.toLowerCase())
    ).length

    if (matchCount >= 4) {
      thesisBonus = 10
      topFactors.push('Thesis alignment')
    } else if (matchCount >= 2) {
      thesisBonus = 5
    }
  }

  const total = Math.min(100, stageScore + sectorScore + hardwareScore + chequeScore + geoScore + activeScore + productReadinessScore + thesisBonus)

  return {
    total,
    stageScore,
    sectorScore,
    hardwareScore,
    chequeScore,
    geoScore,
    activeScore,
    productReadinessScore,
    topFactors: topFactors.slice(0, 3),
  }
}

// ---------------------------------------------------------------------------
// Similar investors (Jaccard + fund size proximity)
// ---------------------------------------------------------------------------

/**
 * Finds investors similar to a target firm using Jaccard similarity on
 * sectors + stages + geo_focus, plus fund size proximity.
 */
export function findSimilarInvestors(
  target: InvestorFirm,
  candidates: InvestorFirm[],
  limit = 5
): { firm: InvestorFirm; similarity: number }[] {
  const targetSectors = new Set((Array.isArray(target.attributes.sectors) ? target.attributes.sectors : []).map(s => s.toLowerCase()))
  const targetStages = new Set((target.attributes.stage_focus ?? []).map(s => s.toLowerCase()))
  const targetGeo = new Set((target.attributes.geo_focus ?? []).map(g => g.toLowerCase()))
  const targetFundSize = target.attributes.fund_size_gbp ?? 0

  const scored = candidates
    .filter(c => c.id !== target.id)
    .map(c => {
      const cSectors = new Set((Array.isArray(c.attributes.sectors) ? c.attributes.sectors : []).map(s => s.toLowerCase()))
      const cStages = new Set((c.attributes.stage_focus ?? []).map(s => s.toLowerCase()))
      const cGeo = new Set((c.attributes.geo_focus ?? []).map(g => g.toLowerCase()))

      // Jaccard similarity per dimension
      const sectorSim = jaccard(targetSectors, cSectors)
      const stageSim = jaccard(targetStages, cStages)
      const geoSim = jaccard(targetGeo, cGeo)

      // Fund size proximity (0-1, 1 = identical)
      const cFundSize = c.attributes.fund_size_gbp ?? 0
      const fundProximity = targetFundSize > 0 && cFundSize > 0
        ? 1 - Math.min(1, Math.abs(targetFundSize - cFundSize) / Math.max(targetFundSize, cFundSize))
        : 0.5

      // Weighted score
      const score = sectorSim * 0.35 + stageSim * 0.3 + geoSim * 0.15 + fundProximity * 0.2
      return { firm: c, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(s => ({ firm: s.firm, similarity: Math.round(s.score * 100) }))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const v of a) {
    if (b.has(v)) intersection++
  }
  const union = a.size + b.size - intersection
  return union > 0 ? intersection / union : 0
}
