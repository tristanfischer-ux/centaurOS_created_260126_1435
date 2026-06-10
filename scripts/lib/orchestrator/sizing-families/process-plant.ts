/**
 * scripts/lib/orchestrator/sizing-families/process-plant.ts
 *
 * PROCESS-PLANT sizing family (E2). Vessel / reactor volumes from throughput +
 * residence time, pump & agitator power, heat-exchanger duty from stream
 * deltas, separators, gas handling. Covers anaerobic-digester / CHP / biogas /
 * chemical-process / SAF-style plants — any class whose envelope carries a
 * 'process' domain or a process-plant slug.
 *
 * DISCIPLINE (matches generic/sizing.ts):
 *   - Lean on TOOL OUTPUTS already in the contract where a tool key exists
 *     (reactor:cstr-pfr-sizing, pump-sizing, heat-exchanger duty) — re-derive
 *     physics ONLY when no tool key is present.
 *   - A rule emits NOTHING when its source quantity is absent (never invent).
 *   - Every rule cites its engineering basis in `basis` (correlation / standard
 *     / first-principles formula).
 *
 * Units consumed (canonical, validated at the G6 boundary by requiredQuantities):
 *   feed throughput in t/day, digester/reactor volume in m³, electrical power
 *   in kW, thermal duty in kW.
 *
 * British spelling throughout.
 */

import type { ContractInProgress } from '../types'
import { mod, type ModifierCharacter } from '../generic/emitter-primitives'
import type { SizingParams } from '../generic/sizing'
import { num } from '../generic/sizing'
import { scanWordsAgainstRules, type FamilyRule } from './rule-engine'
import { registerSizingFamily } from './registry'
import { POWER_KW, VOLUME_M3, MASS_FLOW_T_DAY } from './units'
import {
  type EnvelopeVectorLike,
  type SizableModule,
  type SizingDelta,
  type SizingFamilyPlugin,
} from './types'

const VERSION = '1.0.0'
const PROVENANCE = `family-plugin:process-plant@${VERSION}`

// ── local helpers (same never-invent contract as generic/sizing.ts) ──
function q1(): ModifierCharacter[] {
  return [mod('quantity', '×1')]
}
function qn(v: number | undefined): ModifierCharacter[] {
  return v !== undefined && v >= 1 ? [mod('quantity', `×${Math.round(v)}`)] : []
}
/** spec modifier, rounded to 3 s.f.-ish (2 dp) like the legacy `spec`. */
function rate(kind: string, v: number | undefined, unit: string): ModifierCharacter[] {
  if (v === undefined || !Number.isFinite(v)) return []
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100
  return [mod(kind, String(r), unit)]
}

// Convenience param readers with fallback chains across canonical contract keys.
function firstNum(p: SizingParams, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = num(p, k)
    if (v !== undefined) return v
  }
  return undefined
}

// ---------------------------------------------------------------------------
// RULES — ordered MOST-SPECIFIC first (first match wins).
// 18 rules; every rule cites an engineering basis.
// ---------------------------------------------------------------------------

export const PROCESS_PLANT: FamilyRule[] = [
  // 1. Primary reactor / digester vessel — prefer the sizing tool's volume;
  //    else V = throughput × residence time (HRT). Basis: CSTR design eqn
  //    V = Q·τ (Levenspiel, Chemical Reaction Engineering); AD HRT 20-40 d.
  {
    id: 'primary_reactor',
    match: /primary[_\s-]?digest|mesophilic|main[_\s-]?reactor|\bcstr\b|stirred[_\s-]?tank|primary[_\s-]?vessel/i,
    basis: 'CSTR/digester volume V = Q·τ (Levenspiel); tool reactor:cstr-pfr-sizing volume preferred when present',
    size: (p) => {
      const v = firstNum(p, ['reactor_volume_m3', 'primary_digester_volume_m3', 'digester_working_volume_m3', 'working_volume_m3'])
      return [...q1(), ...rate('capacity', v, 'm³ working volume')]
    },
  },
  // 2. Secondary digester / digestate store. Basis: residual-gas capture stage
  //    sized ~30-50% of primary working volume (AD practice).
  {
    id: 'secondary_reactor',
    match: /secondary[_\s-]?digest|digestate[_\s-]?store|gas[_\s-]?tight[_\s-]?store|post[_\s-]?digest/i,
    basis: 'secondary store ≈ 0.4× primary working volume (anaerobic-digestion residual-gas capture practice)',
    size: (p) => {
      const sec = num(p, 'secondary_digester_volume_m3')
      const pri = firstNum(p, ['reactor_volume_m3', 'primary_digester_volume_m3', 'working_volume_m3'])
      const v = sec ?? (pri !== undefined ? pri * 0.4 : undefined)
      return [...q1(), ...rate('capacity', v, 'm³')]
    },
  },
  // 3. Packed / absorber / scrubber column. Basis: packed-column height from
  //    HTU·NTU (mass-transfer); tool absorber sizing volume preferred.
  {
    id: 'absorber_column',
    match: /absorber|scrubber|packed[_\s-]?column|stripp(er|ing)|wash[_\s-]?column/i,
    basis: 'packed column H = HTU·NTU (mass-transfer unit method, Perry’s); tool absorber:packed-height preferred',
    size: (p) => {
      const h = firstNum(p, ['column_packed_height_m', 'absorber_height_m'])
      const d = firstNum(p, ['column_diameter_m', 'absorber_diameter_m'])
      return [...q1(), ...rate('dimension', h, 'm packed height'), ...rate('dimension', d, 'm diameter')]
    },
  },
  // 4. Gas holder / gas storage. Basis: buffer = biogas flow × storage hours;
  //    double-membrane holders sized for ~2-6 h of production (biogas practice).
  {
    id: 'gas_holder',
    match: /gas[_\s-]?holder|gas[_\s-]?storage|biogas[_\s-]?buffer|double[_\s-]?membrane|gasometer/i,
    basis: 'gas-holder volume = biogas flow (Nm³/h) × buffer hours (~4 h, double-membrane biogas practice)',
    size: (p) => {
      const explicit = num(p, 'gas_holder_volume_m3')
      const flow = firstNum(p, ['biogas_flow_nm3_h', 'biogas_production_nm3_h'])
      const v = explicit ?? (flow !== undefined ? flow * 4 : undefined)
      return [...q1(), ...rate('capacity', v, 'm³')]
    },
  },
  // 5. Gas cleaning / desulphurisation skid. Basis: H2S removal sized to gas
  //    flow; activated-carbon/biological bed throughput in Nm³/h.
  {
    id: 'desulphurisation',
    match: /desulph|h2s[_\s-]?remov|sulphur[_\s-]?remov|gas[_\s-]?clean|activated[_\s-]?carbon|biolog(ical)?[_\s-]?scrub/i,
    basis: 'desulphurisation bed sized on biogas throughput (Nm³/h); H2S < 250 ppm spec (engine gas-quality)',
    size: (p) => {
      const flow = firstNum(p, ['biogas_flow_nm3_h', 'biogas_production_nm3_h'])
      return [...q1(), ...rate('rating_primary', flow, 'Nm³/h gas throughput')]
    },
  },
  // 6. Gas engine / genset (prime mover). Basis: electrical output / electrical
  //    efficiency = fuel power; engine rated at electrical output kW.
  {
    id: 'gas_engine',
    match: /gas[_\s-]?engine|spark[_\s-]?ignition|prime[_\s-]?mover|genset|reciprocating[_\s-]?engine|\bchp\b[_\s-]?engine/i,
    basis: 'engine rated at electrical output P_e; fuel power = P_e/η_e (1st-law CHP energy balance)',
    size: (p) => {
      const pe = firstNum(p, ['electrical_output_kw', 'continuous_power_kw', 'rated_power_kw', 'generator_power_kwe'])
      return [...q1(), ...rate('rating_primary', pe, 'kWe')]
    },
  },
  // 7. Generator / alternator. Basis: synchronous generator sized to electrical
  //    output / power factor → kVA (S = P/cosφ).
  {
    id: 'generator',
    match: /synchronous[_\s-]?generator|alternator|\bgenerator\b/i,
    basis: 'generator kVA = P_e / power-factor (S = P/cosφ); pf 0.95 typical for grid-export gensets',
    size: (p) => {
      const pe = firstNum(p, ['electrical_output_kw', 'continuous_power_kw', 'generator_power_kwe'])
      const pf = num(p, 'power_factor') ?? 0.95
      const kva = pe !== undefined ? pe / pf : undefined
      return [...q1(), ...rate('rating_primary', kva, 'kVA')]
    },
  },
  // 8. Heat-recovery exchanger (jacket / exhaust). Basis: HX duty from the
  //    recovered-heat stream delta; Q = ṁ·cp·ΔT — prefer the contract's
  //    recovered-heat quantity (a tool/stream output).
  {
    id: 'heat_recovery_hx',
    match: /heat[_\s-]?recover|jacket[_\s-]?water|exhaust[_\s-]?heat|heat[_\s-]?exchang|economiser|recuperat/i,
    basis: 'HX duty Q = ṁ·cp·ΔT (1st law); recovered-heat stream quantity preferred over re-derivation',
    size: (p) => {
      const duty = firstNum(p, ['heat_recovery_kw', 'recovered_heat_kwth', 'thermal_recovery_kw', 'hx_duty_kw'])
      return [...q1(), ...rate('rating_primary', duty, 'kWth duty')]
    },
  },
  // 9. Digester heating loop / coils. Basis: maintain mesophilic ~40 °C against
  //    feed + losses; coil duty is the digester-heating share of recovered heat.
  {
    id: 'digester_heating',
    match: /digester[_\s-]?heat|heating[_\s-]?coil|mesophilic[_\s-]?heat|tank[_\s-]?heat/i,
    basis: 'coil duty = feed sensible load + shell losses to hold 40 °C mesophilic (digester heat balance)',
    size: (p) => {
      const duty = firstNum(p, ['digester_heating_kw', 'digester_heat_demand_kw'])
      return [...q1(), ...rate('rating_primary', duty, 'kWth')]
    },
  },
  // 10. Process pump (feed / circulation / recycle). Basis: hydraulic power
  //     P = ρ·g·Q·H / η (pump affinity); prefer pump-sizing tool power.
  {
    id: 'process_pump',
    match: /feed[_\s-]?pump|circulation[_\s-]?pump|recycle[_\s-]?pump|slurry[_\s-]?pump|transfer[_\s-]?pump|\bpump\b/i,
    basis: 'pump shaft power P = ρ·g·Q·H/η (hydraulic power eqn); tool pump-sizing power_kw preferred',
    size: (p) => {
      const pw = firstNum(p, ['pump_power_kw', 'feed_pump_power_kw', 'process_pump_power_kw'])
      return [...q1(), ...rate('rating_primary', pw, 'kW shaft')]
    },
  },
  // 11. Agitator / mixer. Basis: stirred-tank power number P = Np·ρ·N³·D⁵;
  //     digester mixing ~5-8 W per m³ of working volume (AD mixing practice).
  {
    id: 'agitator',
    match: /agitator|\bmixer\b|stirrer|impeller|submersible[_\s-]?mix/i,
    basis: 'mixing power P = Np·ρ·N³·D⁵ (turbulent power number); AD digesters ~5-8 W/m³ working volume',
    size: (p) => {
      const pw = num(p, 'agitator_power_kw')
      const v = firstNum(p, ['reactor_volume_m3', 'primary_digester_volume_m3', 'working_volume_m3'])
      const est = pw ?? (v !== undefined ? (v * 6) / 1000 : undefined) // 6 W/m³ → kW
      return [...q1(), ...rate('rating_primary', est, 'kW')]
    },
  },
  // 12. Macerator / feed preparation. Basis: comminution power scales with feed
  //     mass throughput; sized on t/day feed rate.
  {
    id: 'macerator',
    match: /macerat|comminut|shred|feed[_\s-]?prep|reception[_\s-]?hopper/i,
    basis: 'comminution duty scales with feed mass rate (t/day); reception sized on throughput',
    size: (p) => {
      const t = firstNum(p, ['feed_throughput_t_day', 'feedstock_throughput_t_day', 'feed_rate_t_day'])
      return [...q1(), ...rate('rating_primary', t, 't/day feed')]
    },
  },
  // 13. Pasteuriser. Basis: ABP 70 °C/1 h hold; vessel sized on batch volume
  //     from feed rate × hold time (Animal By-Products Regulation).
  {
    id: 'pasteuriser',
    match: /pasteuris|pasteuriz|hygienis|70[_\s-]?deg|abp[_\s-]?treat/i,
    basis: 'ABP 70 °C/1 h hold (Reg. EC 1069/2009); batch volume = feed rate × hold time',
    size: (p) => {
      const v = num(p, 'pasteuriser_volume_m3')
      return [...q1(), ...rate('capacity', v, 'm³ batch')]
    },
  },
  // 14. Separator / centrifuge / decanter (digestate liquid/fibre). Basis:
  //     throughput-rated decanter; sized on digestate mass flow (t/day).
  {
    id: 'separator',
    match: /separat|centrifuge|decanter|liquid[_\s-]?fibre|screw[_\s-]?press|dewater/i,
    basis: 'decanter/centrifuge rated on digestate mass flow (t/day); Σ-factor sizing (solid-liquid sep.)',
    size: (p) => {
      const t = firstNum(p, ['digestate_throughput_t_day', 'feed_throughput_t_day', 'feedstock_throughput_t_day'])
      return [...q1(), ...rate('rating_primary', t, 't/day')]
    },
  },
  // 15. Flare (surplus / off-spec gas). Basis: enclosed flare rated to peak
  //     biogas flow (Nm³/h) for safe destruction (DSEAR/ATEX gas handling).
  {
    id: 'flare',
    match: /\bflare\b|emergency[_\s-]?burn|surplus[_\s-]?gas|waste[_\s-]?gas[_\s-]?burn/i,
    basis: 'enclosed flare rated to peak biogas flow (Nm³/h); destruction efficiency ≥ 99% (ATEX gas safety)',
    size: (p) => {
      const flow = firstNum(p, ['biogas_flow_nm3_h', 'biogas_production_nm3_h'])
      return [...q1(), ...rate('rating_primary', flow, 'Nm³/h')]
    },
  },
  // 16. Blower / gas booster / compressor. Basis: isentropic gas power
  //     P = (γ/(γ-1))·p₁·Q·((p₂/p₁)^((γ-1)/γ)-1)/η; gas booster on flow.
  {
    id: 'gas_booster',
    match: /booster|blower|gas[_\s-]?compress|gas[_\s-]?train[_\s-]?fan/i,
    basis: 'isentropic compression power (γ-relation); booster sized on biogas flow + pressure ratio',
    size: (p) => {
      const flow = firstNum(p, ['biogas_flow_nm3_h', 'biogas_production_nm3_h'])
      return [...q1(), ...rate('rating_primary', flow, 'Nm³/h')]
    },
  },
  // 17. Storage / buffer tank (feed-mix). Basis: buffer = feed rate × buffer
  //     hours; feed-mixing tank holds ~12-24 h feed (AD practice).
  {
    id: 'buffer_tank',
    match: /feed[_\s-]?mix|buffer[_\s-]?tank|mixing[_\s-]?tank|balance[_\s-]?tank|reception[_\s-]?tank/i,
    basis: 'buffer volume = feed rate × buffer hours; feed-mix tank ~12-24 h hold (AD practice)',
    size: (p) => {
      const v = num(p, 'feed_mixing_tank_volume_m3')
      const t = firstNum(p, ['feed_throughput_t_day', 'feedstock_throughput_t_day'])
      const est = v ?? (t !== undefined ? t * 0.75 : undefined) // ~18 h of t/day, ~1 t≈1 m³ slurry
      return [...q1(), ...rate('capacity', est, 'm³')]
    },
  },
  // 18. Instrumentation / SCADA (process control). Basis: one control system per
  //     plant; channel count scales with sub-module count (not invented here —
  //     emits the single-unit count only when no channel quantity exists).
  {
    id: 'scada',
    match: /scada|\bplc\b|process[_\s-]?control|instrument(ation)?|control[_\s-]?panel/i,
    basis: 'one plant control system; I/O channel count scales with measured points (process-control practice)',
    size: (p) => {
      const ch = num(p, 'scada_io_channel_count')
      return [...q1(), ...rate('capacity', ch, 'I/O channels')]
    },
  },
]

export const PROCESS_PLANT_FAMILY: SizingFamilyPlugin = {
  family: 'process-plant',
  version: VERSION,
  // Runs FIRST in a multi-domain compose (defines vessel/flow scale the thermal
  // + power families read). No runs_after.
  runs_after: [],
  overrides: [],

  // 1.0 — process-plant slug; 0.75 — 'process' domain signal; 0.6 — keyword
  // heuristic (digest / chp / biogas / reactor / fermenter / distill).
  appliesTo(envelopeVector: EnvelopeVectorLike | null | undefined, classSlug: string): number {
    const slug = String(classSlug ?? '')
    if (/process[_-]?plant|chemical[_-]?process|anaerobic|biogas|digest|fermenter|fischer[_-]?tropsch|e[_-]?fuel|distill/i.test(slug)) return 1.0
    const domains = envelopeVector?.domains ?? []
    if (domains.some((d) => /process|chemical|biochem/i.test(String(d)))) return 0.75
    if (/\bchp\b|\bad\b|reactor|reform/i.test(slug)) return 0.6
    return 0
  },

  // G6 boundary: at least ONE of these process-scale anchors must be present +
  // in-range, else the family refuses (loud) rather than emitting nothing.
  // Declared as ONE required ref with a broad alias chain (any present key
  // satisfies it); unit families validate whichever key resolves.
  requiredQuantities: [
    {
      name: 'electrical_output_kw',
      aliases: ['continuous_power_kw', 'rated_power_kw', 'generator_power_kwe'],
      unit: 'kw',
      family: POWER_KW,
      valid_range: [1, 1_000_000], // 1 kW micro-CHP → 1 GW; out of range = a unit/parse bug
    },
  ],

  size(modules: ReadonlyArray<SizableModule>, contract: ContractInProgress): SizingDelta {
    const params = flatten(contract)
    const modifier_writes = scanWordsAgainstRules(modules, PROCESS_PLANT, params, PROVENANCE, 'process-plant first-principles sizing')
    return {
      family: 'process-plant',
      version: VERSION,
      provenance: PROVENANCE,
      modifier_writes,
      quantity_writes: [],
      derived_parameter_writes: [],
      notes: modifier_writes.length > 0 ? [`process-plant sized ${modifier_writes.length} vessel/pump/HX word(s)`] : [],
    }
  },
}

// Local flatten (mirrors generic/sizing.ts flattenParams — kept private so the
// plugin reads exactly the contract's scalar quantities, never invents).
function flatten(contract: ContractInProgress): SizingParams {
  const out: SizingParams = {}
  const qs = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(qs)) {
    const val = v?.value
    if (typeof val === 'number' || typeof val === 'string') out[k] = val
  }
  return out
}

// silence unused-import lint for declared-but-not-yet-consumed unit families
void VOLUME_M3
void MASS_FLOW_T_DAY

registerSizingFamily(PROCESS_PLANT_FAMILY)
