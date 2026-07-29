// ═══════════════════════════════════════════════════════════════════════════════
// B3 — CAGE THE LLM CRITIC (Tristan 2026-06-19)
// ═══════════════════════════════════════════════════════════════════════════════
// "A number is trustworthy only when you can WATCH it be computed." The quality
// FLOOR is therefore set by the DETERMINISTIC (non-advisory) scorecard sections
// only — the arithmetic/ledger gates (drawing_gates, cost_sanity, physics_gates,
// tool_archetype, connectivity). The LLM self-audit sections are ADVISORY: they
// stay visible (a human reads the critic's concerns; they still render on the
// dashboard/Excel) but they may NEVER turn a green deterministic check red or set
// the floor on their own.
//
// This closes the failure Tristan kept catching: the LLM critic scored a CORRECT
// deterministic design 6/10 (it read a per-tank 1,336 m³/h branch flow as the pump
// total; it invented a "missing heat pump" that the adequacy check PASSES) and that
// 6 dragged the whole floor below 8 with no real defect behind it. Proven on real
// ras-inc5 data: OLD floor 6 (physics_fidelity=6 + brief_compliance=7, both LLM
// misreads/wobble) → NEW floor 8, allPass=true, with every deterministic gate ≥8.
//
// Pure + dependency-free so the regression harness can import and test it directly
// (the chain file runs main() on import and cannot itself be imported).

export interface ScorecardSection {
  name: string
  score: number
  defects?: string[]
  /** true = LLM self-audit section: visible but NON-GATING (advisory only). */
  advisory?: boolean
}

/**
 * Compute the scorecard floor + mean from the DETERMINISTIC sections only.
 * Universal fallback: if a run produced ONLY advisory sections (no deterministic
 * gate ran for this class), fall back to all sections so the score is never blank.
 */
export function computeScorecardFloor(
  sections: ScorecardSection[],
): { floor: number; mean: number } {
  const gating = sections.filter((s) => !s.advisory)
  const scored = gating.length ? gating : sections
  const scores = scored.map((s) => s.score)
  const floor = scores.length ? Math.min(...scores) : 0
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  return { floor, mean: Math.round(mean * 10) / 10 }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NON-SHIP-GATING DEFECTS (Tristan 2026-07-09 — "keep Why now, don't fail the system")
// ═══════════════════════════════════════════════════════════════════════════════
// Marketing-timing prose ("Why now") is OPTIONAL colour on the cover. An LLM judge
// may still flag generic boilerplate so a human can improve the paragraph, but that
// defect class must NEVER drag the honest scorecard floor / allPass / Exec-Summary
// floor-mirror. Engineering truth (compliance, BoM, drawings, physics, connectivity)
// remains the ship gate. Universal — keyed on the defect text pattern, no class table.
//
// shipGatingScore: the score used for floor / mean / allPass. When EVERY defect on a
// section matches a non-ship-gating class (or the section has no defects), a sub-10
// advisory score is lifted to 10 for gating purposes only — the raw section.score and
// defects[] stay unchanged so the critique remains visible. Lift is to 10 (not 8)
// so a Why-now-only advisory can never pin Exec/QA floor mirrors below the >9 bar
// Tristan requires on every tab (2026-07-09).
const NON_SHIP_GATING_DEFECT_RE =
  /why\s*now\s+paragraph|why_now|why\s+now\s+(?:is\s+)?generic|generic boilerplate.*why\s*now|why\s*now.*generic boilerplate/i

/** True when a defect string is marketing-timing / Why-now prose only — never a ship gate. */
export function isNonShipGatingDefect(defect: string): boolean {
  return NON_SHIP_GATING_DEFECT_RE.test(String(defect ?? ''))
}

/**
 * Score used for the honest ship floor / allPass. Preserves raw section.score for
 * display; only lifts when the section's defects are exclusively non-ship-gating
 * (or empty) and the raw score is the sole floor-drag. A section with any real
 * engineering defect keeps its raw score.
 */
export function shipGatingScore(section: ScorecardSection): number {
  const raw = Number(section.score)
  if (!Number.isFinite(raw)) return 0
  const defects = section.defects ?? []
  if (defects.length === 0) return raw
  if (defects.every((d) => isNonShipGatingDefect(d))) {
    // Why-now-only (or other non-ship-gating-only) advisory: visible critique, not a fail.
    return Math.max(raw, 10)
  }
  return raw
}

/**
 * Honest ship floor/mean/allPass — min/mean of shipGatingScore across every section.
 * @param passFloor - minimum score for allPass (default 9 — Tristan 2026-07-09 Excel bar).
 */
export function computeHonestShipFloor(
  sections: ScorecardSection[],
  passFloor: number = 9,
): { floor: number; mean: number; allPass: boolean } {
  const scores = sections.map(shipGatingScore)
  const floor = scores.length ? Math.min(...scores) : 0
  const mean = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : 0
  const bar = Number.isFinite(passFloor) ? passFloor : 9
  return { floor, mean, allPass: floor >= bar }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORECARD HONESTY — dedup stale duplicate sections (Tristan 2026-07-08)
// ═══════════════════════════════════════════════════════════════════════════════
// The chain's computeQualityScorecard() pushes sections from several independent
// sources (the LLM self-audit's own opinion + the deterministic FACT builders
// above), and more than one can legitimately push the SAME conceptual name (e.g.
// the self-audit's 'brief_compliance'/'physics_fidelity' opinion ALONGSIDE
// buildBriefComplianceSection/buildPhysicsFidelitySection's fact-based sections of
// the identical name). Left un-merged, `sections[]` reads as a stale-looking
// duplicate — Tristan caught `brief_compliance` appearing as [5, 10] and
// `physics_fidelity` as [7, 10] in the same scorecard. Every reader of `sections[]`
// (a human, an automated "every section ≥N" check, the Excel exporter) must see
// ONE row per name.

/**
 * Merge scorecard sections that share a `name` into ONE entry. Universal — keyed
 * on `name` only, no per-section table:
 *   - a single entry for a name passes through unchanged.
 *   - a collision takes the WORST (min) score across the group (never hides a low
 *     score behind a higher one) and unions the defect lists.
 *   - `advisory` on the merged entry is true ONLY if every entry in the group was
 *     advisory; a group containing at least one deterministic (fact) entry merges
 *     to advisory=false (it is, in part, authoritative) and folds each advisory
 *     sibling's score + defects in as a visible "advisory: self-audit (LLM) scored
 *     this section N/10 — ..." annotation, so the LLM's opinion is never silently
 *     discarded, only demoted to an annotation — both scores stay clearly labelled
 *     rather than one being erased. Mirrors the identical "duplicate names → the
 *     MIN (worst) wins" convention `build-excel-export.py::_verdict_sections`
 *     already applies downstream, so the JSON this writes and the workbook's own
 *     recomputation can never quietly disagree.
 */
export function dedupeScorecardSections(sections: ScorecardSection[]): ScorecardSection[] {
  const order: string[] = []
  const groups = new Map<string, ScorecardSection[]>()
  for (const s of sections) {
    if (!groups.has(s.name)) { groups.set(s.name, []); order.push(s.name) }
    groups.get(s.name)!.push(s)
  }
  const out: ScorecardSection[] = []
  for (const name of order) {
    const group = groups.get(name)!
    if (group.length === 1) { out.push(group[0]); continue }
    const deterministic = group.filter((g) => !g.advisory)
    const advisory = group.filter((g) => g.advisory)
    if (deterministic.length > 0) {
      const score = Math.min(...deterministic.map((d) => d.score))
      const defects = Array.from(new Set(deterministic.flatMap((d) => d.defects ?? [])))
      for (const a of advisory) {
        defects.push(
          `advisory: self-audit (LLM) scored this section ${a.score}/10${(a.defects ?? []).length ? ' — ' + a.defects![0] : ''}`.slice(0, 200),
        )
      }
      out.push({ name, score, defects, advisory: false })
    } else {
      const score = Math.min(...advisory.map((a) => a.score))
      const defects = Array.from(new Set(advisory.flatMap((a) => a.defects ?? [])))
      out.push({ name, score, defects, advisory: true })
    }
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC FACT SECTIONS (Tristan 2026-07-02)
// ═══════════════════════════════════════════════════════════════════════════════
// Tristan's catch: the workbook's Scorecard sheet showed brief_compliance 5/10
// ("8 of 15 constraints unverified") + physics_fidelity 7 while the chain's quality
// scorecard said floor=8/allPass=true. B3 (above) is CORRECT for LLM SCORES — they
// flake — but as written it also dropped FACTS that are deterministically computable
// from state. The two builders below re-admit those FACTS as advisory:false sections
// WITHOUT re-admitting LLM opinion into the floor:
//
//   • brief_compliance — brief target metrics vs DELIVERED contract quantities using
//     the SAME matcher the workbook's compliance matrix renders (the chain probes
//     build-excel-export.py::_match_quantity directly, so the floor and the Excel can
//     never disagree). The MATCH is pure name+unit-family arithmetic — no LLM.
//   • unresolved_critic_highs — the COUNT of physics-critic HIGH findings that
//     survived the falsify-stale pass (dossier_audit.py::_physics_issues +
//     _physics_high_is_design_defect — the exact set the Risk & Regulatory tab gates
//     on). The FINDER is an LLM, but the falsify pass de-flakes the set and the COUNT
//     of survivors is deterministic given the state.
//
// B3 STANDS: LLM self-audit sections stay advisory. These sections participate in the
// floor because their INPUTS are deterministic, not because the critic's opinion is
// trusted again.

export type ComplianceStatus = 'PASS' | 'FAIL' | 'UNVERIFIED'

/** One row of the workbook's Brief-compliance matrix, as matched by the exporter's
 *  matcher (build-excel-export.py::_match_quantity). matched=null ⇒ UNVERIFIED. */
export interface ComplianceRowInput {
  /** brief metric key (key_metric / metric / name) */
  key: string
  unit?: string
  /** brief metric category: scale / durability / safety / performance / efficiency / … */
  category?: string
  target: number | null
  /** name of the matched DELIVERED contract quantity (never a requirement-ECHO —
   *  the matcher excludes …_demand/_required/_requested/_target/_setpoint keys) */
  matched: string | null
  achieved: number | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEEDSTOCK-APPROXIMATION RELIEF (Tristan 2026-07-06, CO₂-mineralisation KOH false miss)
// ═══════════════════════════════════════════════════════════════════════════════
// PORTED from dossier_audit.py::_is_feedstock_metric / _brief_value_approximated /
// check_brief_metric_fail (commit 22a85b526) — scorecard-floor.ts computes PASS/FAIL/
// UNVERIFIED via its OWN independent tolerance logic (agreement-by-construction covers
// the MATCH, not the tolerance band), so the same false brief-miss that check_brief_
// metric_fail already fixed reproduces here unless the identical rule is ported.
//
// A feedstock/consumption metric (koh_feed_tpd) is a DERIVED quantity — the
// stoichiometric amount of raw material the design draws to hit its stated output —
// not a performance floor. When the brief's own prose hedges the cited target with
// 'approximately'/'approx'/'~'/'about'/'roughly', a near-miss under the tight 2% band
// is widened to a ±5% tolerance before it is allowed to gate: 2.54 t/day achieved vs an
// approximate 2.6 t/day target (2.3% gap, the correct stoichiometric amount for 3.9
// t/day K2SO4) is COMPLIANT, not a FAIL. A genuinely short feedstock (>5% out) still
// fails; a hard, non-approximate target, or a capacity/output performance metric that
// merely happens to ALSO be hedged with 'approximately' in the brief, both stay on the
// tight 2% band — the relief is scoped to feedstock/consumption NAMES only
// (complianceMetricIsFeedstock) and only fires when the brief discloses the
// approximation itself (briefValueApproximated). Universal: keyed off the metric's own
// name tokens, never a class table; the hard-performance regex wins any token overlap
// so a name can never accidentally qualify for both. proveCatch (both directions) in
// _selftest.

const FEEDSTOCK_METRIC_RX =
  /\b(feed|feedstock|consum|reagent|dos(?:e|ing)|makeup|make_up|intake|uptake|input)\b/i
const HARD_PERFORMANCE_METRIC_RX =
  /\b(capacity|output|throughput|yield|product|rated|nameplate|power|voltage|current|efficiency|energy|duty|captur\w*)\b/i

/** True for a feedstock/raw-material CONSUMPTION metric name; false for a hard
 *  performance/output floor even when a token would otherwise overlap. */
export function complianceMetricIsFeedstock(name: string): boolean {
  const text = String(name || '').replace(/[_-]+/g, ' ')
  return FEEDSTOCK_METRIC_RX.test(text) && !HARD_PERFORMANCE_METRIC_RX.test(text)
}

const APPROX_HEDGE_RX = /~|\bapprox(?:imately|\.)?\b|\babout\b|\broughly\b/i

/** %g-equivalent short representations of a numeric brief value (mirrors Python's
 *  `_brief_value_reprs`: {v:g}, {v:.0f}, {v:.1f}, {v:.2f}) for locating the brief's own
 *  citation of this figure in its prose. */
function briefValueReprs(value: number | null): Set<string> {
  const reps = new Set<string>()
  if (value == null || !Number.isFinite(value)) return reps
  const g = Number(value.toPrecision(6))
  reps.add(String(g))
  for (const nd of [0, 1, 2]) reps.add(value.toFixed(nd))
  return reps
}

/** True when the brief's own text, within a short window before THIS metric's cited
 *  target value, hedges it with an approximation word — i.e. the brief itself states
 *  the figure is not exact. Mirrors dossier_audit.py::_brief_value_approximated. */
export function briefValueApproximated(briefText: string | undefined, targetValue: number | null): boolean {
  if (!briefText || targetValue == null) return false
  const reps = briefValueReprs(targetValue)
  if (reps.size === 0) return false
  for (const rep of reps) {
    if (!rep) continue
    let from = 0
    for (;;) {
      const at = briefText.indexOf(rep, from)
      if (at === -1) break
      const window = briefText.slice(Math.max(0, at - 40), at)
      if (APPROX_HEDGE_RX.test(window)) return true
      from = at + 1
    }
  }
  return false
}

/**
 * PASS/FAIL/UNVERIFIED for one compliance row — an exact mirror of the direction +
 * tolerance logic the workbook renders (build-excel-export.py::
 * _render_brief_compliance_section): HIGHER-is-better by default; LOWER-is-better only
 * for genuine minimise targets (FCR / feed-conversion / duration / lead-time / LCOE /
 * cost-per / cycle TIME — never cycle LIFE); tolerance ±2% of target. `briefText`
 * (optional — the brief's original/revised prose) engages the feedstock-approximation
 * relief above on a FAIL only; omitting it preserves the original tight-2%-only
 * behaviour exactly (backward compatible with every existing caller/test).
 */
export function complianceRowStatus(row: ComplianceRowInput, briefText?: string): ComplianceStatus {
  if (row.matched == null || row.target == null || row.achieved == null) return 'UNVERIFIED'
  const kl = (row.key || '').toLowerCase()
  // INTENT (2026-07-29 SOL): regulatory/absolute CEILINGS are lower-is-better —
  // max_rotor_speed_rpm=100000 with design base 40000 must PASS (under the ceiling),
  // not FAIL higher-is-better. Exclude capability floors (max_simultaneous_dissipation).
  // INTENT (2026-07-29 SOL): regulatory + brief BAND TOPS are lower-is-better.
  // Design base 40k vs illustrative_*_max_rpm=50k, gear_ratio=8 vs gear_ratio_max=12,
  // flow 15 vs coolant_flow_max=20 must PASS — not FAIL higher-is-better.
  // Exclude capability floors (max_simultaneous_dissipation / max_output_capacity).
  const isCapabilityFloor =
    kl.includes('simultaneous') ||
    kl.includes('output_capacity') ||
    kl.includes('dissipation')
  const isCeilingMetric =
    !isCapabilityFloor &&
    (kl.includes('_ceiling') ||
      kl.includes('_cap_kg') ||
      kl.includes('cost_ceiling') ||
      kl === 'max_mass_kg' ||
      kl === 'max_rotor_speed_rpm' ||
      kl === 'max_system_voltage_v' ||
      kl.includes('_temp_limit') ||
      /_limit_c$/.test(kl) ||
      /_max_rpm$/.test(kl) ||
      /_max_(khz|l_per_min|nm|kw|v|a|c|ratio)\b/.test(kl) ||
      (kl.endsWith('_max') &&
        (kl.includes('ratio') ||
          kl.includes('gear') ||
          kl.includes('flow') ||
          kl.includes('frequency') ||
          kl.includes('speed') ||
          kl.includes('torque') ||
          kl.includes('throughput'))) ||
      (kl.startsWith('max_') &&
        (kl.includes('voltage') || kl.includes('rotor_speed') || kl.includes('rpm'))))
  const lowerBetter =
    isCeilingMetric ||
    kl.includes('fcr') ||
    kl.includes('feed_conversion') ||
    kl.includes('conversion_ratio') ||
    kl.includes('_days') ||
    kl.includes('duration') ||
    kl.includes('lead_time') ||
    kl.includes('lcoe') ||
    kl.includes('cost_per') ||
    (kl.includes('cycle') && /\btime\b|hour|minute|second|_s\b/.test(kl))
  const { target, achieved } = row
  const tol = target ? Math.abs(target) * 0.02 : 0
  let passed = lowerBetter ? achieved <= target + tol : achieved >= target - tol
  if (!passed && complianceMetricIsFeedstock(row.key) && briefValueApproximated(briefText, target)) {
    const approxTol = Math.abs(target) * 0.05
    passed = Math.abs(achieved - target) <= approxTol || target === 0
  }
  return passed ? 'PASS' : 'FAIL'
}

// HARD-constraint classification — mirrors gate 9 (scripts/lib/
// brief-constraint-completeness-audit.ts): scale/durability/safety metrics are always
// HARD; performance metrics are HARD only for the curated system-identity keys.
const HARD_METRIC_CATEGORIES = new Set(['scale', 'durability', 'safety'])
const HARD_PERFORMANCE_KEYS = new Set([
  'rated_power_mw',
  'rated_power_kw',
  'peak_power_mw',
  'peak_power_kw',
  'transient_power_kw',
  'transient_power_mw',
  'continuous_power_kw',
  'continuous_power_mw',
  'dc_bus_voltage_v',
  'ac_output_voltage_v',
  'thermal_output_kw',
  'annual_energy_mwh',
  'yield_kg_per_year',
])

export function complianceMetricIsHard(key: string, category?: string): boolean {
  return (
    HARD_METRIC_CATEGORIES.has((category || '').toLowerCase().trim()) ||
    HARD_PERFORMANCE_KEYS.has((key || '').toLowerCase().trim())
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK QUANTITY MATCHER (Tristan 2026-07-06, CO₂-mineralisation capture UNVERIFIED)
// ═══════════════════════════════════════════════════════════════════════════════
// scorecard-floor's brief_compliance section trusts the upstream matched/achieved pair
// (build-excel-export.py::_match_quantity — agreement-by-construction with the
// workbook). That matcher requires the brief's identity tokens to appear VERBATIM
// among a quantity's underscore-split tokens; a compound token like 'tco2' (the
// t-<formula> "tonnes-of-CO2" naming convention: capture_capacity_tco2_per_day) never
// token-equals the brief's 'co2' token under exact membership, so a quantity that is
// genuinely DELIVERED under that name (1 t/day, exactly the brief's headline) goes
// UNVERIFIED instead of PASS.
//
// This is scorecard-floor's OWN, independent second-opinion matcher: SAME-UNIT,
// SUBSTRING-tolerant token overlap, engaged ONLY when the upstream matcher already
// returned matched=null AND the caller supplies the raw achieved-quantities map (the
// `quantities` field on ComplianceContext) — it NEVER invents a match when quantities
// is absent (every existing caller/test that omits it is unaffected), and it NEVER
// overrides an upstream PASS/FAIL (only a null match is eligible for re-resolution).
// If no quantity clears the bar, the row stays honestly UNVERIFIED — a genuine gap is
// never papered over. proveCatch (both directions) in _selftest.

const ECHO_NAME_TOKEN_RX = /_(requested|request|target|demand|brief|spec|setpoint|required)$/i
// Tokens carrying no engineering identity — dropped before token-overlap matching.
// Mirrors dossier_audit.py::_MATCH_STOP_TOKENS.
const MATCH_STOP_TOKENS = new Set([
  'the', 'of', 'per', 'system', 'total', 'design', 'rated', 'nominal', 'max', 'min', 'peak', 'avg', 'mean',
  // GENERIC measure-nouns — a metric's IDENTITY is its SUBSYSTEM (koh/feed, gac/softener,
  // synthesis/reactor), NOT the generic quantity word it is measured in. These alone must
  // never bridge two different subsystems: a 1-token overlap of 'temp' or 'pressure' matched
  // synthesis_temp_max_c to an unrelated reactor_temp_c (v21 SAF false-positive, 2026-07-06)
  // exactly the wrong-subsystem pattern this stop-list already guards against for throughput.
  'capacity', 'throughput', 'flow', 'rate', 'demand', 'output', 'volume', 'duty', 'load',
  'temp', 'temperature', 'pressure', 'level', 'concentration',
  'm3', 'm2', 'm', 'l', 'hr', 'h', 'hour', 'hrs', 'min', 'mins', 'sec', 's', 'day', 'yr', 'year',
  'kw', 'mw', 'gw', 'w', 'kwh', 'mwh', 'gwh', 'wh', 'kg', 'kt', 't', 'g', 'v', 'kv', 'a', 'ka', 'ma',
  'bar', 'pa', 'kpa', 'mpa', 'psi', 'c', 'k', 'pct', 'percent', 'mm', 'cm', 'km', 'nm', 'ppm',
  'count', 'nr', 'no', 'qty', 'ea', 'off', 'unit', 'units', 'pcs', 'number',
])

function nameTokens(name: string): string[] {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return base.split('_').filter((t) => t && !MATCH_STOP_TOKENS.has(t))
}

/** Count of brief-metric identity tokens covered by a candidate quantity's tokens —
 *  exact match OR (length ≥3 both sides) substring match, so a compound token like
 *  'tco2' still covers the brief's 'co2' without a per-instance alias table. */
function tokenOverlapCount(briefTokens: string[], qTokens: string[]): number {
  let n = 0
  for (const bt of briefTokens) {
    const hit = qTokens.some(
      (qt) => qt === bt || (bt.length >= 3 && qt.length >= 3 && (qt.includes(bt) || bt.includes(qt))),
    )
    if (hit) n++
  }
  return n
}

function normUnit(u?: string): string {
  return String(u || '').trim().toLowerCase().replace(/\s+/g, '')
}

/** Raw achieved-quantity shape (orchestratorContract.quantities entries). */
export interface RawQuantity {
  value?: number | string | null
  unit?: string
}

/**
 * Find the achieved contract quantity that fulfils a brief metric by NAME + EXACT UNIT,
 * tolerating a compound/fused identity token (SUBSTRING overlap) that an exact-token
 * matcher misses. Requirement-ECHO quantities (…_target/_demand/…) are excluded so a
 * genuine miss stays honest. Returns null (never guesses) when nothing clears at least
 * half the brief metric's identity tokens.
 */
export function fallbackMatchQuantity(
  metricKey: string,
  metricUnit: string | undefined,
  quantities: Record<string, RawQuantity>,
): { key: string; value: number } | null {
  const briefTokens = nameTokens(metricKey)
  if (briefTokens.length === 0) return null
  const need = Math.max(1, Math.ceil(briefTokens.length / 2))
  const targetUnit = normUnit(metricUnit)
  // INTENT (2026-07-29 SOL): car_level / vehicle_level brief context must not
  // bind a rear-axle product quantity (false FAIL on 600→350 kW).
  const kl = String(metricKey || '').toLowerCase()
  const scopeTokens = new Set(
    briefTokens.filter((t) => t === 'car' || t === 'vehicle' || t === 'chassis'),
  )
  if (kl.includes('car_level') || kl.includes('vehicle_level')) {
    scopeTokens.add('car')
    scopeTokens.add('vehicle')
  }
  let best: { overlap: number; key: string; value: number } | null = null
  for (const [qname, qv] of Object.entries(quantities || {})) {
    if (!qv || typeof qv !== 'object') continue
    if (ECHO_NAME_TOKEN_RX.test(qname)) continue
    // Dimensionless: ratio / — / empty are interchangeable.
    const qu = normUnit(qv.unit)
    const unitOk =
      qu === targetUnit ||
      ((targetUnit === 'ratio' || targetUnit === '—' || targetUnit === '-' || targetUnit === '') &&
        (qu === 'ratio' || qu === '' || qu === '—' || qu === '-'))
    if (!unitOk) continue
    if (scopeTokens.size > 0) {
      const qTok = new Set(nameTokens(qname))
      let scopeHit = false
      for (const s of scopeTokens) {
        if (qTok.has(s)) {
          scopeHit = true
          break
        }
      }
      if (!scopeHit) continue
    }
    const raw = qv.value
    const val = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isFinite(val)) continue
    const overlap = tokenOverlapCount(briefTokens, nameTokens(qname))
    if (overlap < need) continue
    if (!best || overlap > best.overlap) best = { overlap, key: qname, value: val }
  }
  return best ? { key: best.key, value: best.value } : null
}

/** Optional shared context for a `buildBriefComplianceSection` call — both fields are
 *  opt-in and backward compatible; omitting either preserves the exact prior behaviour. */
export interface ComplianceContext {
  /** raw brief prose (parsedBrief.original_text ?? revised_text) — engages the
   *  feedstock-approximation relief on a FAIL row. */
  briefText?: string
  /** raw orchestratorContract.quantities — engages the fallback matcher on a row the
   *  upstream matcher left UNVERIFIED (matched === null). */
  quantities?: Record<string, RawQuantity>
}

function resolveComplianceRow(row: ComplianceRowInput, ctx?: ComplianceContext): ComplianceRowInput {
  if (row.matched != null || !ctx?.quantities) return row
  const found = fallbackMatchQuantity(row.key, row.unit, ctx.quantities)
  if (!found) return row
  return { ...row, matched: found.key, achieved: found.value }
}

/**
 * Deterministic `closure_honesty` section (advisory:false — it GATES).
 *
 * INTENT (Sol+Fable Block 2, 2026-07-27): the LLM physics-critic `honesty_signal`
 * rewards disclosed TBD (all-TBD → 8–10). That is Goodhart. This section docks
 * fillable-TBD / unbound multiplicity / zero-dim-on-demand from a precomputed
 * closure result (see `design-closure-gate.ts::buildClosureHonestyFromState`).
 *
 * SCORING: caller supplies the score (≤2 all-critical-TBD; 10 when closed).
 */
export function buildClosureHonestySection(input: {
  score: number
  defects?: string[]
  fillable_tbd?: number
}): ScorecardSection {
  const score = Math.max(0, Math.min(10, Math.round(Number(input.score) || 0)))
  const defects = [...(input.defects ?? [])]
  if ((input.fillable_tbd ?? 0) > 0 && !defects.some((d) => /fillable-TBD|TBD/i.test(d))) {
    defects.unshift(`${input.fillable_tbd} fillable-TBD critical role(s) — defect, not disclosure`)
  }
  return {
    name: 'closure_honesty',
    score,
    defects,
    advisory: false,
  }
}

/**
 * Deterministic `brief_compliance` section (advisory:false — it GATES).
 *
 * SCORING RULE (Tristan 2026-07-02):
 *   0 unverified + 0 failed              → 10
 *   any FAILED hard constraint           → 4   (the design misses a hard target)
 *   else any UNVERIFIED hard constraint  → 5   (a hard target the dossier cannot prove)
 *   else (soft-only fails/unverified)    → 7
 *
 * defects[] names every failed/unverified constraint so the fix loop and a human
 * reader see exactly which rows are red/amber in the workbook's compliance matrix.
 *
 * `ctx` (optional, 2026-07-06) is the shared brief text + raw quantities map that
 * engage the feedstock-approximation relief and the fallback matcher above — both are
 * no-ops when omitted, so every existing call site is unaffected byte-for-byte.
 */
export function buildBriefComplianceSection(rows: ComplianceRowInput[], ctx?: ComplianceContext): ScorecardSection {
  const defects: string[] = []
  let hardFail = false
  let hardUnverified = false
  let softGap = false
  for (const row0 of rows) {
    const row = resolveComplianceRow(row0, ctx)
    const status = complianceRowStatus(row, ctx?.briefText)
    if (status === 'PASS') continue
    const hard = complianceMetricIsHard(row.key, row.category)
    if (status === 'FAIL') {
      if (hard) hardFail = true
      else softGap = true
      defects.push(
        `FAIL (${hard ? 'hard' : 'soft'}): ${row.key} — target ${row.target} ${row.unit || ''}, achieved ${row.achieved} (${row.matched})`.slice(0, 200),
      )
    } else {
      if (hard) hardUnverified = true
      else softGap = true
      defects.push(
        `UNVERIFIED (${hard ? 'hard' : 'soft'}): ${row.key} — target ${row.target} ${row.unit || ''}; no delivered contract quantity matches by name + unit family`.slice(0, 200),
      )
    }
  }
  const score = hardFail ? 4 : hardUnverified ? 5 : softGap ? 7 : 10
  return { name: 'brief_compliance', score, defects }
}

/**
 * Deterministic `physics_fidelity` section (advisory:false — it GATES).
 *
 * B3 EXTENDED TO THE FINDING SET (Tristan 2026-07-03): v56c vs v56d (identical code,
 * identical delivered design, fresh runs) showed the LLM critic re-rolling 3→5
 * findings and those findings leaking into scores (Risk 7.0→5.8, physics_fidelity 6,
 * floor mirrors). The fix: a critic finding may SCORE only when CORROBORATED by a
 * deterministic check over the delivered artefacts (dossier_audit.py corroboration
 * layer — rating-pair sweep / brief-vs-delivered / existence / count matchers).
 * This section scores the CORROBORATED set only:
 *
 * SCORING RULE: 0 corroborated findings → 10; each corroborated HIGH −3, each
 * corroborated MED/LOW −1; floor 2. The LLM's own 1-10 opinion (and any
 * uncorroborated notes) become ADVISORY ANNOTATIONS in defects[] — visible,
 * honest, never scored.
 */
export function buildPhysicsFidelitySection(
  corroborated: Array<{ severity: string; issue: string; where?: string }>,
  llmOpinion?: number | null,
  advisoryNoteCount?: number,
): ScorecardSection {
  const nHigh = corroborated.filter((f) => String(f.severity || '').toLowerCase() === 'high').length
  const nOther = corroborated.length - nHigh
  const score = corroborated.length === 0 ? 10 : Math.max(2, 10 - 3 * nHigh - 1 * nOther)
  const defects = corroborated.map((f) =>
    `CORROBORATED (${String(f.severity || 'med').toLowerCase()}): ${f.issue}${f.where ? ` — at ${f.where}` : ''}`.slice(0, 200),
  )
  if (typeof llmOpinion === 'number' && Number.isFinite(llmOpinion)) {
    defects.push(
      `advisory: the LLM critic's own physics opinion is ${llmOpinion}/10 — an annotation only, it never scores (B3)`.slice(0, 200),
    )
  }
  if (advisoryNoteCount && advisoryNoteCount > 0) {
    defects.push(
      `advisory: ${advisoryNoteCount} uncorroborated critic note(s) render as advisory notes — visible, never scored`.slice(0, 200),
    )
  }
  return { name: 'physics_fidelity', score, defects }
}

/**
 * Deterministic `unresolved_critic_highs` section (advisory:false — it GATES).
 *
 * Input: the physics-critic HIGH findings that SURVIVED the falsify-stale pass —
 * the exact set the Risk & Regulatory tab's audit gates on (dossier_audit.py::
 * _physics_issues + _physics_high_is_design_defect). The finder is an LLM; the
 * falsify pass de-flakes the set; COUNTING the survivors is deterministic.
 *
 * SCORING RULE (Tristan 2026-07-02): 0 HIGHs → 10; 1 → 6; ≥2 → 4.
 * defects[] carries each surviving finding's text (truncated).
 */
export function buildUnresolvedCriticHighsSection(
  findings: Array<{ issue: string; where?: string }>,
): ScorecardSection {
  const n = findings.length
  const score = n === 0 ? 10 : n === 1 ? 6 : 4
  const defects = findings.map((f) =>
    `HIGH (unresolved): ${f.issue}${f.where ? ` — at ${f.where}` : ''}`.slice(0, 200),
  )
  return { name: 'unresolved_critic_highs', score, defects }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELF-TEST (Tristan 2026-07-06) — proveCatch for both fixes above, both directions.
// Pure + dependency-free (module-local); run with `npx tsx -e` or import + call
// `scorecardFloorSelfTest()`. Throws on the first failing assertion.
// ═══════════════════════════════════════════════════════════════════════════════
export function scorecardFloorSelfTest(): { passed: number; failed: string[] } {
  const failed: string[] = []
  let total = 0
  const check = (id: string, cond: boolean, detail?: string) => {
    total += 1
    if (!cond) failed.push(detail ? `${id}: ${detail}` : id)
  }

  const KOH_BRIEF =
    'point-source flue-gas capture ... sulfate feedstock (approximately 3.1 t/day), ' +
    'potassium hydroxide (approximately 2.6 t/day), process water'
  const KOH_ROW_NEAR_MISS: ComplianceRowInput = {
    key: 'koh_feed_tpd',
    unit: 't/day',
    category: 'scale',
    target: 2.6,
    matched: 'koh_feed_t_per_day',
    achieved: 2.54,
  }

  // (1) proveCatch — CATCHES the false miss: a feedstock metric, brief-hedged
  // 'approximately', within ±5% (2.3% gap) → PASS, not FAIL.
  check(
    'feedstock_approx_relief.catches_false_miss',
    complianceRowStatus(KOH_ROW_NEAR_MISS, KOH_BRIEF) === 'PASS',
    `got ${complianceRowStatus(KOH_ROW_NEAR_MISS, KOH_BRIEF)}`,
  )

  // (2) proveCatch — does NOT relieve when the brief text carries no approximation hedge
  // at all: the SAME near-miss stays on the tight 2% band → FAIL.
  check(
    'feedstock_approx_relief.tight_band_without_hedge',
    complianceRowStatus(KOH_ROW_NEAR_MISS, 'potassium hydroxide 2.6 t/day, process water') === 'FAIL',
  )

  // (3) proveCatch — a genuinely SHORT feedstock (>5% out) still fails even though the
  // brief hedges it as approximate (the relief widens the band, it does not remove it).
  const kohFarMiss: ComplianceRowInput = { ...KOH_ROW_NEAR_MISS, achieved: 2.3 } // 11.5% short
  check(
    'feedstock_approx_relief.genuine_shortfall_still_fails',
    complianceRowStatus(kohFarMiss, KOH_BRIEF) === 'FAIL',
  )

  // (4) proveCatch — the relief is scoped to FEEDSTOCK names only: a hard capacity/
  // output performance metric with the SAME 2.3%-under miss, hedged 'approximately' in
  // the brief, stays on the tight 2% band (never widened) — proves no over-broadening.
  const hardOutputRow: ComplianceRowInput = {
    key: 'rated_output_capacity_tpd',
    unit: 't/day',
    category: 'scale',
    target: 2.6,
    matched: 'rated_output_t_per_day',
    achieved: 2.54,
  }
  check(
    'feedstock_approx_relief.scoped_to_feedstock_names_only',
    complianceRowStatus(hardOutputRow, 'rated output approximately 2.6 t/day') === 'FAIL',
  )
  check('feedstock_approx_relief.classifier_koh_is_feedstock', complianceMetricIsFeedstock('koh_feed_tpd') === true)
  check(
    'feedstock_approx_relief.classifier_capture_is_not_feedstock',
    complianceMetricIsFeedstock('co2_capture_capacity_tpd') === false,
  )

  // (5) proveCatch — the fallback matcher DISCOVERS the delivered capture quantity under
  // its real (compound-token) name and unit, turning a false UNVERIFIED into a genuine
  // PASS (the CO₂-mineralisation v6 defect: 'capture_capacity_tco2_per_day' vs the
  // brief's 'co2_capture_capacity_tpd' — 'tco2' covers 'co2' by substring).
  const quantities: Record<string, RawQuantity> = {
    capture_capacity_tco2_per_day: { value: 1, unit: 't/day' },
    co2_capture_rate_kg_per_hour: { value: 41.6666666, unit: 'kg/h' },
    koh_feed_t_per_day: { value: 2.54, unit: 't/day' },
  }
  const captureRowUnverified: ComplianceRowInput = {
    key: 'co2_capture_capacity_tpd',
    unit: 't/day',
    category: 'scale',
    target: 1,
    matched: null,
    achieved: null,
  }
  const sectionWithFallback = buildBriefComplianceSection([captureRowUnverified], { quantities })
  check(
    'fallback_matcher.discovers_delivered_capture_quantity',
    sectionWithFallback.score === 10 && (sectionWithFallback.defects || []).length === 0,
    `score=${sectionWithFallback.score} defects=${JSON.stringify(sectionWithFallback.defects)}`,
  )
  const directMatch = fallbackMatchQuantity('co2_capture_capacity_tpd', 't/day', quantities)
  check(
    'fallback_matcher.direct_call_finds_key_and_value',
    !!directMatch && directMatch.key === 'capture_capacity_tco2_per_day' && directMatch.value === 1,
    JSON.stringify(directMatch),
  )

  // (6) proveCatch — a genuinely ABSENT target stays UNVERIFIED: no quantity in the map
  // shares the identity tokens, so the fallback must return null, never guess.
  const noMatchQuantities: Record<string, RawQuantity> = {
    unrelated_pump_flow_m3h: { value: 12, unit: 'm3/h' },
    site_area_m2: { value: 4500, unit: 'm2' },
  }
  const stillUnverified = buildBriefComplianceSection([captureRowUnverified], { quantities: noMatchQuantities })
  check(
    'fallback_matcher.genuine_gap_stays_unverified',
    stillUnverified.score === 5 && (stillUnverified.defects || []).length === 1,
    `score=${stillUnverified.score}`,
  )

  // (7) proveCatch — omitting `ctx` entirely preserves the ORIGINAL behaviour byte-for-
  // byte: a null-matched row stays UNVERIFIED with no fallback attempted.
  const noCtx = buildBriefComplianceSection([captureRowUnverified])
  check('fallback_matcher.noop_when_ctx_omitted', noCtx.score === 5 && (noCtx.defects || []).length === 1)

  // (8) proveCatch — the fallback never fires on a row the upstream matcher already
  // resolved (matched != null); it must not override an existing PASS/FAIL.
  const alreadyMatched: ComplianceRowInput = {
    key: 'ro_permeate_capacity',
    unit: 'm3/h',
    category: 'scale',
    target: 8,
    matched: 'ro_permeate_capacity_m3_h',
    achieved: 3,
  }
  const decoyQuantities: Record<string, RawQuantity> = { ro_permeate_capacity_m3_h_alt: { value: 8, unit: 'm3/h' } }
  const overrideAttempt = buildBriefComplianceSection([alreadyMatched], { quantities: decoyQuantities })
  check(
    'fallback_matcher.never_overrides_upstream_match',
    overrideAttempt.score === 4 && (overrideAttempt.defects || []).length === 1,
    `score=${overrideAttempt.score}`,
  )

  // (9) proveCatch — SCORECARD HONESTY dedup (Tristan 2026-07-08): a self-audit
  // (advisory) opinion and a deterministic FACT section sharing the same name merge
  // into ONE row, taking the deterministic score as canonical and folding the LLM's
  // opinion into defects as a visible annotation — never a second silent row.
  const dedupedMixed = dedupeScorecardSections([
    { name: 'brief_compliance', score: 5, defects: ['6 unverified constraints'], advisory: true },
    { name: 'brief_compliance', score: 10, defects: [] },
  ])
  check(
    'dedupe.mixed_advisory_and_deterministic_merges_to_one_row',
    dedupedMixed.length === 1 &&
      dedupedMixed[0]?.score === 10 &&
      dedupedMixed[0]?.advisory === false &&
      !!dedupedMixed[0]?.defects?.some((d) => d.includes('advisory:') && d.includes('5/10')),
    JSON.stringify(dedupedMixed),
  )

  // (10) proveCatch — a collision between two DETERMINISTIC entries for the same name
  // (never expected today, but the rule must hold universally) takes the WORST score,
  // never the best — a real defect can never be hidden by a later better-looking push.
  const dedupedDeterministic = dedupeScorecardSections([
    { name: 'physics_gates', score: 7, defects: ['finding A'] },
    { name: 'physics_gates', score: 10, defects: [] },
  ])
  check(
    'dedupe.two_deterministic_entries_take_the_worst_score',
    dedupedDeterministic.length === 1 && dedupedDeterministic[0].score === 7,
    JSON.stringify(dedupedDeterministic),
  )

  // (11) proveCatch — two ADVISORY entries for the same name (no deterministic
  // counterpart at all) merge honestly to the worst score, staying advisory.
  const dedupedAdvisoryOnly = dedupeScorecardSections([
    { name: 'headline', score: 9, defects: [], advisory: true },
    { name: 'headline', score: 6, defects: ['blank metric'], advisory: true },
  ])
  check(
    'dedupe.two_advisory_entries_take_the_worst_score_stays_advisory',
    dedupedAdvisoryOnly.length === 1 && dedupedAdvisoryOnly[0].score === 6 && dedupedAdvisoryOnly[0].advisory === true,
    JSON.stringify(dedupedAdvisoryOnly),
  )

  // (12) proveCatch — a unique name (no collision) passes through UNCHANGED, and the
  // HONEST floor (min across every deduped section, deterministic AND advisory) never
  // hides an advisory sub-9 behind a higher deterministic floor — the exact masking
  // Tristan caught (bill_of_materials=8 advisory, reported floor=9 deterministic-only).
  const mixedScorecard = dedupeScorecardSections([
    { name: 'headline', score: 9, defects: [], advisory: true },
    { name: 'bill_of_materials', score: 8, defects: ['4 unpriced lines'], advisory: true },
    { name: 'connectivity', score: 9, defects: [] },
    { name: 'drawing_gates', score: 10, defects: [] },
  ])
  const honestFloor = Math.min(...mixedScorecard.map((s) => s.score))
  const { floor: deterministicOnlyFloor } = computeScorecardFloor(mixedScorecard)
  check(
    'dedupe.unique_names_pass_through_unchanged',
    mixedScorecard.length === 4,
    JSON.stringify(mixedScorecard.map((s) => s.name)),
  )
  check(
    'honest_floor.advisory_sub9_not_masked_by_deterministic_floor',
    honestFloor === 8 && deterministicOnlyFloor === 9 && honestFloor < deterministicOnlyFloor,
    `honestFloor=${honestFloor} deterministicOnlyFloor=${deterministicOnlyFloor}`,
  )

  // (13) proveCatch — Why-now-only design_narrative must NOT drag the honest ship floor
  // (Tristan 2026-07-09: keep the paragraph, do not fail the system off it).
  const withWhyNowOnly = [
    { name: 'connectivity', score: 9, defects: [] as string[] },
    { name: 'drawing_gates', score: 10, defects: [] as string[] },
    {
      name: 'design_narrative',
      score: 6,
      defects: ['Why now paragraph is generic boilerplate'],
      advisory: true,
    },
  ]
  const ship = computeHonestShipFloor(withWhyNowOnly)
  check(
    'ship_floor.why_now_only_does_not_drag_floor_below_8',
    ship.floor >= 9 && ship.allPass === true && shipGatingScore(withWhyNowOnly[2]) === 10,
    JSON.stringify(ship),
  )
  // A design_narrative with a REAL engineering defect still drags the floor.
  const withRealDefect = [
    { name: 'connectivity', score: 9, defects: [] as string[] },
    {
      name: 'design_narrative',
      score: 5,
      defects: ['Module overview invents a heat pump the brief never asked for'],
      advisory: true,
    },
  ]
  const shipReal = computeHonestShipFloor(withRealDefect)
  check(
    'ship_floor.real_narrative_defect_still_drags_floor',
    shipReal.floor === 5 && shipReal.allPass === false,
    JSON.stringify(shipReal),
  )

  // (14) proveCatch — closure honesty: all-TBD docks to ≤3; closed = 10; gates ship floor
  const allTbdHonesty = buildClosureHonestySection({
    score: 2,
    fillable_tbd: 12,
    defects: ['Per Channel Precision Afe is TBD while ledger carries channel_count=8'],
  })
  check(
    'closure_honesty.all_tbd_is_defect_not_disclosure',
    allTbdHonesty.name === 'closure_honesty'
      && allTbdHonesty.advisory === false
      && allTbdHonesty.score <= 3
      && (allTbdHonesty.defects?.length ?? 0) >= 1,
    JSON.stringify(allTbdHonesty),
  )
  const closedHonesty = buildClosureHonestySection({ score: 10, fillable_tbd: 0, defects: [] })
  check(
    'closure_honesty.closed_slots_score_10',
    closedHonesty.score === 10 && closedHonesty.advisory === false,
    JSON.stringify(closedHonesty),
  )
  const shipWithTbd = computeHonestShipFloor([
    { name: 'brief_compliance', score: 10, defects: [] },
    allTbdHonesty,
  ])
  check(
    'closure_honesty.docks_honest_ship_floor',
    shipWithTbd.floor <= 3 && shipWithTbd.allPass === false,
    JSON.stringify(shipWithTbd),
  )

  // (15) proveCatch — *_max_rpm is a speed CEILING (MGU illustrative band / FIA).
  // Design base 40k under illustrative max 50k must PASS, not FAIL higher-is-better.
  check(
    'ceiling_metric.illustrative_base_speed_max_rpm_under_is_pass',
    complianceRowStatus({
      key: 'illustrative_mgu_base_speed_max_rpm',
      unit: 'rpm',
      target: 50000,
      matched: 'mgu_base_speed_rpm',
      achieved: 40000,
    }) === 'PASS',
  )
  check(
    'ceiling_metric.max_rotor_speed_under_is_pass',
    complianceRowStatus({
      key: 'max_rotor_speed_rpm',
      unit: 'rpm',
      target: 100000,
      matched: 'mgu_base_speed_rpm',
      achieved: 40000,
    }) === 'PASS',
  )
  check(
    'ceiling_metric.max_rpm_over_ceiling_still_fails',
    complianceRowStatus({
      key: 'illustrative_mgu_base_speed_max_rpm',
      unit: 'rpm',
      target: 50000,
      matched: 'mgu_base_speed_rpm',
      achieved: 60000,
    }) === 'FAIL',
  )
  check(
    'ceiling_metric.gear_ratio_max_under_is_pass',
    complianceRowStatus({
      key: 'gear_ratio_max',
      unit: 'ratio',
      target: 12,
      matched: 'gear_ratio',
      achieved: 8,
    }) === 'PASS',
  )
  // car_level must NOT bind rear_electrical — stay UNVERIFIED (honest context).
  const carLevel = fallbackMatchQuantity('car_level_battery_power_cap_kw', 'kW', {
    rear_electrical_power_cap_kw: { value: 350, unit: 'kW' },
    rear_axle_electrical_power_kw: { value: 350, unit: 'kW' },
  })
  check(
    'scope_gate.car_level_does_not_bind_rear_axle',
    carLevel === null,
    JSON.stringify(carLevel),
  )

  return { passed: total - failed.length, failed }
}
