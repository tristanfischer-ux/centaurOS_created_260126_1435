/**
 * Sizing-vs-design audit (universal — runs for every chain, every class).
 *
 * Root cause it addresses: deterministic-emitter.ts has HARDCODED current /
 * voltage / power ratings for many components (e.g. "100 A" for an AC filter
 * inductor) that should be CALCULATED from the design's continuous load. The
 * design parameters live in `state.orchestratorContract.quantities`
 * (bus_continuous_current_a, continuous_power_kw, dc_bus_voltage_v, ...) but
 * the emitter doesn't read them when setting ratings on individual words.
 *
 * BESS L18 example caught by Physics Critic (gate 1):
 *   - PCS continuous power = 1000 kW @ 400 V 3-phase AC
 *   - I_continuous = 1,000,000 / (400 × √3) = 1443 A continuous
 *   - Required AC component rating (UL 489 / IEC 60947-2): 1.25 × 1443 = 1804 A
 *   - Emitted pcs_filter_inductor_word: rating_primary = "100 A" — undersized 14.4×
 *
 * The sizing audit walks every word with a current rating, traces back through
 * sub_module → module → design parameters, computes the EXPECTED rating
 * (continuous load × safety factor), and flags any word whose rating is
 * < the expected value. Universal across all 35 archetypes — adding new slot
 * patterns extends coverage class by class without touching this audit.
 *
 * Distinct from parts-spec-validator (gate 13):
 *   - parts-spec validator catches WRONG SPEC CLAIM (e.g. Schaltbau C310
 *     claimed 1500 A but real datasheet says 500 A). The part exists but the
 *     emitter lied about its spec.
 *   - sizing audit catches UNDERSIZED component (e.g. AC filter inductor
 *     claimed 100 A but design needs 1804 A continuous). The emitter is
 *     honest about the part's spec; the part is simply too small for the load.
 *
 * Both gates are needed. The parts validator catches over-claims; the sizing
 * audit catches under-specs.
 */

import { readFileSync } from 'node:fs'

// ── SLOT-SIZING RULES ────────────────────────────────────────────────────────
// Each rule matches one or more sub-module IDs by regex and specifies the
// continuous-load source (a design parameter OR a power-voltage formula) plus
// a safety factor. Add new rules per class as new slots get pinned in
// deterministic-emitter.ts.

export interface SlotSizingRule {
  /** Match a sub_module by id (case-insensitive). */
  match_sub_module: RegExp
  /** Optional word-id EXCLUSION — words whose id matches this regex are
   * skipped by this rule (e.g. pre-charge contactors carry only inrush
   * current, not bus continuous; they should not be sized against bus_
   * continuous_current_a). */
  exclude_word_id?: RegExp
  /** Continuous-load source. First entry takes precedence; if missing, falls
   * through to the next. Allows class-agnostic defaults + class overrides. */
  continuous_load_source: Array<
    | { design_param: string }
    | { compute_ac_from: { power_param: string; voltage_v: number } }
  >
  /** Safety multiplier (IEC 60947-2 + UL 489 + UL 9540A default 1.25). */
  safety_factor: number
  /** Optional class restriction — if set, rule only applies when state's
   * product_class matches. */
  applies_to_classes?: string[]
  /** Human-readable explanation for the audit report. */
  description: string
}

export const SIZING_RULES: SlotSizingRule[] = [
  // BESS DC bus / main contactor / DC switchgear → bus_continuous_current_a
  // EXCLUDES: pre-charge contactors (carry inrush current only, sized ~100 A
  // for capacitor-bank pre-charge timing), busbar (sized by ampacity not by
  // bus continuous current), isolation monitor (low-current measurement).
  {
    match_sub_module: /dc_distribution|dc_bus|main_bus|dc_switchgear/i,
    exclude_word_id: /precharge|pre_charge|inrush|busbar|iso_?monitor|isolation_monitor/i,
    continuous_load_source: [{ design_param: 'bus_continuous_current_a' }],
    safety_factor: 1.25,
    applies_to_classes: ['energy_storage', 'bess', 'solar_inverter', 'ev_charger'],
    description:
      'DC bus + main contactor + DC HRC fuse components must be sized to ≥ 1.25 × bus_continuous_current_a (IEC 60947-2 + UL 9540A 13.2.4 for utility BESS). Pre-charge contactors (inrush only), busbars (sized by ampacity), and isolation monitors (low-current measurement) are excluded — they have separate sizing rules.',
  },
  // BESS AC switchgear / PCS inverter output side / AC filter →
  // continuous current computed from continuous_power_kw at 400 V 3-phase.
  {
    match_sub_module: /ac_switchgear|pcs_inverter|grid_pcc|ac_filter|ac_breaker/i,
    continuous_load_source: [
      { compute_ac_from: { power_param: 'continuous_power_kw', voltage_v: 400 } },
    ],
    safety_factor: 1.25,
    applies_to_classes: ['energy_storage', 'bess', 'solar_inverter', 'ev_charger'],
    description:
      'AC switchgear + filter + breaker components must be sized to ≥ 1.25 × AC continuous current. AC continuous current = continuous_power_kw × 1000 / (400 V × √3) for LV (400 V 3-phase) systems. UL 489 + IEC 60947-2 mandate 125 % margin for continuous duty.',
  },
  // BESS string / rack / per-rack distribution → string_continuous_current_a
  {
    match_sub_module: /^string_|_per_rack|rack_distribution|cell_string|pre_charge/i,
    continuous_load_source: [{ design_param: 'string_continuous_current_a' }],
    safety_factor: 1.25,
    applies_to_classes: ['energy_storage', 'bess'],
    description:
      'String-level + per-rack DC components must be sized to ≥ 1.25 × string_continuous_current_a per rack.',
  },
]

// ── COLLECTORS ───────────────────────────────────────────────────────────────

interface EmittedRating {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  claimed_a: number
}

function parseCurrentA(value: string): number | null {
  if (typeof value !== 'string') return null
  // Allow "1500 A", "1500A", "1,500 A continuous", "±300 A peak"
  const cleaned = value.replace(/,(?=\d{3}\b)/g, '')
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*A\b/i)
  return m ? parseFloat(m[1]) : null
}

function collectEmittedRatings(state: any): EmittedRating[] {
  const out: EmittedRating[] = []
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  for (const m of modules) {
    const moduleId = String(m?.module ?? m?.id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subId = String(sm?.id ?? sm?.sub_module_id ?? 'unknown')
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const mods: any[] = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        // Try rating_primary, then capacity (must be A-unit), then dimension (A-unit).
        let claimedA: number | null = null
        for (const kind of ['rating_primary', 'capacity', 'dimension']) {
          const mod = mods.find((mc) => mc.kind === kind)
          if (!mod) continue
          const a = parseCurrentA(String(mod.value))
          if (a != null) {
            claimedA = a
            break
          }
        }
        if (claimedA == null) continue
        const wordId = String(w?.id ?? w?.content_character?.character_id ?? 'unknown')
        const nameHuman = String(w?.name_human ?? w?.content_character?.name_human ?? wordId)
        out.push({
          word_id: wordId,
          word_name_human: nameHuman,
          module_id: moduleId,
          sub_module_id: subId,
          claimed_a: claimedA,
        })
      }
    }
  }
  return out
}

// ── EXPECTED LOAD COMPUTATION ────────────────────────────────────────────────

interface DesignContext {
  product_class: string
  quantities: Record<string, number>
}

function buildContext(state: any): DesignContext {
  const product_class =
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    state?.classify?.product_class ??
    'unknown'
  const quantities: Record<string, number> = {}
  const q = state?.orchestratorContract?.quantities
  if (q && typeof q === 'object') {
    for (const [k, v] of Object.entries(q as Record<string, any>)) {
      if (v && typeof v === 'object' && typeof v.value === 'number' && Number.isFinite(v.value)) {
        quantities[k] = v.value
      }
    }
  }
  return { product_class: String(product_class), quantities }
}

function expectedLoadFromRule(rule: SlotSizingRule, ctx: DesignContext): number | null {
  for (const source of rule.continuous_load_source) {
    if ('design_param' in source) {
      const v = ctx.quantities[source.design_param]
      if (typeof v === 'number' && v > 0) return v
    } else if ('compute_ac_from' in source) {
      const p_kw = ctx.quantities[source.compute_ac_from.power_param]
      const v_ac = source.compute_ac_from.voltage_v
      if (typeof p_kw === 'number' && p_kw > 0 && v_ac > 0) {
        return (p_kw * 1000) / (v_ac * Math.sqrt(3))
      }
    }
  }
  return null
}

function matchingRule(emitted: EmittedRating, ctx: DesignContext): SlotSizingRule | null {
  for (const rule of SIZING_RULES) {
    if (rule.applies_to_classes && rule.applies_to_classes.length > 0) {
      const matches = rule.applies_to_classes.some((cls) =>
        ctx.product_class.toLowerCase().includes(cls.toLowerCase()),
      )
      if (!matches) continue
    }
    if (!rule.match_sub_module.test(emitted.sub_module_id)) continue
    if (rule.exclude_word_id && rule.exclude_word_id.test(emitted.word_id)) continue
    return rule
  }
  return null
}

// ── MAIN AUDIT ───────────────────────────────────────────────────────────────

export interface SizingFinding {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  claimed_a: number
  continuous_load_a: number
  safety_factor: number
  required_a: number
  ratio: number
  severity: 'HIGH' | 'MED' | 'LOW'
  explanation: string
}

export interface SizingAuditResult {
  findings: SizingFinding[]
  words_with_rating: number
  words_matched_to_rule: number
  product_class: string
}

export function auditSizing(state: any): SizingAuditResult {
  const ctx = buildContext(state)
  const emitted = collectEmittedRatings(state)
  const findings: SizingFinding[] = []
  let words_matched_to_rule = 0
  for (const e of emitted) {
    const rule = matchingRule(e, ctx)
    if (!rule) continue
    const continuous = expectedLoadFromRule(rule, ctx)
    if (continuous == null) continue
    words_matched_to_rule += 1
    const required = continuous * rule.safety_factor
    const ratio = e.claimed_a / required
    if (ratio >= 1.0) continue
    let severity: 'HIGH' | 'MED' | 'LOW'
    if (ratio < 0.5) severity = 'HIGH'
    else if (ratio < 0.85) severity = 'MED'
    else severity = 'LOW'
    findings.push({
      word_id: e.word_id,
      word_name_human: e.word_name_human,
      module_id: e.module_id,
      sub_module_id: e.sub_module_id,
      claimed_a: e.claimed_a,
      continuous_load_a: continuous,
      safety_factor: rule.safety_factor,
      required_a: required,
      ratio,
      severity,
      explanation:
        `${e.word_name_human} (id ${e.word_id}) in ${e.module_id} → ${e.sub_module_id} ` +
        `is rated ${e.claimed_a.toFixed(0)} A but the design's continuous load is ` +
        `${continuous.toFixed(0)} A; with the ${rule.safety_factor}× safety factor, the ` +
        `required rating is ${required.toFixed(0)} A. Claim is ${(ratio * 100).toFixed(0)}% ` +
        `of required (${(1 / ratio).toFixed(1)}× undersized). ${rule.description}`,
    })
  }
  return {
    findings,
    words_with_rating: emitted.length,
    words_matched_to_rule,
    product_class: ctx.product_class,
  }
}

// ── CLI ENTRYPOINT ───────────────────────────────────────────────────────────

function renderMarkdown(result: SizingAuditResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Sizing-vs-Design Audit — ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.words_with_rating} words have a current rating; ${result.words_matched_to_rule} matched a sizing rule.** ` +
      `Product class: \`${result.product_class}\`.`,
  )
  lines.push('')
  if (result.findings.length === 0) {
    lines.push('✅ **PASS** — no undersized components detected.')
    return lines.join('\n')
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  const low = result.findings.filter((f) => f.severity === 'LOW')
  lines.push(`❌ **FAIL** — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`)
  lines.push('')
  const sorted = [...result.findings].sort((a, b) => {
    const order = { HIGH: 0, MED: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })
  for (const f of sorted) {
    lines.push(`## [${f.severity}] ${f.word_name_human} — undersized ${(1 / f.ratio).toFixed(1)}×`)
    lines.push(`- **Module:** ${f.module_id} → ${f.sub_module_id}`)
    lines.push(`- **Word ID:** ${f.word_id}`)
    lines.push(`- **Claimed:** ${f.claimed_a.toFixed(0)} A`)
    lines.push(`- **Continuous load:** ${f.continuous_load_a.toFixed(0)} A`)
    lines.push(`- **Required (× ${f.safety_factor} safety):** ${f.required_a.toFixed(0)} A`)
    lines.push(`- **Ratio:** ${(f.ratio * 100).toFixed(0)}% of required`)
    lines.push(`- **Reason:** ${f.explanation}`)
    lines.push('')
  }
  return lines.join('\n')
}

const argv1 = process.argv[1] ?? ''
const isMain = /sizing-vs-design-audit\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: sizing-vs-design-audit <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[sizing-audit] failed to read ${statePath}: ${(err as Error).message}`)
    process.exit(1)
  }
  const result = auditSizing(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[sizing-audit] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  // Exit 14 on any HIGH finding (gate 14 — reserved alongside 10/11/12/13).
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(`[sizing-audit] FAIL: ${high.length} HIGH-severity finding(s)`)
    process.exit(14)
  }
  console.log(
    `[sizing-audit] PASS: ${result.words_matched_to_rule}/${result.words_with_rating} matched-to-rule, ${result.findings.length} findings (${result.findings.filter((f) => f.severity === 'MED').length} MED, ${result.findings.filter((f) => f.severity === 'LOW').length} LOW)`,
  )
}
