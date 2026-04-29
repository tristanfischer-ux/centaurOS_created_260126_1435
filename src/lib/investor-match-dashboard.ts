/**
 * @file investor-match-dashboard.ts
 *
 * @description 1:1 port of the scoring functions from
 * /Users/tristanfischer/Developer/Forge-Capital/Forge-Capital-Dashboard.html
 * lines 1214-1279. The dashboard is the master algorithm: every fit function
 * takes the USER QUERY TEXT plus the investor field and returns a 0-100 pillar
 * value (or null when inapplicable). This deliberately avoids the ForgeOS
 * FoundryProfile path which was collapsing to zero for anonymous users.
 *
 * Keep this file in sync with the dashboard source; the composite formula
 * and weight constants must match line-for-line.
 */

import type { InvestorFirm } from '@/actions/investors'

const STAGE_ORDER = ['pre-seed', 'seed', 'early stage', 'series a', 'series b', 'series c+', 'growth']

const UK_TERMS = ['uk', 'united kingdom', 'britain', 'england', 'london', 'birmingham', 'manchester', 'bristol', 'cambridge', 'oxford', 'edinburgh']
const EU_TERMS = ['europe', 'european', 'eu', 'emea', 'france', 'germany', 'spain', 'italy', 'netherlands', 'nordics', 'switzerland', 'swiss']
const US_TERMS = ['us', 'usa', 'united states', 'america', 'silicon valley', 'new york', 'boston', 'san francisco']
const GLOBAL_TERMS = ['global', 'worldwide', 'international']

/** Port of stageFit() from Forge-Capital-Dashboard.html:1216-1236. */
export function stageFit(investorStages: string | null | undefined, queryText: string): number | null {
  if (!investorStages || !queryText) return null
  const inv = investorStages.toLowerCase()
  const q = queryText.toLowerCase()
  let queryStage: number | null = null
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    if (q.includes(STAGE_ORDER[i]) || q.includes(STAGE_ORDER[i].replace('-', ' '))) { queryStage = i; break }
  }
  if (queryStage === null && /\bseed\b/.test(q) && !q.includes('pre-seed')) queryStage = 1
  if (queryStage === null) return null
  let bestDist = 99
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    if (inv.includes(STAGE_ORDER[i]) || inv.includes(STAGE_ORDER[i].replace('-', ' '))) {
      bestDist = Math.min(bestDist, Math.abs(i - queryStage))
    }
  }
  if (queryStage === 1 && /\bseed\b/.test(inv)) bestDist = 0
  if (bestDist === 0) return 100
  if (bestDist === 1) return 80
  if (bestDist === 2) return 65
  if (bestDist === 3) return 55
  if (bestDist < 99) return 40
  return 50
}

/** Port of geoFit() from Forge-Capital-Dashboard.html:1238-1257. */
export function geoFit(investorGeo: string | null | undefined, queryText: string): number | null {
  if (!investorGeo || !queryText) return null
  const geo = investorGeo.toLowerCase()
  const q = queryText.toLowerCase()
  const qIsUK = UK_TERMS.some(t => q.includes(t))
  const qIsEU = EU_TERMS.some(t => q.includes(t))
  const qIsUS = US_TERMS.some(t => q.includes(t))
  const geoHasUK = UK_TERMS.some(t => geo.includes(t))
  const geoHasEU = EU_TERMS.some(t => geo.includes(t))
  const geoHasUS = US_TERMS.some(t => geo.includes(t))
  const geoGlobal = GLOBAL_TERMS.some(t => geo.includes(t))
  if ((qIsUK && geoHasUK) || (qIsEU && geoHasEU) || (qIsUS && geoHasUS)) return 100
  if ((qIsUK && geoHasEU) || (qIsEU && geoHasUK)) return 70
  if (geoGlobal) return 50
  if ((qIsUK || qIsEU || qIsUS) && !geoHasUK && !geoHasEU && !geoHasUS && !geoGlobal) return 20
  return null
}

/** Port of chequeFit() from Forge-Capital-Dashboard.html:1259-1279. */
export function chequeFit(invMin: number | null | undefined, invMax: number | null | undefined, queryText: string): number | null {
  if (!invMin && !invMax) return null
  const q = queryText.toLowerCase()
  const amounts = [...q.matchAll(/[$£€]?\s*(\d[\d.]*)\s*(k|m|b|million|billion)?/gi)]
  const parsed = amounts.map(m => {
    let val = parseFloat(m[1])
    const unit = (m[2] || '').toLowerCase()
    if (unit === 'k') val *= 1_000
    else if (unit === 'm' || unit === 'million') val *= 1_000_000
    else if (unit === 'b' || unit === 'billion') val *= 1_000_000_000
    return val
  }).filter(v => v >= 10_000 && v <= 1e10)
  let qMin: number, qMax: number
  if (parsed.length >= 2) { qMin = Math.min(...parsed); qMax = Math.max(...parsed) }
  else if (parsed.length === 1) { qMin = parsed[0] * 0.5; qMax = parsed[0] * 2 }
  else return null
  const iMin = invMin || 0
  const iMax = invMax || Infinity
  const overlapMin = Math.max(qMin, iMin)
  const overlapMax = Math.min(qMax, iMax)
  if (overlapMin <= overlapMax) {
    const qRange = qMax - qMin
    return qRange > 0 ? Math.min(100, Math.round((overlapMax - overlapMin) / qRange * 100)) : 100
  }
  return 0
}

export interface DashboardScore {
  composite: number
  pillars: { thesis: number; stage: number; geo: number; cheque: number; activity: number; data: number; hardware: number }
  appliedPillars: { thesis: true; stage: boolean; geo: boolean; cheque: boolean; activity: true; data: true; hardware: boolean }
}

/**
 * Score a single investor firm against the user query and the semantic
 * thesis similarity (from the pgvector RPC, 0-1). Returns 0-100 composite
 * and the 7 pillar breakdown aligned with forge-capital-app's weighting:
 *   thesis×20 + stage×20 + geo×15 + cheque×15 + activity×15 + data×10 + hardware×15
 *   = /110 (normalised to 0-100).
 * Missing pillars (stage/geo/cheque/hardware) are marked "not applied" and
 * excluded from the weight divisor.
 */
export function scoreFirmDashboard(firm: InvestorFirm, queryText: string, similarity: number | null): DashboardScore {
  const attrs = firm.attributes
  const thesis = Math.round(Math.max(0, Math.min(1, similarity ?? 0)) * 100)

  const stageFocusStr = Array.isArray(attrs.stage_focus) ? attrs.stage_focus.join(' ') : (attrs.stage_focus as string | undefined) ?? null
  const geoFocusStr = Array.isArray(attrs.geo_focus) ? attrs.geo_focus.join(' ') : (attrs.geo_focus as string | undefined) ?? null
  const cheque = (attrs.cheque_range_gbp as { min?: number | null; max?: number | null } | undefined) ?? null

  const stageRaw = stageFit(stageFocusStr, queryText)
  const geoRaw = geoFit(geoFocusStr, queryText)
  const chequeRaw = chequeFit(cheque?.min ?? null, cheque?.max ?? null, queryText)
  const activity = (attrs.is_active_deploying as boolean | undefined) ? 80 : 50
  const dq = typeof attrs.data_quality_score === 'number' ? attrs.data_quality_score : 0
  const dataPillar = Math.round(Math.max(0, Math.min(100, dq * 10)))
  // Hardware pillar: 0-10 raw → 0-100. Null when investor hasn't been scored.
  const hwRaw = attrs.hardware_fit_score
  const hwNorm = hwRaw != null ? Math.round(Math.min(10, Math.max(0, hwRaw)) * 10) : null

  // Composite: forge-capital-app weighting (thesis×20 + stage×20 + geo×15 +
  // cheque×15 + activity×15 + data×10 + hardware×15 = /110).
  // Always-on: thesis, data, activity.
  let compositeNum = thesis * 20 + dataPillar * 10 + activity * 15
  let weight = 20 + 10 + 15
  if (stageRaw !== null) { compositeNum += stageRaw * 20; weight += 20 }
  if (geoRaw !== null) { compositeNum += geoRaw * 15; weight += 15 }
  if (chequeRaw !== null) { compositeNum += chequeRaw * 15; weight += 15 }
  if (hwNorm !== null) { compositeNum += hwNorm * 15; weight += 15 }
  const composite = Math.round(compositeNum / weight)

  return {
    composite,
    pillars: {
      thesis,
      stage: stageRaw ?? 0,
      geo: geoRaw ?? 0,
      cheque: chequeRaw ?? 0,
      activity,
      data: dataPillar,
      hardware: hwNorm ?? 0,
    },
    appliedPillars: {
      thesis: true,
      stage: stageRaw !== null,
      geo: geoRaw !== null,
      cheque: chequeRaw !== null,
      activity: true,
      data: true,
      hardware: hwNorm !== null,
    },
  }
}
