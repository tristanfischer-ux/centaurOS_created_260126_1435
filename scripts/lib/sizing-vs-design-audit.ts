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
  /** Optional word-id INCLUSION — if set, ONLY words matching this regex
   * are evaluated by this rule. Useful for narrow rules that override a
   * broader sub_module rule (e.g. per-rack fuses inside a dc_distribution
   * sub_module). Specific rules with match_word_id should be listed
   * BEFORE the broad sub_module rule so the matcher picks them first. */
  match_word_id?: RegExp
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
  // BESS per-rack DC HRC fuse → string_continuous_current_a (more specific
  // than the generic DC bus rule below; must come FIRST so the matcher picks
  // it for hrc_fuse / rack_fuse / per_rack_fuse word_ids).
  // Rationale: a BESS dc_distribution sub_module typically holds BOTH a 1×
  // main bus contactor (1250 A class) AND N× per-rack fuses (~100 A class).
  // The chain's phase-2 grammar-repair loop sometimes strips the `quantity`
  // modifier when collapsing duplicate-kind modifiers, leaving the audit
  // unable to distinguish bus-level from per-rack components by quantity
  // alone. The word_id pattern is therefore the disambiguator: `*hrc_fuse`
  // or `rack_fuse` or `per_rack_*` → per-rack sizing.
  {
    match_sub_module: /dc_distribution|dc_bus|main_bus|dc_switchgear/i,
    match_word_id: /hrc_fuse|rack_fuse|per_rack|string_fuse/i,
    continuous_load_source: [{ design_param: 'string_continuous_current_a' }],
    safety_factor: 1.25,
    applies_to_classes: ['energy_storage', 'bess', 'solar_inverter', 'ev_charger'],
    description:
      'Per-rack DC fuse / per-string protection components must be sized to ≥ 1.25 × string_continuous_current_a (the rack-level current, not the bus total). Universal across multi-rack BESS architectures.',
  },
  // BESS DC bus / main contactor / DC switchgear → bus_continuous_current_a
  // EXCLUDES: pre-charge contactors (carry inrush current only, sized ~100 A
  // for capacitor-bank pre-charge timing), busbar (sized by ampacity not by
  // bus continuous current), isolation monitor (low-current measurement).
  {
    match_sub_module: /dc_distribution|dc_bus|main_bus|dc_switchgear/i,
    exclude_word_id: /precharge|pre_charge|inrush|busbar|iso_?monitor|isolation_monitor|hrc_fuse|rack_fuse|per_rack|string_fuse/i,
    continuous_load_source: [{ design_param: 'bus_continuous_current_a' }],
    safety_factor: 1.25,
    applies_to_classes: ['energy_storage', 'bess', 'solar_inverter', 'ev_charger'],
    description:
      'DC bus + main contactor components must be sized to ≥ 1.25 × bus_continuous_current_a (IEC 60947-2 + UL 9540A 13.2.4 for utility BESS). Pre-charge contactors (inrush only), per-rack fuses (separate string-level rule above), busbars (sized by ampacity), and isolation monitors (low-current measurement) are excluded.',
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
  // ── WIND class (2026-05-25) ───────────────────────────────────
  // Utility wind generator (Vestas / SGRE / GE / Goldwind) uses 690 V AC
  // LV side at the generator + converter; transformer steps up to 11/33 kV
  // for collector network. Compute per-phase continuous from rated_power_kw
  // at the appropriate voltage class.
  // Generator + converter + chopper (LV 690 V side)
  {
    match_sub_module: /generator_(stator|rotor|conducting|electromechanical)|converter|inverter|chopper|braking_resistor|generator_circuit/i,
    continuous_load_source: [
      { compute_ac_from: { power_param: 'rated_power_kw', voltage_v: 690 } },
    ],
    safety_factor: 1.25,
    applies_to_classes: ['wind', 'wind_turbine', 'wind_offshore'],
    description:
      'Wind generator + converter + chopper LV-side components (690 V AC bus) must be sized to ≥ 1.25 × rated_power_kw × 1000 / (690 × √3). IEC 61400-1 + IEC 60204-1.',
  },
  // Wind transformer HV side (11/33 kV collector) — voltage from design
  // parameter if available (transformer_hv_kv); default 11 kV utility class.
  {
    match_sub_module: /transformer_hv|step_up_secondary|hv_switchgear|hv_metering|hv_breaker|collector_(point|switchgear)/i,
    continuous_load_source: [
      { compute_ac_from: { power_param: 'rated_power_kw', voltage_v: 11000 } },
    ],
    safety_factor: 1.25,
    applies_to_classes: ['wind', 'wind_turbine', 'wind_offshore', 'solar_inverter'],
    description:
      'Wind HV collector / transformer HV-side components must be sized to ≥ 1.25 × rated_power_kw × 1000 / (V_HV × √3). Voltage defaults to 11 kV utility class; for 33 kV systems update the rule or add per-design override.',
  },
]

// ── COLLECTORS ───────────────────────────────────────────────────────────────

interface EmittedRating {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  claimed_a: number
  /** Quantity modifier — used for per-unit sizing when a single sub_module
   * holds N replicated units (e.g. 15× rack-level fuses inside the
   * dc_distribution sub-module: each fuse sees per-rack current, not bus
   * total current). */
  quantity: number
  /** content_character.character_id — used to exclude derived-metric pseudo-
   * words (e.g. `current`, `power`, `voltage`, `efficiency`) that the chain
   * sometimes emits as BoM rows but which aren't real procurement items. */
  character_id: string
}

function parseCurrentA(value: string): number | null {
  if (typeof value !== 'string') return null
  // Allow "1500 A", "1500A", "1,500 A continuous", "±300 A peak"
  const cleaned = value.replace(/,(?=\d{3}\b)/g, '')
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*A\b/i)
  return m ? parseFloat(m[1]) : null
}

function parseQuantityModifier(value: string): number {
  if (typeof value !== 'string') return 1
  const m = value.replace(/[×x,\s]/g, '').match(/(\d+)/)
  const n = m ? parseInt(m[1], 10) : 1
  return Number.isFinite(n) && n > 0 ? n : 1
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
        const charId = String(w?.content_character?.character_id ?? '')
        const qtyMod = mods.find((mc) => mc.kind === 'quantity')
        const quantity = qtyMod ? parseQuantityModifier(String(qtyMod.value)) : 1
        out.push({
          word_id: wordId,
          word_name_human: nameHuman,
          module_id: moduleId,
          sub_module_id: subId,
          claimed_a: claimedA,
          quantity,
          character_id: charId,
        })
      }
    }
  }
  return out
}

// ── UNIVERSAL EXCLUSIONS ─────────────────────────────────────────────────────
// Applied across ALL rules. Components that match these patterns are skipped
// entirely — they're either signal-level (don't carry load current), derived
// metrics (not real procurement items), or sized by a different physical
// principle (ampacity for busbars; thermal for heatsinks).

const GLOBAL_EXCLUDE_WORD_ID = new RegExp(
  // Signal-level components (carry control/measurement current, not load)
  'bms_slave|cell_monitor|cell_voltage_sense|voltage_sense|aux_contact|auxiliary_contact|' +
    'signal_contact|control_relay|control_signal|isolation_signal|ct_signal|pt_signal|' +
    // Busbars (sized by copper cross-section + ventilation, not breaker rating)
    'busbar|bus_bar|copper_bar|distribution_bar|' +
    // Connectors / terminals / lugs (passive, sized by IEC 61238 ampacity table)
    'crimp_lug|terminal_lug|cable_lug|ferrule|connector_housing|' +
    // cell_terminal_hardware = Klauke 16208 voltage-sense ring terminal (≤1 mA
    // quiescent on 22 AWG BMS slave sense lead). NOT a current-carrying conductor;
    // the cell M8 power stud is bolted directly to the Mersen busbar per
    // Tesla Megapack / CATL EnerC+ / Sungrow PowerStack practice. Sizing it
    // against string_continuous_current_a (100 A class) is a category error —
    // same reason bms_slave is excluded. IEC 61238-1 / DIN 46234 ampacity
    // table governs; 0.5-1.0 mm² Klauke 16208 at ≤1 mA is compliant.
    // L28 council gate-14 CHAIN-BLOCKER: "6 A vs 83 A continuous" — correct
    // diagnosis that the 6 A figure exists, wrong conclusion that it's
    // undersized; it's a voltage-sense lug, not a power conductor.
    'cell_terminal_hardware|thermistor_attachment',
  'i',
)

// content_character.character_id values that are SCALAR METRICS, not parts.
// The chain's phase-2 grammar-repair loop sometimes adds these as BoM words
// to satisfy "module_prose_subset_of_sub_modules" — but they have no
// procurement reality and shouldn't be sizing-audited.
const GLOBAL_EXCLUDE_CHARACTER_ID = new RegExp(
  '^(current|power|voltage|efficiency|thermal|frequency|temperature|mass|capacity|' +
    'pressure|flow|speed|torque|altitude|range|throughput|dissipation)$',
  'i',
)

function isGloballyExcluded(emitted: EmittedRating): boolean {
  if (GLOBAL_EXCLUDE_WORD_ID.test(emitted.word_id)) return true
  if (GLOBAL_EXCLUDE_CHARACTER_ID.test(emitted.character_id)) return true
  return false
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
    if (rule.match_word_id && !rule.match_word_id.test(emitted.word_id)) continue
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
    // Universal exclusions (BMS slaves, busbars, scalar metrics, etc.)
    if (isGloballyExcluded(e)) continue
    const rule = matchingRule(e, ctx)
    if (!rule) continue
    const continuousTotal = expectedLoadFromRule(rule, ctx)
    if (continuousTotal == null) continue
    words_matched_to_rule += 1
    // Quantity-aware sizing: PARALLEL DC components (15× rack fuses share
    // the total bus current) divide the load by quantity. AC 3-phase
    // components (3× per-phase inductors) REPLICATE the per-phase current
    // each (every phase carries the full line current). Determine which
    // case by examining the source: design_param-based loads are typically
    // TOTAL bus currents → divide by quantity for per-unit sizing;
    // compute_ac_from loads are typically PER-PHASE currents already →
    // don't divide.
    const isTotalBusLoad = rule.continuous_load_source.some((s) => 'design_param' in s)
    const continuous = isTotalBusLoad && e.quantity > 1 ? continuousTotal / e.quantity : continuousTotal
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

// ── VOLTAGE SIZING (BESS WAVE C item 1, 2026-07-04) ─────────────────────────
// Additive to the current-sizing audit above — a SEPARATE rule table + a
// SEPARATE exported function (auditVoltageSizing), so the existing
// auditSizing() current-rating behaviour and its `SizingFinding` shape are
// completely unchanged (no risk to any existing consumer/test).
//
// Root cause this closes: DC-bus-facing protection/monitoring parts (an
// insulation monitor, a DC-bus voltage transducer, a rack DC isolator, a
// DC HRC/string fuse) must be rated >= the DC bus nominal voltage class.
// BESS WAVE C item 1 found FOUR such parts pinned at 1000 V on a 1500 V-
// nominal bus (Bender iso685-D-B, LEM LV 25-1000, ABB OTDC200E02P, Eaton
// Bussmann PV-200ANH1/170M6812) — the deterministic-emitter fix (2026-07-04)
// now branches on `dc_bus_voltage_v` to pick the real 1500 V-class part
// family; this rule is the regression GUARD so that class of defect can
// never regress silently. Sizing criterion: rated voltage >= the bus's
// NOMINAL voltage class (dc_bus_voltage_v) — matching real industry
// practice (equipment is sold/rated to the market's NOMINAL system-voltage
// class, e.g. "1500V-class BESS/PV" hardware, not to an internal worst-case
// full-charge string voltage that can exceed the class nameplate by design;
// see deterministic-emitter.ts's selectBessDcFuse1500V header comment for
// the full reasoning). No safety-factor multiplier — this mirrors
// engineering-contract.ts's own `voltage_closure` invariant (string voltage
// <= bus nominal class), not an arbitrary margin.

export interface VoltageSizingRule {
  /** Match a word by id (case-insensitive) — voltage-class rules are
   * word-scoped, not sub_module-scoped, because a sub_module can hold both
   * DC-bus-facing parts (need this rule) and unrelated commodity parts
   * (labels, mounting hardware) that must NOT be checked. */
  match_word_id: RegExp
  /** Design parameter holding the required minimum rated voltage. */
  design_param: string
  applies_to_classes?: string[]
  description: string
  /**
   * v4 physics-critic HIGH #1 follow-up (2026-07-05, out/bess-campaign-v4,
   * gate 33 blocking): rack-level fuses (and any other word matched by
   * match_word_id that carries a current rating) also need an AMPACITY
   * floor, not just a voltage-class floor — the two dimensions are
   * independent failure modes (a part can be the right voltage class and
   * still be undersized for the load, or vice versa). Optional — rules
   * with no ampacity_design_param are voltage-only (unchanged behaviour).
   * When set: required_a = quantities[ampacity_design_param] ×
   * (ampacity_safety_factor ?? 1); any matched word with a parseable A
   * rating below required_a is flagged HIGH, mirroring SIZING_RULES'
   * safety-factor convention (IEC 60269-6 / UL 9540A 13.2.4 = 1.25×
   * continuous). Words with NO parseable A value (e.g. a voltage-only
   * insulation monitor) are silently skipped for this leg — they still get
   * the voltage check above.
   */
  ampacity_design_param?: string
  ampacity_safety_factor?: number
}

export const VOLTAGE_SIZING_RULES: VoltageSizingRule[] = [
  {
    match_word_id: /insulation_monitor|pack_voltage_sensor|rack_dc_isolator|hrc_fuse|string_fuse/i,
    design_param: 'dc_bus_voltage_v',
    applies_to_classes: ['energy_storage', 'bess', 'solar_inverter', 'ev_charger'],
    description:
      'DC-bus-facing protection/monitoring parts (insulation monitor, DC-bus voltage transducer, rack DC isolator, DC HRC/string fuse) must be rated >= dc_bus_voltage_v (the bus nominal voltage class) — real 1500V-class BESS/PV hardware exists and must be selected once the bus nominal exceeds a lower class (e.g. 1000 V).',
    // Ampacity leg (added 2026-07-05, v4 physics-critic HIGH #1): rack-level
    // fuses/isolators in this SAME word_id group carry the rack's full
    // continuous current — arithmetic: rack_continuous_current_a =
    // string_continuous_current_a (1P per rack topology; = bus_continuous_
    // current_a / rack_count = PCS_kw × 1000 / dc_bus_voltage_v / rack_count).
    // required_a = rack_continuous_current_a × 1.25 (IEC 60269-6 + UL 9540A
    // 13.2.4). Words in this group with no A-parseable rating (the voltage
    // instruments — insulation monitor, DC-bus voltage transducer) are
    // skipped for this leg automatically (no false positive — see
    // collectEmittedVoltageRatings). Verified deliberately universal, not
    // narrowed to *_fuse only: the rack DC isolator carries the identical
    // rack current and must clear the same floor.
    ampacity_design_param: 'string_continuous_current_a',
    ampacity_safety_factor: 1.25,
  },
]

interface EmittedVoltageRating {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  claimed_v: number | null
  /** Ampacity leg (2026-07-05) — parsed the same way as SIZING_RULES'
   * collectEmittedRatings, via the shared parseCurrentA() helper. null when
   * the word carries no A-shaped rating (e.g. a voltage-only instrument). */
  claimed_a: number | null
  manufacturer: string | null
  part_number: string | null
}

function parseVoltageDcV(value: string): number | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/,(?=\d{3}\b)/g, '')
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*V\b/i)
  return m ? parseFloat(m[1]) : null
}

function collectEmittedVoltageRatings(state: any): EmittedVoltageRating[] {
  const out: EmittedVoltageRating[] = []
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  for (const m of modules) {
    const moduleId = String(m?.module ?? m?.id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subId = String(sm?.id ?? sm?.sub_module_id ?? 'unknown')
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const mods: any[] = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        let claimedV: number | null = null
        // Voltage is emitted under `dimension`, `capacity`, or `rating_primary`
        // depending on the word (see deterministic-emitter.ts's mod() calls
        // for these parts) — try all three, first V-shaped value wins.
        for (const kind of ['dimension', 'capacity', 'rating_primary']) {
          const mod = mods.find((mc) => mc.kind === kind)
          if (!mod) continue
          const v = parseVoltageDcV(String(mod.value) + (mod.unit ? ' ' + mod.unit : ''))
          if (v != null) {
            claimedV = v
            break
          }
        }
        // Ampacity leg (2026-07-05): independently look for an A-shaped
        // value across the same three kinds (reuses parseCurrentA — the
        // same parser SIZING_RULES uses above). A word can have a voltage
        // value, an ampacity value, both, or neither; each leg is only
        // evaluated by auditVoltageSizing when its own value is present.
        let claimedA: number | null = null
        for (const kind of ['rating_primary', 'capacity', 'dimension']) {
          const mod = mods.find((mc) => mc.kind === kind)
          if (!mod) continue
          const a = parseCurrentA(String(mod.value) + (mod.unit ? ' ' + mod.unit : ''))
          if (a != null) {
            claimedA = a
            break
          }
        }
        if (claimedV == null && claimedA == null) continue
        const wordId = String(w?.id ?? w?.content_character?.character_id ?? 'unknown')
        const nameHuman = String(w?.name_human ?? w?.content_character?.name_human ?? wordId)
        const mfrMod = mods.find((mc) => mc.kind === 'manufacturer')
        const pnMod = mods.find((mc) => mc.kind === 'part_number')
        out.push({
          word_id: wordId,
          word_name_human: nameHuman,
          module_id: moduleId,
          sub_module_id: subId,
          claimed_v: claimedV,
          claimed_a: claimedA,
          manufacturer: mfrMod ? String(mfrMod.value) : null,
          part_number: pnMod ? String(pnMod.value) : null,
        })
      }
    }
  }
  return out
}

export interface VoltageSizingFinding {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  manufacturer: string | null
  part_number: string | null
  /** Which leg fired — the two dimensions are independent (BESS WAVE C
   * item 1 follow-up, 2026-07-05): a part can be the right voltage class
   * and still be undersized for the load, or vice versa. */
  check: 'voltage' | 'ampacity'
  claimed_v?: number
  required_v?: number
  claimed_a?: number
  required_a?: number
  severity: 'HIGH'
  explanation: string
}

export interface VoltageSizingAuditResult {
  findings: VoltageSizingFinding[]
  words_with_voltage_rating: number
  words_matched_to_rule: number
  product_class: string
}

/**
 * auditVoltageSizing — gate 6 extension (BESS WAVE C item 1, 2026-07-04;
 * ampacity leg added 2026-07-05).
 *
 * proveCatch (voltage leg): feed a state whose insulation-monitor/voltage-
 * transducer/isolator/fuse word is rated below dc_bus_voltage_v — must
 * return exactly one HIGH finding for that word (verified via
 * deterministic-emitter.ts's pre-fix behaviour on out/bess-campaign-v2:
 * iso685-D-B @ 1000 V on a 1500 V bus would have fired this rule before the
 * emitter fix).
 *
 * proveCatch (ampacity leg, both directions — see
 * src/lib/__tests__/deterministic-emitter-wave-c.test.ts):
 *   (a) FIRES: a rack fuse claiming an A rating below
 *       string_continuous_current_a × 1.25 must return >= 1 HIGH finding
 *       with check:'ampacity'.
 *   (b) DOES NOT FALSE-POSITIVE: the real out/bess-campaign-v4 pick
 *       (PV-200A-1XL-B-15 on a 128.2 A rack, 1.56× actual margin) must
 *       return ZERO ampacity findings — this is the case the v4 physics
 *       critic wrongly flagged; the deterministic gate is the tie-breaker.
 */
export function auditVoltageSizing(state: any): VoltageSizingAuditResult {
  const ctx = buildContext(state)
  const emitted = collectEmittedVoltageRatings(state)
  const findings: VoltageSizingFinding[] = []
  let words_matched_to_rule = 0
  for (const e of emitted) {
    const rule = VOLTAGE_SIZING_RULES.find((r) => {
      if (r.applies_to_classes && r.applies_to_classes.length > 0) {
        const matches = r.applies_to_classes.some((cls) => ctx.product_class.toLowerCase().includes(cls.toLowerCase()))
        if (!matches) return false
      }
      return r.match_word_id.test(e.word_id)
    })
    if (!rule) continue
    let matchedThisWord = false

    // ── Voltage leg (unchanged behaviour) ──────────────────────────────
    const requiredV = ctx.quantities[rule.design_param]
    if (typeof requiredV === 'number' && requiredV > 0) {
      matchedThisWord = true
      if (e.claimed_v != null && e.claimed_v < requiredV) {
        findings.push({
          word_id: e.word_id,
          word_name_human: e.word_name_human,
          module_id: e.module_id,
          sub_module_id: e.sub_module_id,
          manufacturer: e.manufacturer,
          part_number: e.part_number,
          check: 'voltage',
          claimed_v: e.claimed_v,
          required_v: requiredV,
          severity: 'HIGH',
          explanation:
            `${e.word_name_human} (id ${e.word_id}) in ${e.module_id} → ${e.sub_module_id} is ${e.manufacturer ?? ''} ` +
            `${e.part_number ?? '<no-part-number>'} rated ${e.claimed_v} V DC but the DC bus nominal is ${requiredV} V — ` +
            `an under-rated DC-bus-facing protection/monitoring part cannot reliably operate at the bus voltage it is meant ` +
            `to supervise/protect (a live safety defect, not a cosmetic spec mismatch). ${rule.description}`,
        })
      }
    }

    // ── Ampacity leg (added 2026-07-05, v4 physics-critic HIGH #1) ─────
    if (rule.ampacity_design_param) {
      const baseA = ctx.quantities[rule.ampacity_design_param]
      if (typeof baseA === 'number' && baseA > 0 && e.claimed_a != null) {
        matchedThisWord = true
        const requiredA = baseA * (rule.ampacity_safety_factor ?? 1)
        if (e.claimed_a < requiredA) {
          findings.push({
            word_id: e.word_id,
            word_name_human: e.word_name_human,
            module_id: e.module_id,
            sub_module_id: e.sub_module_id,
            manufacturer: e.manufacturer,
            part_number: e.part_number,
            check: 'ampacity',
            claimed_a: e.claimed_a,
            required_a: requiredA,
            severity: 'HIGH',
            explanation:
              `${e.word_name_human} (id ${e.word_id}) in ${e.module_id} → ${e.sub_module_id} is ${e.manufacturer ?? ''} ` +
              `${e.part_number ?? '<no-part-number>'} rated ${e.claimed_a} A but ${rule.ampacity_design_param} = ${baseA.toFixed(1)} A ` +
              `× ${rule.ampacity_safety_factor ?? 1} safety factor requires >= ${requiredA.toFixed(1)} A — an under-rated ` +
              `current-carrying protection part will nuisance-trip or overheat under normal continuous load. ${rule.description}`,
          })
        }
      }
    }

    if (matchedThisWord) words_matched_to_rule += 1
  }
  return {
    findings,
    words_with_voltage_rating: emitted.length,
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
  // BESS WAVE C item 1 (2026-07-04): additive voltage-sizing check, folded
  // into the SAME exit-14 gate — an under-rated DC-bus-facing protection/
  // monitoring part is a safety defect of the same class the current-sizing
  // rules already hard-exit on.
  const voltageResult = auditVoltageSizing(state)
  if (voltageResult.findings.length > 0) {
    console.error(`[sizing-audit] voltage-sizing: ${voltageResult.findings.length} HIGH finding(s)`)
    for (const f of voltageResult.findings) console.error(`  [HIGH] ${f.explanation}`)
  }
  // Exit 14 on any HIGH finding (gate 14 — reserved alongside 10/11/12/13).
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0 || voltageResult.findings.length > 0) {
    console.error(`[sizing-audit] FAIL: ${high.length} current-sizing HIGH + ${voltageResult.findings.length} voltage-sizing HIGH finding(s)`)
    process.exit(14)
  }
  console.log(
    `[sizing-audit] PASS: ${result.words_matched_to_rule}/${result.words_with_rating} matched-to-rule, ${result.findings.length} findings (${result.findings.filter((f) => f.severity === 'MED').length} MED, ${result.findings.filter((f) => f.severity === 'LOW').length} LOW); voltage-sizing ${voltageResult.words_matched_to_rule}/${voltageResult.words_with_voltage_rating} matched, 0 findings`,
  )
}
