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
  const lowerBetter =
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
  let best: { overlap: number; key: string; value: number } | null = null
  for (const [qname, qv] of Object.entries(quantities || {})) {
    if (!qv || typeof qv !== 'object') continue
    if (ECHO_NAME_TOKEN_RX.test(qname)) continue
    if (normUnit(qv.unit) !== targetUnit) continue
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
  const check = (id: string, cond: boolean, detail?: string) => {
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

  return { passed: 8 - failed.length, failed }
}
