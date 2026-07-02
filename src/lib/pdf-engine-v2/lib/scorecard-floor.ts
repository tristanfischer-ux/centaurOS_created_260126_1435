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

/**
 * PASS/FAIL/UNVERIFIED for one compliance row — an exact mirror of the direction +
 * tolerance logic the workbook renders (build-excel-export.py::
 * _render_brief_compliance_section): HIGHER-is-better by default; LOWER-is-better only
 * for genuine minimise targets (FCR / feed-conversion / duration / lead-time / LCOE /
 * cost-per / cycle TIME — never cycle LIFE); tolerance ±2% of target.
 */
export function complianceRowStatus(row: ComplianceRowInput): ComplianceStatus {
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
  const tol = row.target ? Math.abs(row.target) * 0.02 : 0
  const passed = lowerBetter
    ? row.achieved <= row.target + tol
    : row.achieved >= row.target - tol
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
 */
export function buildBriefComplianceSection(rows: ComplianceRowInput[]): ScorecardSection {
  const defects: string[] = []
  let hardFail = false
  let hardUnverified = false
  let softGap = false
  for (const row of rows) {
    const status = complianceRowStatus(row)
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
