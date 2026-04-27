/**
 * @file forge-capital-ranking.ts
 *
 * @description Forge Capital composite ranking ported VERBATIM from
 * `Forge-Capital-Search.html` lines 458-625. Tristan's mandate 2026-04-27:
 * "Forge Capital all the code exists. Everything is already there. I just
 * want you to mimic forge capital. Don't create new stuff."
 *
 * Composite formula:
 *   composite = (thesis_sim * 100) * 0.55
 *             + (stage_fit  * 0.10)   -- if non-null
 *             + (geo_fit    * 0.15)   -- if non-null
 *             + (cheque_fit * 0.10)   -- if non-null
 *             + (activity   * 0.03)
 *             + (dc         * 0.02)
 *   composite = composite / sum(active weights)
 *
 *   activity = is_active_deploying ? 80 : 50
 *   dc       = data_completeness   (0–100; 0 if absent)
 *
 * Stage / geo / cheque can return null (no signal in the query). When null
 * they are NOT weighted into the denominator — keeps thesis-only matches
 * scoring honestly without a stage-mismatch tax.
 *
 * @related Forge-Capital-Search.html (canonical), src/actions/investors.ts
 */

const STAGE_ORDER = [
  'pre-seed',
  'seed',
  'early stage',
  'series a',
  'series b',
  'series c+',
  'growth',
] as const

/**
 * stageFit — verbatim port of Forge-Capital-Search.html lines 460-498.
 * Returns 0–100 if both query + investor have stage info, null otherwise.
 *
 * Soft gradient so a 1- or 2-stage gap doesn't kill an otherwise great
 * match. exact=100, ±1=80, ±2=65, ±3=55, further=40.
 */
export function stageFit(
  investorStages: string | null | undefined,
  queryText: string,
): number | null {
  if (!investorStages || !queryText) return null
  const inv = investorStages.toLowerCase()
  const q = queryText.toLowerCase()

  // Detect which stage the query mentions
  let queryStage: number | null = null
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const s = STAGE_ORDER[i]
    if (q.includes(s) || q.includes(s.replace('-', ' ')) || q.includes(s.replace(' ', '-'))) {
      queryStage = i
      break
    }
  }
  if (queryStage === null && /\bseed\b/.test(q) && !q.includes('pre-seed') && !q.includes('pre seed')) {
    queryStage = 1
  }
  if (queryStage === null) return null

  let bestDist = 99
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const s = STAGE_ORDER[i]
    if (inv.includes(s) || inv.includes(s.replace('-', ' ')) || inv.includes(s.replace(' ', '-'))) {
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

const UK_TERMS = ['uk', 'united kingdom', 'britain', 'england', 'scotland', 'wales', 'london', 'birmingham', 'manchester', 'bristol', 'cambridge', 'oxford', 'edinburgh']
const EU_TERMS = ['europe', 'european', 'eu', 'emea', 'france', 'germany', 'spain', 'italy', 'netherlands', 'sweden', 'denmark', 'nordics']
const US_TERMS = ['us', 'usa', 'united states', 'america', 'silicon valley', 'new york', 'boston', 'san francisco']
const GLOBAL_TERMS = ['global', 'worldwide', 'international']

/**
 * geoFit — verbatim port of Forge-Capital-Search.html lines 500-523.
 * Returns 0–100 if query mentions a geography and investor has geo data,
 * null otherwise (no geo signal in the query).
 */
export function geoFit(
  investorGeo: string | null | undefined,
  queryText: string,
): number | null {
  if (!investorGeo || !queryText) return null
  const geo = investorGeo.toLowerCase()
  const q = queryText.toLowerCase()

  const qIsUK = UK_TERMS.some((t) => q.includes(t))
  const qIsEU = EU_TERMS.some((t) => q.includes(t))
  const qIsUS = US_TERMS.some((t) => q.includes(t))
  const geoHasUK = UK_TERMS.some((t) => geo.includes(t))
  const geoHasEU = EU_TERMS.some((t) => geo.includes(t))
  const geoHasUS = US_TERMS.some((t) => geo.includes(t))
  const geoGlobal = GLOBAL_TERMS.some((t) => geo.includes(t))

  if ((qIsUK && geoHasUK) || (qIsEU && geoHasEU) || (qIsUS && geoHasUS)) return 100
  if ((qIsUK && geoHasEU) || (qIsEU && geoHasUK)) return 70
  if (geoGlobal) return 50
  if ((qIsUK || qIsEU || qIsUS) && !geoHasUK && !geoHasEU && !geoHasUS && !geoGlobal) return 20
  return null
}

/**
 * chequeFit — verbatim port of Forge-Capital-Search.html lines 525-558.
 * Returns 0–100 if query mentions a cheque size and investor has range,
 * null otherwise.
 */
export function chequeFit(
  invMin: number | null | undefined,
  invMax: number | null | undefined,
  queryText: string,
): number | null {
  if (!invMin && !invMax) return null

  const q = queryText.toLowerCase()
  let qMin: number | null = null
  let qMax: number | null = null

  const amounts = [...q.matchAll(/[$£]?\s*([\d.]+)\s*(k|m|b|million|billion)?/gi)]
  const parsed = amounts
    .map((m) => {
      let val = parseFloat(m[1])
      const unit = (m[2] || '').toLowerCase()
      if (unit === 'k') val *= 1000
      else if (unit === 'm' || unit === 'million') val *= 1000000
      else if (unit === 'b' || unit === 'billion') val *= 1000000000
      return val
    })
    .filter((v) => v >= 10000 && v <= 10000000000)

  if (parsed.length >= 2) {
    qMin = Math.min(...parsed)
    qMax = Math.max(...parsed)
  } else if (parsed.length === 1) {
    qMin = parsed[0] * 0.5
    qMax = parsed[0] * 2
  }

  if (qMin == null && qMax == null) return null

  const iMin = invMin || 0
  const iMax = invMax || Infinity
  const overlapMin = Math.max(qMin || 0, iMin)
  const overlapMax = Math.min(qMax || Infinity, iMax)

  if (overlapMin <= overlapMax) {
    const qRange = (qMax || (qMin ?? 0) * 10) - (qMin || 0)
    if (qRange > 0) {
      return Math.min(100, Math.round(((overlapMax - overlapMin) / qRange) * 100))
    }
    return 100
  }
  return 0
}

/**
 * Forge Capital composite — verbatim port of lines 604-625.
 *
 * @param thesisSim cosine similarity 0–1 (normalised)
 * @param stage     stageFit result, may be null
 * @param geo       geoFit result, may be null
 * @param cheque    chequeFit result, may be null
 * @param activity  80 if actively deploying, else 50
 * @param dc        data completeness 0–100 (0 if unknown)
 */
export function forgeCapitalComposite(
  thesisSim: number,
  stage: number | null,
  geo: number | null,
  cheque: number | null,
  activity: number,
  dc: number,
): { composite: number; thesis_sim: number } {
  let composite = thesisSim * 100 * 0.55
  let weights = 0.55
  if (stage !== null) {
    composite += stage * 0.10
    weights += 0.10
  }
  if (geo !== null) {
    composite += geo * 0.15
    weights += 0.15
  }
  if (cheque !== null) {
    composite += cheque * 0.10
    weights += 0.10
  }
  composite += activity * 0.03 + dc * 0.02
  weights += 0.05
  composite = composite / weights

  return {
    composite: Math.round(composite * 10) / 10,
    thesis_sim: Math.round(thesisSim * 1000) / 10,
  }
}
