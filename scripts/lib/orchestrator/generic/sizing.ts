/**
 * scripts/lib/orchestrator/generic/sizing.ts
 *
 * PER-CLASS-FAMILY SIZING LAYER (wall-3 Phase-2 — the lone wall from the Phase-1
 * verdict, drawer forgeos_decisions_7e83125db20634da).
 *
 * The Phase-1 generic emitter produces correct STRUCTURE but the Physics Critic
 * caps engineering_plausibility at 3/10 on UNDER-PROVISIONING (CMUs / modules /
 * sensors emitted ×1) and scale (a component word with no engineering rating).
 * The fix is NOT new physics: the engineering CONTRACT already carries the fully
 * computed coupled-physics quantities (cell_count, bms_slave_count, module_count,
 * bus_continuous_current_a, continuous_power_kw, transformer_rating_kva, …). This
 * layer simply ATTACHES that already-computed engineering to the generic component
 * words, keyed by component TYPE, per class FAMILY.
 *
 * Universal pattern (drawer about the thermal-derating contract): the contract
 * EMITS the parameter, this layer CONSUMES it onto the BoM word, a gate VERIFIES
 * it. Reusable across a family: the BATTERY rules below work for BESS / residential
 * / marine / second-life ESS unchanged — only the contract VALUES differ.
 *
 * NOTHING is invented: a rule only sets a modifier when the contract supplies the
 * source quantity (helpers return [] on a missing param). Quantities come solely
 * from real contract counts. Physics-bounded discipline (drawer about scaling
 * formulas): ratings are continuous unless the contract names a peak/transient.
 *
 * British spelling throughout.
 */

import type { ContractInProgress } from '../types'
import { mod, type ModifierCharacter } from './emitter-primitives'

// Minimal structural shapes (avoid importing DesignModule's heavy type here).
interface WordLike {
  id?: string
  name_human?: string
  content_character?: { character_id?: string; name_human?: string }
  modifier_characters?: ModifierCharacter[]
}
interface SubModuleLike { words?: WordLike[] }
interface ModuleLike { sub_modules?: SubModuleLike[] }

export interface SizingParams {
  [k: string]: number | string
}

type SizeFn = (p: SizingParams) => ModifierCharacter[]
interface SizingRule {
  id: string
  match: RegExp
  size: SizeFn
}

// ── helpers (return [] when the contract lacks the source quantity — never invent)
function num(p: SizingParams, k: string): number | undefined {
  const v = p[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function qty(v: number | undefined): ModifierCharacter[] {
  return v !== undefined && v >= 1 ? [mod('quantity', `×${Math.round(v)}`)] : []
}
function spec(kind: string, v: number | undefined, unit: string): ModifierCharacter[] {
  if (v === undefined) return []
  const rounded = Math.round(v * 100) / 100
  return [mod(kind, String(rounded), unit)]
}

// ── BATTERY family — every value sourced from the engineering contract's COMPUTED
//    quantities. Ordered MOST-SPECIFIC first (first match wins); rack before module
//    so "battery_module_racks" sizes as racks, not modules.
const BATTERY: SizingRule[] = [
  { id: 'cell_monitoring', match: /monitor|\bcmu\b|bms[_\s-]?slave|cell[_\s-]?balanc/i,
    size: (p) => qty(num(p, 'bms_slave_count')) },
  { id: 'controller', match: /bms[_\s-]?master|\bems\b|scada|energy[_\s-]?management|controller|gateway/i,
    size: () => qty(1) },
  { id: 'rack', match: /\brack(s)?\b|seismic[_\s-]?frame/i,
    size: (p) => qty(num(p, 'rack_count')) },
  { id: 'battery_module', match: /battery[_\s-]?module|cell[_\s-]?module|\bmodules?\b/i,
    size: (p) => [...qty(num(p, 'module_count')), ...spec('capacity', num(p, 'cells_per_module'), 'cells')] },
  { id: 'cell', match: /prismatic|\blfp\b|\bcells?\b|electrode|jelly[_\s-]?roll/i,
    size: (p) => [...qty(num(p, 'cell_count')), ...spec('capacity', num(p, 'cell_capacity_ah'), 'Ah'), ...spec('dimension', num(p, 'cell_voltage_v'), 'V nominal')] },
  { id: 'pcs_inverter', match: /inverter|\bpcs\b|power[_\s-]?conversion|bidirectional|grid[_\s-]?form/i,
    size: (p) => [...qty(1), ...spec('rating_primary', num(p, 'continuous_power_kw'), 'kW continuous'), ...spec('performance', num(p, 'inverter_efficiency_pct'), '% efficiency')] },
  { id: 'dcdc', match: /dc[_\s-]?dc|\bconverter\b/i,
    size: (p) => spec('rating_primary', num(p, 'continuous_power_kw'), 'kW') },
  { id: 'filter_inductor', match: /filter|inductor|\blcl\b|choke|reactor/i,
    size: (p) => spec('rating_primary', num(p, 'lcl_filter_rating_a'), 'A continuous') },
  { id: 'busbar', match: /bus[_\s-]?bar|busbar|laminated[_\s-]?bus/i,
    size: (p) => spec('rating_primary', num(p, 'bus_continuous_current_a'), 'A continuous') },
  { id: 'breaker', match: /breaker|\bmccb\b|\bmcb\b|disconnect|isolator/i,
    size: (p) => spec('rating_primary', num(p, 'dc_breaker_rating_a'), 'A') },
  { id: 'contactor', match: /contactor|relay/i,
    size: (p) => spec('rating_primary', num(p, 'dc_contactor_rating_a'), 'A') },
  { id: 'switchgear', match: /switchgear|ac[_\s-]?distribution|main[_\s-]?ac|ac[_\s-]?panel/i,
    size: (p) => [...spec('rating_primary', num(p, 'ac_continuous_current_a'), 'A'), ...spec('dimension', num(p, 'ac_output_voltage_v'), 'V AC')] },
  { id: 'transformer', match: /transformer/i,
    size: (p) => [...qty(1), ...spec('rating_primary', num(p, 'transformer_rating_kva'), 'kVA')] },
  { id: 'chiller', match: /chiller|cooling[_\s-]?unit|\bhvac\b|heat[_\s-]?exchanger|refrigerat/i,
    size: (p) => spec('rating_primary', num(p, 'thermal_rejection_capacity_kw'), 'kW cooling') },
  { id: 'cold_plate', match: /cold[_\s-]?plate|liquid[_\s-]?plate/i,
    size: (p) => [...qty(num(p, 'rack_count')), ...spec('rating_primary', num(p, 'cold_plate_per_rack_min_capacity_kw'), 'kW each')] },
  { id: 'pump', match: /\bpump\b|circulation/i, size: () => qty(1) },
  { id: 'current_sensor', match: /current[_\s-]?(sensor|transducer)|\bhall\b/i,
    size: (p) => [...qty(num(p, 'rack_count')), ...spec('rating_primary', num(p, 'bus_continuous_current_a'), 'A nominal')] },
  { id: 'temp_sensor', match: /temperature|thermistor|\bntc\b|thermal[_\s-]?probe/i,
    size: (p) => qty(num(p, 'module_count')) },
  { id: 'voltage_sensor', match: /voltage[_\s-]?(sensor|transducer|monitor)|insulation[_\s-]?monitor/i,
    size: (p) => [...qty(1), ...spec('dimension', num(p, 'dc_bus_voltage_v'), 'V range')] },
]

// ── helper: find the first numeric param whose KEY matches a pattern (tool output
//    names vary — reactor_volume_m3 / tank_volume_m3 / working_volume_m3 / …).
function findNum(p: SizingParams, patterns: RegExp[]): number | undefined {
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'number' && Number.isFinite(v) && patterns.some((rx) => rx.test(k))) return v
  }
  return undefined
}

/**
 * Derive a cylindrical vessel's CONSISTENT dimensions from its working volume.
 * Pick aspect ratio AR = L/D, then D = (4V/(π·AR))^(1/3), L = AR·D. The emitted
 * dimension is geometrically guaranteed to hold the stated volume — fixing the
 * "58.7 L tank drawn 450 × 300 mm" class of bug (a Ø450 × 300 cylinder holds only
 * 47.7 L, not 58.7 L). Wall thickness folds into the SAME dimension string (one
 * value per kind — the modifier-consistency gate rejects two `dimension` mods) via
 * ASME VIII UG-27 hoop stress when a design pressure is supplied. Pure; exported
 * for tests. Returns [] when no volume is supplied (never invents geometry).
 */
export function vesselDimsFromVolume(
  volume_m3: number | undefined,
  aspect = 3,
  design_pressure_bar?: number,
): ModifierCharacter[] {
  if (volume_m3 === undefined || volume_m3 <= 0) return []
  const D = Math.cbrt((4 * volume_m3) / (Math.PI * aspect))
  const Dmm = Math.round(D * 1000)
  const Lmm = Math.round(aspect * D * 1000)
  let dimStr = `Ø${Dmm} × ${Lmm} mm (cylinder, L/D ${aspect}, sized from ${Math.round(volume_m3 * 1000) / 1000} m³)`
  if (design_pressure_bar !== undefined && design_pressure_bar > 0) {
    const P = design_pressure_bar * 0.1 // bar → MPa
    const S = 138 // 304SS allowable stress, MPa
    const E = 0.85 // longitudinal joint efficiency
    const tmm = Math.round(((P * (Dmm / 2)) / (S * E - 0.6 * P) + 3) * 10) / 10 // UG-27 hoop + 3 mm corrosion
    dimStr = `Ø${Dmm} × ${Lmm} mm × ${tmm} mm wall (L/D ${aspect}, ASME UG-27 @ ${design_pressure_bar} bar)`
  }
  return [
    mod('capacity', String(Math.round(volume_m3 * 1000) / 1000), 'm³ working volume'),
    mod('dimension', dimStr),
  ]
}

/** Pipe/line bore from volumetric flow at a design velocity: D = √(4Q/(π·v)). */
export function pipeBoreFromFlow(flow_m3_h: number | undefined, velocity_m_s = 2): ModifierCharacter[] {
  if (flow_m3_h === undefined || flow_m3_h <= 0) return []
  const D = Math.sqrt((4 * (flow_m3_h / 3600)) / (Math.PI * velocity_m_s))
  return [mod('dimension', `DN${Math.round(D * 1000)} bore (${velocity_m_s} m/s design velocity)`)]
}

/** Keep the FIRST modifier per kind — used in the universal union path so two
 *  families matching one word can't emit duplicate-kind conflicts (the bug the
 *  modifier-consistency gate exists to catch). */
function dedupeByKind(mods: ModifierCharacter[]): ModifierCharacter[] {
  const seen = new Set<string>()
  const out: ModifierCharacter[] = []
  for (const m of mods) if (!seen.has(m.kind)) { seen.add(m.kind); out.push(m) }
  return out
}

// ── PROCESS-PLANT family — emits SELF-CONSISTENT geometry from contract physics.
//    Every rule is param-gated (emits [] when the contract lacks the source), so it
//    only fires when a real tool produced the quantity (grounded via Phase 1). The
//    vessel rule is the centrepiece: dimensions are DERIVED from the working volume,
//    so a tank/reactor is the right size by construction (the satellite-tank bug).
const PROCESS_PLANT: SizingRule[] = [
  { id: 'vessel', match: /tank|vessel|reactor|column|drum|separator|absorber|stripper|crystallis|crystalliz|scrubber|digester|fermenter|autoclave|recrystallis/i,
    size: (p) => vesselDimsFromVolume(
      findNum(p, [/(reactor|tank|vessel|working|absorber|stripper|column|buffer|storage|carbonation)_?volume_?m3/i, /volume_m3$/i]),
      3,
      findNum(p, [/design_pressure_bar/i, /operating_pressure_bar/i, /pressure_bar/i]),
    ) },
  { id: 'pump', match: /\bpump\b|circulation|metering|dosing/i,
    size: (p) => [...spec('rating_primary', findNum(p, [/flow_?rate_?m3_?h/i, /circulation_?m3_?h/i, /pump_?flow/i]), 'm³/h'), ...spec('performance', findNum(p, [/^head_?m$|pump_?head_?m/i]), 'm head')] },
  { id: 'heat_exchanger', match: /heat[_\s-]?exchanger|\bhx\b|cooler|condenser|reboiler|economiser|economizer/i,
    size: (p) => [...spec('rating_primary', findNum(p, [/duty_?kw|heat_?duty|thermal_?duty_?kw|reboiler_?duty/i]), 'kW duty'), ...spec('capacity', findNum(p, [/hx_?area_?m2|exchange_?area_?m2|heat_?transfer_?area_?m2/i]), 'm² area')] },
  { id: 'compressor_blower', match: /compressor|blower|\bfan\b/i,
    size: (p) => [...spec('rating_primary', findNum(p, [/compressor_?power_?kw|blower_?power_?kw|gas_?power_?kw/i]), 'kW'), ...spec('capacity', findNum(p, [/gas_?flow_?m3_?h|gas_?nm3_?h/i]), 'm³/h')] },
  { id: 'pipe_line', match: /\bpipe\b|piping|\bline\b|manifold|\bheader\b/i,
    size: (p) => pipeBoreFromFlow(findNum(p, [/process_?flow_?m3_?h|line_?flow_?m3_?h|flow_?rate_?m3_?h/i])) },
]

/**
 * Flat-panel radiator area + dimensions from a heat load. SPACE: radiative
 * A = Q/(ε·σ·(T_rad⁴ − T_sink⁴)). TERRESTRIAL: forced-air finned A = Q/flux
 * (~800 W/m²). Square panel (side = √A). Q in kW. Pure; exported for tests.
 */
export function radiatorDimsFromHeat(
  heat_kw: number | undefined,
  mode: 'space' | 'terrestrial' = 'terrestrial',
  t_rad_k = 320,
  t_sink_k = 250,
): ModifierCharacter[] {
  if (heat_kw === undefined || heat_kw <= 0) return []
  const Q = heat_kw * 1000 // W
  const area_m2 = mode === 'space'
    ? Q / (0.85 * 5.670374e-8 * (Math.pow(t_rad_k, 4) - Math.pow(t_sink_k, 4)))
    : Q / 800
  const side_mm = Math.round(Math.sqrt(area_m2) * 1000)
  return [
    mod('rating_primary', String(Math.round(heat_kw * 100) / 100), 'kW heat rejection'),
    mod('capacity', String(Math.round(area_m2 * 100) / 100), 'm² radiating area'),
    mod('dimension', `${side_mm} × ${side_mm} mm panel (${mode}, sized from ${Math.round(heat_kw * 100) / 100} kW)`),
  ]
}

/** Solar-array area + dimensions from electrical power: A = P/(flux·η). Space
 *  flux 1361 W/m², η ~0.30 (triple-junction). P in W. Square. Pure; exported. */
export function solarArrayDimsFromPower(power_w: number | undefined, flux_w_m2 = 1361, eff = 0.3): ModifierCharacter[] {
  if (power_w === undefined || power_w <= 0) return []
  const area_m2 = power_w / (flux_w_m2 * eff)
  const side_mm = Math.round(Math.sqrt(area_m2) * 1000)
  return [
    mod('rating_primary', String(Math.round(power_w)), 'W BoL'),
    mod('capacity', String(Math.round(area_m2 * 100) / 100), 'm² array'),
    mod('dimension', `${side_mm} × ${side_mm} mm (η ${Math.round(eff * 100)}%, sized from ${Math.round(power_w)} W)`),
  ]
}

// ── THERMAL-REJECTION family — radiator/cold-plate panels sized from heat load
//    (compute-heat, edge-compute, spacecraft thermal). Param-gated.
const THERMAL_REJECTION: SizingRule[] = [
  { id: 'radiator', match: /radiator|heat[_\s-]?reject|dry[_\s-]?cooler|finned|thermal[_\s-]?panel/i,
    size: (p) => radiatorDimsFromHeat(
      findNum(p, [/heat[_\s-]?(load|reject|dissipat).*kw/i, /thermal_?(load|dissipation)_?kw/i, /waste_?heat_?kw/i, /dissipated_?power_?kw/i]),
      findNum(p, [/orbit|altitude_?km|t_?sink/i]) !== undefined ? 'space' : 'terrestrial',
    ) },
]

// ── SPACECRAFT family — propellant tanks (volume→geometry), solar arrays
//    (power→area), thrusters, reaction wheels. Param-gated. Covers satellite /
//    thruster archetypes; the propellant tank reuses the vessel geometry so a
//    COPV is the right size for its volume (the satellite-run bug).
const SPACECRAFT: SizingRule[] = [
  { id: 'propellant_tank', match: /propellant|\bcopv\b|xenon|fuel[_\s-]?tank|oxidiser|oxidizer|\bn2o\b|hydrazine/i,
    size: (p) => vesselDimsFromVolume(
      findNum(p, [/propellant_?volume_?m3|tank_?volume_?m3|copv_?volume_?m3|fuel_?volume_?m3/i]),
      2.5,
      findNum(p, [/tank_?pressure_?bar|copv_?pressure_?bar|design_?pressure_?bar/i]),
    ) },
  { id: 'solar_array', match: /solar[_\s-]?array|solar[_\s-]?panel|photovolta|solar[_\s-]?cell/i,
    size: (p) => solarArrayDimsFromPower(findNum(p, [/solar_?power_?w|array_?power_?w|generated_?power_?w|power_?bol_?w/i])) },
  { id: 'thruster', match: /thruster|nozzle|combustion[_\s-]?chamber|\bengine\b/i,
    size: (p) => [...spec('rating_primary', findNum(p, [/^thrust_?n$|thrust_?newton/i]), 'N thrust'), ...spec('performance', findNum(p, [/^isp_?s$|specific_?impulse_?s/i]), 's Isp')] },
  { id: 'reaction_wheel', match: /reaction[_\s-]?wheel|momentum[_\s-]?wheel|\bcmg\b|control[_\s-]?moment/i,
    size: (p) => spec('rating_primary', findNum(p, [/momentum_?nms|angular_?momentum_?nms/i]), 'Nms') },
]

const FAMILIES: Record<string, SizingRule[]> = {
  battery: BATTERY,
  process_plant: PROCESS_PLANT,
  thermal_rejection: THERMAL_REJECTION,
  spacecraft: SPACECRAFT,
}

// Class → sizing family (coarse; same intent as build-links FAMILY_KEY). Extend as
// new families gain a ruleset; an unmapped class is left un-sized (Phase-1 baseline).
const FAMILY_OF: Record<string, string> = {
  energy_storage: 'battery',
  bess: 'battery',
  'bess-utility-scale': 'battery',
  ess: 'battery',
  battery: 'battery',
  residential_ess: 'battery',
  marine_ess: 'battery',
  second_life_battery_pack: 'battery',
  vehicle_battery_pack: 'battery',
  // process-plant family. Most are registered with hand plans + bypass this layer;
  // the mapping documents intent + applies if one hits the generic path. An UNMAPPED
  // (truly novel) class gets the universal UNION of all families below.
  co2_mineralisation: 'process_plant',
  co2_capture: 'process_plant',
  direct_air_capture: 'process_plant',
  e_fuel: 'process_plant',
  e_fuel_synthesis: 'process_plant',
  chemical_plant: 'process_plant',
  water_treatment: 'process_plant',
}

function flattenParams(contract: ContractInProgress): SizingParams {
  const out: SizingParams = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' || typeof val === 'string') out[k] = val
  }
  return out
}

/** Replace existing modifiers of the same kind, then append the sized ones. */
function mergeMods(word: WordLike, add: ModifierCharacter[]): void {
  if (add.length === 0) return
  const kinds = new Set(add.map((m) => m.kind))
  const kept = (word.modifier_characters ?? []).filter((m) => !kinds.has(m.kind))
  word.modifier_characters = [...kept, ...add]
}

/**
 * Attach the contract's computed engineering (real quantities + ratings) to the
 * generic component words for the class's FAMILY. Mutates `modules` in place.
 *
 * @returns the resolved family (or null if the class has no ruleset) + how many
 *          words were sized — for logging / the emitter rationale.
 */
export function applyFamilySizing(
  modules: ModuleLike[],
  contract: ContractInProgress,
  className: string,
): { family: string | null; sized: number } {
  const mapped = FAMILY_OF[String(className ?? '').trim().toLowerCase()]
  // Registered class → its single family (first-match-wins, exact prior behaviour).
  // UNSEEN class → the UNION of every family's rules. Each rule is param-gated, so it
  // only fires when the contract actually supplies its source quantity (grounded via
  // Phase 1) — this is the universal path that sizes a never-seen archetype from
  // whatever physics its tools produced, with no per-class wiring. 2026-06-10 Phase 3.
  const family = mapped ?? 'universal'
  const rules = mapped ? FAMILIES[mapped] : Object.values(FAMILIES).flat()
  if (!rules || rules.length === 0) return { family: null, sized: 0 }
  const unionMode = !mapped

  const p = flattenParams(contract)
  let sized = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const hay = `${w.id ?? ''} ${w.name_human ?? ''} ${w.content_character?.character_id ?? ''} ${w.content_character?.name_human ?? ''}`.toLowerCase()
        let add: ModifierCharacter[]
        if (unionMode) {
          // Apply EVERY matching rule and merge (dedupe by kind keeps the first
          // value, so two families can't emit a duplicate-kind conflict).
          add = dedupeByKind(rules.filter((r) => r.match.test(hay)).flatMap((r) => r.size(p)))
        } else {
          const rule = rules.find((r) => r.match.test(hay))
          add = rule ? rule.size(p) : []
        }
        if (add.length) {
          mergeMods(w, add)
          sized += 1
        }
      }
    }
  }
  return { family, sized }
}
