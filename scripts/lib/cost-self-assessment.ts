/**
 * @file lib/cost-self-assessment.ts — the engine assessing its OWN cost output.
 *
 * Tristan 2026-06-01: "why isn't the engine self-assessing the cost and fixing it
 * BEFORE it appears in a PDF?" The existing cost gates have a blind spot: gate-21
 * (per-line price plausibility) only checks lines it can find a LIVE DISTRIBUTOR
 * price for, and SKIPS the rest — so the most-wrong lines (a £450k "DO-178C
 * certification", a £5,280 "historian database", a hallucinated part) sail through
 * because they aren't real catalogue parts. The aggregate band (gate-10) is too
 * coarse to notice one inflated line inside a big total.
 *
 * This auditor checks EVERY priced line WITHOUT needing a distributor reference:
 *   1. IDENTICAL-PRICE FINGERPRINT — ≥3 distinct line-items at the exact same unit
 *      price is the signature of classifier mis-bucketing (e.g. 5 unrelated parts
 *      all dumped into `oem_subsystem` and priced at the single class anchor:
 *      bioreactor's "auto-sampler skid / CO₂ MFC / process controller / Mettler
 *      transmitter / historian database" ALL at £5,280; a heat-pump's three room
 *      thermostats all at £600). No real BoM has many unrelated parts at an
 *      identical price.
 *   2. PER-LINE TYPE OUTLIER — a unit price far above its component-class sane
 *      ceiling (CLASS_PRICE_SANITY_BOUNDS) is implausible for that TYPE of part,
 *      regardless of whether a distributor lists it.
 *   3. NON-PHYSICAL-IN-CAPITAL — a certification / documentation / software line
 *      that is still inside the per-unit capital BoM (it should be NRE — backstop
 *      for the renderer's NRE routing).
 *
 * The verdict is advisory by default (surfaces the engine's own doubt on the
 * cover + cost-analysis page) and HARD on egregious cases (a single line > the
 * EGREGIOUS_MULTIPLE of its class ceiling), so nothing absurd ships silently.
 *
 * British spelling throughout.
 */

export interface CostLine {
  word_name: string
  component_class: string | null
  unit_price_gbp: number
  quantity: number
  /**
   * Provenance tier of unit_price_gbp. Lines whose price is REAL/SOURCED — a
   * distributor / DB quote ('actual'), an emitter catalogue pin, or a corpus
   * real-price match ('corpus_price') — are NOT estimates, so the ceiling
   * sanity-bound and the identical-price fingerprint do NOT apply to them
   * (Tristan 2026-06-04: a £60k boiler with a real Fulton price must not be
   * flagged against a £15k generic-thermal ESTIMATE ceiling). Absent / any
   * estimate tier behaves exactly as before (audited).
   */
  price_tier?: 'actual' | 'estimate' | 'tbd' | string | null
  /**
   * Explicit sourced override. When true the line is treated as real/sourced
   * regardless of price_tier (e.g. an emitter list_price pin that renders as a
   * distributor price, or a corpus_price estimate-tier line). Set by the
   * renderer from distributor_price_source / engine_b_estimate_source.
   */
  price_sourced?: boolean
}

/**
 * A line is REAL/SOURCED (not an estimate) when its price came from a
 * distributor / DB quote, an emitter catalogue pin, or a corpus real-price
 * match. The ceiling is a sanity bound for ESTIMATES only — a real sourced
 * price is its own ground truth and must never be flagged against a generic
 * class-anchor estimate ceiling. Conservative by construction: anything not
 * positively known to be sourced is still audited as an estimate.
 */
function isSourcedLine(ln: CostLine): boolean {
  if (ln.price_sourced === true) return true
  return ln.price_tier === 'actual' || ln.price_tier === 'corpus_price'
}

export interface CostSanityFinding {
  kind: 'identical_price_fingerprint' | 'per_line_type_outlier' | 'non_physical_in_capital'
  severity: 'HIGH' | 'MED'
  detail: string
  unit_price_gbp?: number
  count?: number
}

export interface CostSanityResult {
  passed: boolean // false only on a HARD (egregious) finding
  verdict: 'clean' | 'review' | 'fail'
  findings: CostSanityFinding[]
  lines_checked: number
}

// A unit price this many times its component-class sane ceiling is not a
// magnitude variant — it is a mis-classification or hallucination → HARD fail.
const EGREGIOUS_MULTIPLE = 8
// Above the class ceiling but below egregious → advisory MED (review).
const OUTLIER_MULTIPLE = 3
// This many distinct line-items at the IDENTICAL unit price = a fingerprint.
const FINGERPRINT_MIN_COUNT = 3
// Below this price an identical-price coincidence is meaningless (fasteners,
// passives genuinely share round prices).
const FINGERPRINT_MIN_PRICE_GBP = 50

const NON_PHYSICAL_RE =
  /\bDO-\d{3}|\bDAL[\s-]?[A-D]\b|\bARP\s?\d{3,}|\bcertificat(e|ion)\b|\bsafety\s+assessment\b|\b(historian|database|software\s+licen|firmware\s+licen)\b|\bdocumentation\s+(package|set|suite)\b|\btraining\s+(course|programme)\b/i

/**
 * Audit a set of priced BoM lines for self-evidently-wrong costs.
 *
 * @param lines      the per-unit CAPITAL BoM lines (after NRE/consumable/external
 *                   exclusion — those are checked separately by the renderer).
 * @param classCeil  CLASS_PRICE_SANITY_BOUNDS-style per-class max £ (component
 *                   class → sane ceiling). Lines whose class is absent are checked
 *                   for fingerprints + non-physical only (no type-outlier bound).
 */
export function auditCostSanity(
  lines: CostLine[],
  classCeil: Record<string, number>,
): CostSanityResult {
  const findings: CostSanityFinding[] = []
  let hard = false

  // 2 + 3: per-line checks.
  for (const ln of lines) {
    const price = Number(ln.unit_price_gbp)
    if (!Number.isFinite(price) || price <= 0) continue
    const cls = String(ln.component_class ?? '')
    const name = String(ln.word_name ?? '')
    const sourced = isSourcedLine(ln)

    // 3. non-physical line still inside the per-unit capital BoM.
    // The NON_PHYSICAL check is NAME-based (a certification / software line),
    // independent of price provenance, so it still fires on sourced lines —
    // a real-priced "DO-178C certification" is still mis-routed into capital.
    if (NON_PHYSICAL_RE.test(name)) {
      findings.push({
        kind: 'non_physical_in_capital',
        severity: 'HIGH',
        detail: `"${name.slice(0, 50)}" (£${Math.round(price).toLocaleString()}) is a certification / documentation / software line — a non-recurring engineering cost, not a per-unit raw material. It must be routed to the NRE line, not the capital BoM.`,
        unit_price_gbp: price,
      })
      hard = true
      continue
    }

    // 2. per-line type outlier vs class ceiling.
    // SKIP sourced lines: the ceiling is a sanity bound for ESTIMATES, not for
    // a real distributor / corpus / pinned price. A £60k boiler with a real
    // Fulton catalogue price must not be flagged 4× against a £15k generic-
    // thermal ESTIMATE ceiling (Tristan 2026-06-04).
    const ceil = classCeil[cls]
    if (!sourced && typeof ceil === 'number' && ceil > 0 && price > ceil * OUTLIER_MULTIPLE) {
      const egregious = price > ceil * EGREGIOUS_MULTIPLE
      findings.push({
        kind: 'per_line_type_outlier',
        severity: egregious ? 'HIGH' : 'MED',
        detail: `"${name.slice(0, 50)}" priced £${Math.round(price).toLocaleString()} — ${(price / ceil).toFixed(1)}× the sane ceiling (£${Math.round(ceil).toLocaleString()}) for a "${cls}". Implausible for this TYPE of part; likely mis-classified.`,
        unit_price_gbp: price,
      })
      if (egregious) hard = true
    }
  }

  // 1. identical-price fingerprint.
  // SKIP sourced lines: the fingerprint is the signature of classifier mis-
  // bucketing (many ESTIMATE lines collapsed onto one class anchor). Real
  // sourced prices can legitimately coincide (two Eaton valves both £450 from
  // the corpus, several parts genuinely priced at a round catalogue figure)
  // and are NOT evidence of mis-bucketing — counting them produces false
  // fingerprints. Only estimate-tier lines participate.
  const byPrice = new Map<number, Set<string>>()
  for (const ln of lines) {
    if (isSourcedLine(ln)) continue
    const price = Math.round(Number(ln.unit_price_gbp))
    if (!Number.isFinite(price) || price < FINGERPRINT_MIN_PRICE_GBP) continue
    let names = byPrice.get(price)
    if (!names) { names = new Set<string>(); byPrice.set(price, names) }
    names.add(String(ln.word_name ?? '').toLowerCase().trim())
  }
  for (const [price, names] of byPrice) {
    if (names.size >= FINGERPRINT_MIN_COUNT) {
      findings.push({
        kind: 'identical_price_fingerprint',
        severity: 'MED',
        detail: `${names.size} unrelated line-items all priced exactly £${price.toLocaleString()} — the signature of classifier mis-bucketing (many distinct parts dumped into one component class and priced at its single anchor). These prices are not independently sourced.`,
        unit_price_gbp: price,
        count: names.size,
      })
    }
  }

  const verdict: CostSanityResult['verdict'] = hard ? 'fail' : findings.length > 0 ? 'review' : 'clean'
  return { passed: !hard, verdict, findings, lines_checked: lines.length }
}
