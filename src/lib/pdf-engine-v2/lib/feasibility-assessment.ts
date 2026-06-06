/**
 * src/lib/pdf-engine-v2/lib/feasibility-assessment.ts
 *
 * Deterministic TECHNICAL-FEASIBILITY generator (2026-06-03). The council scores
 * the `feasibility_notes` section against the rubric "cost verdict, top 3
 * technical risks with severity, regulatory flags, manufacturing flags". The
 * Risk page rendered only the CLASS-LEVEL hazard register (generic for the
 * class) — it never pulled the design's ACTUAL engineering, so CO₂ scored 7.5:
 * the section read as boilerplate risk rather than a feasibility verdict on THIS
 * design.
 *
 * This synthesises a feasibility assessment from data the chain already
 * computed:
 *   • cost verdict          ← state.cost_reality (verdict + BoM total vs ceiling)
 *   • proven engineering     ← state.orchestratorContract.quantities (the tool
 *                              outputs: duties, energies, safety factors, margins)
 *   • top technical risks    ← state.physicsCritique.issues (HIGH/MED, severity +
 *                              the engine's own suggested mitigation)
 *   • regulatory flags       ← parsedBrief.constraints.safety_standards +
 *                              complianceGate
 *   • manufacturing flags    ← parsedBrief.constraints.additional_constraints +
 *                              batch_size (grade / purity / packaging / batch)
 *
 * Pure + deterministic; no LLM. Each block is emitted only when its source data
 * is present, so it is universal across product classes — any class that ran the
 * orchestrator + physics critic gets a substantive feasibility section.
 */

export interface FeasibilityRisk {
  severity: 'high' | 'med' | 'low'
  title: string
  detail: string
  mitigation: string
}

export interface FeasibilityProvenMargin {
  label: string
  value: string
}

export interface FeasibilityAssessment {
  /** One-line verdict on whether the design is buildable as costed. */
  cost_verdict: string
  /** "What is proven" — the engineering the tools have actually closed. */
  proven_summary: string
  proven_margins: FeasibilityProvenMargin[]
  /** Top technical risks (severity-ranked, with the engine's mitigation). */
  risks: FeasibilityRisk[]
  /** Regulatory directives / standards the design is bound by. */
  regulatory_flags: string[]
  /** Manufacturing constraints (grade, purity, packaging, batch). */
  manufacturing_flags: string[]
  /** True when there is enough to render a meaningful section. */
  has_content: boolean
}

// ── number helpers ────────────────────────────────────────────────────────────

function num(x: any): number | null {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : null
}

/** Read a quantity's numeric value from the orchestrator contract (handles the
 *  { value, unit } envelope and bare numbers). */
function qVal(quantities: any, key: string): { value: number; unit: string } | null {
  const q = quantities?.[key]
  if (q == null) return null
  if (typeof q === 'object') {
    const v = num(q.value)
    if (v == null) return null
    return { value: v, unit: String(q.unit ?? '') }
  }
  const v = num(q)
  return v == null ? null : { value: v, unit: '' }
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 100) return String(Math.round(n))
  if (Math.abs(n) >= 10) return n.toFixed(1)
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

function fmtGbp(n: number): string {
  if (n >= 1e6) return `£${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `£${Math.round(n / 1e3)}k`
  return `£${Math.round(n)}`
}

function firstSentence(s: string): string {
  const t = String(s ?? '').trim()
  if (!t) return ''
  // Terminal punctuation = . ! ? followed by a space/end — but NOT a decimal
  // point inside a number (2.591 m) or an abbreviation period mid-token. The
  // lookbehind/lookahead require a non-digit before a '.' and whitespace-or-end
  // after, so "2591 mm (2.591 m)." stays whole instead of cutting at "(2".
  const m = t.match(/^.*?[.!?](?=\s|$)/)
  let out = (m ? m[0] : t).trim()
  // If the match ended on a decimal point (digit '.' digit), it was a false
  // boundary — fall back to the first hard boundary or the whole string.
  if (/\d\.$/.test(out)) {
    const m2 = t.match(/^.*?[.!?](?=\s+[A-Z(]|$)/)
    out = (m2 ? m2[0] : t).trim()
  }
  return out
}

function clip(s: string, n: number): string {
  const t = String(s ?? '').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

// ── cost verdict ──────────────────────────────────────────────────────────────

function buildCostVerdict(state: any): string {
  const cr = state?.cost_reality ?? {}
  // Cost SINGLE-SOURCE-OF-TRUTH (2026-06-03): the ex-works figure the cover
  // prints is costStack.oem_transfer_price_gbp (raw materials + labour +
  // overhead + manufacturer margin), NOT the raw materials BoM total. Prefer
  // it so the feasibility narrative, the cover cost-stack, and the gate-32
  // cost-sanity audit all quote ONE ex-works number. Fall back to the raw
  // cost_reality.bom_total_gbp only when the cost stack was not persisted
  // (older state files / classes where the stack could not be resolved).
  const exWorks = num(state?.costStack?.oem_transfer_price_gbp)
  const total = exWorks ?? num(cr.bom_total_gbp)
  const verdict = String(cr.verdict ?? '').toLowerCase()
  const ceiling = num(state?.parsedBrief?.constraints?.unit_cost_ceiling?.value)
  if (total == null) {
    return 'The bill of materials has not been priced, so no cost verdict can be given yet; firm quotations against the named manufacturers are the next step.'
  }
  // The master BoM table totals the raw-materials parts (cr.bom_total_gbp); the
  // ex-works figure (total) adds manufacturing, labour, overhead and margin. State
  // BOTH when they differ so the BoM table total and this verdict reconcile visibly,
  // rather than reading as two contradictory totals for the same priced lines.
  const bomParts = num(cr.bom_total_gbp)
  let s: string
  if (bomParts != null && bomParts > 0 && Math.abs(bomParts - total) > total * 0.02) {
    s = `The priced bill of materials totals ${fmtGbp(bomParts)}`
    if (cr.priced_lines != null) {
      s += ` across ${cr.priced_lines} priced line${Number(cr.priced_lines) === 1 ? '' : 's'}`
      if (num(cr.unpriced_lines)) s += ` (${cr.unpriced_lines} line${Number(cr.unpriced_lines) === 1 ? '' : 's'} still to quote)`
    }
    s += `; the fully-costed design reaches ${fmtGbp(total)} ex-works (parts plus manufacturing, labour and margin).`
  } else {
    s = `The priced bill of materials rolls up to ${fmtGbp(total)} ex-works`
    if (cr.priced_lines != null) {
      s += ` across ${cr.priced_lines} priced line${Number(cr.priced_lines) === 1 ? '' : 's'}`
      if (num(cr.unpriced_lines)) s += ` (${cr.unpriced_lines} line${Number(cr.unpriced_lines) === 1 ? '' : 's'} still to quote)`
    }
    s += '.'
  }
  if (ceiling != null && ceiling > 0) {
    const ratio = total / ceiling
    if (ratio <= 1.05) {
      s += ` That is within the ${fmtGbp(ceiling)} brief cost ceiling (${Math.round(ratio * 100)}% of ceiling).`
    } else {
      s += ` That is ${ratio.toFixed(1)}× the ${fmtGbp(ceiling)} brief cost ceiling — the cost target is not met at this scope and must be designed down or the ceiling revisited.`
    }
  }
  if (verdict === 'pass') {
    s += ' The order-of-magnitude check passes: the total is consistent with comparable plants of this class.'
  } else if (verdict === 'fail' || verdict === 'reject') {
    s += ' The order-of-magnitude check FAILS: the total diverges from comparable plants and should be re-estimated before procurement.'
  }
  return s
}

// ── proven engineering (from contract quantities) ─────────────────────────────

// A small, universal whitelist of "headline" engineering quantities. Each entry
// is emitted only if present, so classes that don't compute a given quantity
// simply skip it. Labels are reader-facing; the key is the contract quantity.
const PROVEN_KEYS: Array<{ key: string; label: string; unit?: string }> = [
  { key: 'reboiler_duty_kw', label: 'Reboiler duty' },
  { key: 'cross_exchanger_duty_kw', label: 'Lean/rich cross-exchanger duty' },
  { key: 'condenser_duty_kw', label: 'Overhead condenser duty' },
  { key: 'regeneration_energy_kwh_per_t_co2', label: 'Solvent regeneration energy' },
  { key: 'regeneration_heat_demand_gj_per_t_co2', label: 'Reboiler heat demand' },
  { key: 'co2_capture_efficiency_pct', label: 'Design capture efficiency' },
  { key: 'carbonation_conversion_pct', label: 'Carbonation conversion' },
  { key: 'reactor_agitator_power_w', label: 'Reactor agitator power' },
  { key: 'reactor_yield_safety_factor', label: 'Reactor vessel yield safety factor', unit: '×' },
  { key: 'cp_protection_current_a', label: 'Cathodic-protection current' },
  { key: 'cp_anode_replacement_interval_years', label: 'Sacrificial-anode replacement interval' },
  { key: 'fire_agent_mass_kg', label: 'Clean-agent fire charge' },
  { key: 'ph_loop_phase_margin_deg', label: 'pH-control-loop phase margin' },
  { key: 'plant_sound_pressure_at_10m_dba', label: 'Sound pressure at 10 m' },
  { key: 'plant_lifecycle_co2_t', label: 'Cradle-to-grave plant CO₂' },
  { key: 'mass_budget_utilisation_pct', label: 'Road-envelope mass-budget utilisation' },
  { key: 'total_plant_mass_kg', label: 'Total plant mass' },
]

function buildProvenMargins(quantities: any): FeasibilityProvenMargin[] {
  const out: FeasibilityProvenMargin[] = []
  for (const { key, label, unit } of PROVEN_KEYS) {
    const q = qVal(quantities, key)
    if (!q) continue
    const u = unit ?? q.unit
    out.push({ label, value: `${fmtNum(q.value)}${u ? ` ${u}` : ''}`.trim() })
    if (out.length >= 12) break
  }
  return out
}

// 2026-06-06 (FIX 6): readable name for a tool-id, derived from the id itself so
// the proven-engineering summary can name the tools that ACTUALLY ran rather than
// a hardcoded catalogue. The id is "<domain>:<variant>" (e.g.
// "reaction:cstr-pfr-sizing", "ht:ntu-heat-exchanger", "lifecycle-co2:assessment").
// We take the variant (or the whole id when there's no colon), turn separators
// into spaces, and apply a few readability fixups. Pure, dependency-free.
function toolIdToReadable(toolId: string): string {
  const raw = String(toolId ?? '').trim()
  if (!raw) return ''
  const afterColon = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw
  let s = afterColon.replace(/[-_:]+/g, ' ').trim()
  // Common abbreviations → readable, applied as whole words.
  s = s
    .replace(/\bcstr pfr\b/gi, 'reactor')
    .replace(/\bntu\b/gi, 'heat-exchanger')
    .replace(/\bnpv\b/gi, 'economics')
    .replace(/\bco2\b/gi, 'CO₂')
    .replace(/\bfmea\b/gi, 'reliability')
    .replace(/\bcert\b/gi, 'certification')
  return s
}

// Build a concise, DE-DUPLICATED phrase listing the kinds of analysis that ran,
// from the actual tool-id list. Caps the phrase length so the sentence stays
// readable. Empty string when no tools ran.
function describeToolsRun(toolIds: string[]): string {
  const names = Array.from(new Set(toolIds.map(toolIdToReadable).filter(Boolean)))
  if (names.length === 0) return ''
  const shown = names.slice(0, 8)
  const more = names.length - shown.length
  const list = shown.join(', ')
  return more > 0 ? `${list}, and ${more} more` : list
}

function buildProvenSummary(quantities: any, toolCount: number, toolIds: string[]): string {
  const n = quantities ? Object.keys(quantities).length : 0
  if (n === 0) {
    return 'The core engineering quantities for this design have not yet been computed by the analysis tools.'
  }
  let s = `The design is grounded in ${n} engineering quantit${n === 1 ? 'y' : 'ies'} computed by`
  s += toolCount > 0 ? ` ${toolCount} validated analysis tools` : ' the analysis tool chain'
  // 2026-06-06 (FIX 6): name the tools that ACTUALLY ran (from _tools_run), not a
  // hardcoded CO₂-mineralisation catalogue. The old static list ("agitation
  // power, corrosion/cathodic-protection, fire-suppression …") leaked tools that
  // never ran on, e.g., the e_fuel SAF plant. Class-neutral + truthful.
  const toolsPhrase = describeToolsRun(toolIds)
  s += toolsPhrase
    ? ` (${toolsPhrase}), so the thermal duties, structural margins and energy demands below are calculated rather than assumed.`
    : ', so the thermal duties, structural margins and energy demands below are calculated rather than assumed.'
  return s
}

// ── technical risks (from physics critic) ─────────────────────────────────────

function normSeverity(s: any): 'high' | 'med' | 'low' {
  const t = String(s ?? '').toLowerCase()
  if (t.startsWith('h')) return 'high'
  if (t.startsWith('m')) return 'med'
  return 'low'
}

const SEV_RANK: Record<string, number> = { high: 0, med: 1, low: 2 }

// Non-physical META-FINDINGS that the Physics Critic occasionally emits about the
// DATA/PIPELINE/MODEL rather than the physical plant — e.g. "the design JSON
// payload is truncated… invalid JSON… missing structural details". These are
// artefacts of how the design was serialised/generated, NOT engineering risks of
// the built plant, so they must NEVER surface in the customer-facing risk register.
// Universal across every product class: drop any issue whose text OR title matches.
// Exported so the renderer can apply the SAME guard to the per-module "Engineering
// check" annotations, which read state.physicsCritique.issues directly.
export const META_FINDING_RE = /json|payload|truncat|parse|parsing|pipeline|schema|invalid syntax|missing structural details|design generation|design generator|serialis|serializ|\bthe model\b|\bllm\b/i

export function isPhysicalRisk(i: any): boolean {
  const haystack = `${String(i?.issue ?? '')} ${String(i?.dimension ?? '')} ${String(i?.suggested_check ?? i?.suggested_fix ?? '')}`
  return !META_FINDING_RE.test(haystack)
}

function buildRisks(state: any): FeasibilityRisk[] {
  const rawIssues = Array.isArray(state?.physicsCritique?.issues) ? state.physicsCritique.issues : []
  // Filter out non-physical meta-findings (pipeline/data/model artefacts) before
  // ranking — they are not plant risks and must not reach the rendered register.
  const issues = rawIssues.filter(isPhysicalRisk)
  const risks: FeasibilityRisk[] = issues.map((i: any): FeasibilityRisk => {
    // Caps are generous (not layout limits — react-pdf wraps freely): they exist
    // only to bound a pathological run-on, NOT to truncate a Physics-Critic
    // sentence mid-thought. Raised 2026-06-04 (CO₂ risk-section truncation) so
    // full sentences render — the boiler/centrifuge findings were cut at "~275…".
    const detail = clip(String(i?.issue ?? ''), 700)
    const mitigation = clip(String(i?.suggested_check ?? i?.suggested_fix ?? ''), 500)
    // Title = the dimension, humanised, as a short risk heading.
    const dim = String(i?.dimension ?? 'engineering').replace(/_/g, ' ')
    const title = firstSentence(detail) || dim
    return { severity: normSeverity(i?.severity), title: title.replace(/\.$/, ''), detail, mitigation }
  })
  risks.sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))
  return risks.slice(0, 3)
}

// ── regulatory + manufacturing flags ──────────────────────────────────────────

function buildRegulatoryFlags(state: any): string[] {
  const out: string[] = []
  const ss = Array.isArray(state?.parsedBrief?.constraints?.safety_standards) ? state.parsedBrief.constraints.safety_standards : []
  for (const s of ss) {
    const code = String(s?.code ?? '').trim()
    const name = String(s?.standard ?? '').trim()
    if (!code && !name) continue
    out.push(code && name ? `${code} — ${name}` : code || name)
  }
  // Compliance-gate verdict adds context when it flagged the class.
  // 2026-06-04: the gate's WARN reason for an unregistered class is a DEV-facing
  // string ("No class-standards registered for '…'. Compliance check skipped …")
  // that leaked the internal registry concept into the customer-facing Risk
  // page — and contradicted the populated standards table on the Regulatory
  // page. Reword the no-registry case to a customer-facing line (no source-file
  // / registry reference); pass through any other genuine WARN reason verbatim.
  const cg = state?.complianceGate
  if (cg && String(cg.verdict ?? '').toUpperCase() === 'WARN' && cg.reason) {
    const reason = String(cg.reason)
    const isNoRegistry = /class-standards|No class-standards registered|No regulatory standards registered/i.test(reason)
    out.push(
      isNoRegistry
        ? 'No standing class-wide standards profile applies; the standards listed are those declared in the brief and must be verified by a qualified engineer before sale.'
        : `Compliance check: ${clip(reason, 400)}`,
    )
  }
  // De-duplicate, cap.
  return Array.from(new Set(out)).slice(0, 8)
}

// Keywords that mark a brief constraint as a MANUFACTURING flag (as opposed to a
// pure performance target). Universal: grade/purity, packaging, batch, finish.
const MFG_RE = /grade|purity|pure\b|free\b|chloride|fertiliser|fertilizer|filler|food|pharma|bag|bagg|packag|pallet|finish|coating|cleanlin|closed.?loop|recover|recrystall|tolerance|surface|weld|certif/i

function buildManufacturingFlags(state: any): string[] {
  const out: string[] = []
  const ac = Array.isArray(state?.parsedBrief?.constraints?.additional_constraints) ? state.parsedBrief.constraints.additional_constraints : []
  for (const c of ac) {
    const d = String(c?.description ?? c ?? '').trim()
    if (!d) continue
    if (MFG_RE.test(d)) out.push(clip(d, 400))
  }
  const batch = num(state?.parsedBrief?.constraints?.batch_size?.value)
  if (batch != null && batch > 0) {
    out.push(`Production batch size: ${batch} unit${batch === 1 ? '' : 's'} — sets the procurement quantity and the per-unit tooling/NRE amortisation.`)
  }
  return out.slice(0, 6)
}

// ── top-level builder ─────────────────────────────────────────────────────────

export function buildFeasibilityAssessment(state: any): FeasibilityAssessment {
  const quantities = state?.orchestratorContract?.quantities ?? state?.engineeringContract?.quantities ?? null
  // 2026-06-06 (FIX 6): the actual tool-id list the chain ran — used to NAME the
  // tools in the proven-engineering summary instead of a hardcoded catalogue.
  // Prefer orchestratorContract._tools_run; fall back to the toolsUsedPage ids.
  const toolIds: string[] = Array.isArray(state?.orchestratorContract?._tools_run)
    ? state.orchestratorContract._tools_run.map((t: any) => String(t))
    : Array.isArray(state?.toolsUsedPage?.tools)
      ? state.toolsUsedPage.tools.map((t: any) => String(t?.tool_id ?? '')).filter(Boolean)
      : []
  const toolCount = toolIds.length

  const cost_verdict = buildCostVerdict(state)
  const proven_margins = buildProvenMargins(quantities)
  const proven_summary = buildProvenSummary(quantities, toolCount, toolIds)
  const risks = buildRisks(state)
  const regulatory_flags = buildRegulatoryFlags(state)
  const manufacturing_flags = buildManufacturingFlags(state)

  // Meaningful section needs at least proven engineering OR risks OR a real
  // priced cost verdict — otherwise there is nothing design-specific to say.
  const has_content =
    proven_margins.length > 0 ||
    risks.length > 0 ||
    (num(state?.cost_reality?.bom_total_gbp) != null) ||
    regulatory_flags.length > 0

  return {
    cost_verdict,
    proven_summary,
    proven_margins,
    risks,
    regulatory_flags,
    manufacturing_flags,
    has_content,
  }
}
