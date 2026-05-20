/**
 * @file universal-arithmetic-gates.ts — Universal field-relationship gates.
 *
 * Replaces class-arithmetic-gates.ts (which routed via CLASS_GATES[productClass]
 * — too BESS-restrictive). Each gate here is **field-presence guarded**: it
 * fires only on designs that declare the relevant fields, regardless of product
 * class. A heat pump and a BESS and a vertical farm all run through the same
 * gate list — different gates fire for each because they declare different
 * fields.
 *
 * Gate contract:
 *   - name: unique short id
 *   - description: human-readable
 *   - evaluate(modules) → { score, passed, reasons, affected }
 *     · score positive = good, negative = bad, 0 = silent (preconditions absent)
 *     · passed = true iff score >= 0 (Phase 2 hard accept gate)
 *     · reasons[] = human readable lines for telemetry / repair
 *     · affected[] = module ids touched (for repair targeting)
 *
 * Tristan/Council 2026-05-14: universal, not class-specific.
 */
import type { ModuleSpec } from '../types/module-decomposition'

export interface GateResult {
  score: number
  passed: boolean
  reasons: string[]
  affected: string[]
}

export interface ArithmeticGate {
  name: string
  description: string
  evaluate: (modules: ModuleSpec[]) => GateResult
}

// ─── helpers ────────────────────────────────────────────────────────────────

function num(dp: Record<string, number | string> | undefined, ...keys: string[]): number | null {
  if (!dp) return null
  for (const k of keys) {
    const x = dp[k]
    if (typeof x === 'number' && Number.isFinite(x)) return x
  }
  return null
}

function approxEqual(a: number, b: number, tolPct: number): boolean {
  if (b === 0) return a === 0
  return Math.abs(a - b) / Math.abs(b) <= tolPct
}

function findByKey(modules: ModuleSpec[], key: string): ModuleSpec | undefined {
  return modules.find(m => m.module === key)
}

function emptyResult(): GateResult {
  return { score: 0, passed: true, reasons: [], affected: [] }
}

// Trigger/verify split (council fix 2026-05-20, BESS iter-6).
//
// The original gates silently fell through when ANY required field was
// missing (`if (!a || !b || !c) continue`). That meant a BESS that declared
// `cell_count + capacity_kwh` but no `cell_capacity_ah` skipped the capacity-
// arithmetic check entirely — the 458.75 kWh ≠ 500 kWh contradiction landed
// in the PDF unflagged. Every gate now distinguishes:
//   - 0 trigger fields present → not the gate's domain, silent skip
//   - ≥1 trigger field present but verify set incomplete → INCOMPLETE fail
//   - all verify fields present → run the arithmetic
function incompleteResult(gateName: string, moduleId: string, missing: string[], present: string[]): GateResult {
  return {
    score: -1500,
    passed: false,
    reasons: [`${gateName} INCOMPLETE on ${moduleId}: declared {${present.join(', ')}} but missing [${missing.join(', ')}]. Generator MUST emit the full field set to make the arithmetic verifiable. FIX: add the missing keys to ${moduleId}.derived_parameters.`],
    affected: [moduleId],
  }
}

// ─── gates ──────────────────────────────────────────────────────────────────

/** cells × Ah × V / 1000 ≈ nameplate kWh (any electrochemical store). */
const cellsAhVoltageCapacityGate: ArithmeticGate = {
  name: 'cells_ah_voltage_capacity',
  description: 'cell_count × cell_capacity_ah × cell_voltage_v / 1000 ≈ capacity_kwh_total (±2 %)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const cells = num(dp, 'cell_count')
      const Ah = num(dp, 'cell_capacity_ah', 'cell_ah')
      const V = num(dp, 'cell_voltage_v', 'cell_voltage_nominal_v')
      const nameplate = num(dp, 'nameplate_capacity_mwh') !== null
        ? (num(dp, 'nameplate_capacity_mwh') as number) * 1000
        : num(dp, 'capacity_kwh_total', 'capacity_kwh_gross', 'capacity_kwh_nameplate', 'capacity_kwh')

      // Trigger: cell_count OR nameplate present → this module is an
      // electrochemical store. Either signal alone is unambiguous: a
      // non-electrochemical module never declares cell_count, and a module
      // that declares its own capacity_kwh is the energy-source module.
      const hasTrigger = cells !== null || nameplate !== null
      if (!hasTrigger) continue

      const present: string[] = []
      const missing: string[] = []
      if (cells !== null) present.push(`cell_count=${cells}`); else missing.push('cell_count')
      if (Ah !== null) present.push(`cell_capacity_ah=${Ah}`); else missing.push('cell_capacity_ah')
      if (V !== null) present.push(`cell_voltage_v=${V}`); else missing.push('cell_voltage_v')
      if (nameplate !== null) present.push(`capacity_kwh=${nameplate}`); else missing.push('capacity_kwh')
      if (missing.length > 0) return incompleteResult('capacity', m.module, missing, present)

      const product = (cells! * Ah! * V!) / 1000
      const errPct = Math.abs(product - nameplate!) / nameplate!
      if (errPct <= 0.02) {
        return { score: 1000, passed: true, reasons: [`capacity OK on ${m.module}: ${cells}×${Ah}×${V}/1000 = ${product.toFixed(0)} ≈ ${nameplate} kWh`], affected: [m.module] }
      }
      const correctCells = Math.ceil(nameplate! * 1000 / (Ah! * V!))
      const correctNameplate = product
      return { score: -5000, passed: false, reasons: [`capacity FAIL on ${m.module}: ${cells}×${Ah}×${V}/1000 = ${product.toFixed(1)} but declared ${nameplate} (${(errPct * 100).toFixed(1)}% off). FIX: either set cell_count=${correctCells} to match nameplate, or set capacity_kwh=${correctNameplate.toFixed(1)} to match cell topology.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** modules × cells_per_module = cell_count exactly. */
const moduleCellCountGate: ArithmeticGate = {
  name: 'module_cell_count',
  description: 'module_count × cells_per_module = cell_count exactly',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const cells = num(dp, 'cell_count')
      const mods = num(dp, 'module_count', 'modules_count')
      const cpm = num(dp, 'cells_per_module')
      // Trigger: cell_count is the strongest signal. If a module declares
      // cell_count but doesn't break it down into module_count × cells_per_module,
      // the pack topology is unverifiable.
      if (cells === null) continue
      const present: string[] = [`cell_count=${cells}`]
      const missing: string[] = []
      if (mods !== null) present.push(`module_count=${mods}`); else missing.push('module_count')
      if (cpm !== null) present.push(`cells_per_module=${cpm}`); else missing.push('cells_per_module')
      if (missing.length > 0) return incompleteResult('module_cell_count', m.module, missing, present)
      if (mods! * cpm! === cells) {
        return { score: 500, passed: true, reasons: [`mod-count OK on ${m.module}: ${mods}×${cpm}=${cells}`], affected: [m.module] }
      }
      return { score: -2000, passed: false, reasons: [`mod-count FAIL on ${m.module}: ${mods}×${cpm}=${mods! * cpm!} ≠ ${cells}. FIX: pick integer (module_count, cells_per_module) that multiplies to ${cells}.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** cells_per_module × modules_per_string × cell_voltage_v ≈ dc_bus_voltage_v (±2 %). */
const seriesStackVoltageGate: ArithmeticGate = {
  name: 'series_stack_voltage',
  description: 'cells_per_module × modules_per_string × cell_voltage_v ≈ dc_bus_voltage_v (±2 %)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const cpm = num(dp, 'cells_per_module')
      const mps = num(dp, 'modules_per_string')
      const V = num(dp, 'cell_voltage_v', 'cell_voltage_nominal_v')
      const bus = num(dp, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v', 'nominal_voltage_v')
      // Trigger: bus voltage OR cells_per_module declared on a module signals
      // electrochemical stack topology. Either alone is enough to demand the
      // series-V arithmetic be verifiable.
      const hasTrigger = bus !== null || cpm !== null
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      if (cpm !== null) present.push(`cells_per_module=${cpm}`); else missing.push('cells_per_module')
      if (mps !== null) present.push(`modules_per_string=${mps}`); else missing.push('modules_per_string')
      if (V !== null) present.push(`cell_voltage_v=${V}`); else missing.push('cell_voltage_v')
      if (bus !== null) present.push(`dc_bus_voltage_v=${bus}`); else missing.push('dc_bus_voltage_v')
      if (missing.length > 0) return incompleteResult('series_stack_voltage', m.module, missing, present)
      const stack = cpm! * mps! * V!
      if (approxEqual(stack, bus!, 0.02)) {
        return { score: 800, passed: true, reasons: [`series-V OK on ${m.module}: ${cpm}×${mps}×${V}=${stack.toFixed(1)}≈${bus}`], affected: [m.module] }
      }
      return { score: -2000, passed: false, reasons: [`series-V FAIL on ${m.module}: ${cpm}×${mps}×${V}=${stack.toFixed(1)} ≠ ${bus}. FIX: pick (cells_per_module, modules_per_string) whose product × ${V}V = ${bus}V (need ${Math.round(bus! / V!)} cells in series total).`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** usable_kWh = nameplate × DoD ±1 %. */
const usableEnergyClosureGate: ArithmeticGate = {
  name: 'usable_energy_closure',
  description: 'usable_capacity_kwh = nameplate × dod_fraction (±1 %)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const nameplate = num(dp, 'nameplate_capacity_mwh') !== null
        ? (num(dp, 'nameplate_capacity_mwh') as number) * 1000
        : num(dp, 'capacity_kwh_total', 'capacity_kwh_gross', 'capacity_kwh')
      const usable = num(dp, 'usable_capacity_kwh', 'capacity_kwh_usable', 'usable_kwh')
      const dod = num(dp, 'dod_fraction', 'dod_max')
      // Trigger: any of {nameplate, usable, dod} declared → this is an
      // energy-storage module and the DoD relationship is verifiable.
      const hasTrigger = nameplate !== null || usable !== null || dod !== null
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      if (nameplate !== null) present.push(`nameplate_kwh=${nameplate}`); else missing.push('capacity_kwh (nameplate)')
      if (usable !== null) present.push(`usable_kwh=${usable}`); else missing.push('usable_capacity_kwh')
      if (dod !== null) present.push(`dod_fraction=${dod}`); else missing.push('dod_fraction')
      if (missing.length > 0) return incompleteResult('usable_energy_closure', m.module, missing, present)
      const expected = nameplate! * dod!
      if (approxEqual(expected, usable!, 0.01)) {
        return { score: 600, passed: true, reasons: [`usable OK on ${m.module}: ${nameplate}×${dod}=${expected.toFixed(0)}≈${usable}`], affected: [m.module] }
      }
      return { score: -1800, passed: false, reasons: [`usable FAIL on ${m.module}: ${nameplate}×${dod}=${expected.toFixed(0)} ≠ ${usable}. FIX: set usable_capacity_kwh=${expected.toFixed(1)} OR adjust dod_fraction to ${(usable! / nameplate!).toFixed(3)}.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** COP × electrical_input ≈ thermal_output (any heat-pump / chiller / refrigerator). */
const copThermalElectricalGate: ArithmeticGate = {
  name: 'cop_thermal_electrical',
  description: 'rated_thermal_kw / cop ≈ rated_electrical_kw (±5 %)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const cop = num(dp, 'cop_target', 'cop', 'cop_rated')
      const thermal = num(dp, 'rated_thermal_kw', 'heat_output_kw', 'thermal_capacity_kw')
      const electric = num(dp, 'rated_electrical_kw', 'compressor_power_kw', 'electrical_input_kw')
      // Trigger: any of {cop, thermal, electric} declared → this is a heat-
      // moving device and the COP relationship is verifiable.
      const hasTrigger = cop !== null || thermal !== null || electric !== null
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      if (cop !== null) present.push(`cop=${cop}`); else missing.push('cop_target')
      if (thermal !== null) present.push(`rated_thermal_kw=${thermal}`); else missing.push('rated_thermal_kw')
      if (electric !== null) present.push(`rated_electrical_kw=${electric}`); else missing.push('rated_electrical_kw')
      if (missing.length > 0) return incompleteResult('cop_thermal_electrical', m.module, missing, present)
      const expected = thermal! / cop!
      if (approxEqual(expected, electric!, 0.05)) {
        return { score: 800, passed: true, reasons: [`COP OK on ${m.module}: ${thermal}/${cop}=${expected.toFixed(2)}≈${electric}`], affected: [m.module] }
      }
      return { score: -1500, passed: false, reasons: [`COP FAIL on ${m.module}: ${thermal}/${cop}=${expected.toFixed(2)} ≠ ${electric}. FIX: set rated_electrical_kw=${expected.toFixed(2)} OR adjust COP to ${(thermal! / electric!).toFixed(2)}.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** Refrigerant mass flow × Δh ≈ thermal capacity (any phase-change loop). */
const refrigerantMassFlowGate: ArithmeticGate = {
  name: 'refrigerant_mass_flow',
  description: 'refrigerant_mass_flow_kg_s × enthalpy_change_kj_kg ≈ rated_thermal_kw (±5 %)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const flow = num(dp, 'refrigerant_mass_flow_kg_s')
      const dh = num(dp, 'enthalpy_change_kj_kg', 'evap_delta_h_kj_kg', 'condenser_delta_h_kj_kg')
      const thermal = num(dp, 'rated_thermal_kw', 'heat_output_kw')
      // Trigger: any of {flow, dh, thermal} declared on this module → phase-
      // change loop. Mass-flow arithmetic verifiable.
      const hasTrigger = flow !== null || dh !== null || (thermal !== null && (num(dp, 'refrigerant') !== null || /^thermal_management/i.test(m.module) || /chiller|refrigerant|heat.?pump/i.test(JSON.stringify(dp ?? {}))))
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      if (flow !== null) present.push(`refrigerant_mass_flow_kg_s=${flow}`); else missing.push('refrigerant_mass_flow_kg_s')
      if (dh !== null) present.push(`enthalpy_change_kj_kg=${dh}`); else missing.push('enthalpy_change_kj_kg')
      if (thermal !== null) present.push(`rated_thermal_kw=${thermal}`); else missing.push('rated_thermal_kw')
      if (missing.length > 0) return incompleteResult('refrigerant_mass_flow', m.module, missing, present)
      const expected = flow! * dh!
      if (approxEqual(expected, thermal!, 0.05)) {
        return { score: 600, passed: true, reasons: [`refrigerant OK on ${m.module}: ${flow}×${dh}=${expected.toFixed(1)}≈${thermal}`], affected: [m.module] }
      }
      return { score: -1200, passed: false, reasons: [`refrigerant FAIL on ${m.module}: ${flow}×${dh}=${expected.toFixed(1)} ≠ ${thermal}. FIX: set refrigerant_mass_flow_kg_s=${(thermal! / dh!).toFixed(4)} OR enthalpy_change_kj_kg=${(thermal! / flow!).toFixed(1)}.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** LED total power = PPFD × area / efficacy / 1000 (any photosynthetic system). */
const ledPpfdAreaGate: ArithmeticGate = {
  name: 'led_ppfd_area',
  description: 'ppfd_umol_m2_s × canopy_area_m2 / led_efficacy_umol_j / 1000 ≈ led_power_kw (±10 %)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const ppfd = num(dp, 'ppfd_umol_m2_s', 'ppfd', 'target_ppfd')
      const area = num(dp, 'canopy_area_m2', 'growing_area_m2')
      const efficacy = num(dp, 'led_efficacy_umol_j', 'photon_efficacy')
      const ledKw = num(dp, 'led_power_kw', 'lighting_power_kw')
      // Trigger: any of {ppfd, ledKw} declared → photosynthetic system.
      // area/efficacy alone are too generic to be sole triggers.
      const hasTrigger = ppfd !== null || ledKw !== null
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      if (ppfd !== null) present.push(`ppfd=${ppfd}`); else missing.push('ppfd_umol_m2_s')
      if (area !== null) present.push(`canopy_area_m2=${area}`); else missing.push('canopy_area_m2')
      if (efficacy !== null) present.push(`led_efficacy=${efficacy}`); else missing.push('led_efficacy_umol_j')
      if (ledKw !== null) present.push(`led_power_kw=${ledKw}`); else missing.push('led_power_kw')
      if (missing.length > 0) return incompleteResult('led_ppfd_area', m.module, missing, present)
      const expectedKw = (ppfd! * area!) / efficacy! / 1000
      if (approxEqual(expectedKw, ledKw!, 0.10)) {
        return { score: 600, passed: true, reasons: [`LED-power OK on ${m.module}: ${ppfd}×${area}/${efficacy}/1000≈${expectedKw.toFixed(1)}kW`], affected: [m.module] }
      }
      return { score: -1200, passed: false, reasons: [`LED-power FAIL on ${m.module}: ${expectedKw.toFixed(1)}kW vs declared ${ledKw}kW. FIX: set led_power_kw=${expectedKw.toFixed(2)} OR adjust ppfd/area/efficacy to match declared power.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** Irrigation total flow = plant_count × per-plant flow rate. */
const irrigationFlowGate: ArithmeticGate = {
  name: 'irrigation_flow',
  description: 'plant_count × flow_per_plant_l_h ≈ total_flow_l_h (±5 %)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const plants = num(dp, 'plant_count', 'total_plants')
      const per = num(dp, 'flow_per_plant_l_h', 'water_per_plant_l_h')
      const total = num(dp, 'total_flow_l_h', 'irrigation_flow_l_h')
      // Trigger: any of {plants, per, total} declared → fluid-delivery
      // system. Verifiable.
      const hasTrigger = plants !== null || per !== null || total !== null
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      if (plants !== null) present.push(`plant_count=${plants}`); else missing.push('plant_count')
      if (per !== null) present.push(`flow_per_plant_l_h=${per}`); else missing.push('flow_per_plant_l_h')
      if (total !== null) present.push(`total_flow_l_h=${total}`); else missing.push('total_flow_l_h')
      if (missing.length > 0) return incompleteResult('irrigation_flow', m.module, missing, present)
      const expected = plants! * per!
      if (approxEqual(expected, total!, 0.05)) {
        return { score: 500, passed: true, reasons: [`flow OK on ${m.module}: ${plants}×${per}=${expected.toFixed(0)}≈${total}`], affected: [m.module] }
      }
      return { score: -1000, passed: false, reasons: [`flow FAIL on ${m.module}: ${plants}×${per}=${expected.toFixed(0)} ≠ ${total}. FIX: set total_flow_l_h=${expected.toFixed(1)} OR adjust flow_per_plant_l_h to ${(total! / plants!).toFixed(3)}.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/** DC bus voltage consistent across every module that declares it (±2 %). */
const dcBusVoltageConsistencyGate: ArithmeticGate = {
  name: 'dc_bus_voltage_consistency',
  description: 'dc_bus_voltage_v consistent across all modules that declare it (±2 %)',
  evaluate(modules) {
    const dcVoltages: Array<{ mod: string; v: number }> = []
    for (const m of modules) {
      const v = num(m.derived_parameters, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v', 'dc_input_voltage_v', 'nominal_voltage_v')
      if (v !== null) dcVoltages.push({ mod: m.module, v })
    }
    if (dcVoltages.length < 2) return emptyResult()
    const sorted = [...dcVoltages].sort((a, b) => a.v - b.v)
    const ref = sorted[Math.floor(sorted.length / 2)].v
    const fails = dcVoltages.filter(d => !approxEqual(d.v, ref, 0.02))
    if (fails.length === 0) {
      return { score: 600, passed: true, reasons: [`cross-mod DC-V OK: all ${dcVoltages.length} at ${ref}V`], affected: [] }
    }
    return { score: -1000 * fails.length, passed: false, reasons: [`cross-mod DC-V FAIL: ${fails.length}/${dcVoltages.length} disagree (median ${ref})`], affected: fails.map(f => f.mod) }
  },
}

/** I = P / V — bus rating ≥ required × 1.15 (15 % headroom). */
const currentRatingHeadroomGate: ArithmeticGate = {
  name: 'current_rating_headroom',
  description: 'bus_rating_a ≥ peak_power_kw × 1000 / dc_voltage_v × 1.15',
  evaluate(modules) {
    const peakKw = num(findByKey(modules, 'energy_conversion_transduction')?.derived_parameters, 'rated_power_peak_kw', 'peak_power_kw')
    const dcV = num(findByKey(modules, 'energy_conversion_transduction')?.derived_parameters, 'dc_input_voltage_v')
      ?? num(findByKey(modules, 'energy_storage_source')?.derived_parameters, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v')
    const busA = num(findByKey(modules, 'power_distribution')?.derived_parameters, 'dc_bus_rating_a', 'dc_bus_current_rating_a')
    if (!peakKw || !dcV || !busA) return emptyResult()
    const required = (peakKw * 1000) / dcV
    const ratio = busA / required
    if (ratio >= 1.15) {
      return { score: 500, passed: true, reasons: [`bus-A OK: ${busA}A ≥ ${required.toFixed(0)}A × 1.15`], affected: [] }
    }
    const fixHint = `FIX: edit power_distribution.derived_parameters.dc_bus_rating_a to ≥ ${Math.ceil(required * 1.15)} A.`
    if (ratio >= 1.0) {
      return { score: -800, passed: false, reasons: [`bus-A TIGHT: dc_bus_rating_a=${busA} vs ${required.toFixed(0)} (need 15 % margin). ${fixHint}`], affected: ['power_distribution'] }
    }
    return { score: -3000, passed: false, reasons: [`bus-A UNDER: dc_bus_rating_a=${busA} < ${required.toFixed(0)} required. ${fixHint}`], affected: ['power_distribution'] }
  },
}

/** Cooling capacity ≥ heat estimate × 1.25 (any active cooling). */
const coolingPowerGate: ArithmeticGate = {
  name: 'cooling_power',
  description: 'cooling_capacity_kw ≥ continuous_power × (1 − efficiency) × 1.25 (25 % margin)',
  evaluate(modules) {
    const ect = findByKey(modules, 'energy_conversion_transduction')
    const env = findByKey(modules, 'environmental_interface')
    const contKw = num(ect?.derived_parameters, 'rated_power_continuous_kw', 'continuous_power_kw', 'rated_power_kw')
    const effPct = num(ect?.derived_parameters, 'efficiency_percent', 'round_trip_efficiency_percent')
    const coolKw = num(env?.derived_parameters, 'cooling_capacity_kw', 'thermal_capacity_kw')
    if (!contKw || !coolKw) return emptyResult()
    const eff = (effPct ?? 95) / 100
    const heatEstKw = contKw * (1 - eff) + contKw * 0.02
    const required = heatEstKw * 1.25
    if (coolKw >= required) {
      return { score: 400, passed: true, reasons: [`cooling OK: ${coolKw}kW ≥ ${required.toFixed(0)}kW`], affected: [] }
    }
    return {
      score: -1500,
      passed: false,
      reasons: [`cooling UNDER: cooling_capacity_kw=${coolKw} < ${required.toFixed(2)} required (heat ${heatEstKw.toFixed(2)}kW × 1.25). FIX: edit environmental_interface.derived_parameters.cooling_capacity_kw to ${Math.ceil(required)} (≥ required, with safety margin) OR add a second cooling sub-module to bridge the gap.`],
      affected: ['environmental_interface'],
    }
  },
}

/**
 * Pull the quantity multiplier off a WordSpec. The chain emits quantity as a
 * modifier_character with kind="quantity" and value like "×4500", "4500",
 * "× 4500", "4500 ea", etc. Default to 1 when absent or unparseable.
 *
 * BUG HISTORY (Tristan / Test 4, 2026-05-15): cost_ceiling and mass_budget
 * gates previously summed `mod.value` per WORD without multiplying by
 * quantity. 4500 cells at £78 each contributed £78 to the total instead of
 * £351,000 — gates silently passed designs whose BoM-total cost was 300%+
 * over the headline. Test 4 caught it deterministically.
 */
function getWordQuantity(word: { modifier_characters?: Array<{ kind: string; value: string }> }): number {
  // Defensive: the repair LLM has been observed to emit non-array values for
  // modifier_characters (e.g. a single object instead of [object]). Coerce to
  // array-or-empty before any .find() call.
  const mods = Array.isArray(word.modifier_characters) ? word.modifier_characters : []
  const qty = mods.find(m => /^quantity$|^qty$/i.test(m.kind))
  if (!qty) return 1
  const raw = String(qty.value ?? '').trim()
  // Strip ×, x, *, leading "qty", commas, "ea", "off"
  const cleaned = raw.replace(/^(×|x|\*)\s*/i, '').replace(/[, ]/g, '').replace(/(ea|off|units?|pcs?)$/i, '').trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function parseNumericFromValue(s: string, unitRegex: RegExp): number | null {
  if (!s) return null
  // Strip currency, commas, units
  const m = s.match(/(-?\d[\d,]*\.?\d*)/)
  if (!m) return null
  const v = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(v) ? v : null
}

/**
 * Cost ceiling — sum of (unit_cost × quantity) across all components ≤ ceiling.
 *
 * Reads `unit_cost_ceiling_gbp` (or aliases) from any module's
 * derived_parameters as the budget. Iterates every WordSpec, multiplies
 * unit_cost_estimate_gbp by the word's quantity modifier (default 1), sums.
 * Fails if BoM total > ceiling.
 */
const costCeilingGate: ArithmeticGate = {
  name: 'cost_ceiling',
  description: 'Σ (unit_cost × quantity) across all components ≤ unit_cost_ceiling_gbp',
  evaluate(modules) {
    let ceiling: number | null = null
    for (const m of modules) {
      const c = num(m.derived_parameters, 'unit_cost_ceiling_gbp', 'cost_ceiling_gbp', 'target_unit_cost_gbp')
      if (c !== null) { ceiling = c; break }
    }
    if (!ceiling) return emptyResult()
    let total = 0
    let hasAnyDeclaredCost = false
    let largestLine = { line: 0, ref: '' }
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          const mods = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
          // Use the first cost modifier per word — modifier_consistency gate
          // is responsible for catching duplicate-kind hazards. Sum once per
          // word to avoid double-counting if the LLM emits the same cost
          // modifier twice.
          const costMod = mods.find(mc => /^unit_cost_estimate_gbp$|cost|price/i.test(mc.kind))
          if (!costMod) continue
          const unit = parseNumericFromValue(String(costMod.value ?? ''), /gbp|£/i)
          if (unit === null) continue
          const qty = getWordQuantity(w)
          const lineCost = unit * qty
          if (lineCost > largestLine.line) largestLine = { line: lineCost, ref: `${m.module}::${sm.id}::${(w as any).id ?? '?'}` }
          total += lineCost
          hasAnyDeclaredCost = true
        }
      }
    }
    if (!hasAnyDeclaredCost) return emptyResult()
    if (total <= ceiling) {
      return { score: 400, passed: true, reasons: [`cost OK: BoM Σ(unit×qty) £${total.toFixed(0)} ≤ ceiling £${ceiling}`], affected: [] }
    }
    return {
      score: -2000,
      passed: false,
      reasons: [`cost OVER: BoM Σ(unit×qty) £${total.toFixed(0)} > ceiling £${ceiling} (${((total - ceiling) / ceiling * 100).toFixed(0)}% over). Largest line: £${largestLine.line.toFixed(0)} at ${largestLine.ref}. FIX: reduce per-unit cost on the largest lines (substitute parts) OR reduce quantity OR raise the ceiling if the brief allows.`],
      affected: modules.map(m => m.module),
    }
  },
}

/**
 * Mass budget — sum of (mass × quantity) across all components ≤ limit.
 * Same fix as cost_ceiling: previously summed per-word mass without
 * multiplying by quantity.
 */
const massBudgetGate: ArithmeticGate = {
  name: 'mass_budget',
  description: 'Σ (mass × quantity) across all components ≤ max_mass_kg',
  evaluate(modules) {
    let limit: number | null = null
    for (const m of modules) {
      const c = num(m.derived_parameters, 'max_mass_kg', 'mass_limit_kg', 'gross_mass_kg')
      if (c !== null) { limit = c; break }
    }
    if (!limit) return emptyResult()
    let total = 0
    let hasAnyDeclaredMass = false
    let largestLine = { line: 0, ref: '' }
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          const mods = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
          const massMod = mods.find(mc => /^mass$|^mass_kg$|^weight$/i.test(mc.kind))
          if (!massMod) continue
          // Parse kg out of "5.3 kg" / "5.3" / "5300 g" (latter not handled)
          const v = String(massMod.value ?? '')
          let kg: number | null = null
          const m1 = v.match(/(-?\d[\d,]*\.?\d*)\s*kg/i)
          if (m1) kg = parseFloat(m1[1].replace(/,/g, ''))
          else { const m2 = v.match(/^(-?\d[\d,]*\.?\d*)$/); if (m2) kg = parseFloat(m2[1].replace(/,/g, '')) }
          if (kg === null) continue
          const qty = getWordQuantity(w)
          const lineMass = kg * qty
          if (lineMass > largestLine.line) largestLine = { line: lineMass, ref: `${m.module}::${sm.id}::${(w as any).id ?? '?'}` }
          total += lineMass
          hasAnyDeclaredMass = true
        }
      }
    }
    if (!hasAnyDeclaredMass) return emptyResult()
    if (total <= limit) {
      return { score: 400, passed: true, reasons: [`mass OK: BoM Σ(mass×qty) ${total.toFixed(0)}kg ≤ limit ${limit}kg`], affected: [] }
    }
    return {
      score: -2000,
      passed: false,
      reasons: [`mass OVER: BoM Σ(mass×qty) ${total.toFixed(0)}kg > limit ${limit}kg (${((total - limit) / limit * 100).toFixed(0)}% over). Largest line: ${largestLine.line.toFixed(0)}kg at ${largestLine.ref}. FIX: lighter-spec parts or reduce quantity.`],
      affected: modules.map(m => m.module),
    }
  },
}

/**
 * cell_discharge_rate_within_nameplate (Tristan directive 2026-05-16).
 *
 * Catches the iter-60b BESS finding: pack designed at 1.09 C continuous discharge
 * on a cell rated 1 C continuous nameplate, no derating note. The engine should
 * surface this so the human can decide to (a) accept the marginal operating
 * point with active thermal management, (b) re-rate the pack to a higher
 * parallel count, or (c) pick a higher C-rate cell.
 *
 * Math:
 *   pack_current_a       = pcs_continuous_power_kw × 1000 / dc_bus_voltage_v
 *   per_cell_current_a   = pack_current_a / parallel_paths_per_string
 *   computed_c_rate      = per_cell_current_a / cell_capacity_ah
 *   if computed_c_rate > cell_continuous_c_max AND no derating note → fail
 *
 * Required inputs (all from derived_parameters across modules):
 *   - energy_conversion_transduction.continuous_power_kw
 *   - energy_storage_source.system_voltage_nominal_v  (or dc_bus_voltage_v)
 *   - energy_storage_source.parallel_paths_per_string (or 1 if not declared)
 *   - cell_capacity_ah (read from any cell word's rating_primary, e.g. "280 Ah")
 *   - cell_continuous_c_max  (read from class-floors.ts OR derived_parameters.max_charge_rate_c)
 *
 * Silent when any input is missing. Universal to any class with cells (BESS,
 * drone, AUV, HAPS, mobile robotics).
 */
const cellDischargeRateGate: ArithmeticGate = {
  name: 'cell_discharge_rate_within_nameplate',
  description: 'pack discharge current per cell does not exceed cell continuous C-rate nameplate (or derating is declared)',
  evaluate(modules) {
    const esm = modules.find(m => m.module === 'energy_storage_source')
    const ect = modules.find(m => m.module === 'energy_conversion_transduction')
    if (!esm || !ect) return emptyResult()
    const continuousKw = num(ect.derived_parameters, 'continuous_power_kw', 'rated_power_kw', 'peak_power_kw')
    const busV = num(esm.derived_parameters, 'system_voltage_nominal_v', 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v', 'nominal_voltage_v')
    if (!continuousKw || !busV) return emptyResult()
    // Parse parallel paths from string_topology (e.g. "256s2p×20 racks" → 2 parallel per string × 20 racks = 40)
    // OR from derived_parameters.parallel_paths_per_string (default 1)
    let parallelPaths = num(esm.derived_parameters, 'parallel_paths_per_string', 'parallel_count') ?? 1
    const topology = String((esm.derived_parameters as any).string_topology ?? '')
    const topoMatch = topology.match(/(\d+)s(\d+)p(?:\s*×\s*(\d+))?/i)
    if (topoMatch) {
      const pPerString = parseInt(topoMatch[2], 10)
      const rackCount = topoMatch[3] ? parseInt(topoMatch[3], 10) : 1
      parallelPaths = (pPerString || 1) * (rackCount || 1)
    }

    // Cell nameplate Ah — find a cell word and read its rating
    let cellAh: number | null = null
    let cellName = ''
    for (const sm of (esm.sub_modules ?? [])) {
      for (const w of (sm.words ?? [])) {
        const cid = String((w as any).content_character?.character_id ?? w.id ?? '').toLowerCase()
        if (cid.includes('cell') && !cid.includes('fuse') && !cid.includes('busbar') && !cid.includes('terminal') && !cid.includes('wire')) {
          const mods = (w as any).modifier_characters ?? []
          for (const mc of mods) {
            const k = String(mc?.kind ?? '').toLowerCase()
            if (k === 'rating_primary' || k === 'rating') {
              const v = String(mc?.value ?? '')
              const match = v.match(/(\d+(?:\.\d+)?)\s*Ah/i)
              if (match) { cellAh = parseFloat(match[1]); cellName = String((w as any).name_human ?? cid); break }
            }
          }
          if (cellAh) break
        }
      }
      if (cellAh) break
    }
    if (!cellAh) return emptyResult()

    const packCurrent = (continuousKw * 1000) / busV
    const perCellCurrent = packCurrent / parallelPaths
    const computedC = perCellCurrent / cellAh

    // Cell continuous C-rate floor: prefer explicit class-floors / derived_parameters,
    // otherwise default to 1 C (LFP-typical conservative).
    const declaredCMax = num(esm.derived_parameters, 'cell_continuous_c_max', 'cell_continuous_c_rate_max', 'max_discharge_rate_c')
    const cellCMax = declaredCMax ?? 1.0

    // Check whether a derating note is present on a cell word (e.g. modifier
    // kind='derating' value='operating at 1.05C with cold-plate cooling')
    let deratingDeclared = false
    for (const sm of (esm.sub_modules ?? [])) {
      for (const w of (sm.words ?? [])) {
        const mods = (w as any).modifier_characters ?? []
        for (const mc of mods) {
          const k = String(mc?.kind ?? '').toLowerCase()
          if (k === 'derating' || k === 'continuous_derate' || k === 'discharge_derating') {
            deratingDeclared = true
            break
          }
        }
        if (deratingDeclared) break
      }
      if (deratingDeclared) break
    }

    const headroomPct = ((cellCMax - computedC) / cellCMax) * 100
    if (computedC <= cellCMax) {
      return { score: 400, passed: true, reasons: [`cell C-rate OK: ${computedC.toFixed(2)} C ≤ ${cellCMax} C cell nameplate (${headroomPct.toFixed(1)}% headroom on ${cellName})`], affected: ['energy_storage_source'] }
    }
    if (deratingDeclared) {
      return { score: 200, passed: true, reasons: [`cell C-rate ${computedC.toFixed(2)} C exceeds nameplate ${cellCMax} C BUT derating note declared on a cell word (accepting with caution)`], affected: ['energy_storage_source'] }
    }
    return {
      score: -300,
      passed: false,
      reasons: [`cell C-rate FAIL: pack discharge requires ${computedC.toFixed(2)} C per cell (${perCellCurrent.toFixed(0)} A across ${parallelPaths} parallel paths from ${packCurrent.toFixed(0)} A pack), exceeding ${cellName} nameplate ${cellCMax} C continuous. Either (a) add a "derating" modifier on the cell word with reasoning, (b) increase parallel_paths in derived_parameters, or (c) specify a higher-C-rate cell.`],
      affected: ['energy_storage_source'],
    }
  },
}

/**
 * Power balance gate (2026-05-20 iter-8 council fix B): aggregate driver
 * power must equal or exceed aggregate load power (within 5% margin).
 *
 * Closes the LED 10× mismatch class — VF iter-7 physics critic caught
 * "500W Osram PHYTOVYNE R1500 LED panels paired with 50W Inventronics
 * EUM050S050ST drivers — LEDs run at 10% capacity, fail to deliver target
 * PPFD". The capacity gate (cells × Ah × V) didn't fire because LED panel
 * power and driver power weren't surfaced as a derived parameter.
 *
 * Universal: applies to any product with driver/PSU + load components.
 * BESS pre-charge contactor + DC-link cap, EV charger AC-DC, heat pump
 * controller + EXV — all share the "PSU rating ≥ load draw" pattern.
 */
const driverLoadPowerBalanceGate: ArithmeticGate = {
  name: 'driver_load_power_balance',
  description: 'aggregate driver/PSU power ≥ aggregate load power × 0.95',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const driverCount = num(dp, 'driver_count', 'psu_count', 'led_driver_count')
      const driverPowerW = num(dp, 'driver_power_w', 'psu_power_w', 'led_driver_power_w')
      const loadCount = num(dp, 'led_count', 'panel_count', 'load_count', 'led_panel_count')
      const loadPowerW = num(dp, 'led_power_w', 'panel_power_w', 'load_power_w', 'led_panel_power_w')
      // Trigger: any of the four fields present → this module declares a
      // power-balance relationship and the arithmetic is verifiable.
      const hasTrigger = driverCount !== null || driverPowerW !== null || loadCount !== null || loadPowerW !== null
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      if (driverCount !== null) present.push(`driver_count=${driverCount}`); else missing.push('driver_count')
      if (driverPowerW !== null) present.push(`driver_power_w=${driverPowerW}`); else missing.push('driver_power_w')
      if (loadCount !== null) present.push(`load_count=${loadCount}`); else missing.push('load_count (panel_count / led_count)')
      if (loadPowerW !== null) present.push(`load_power_w=${loadPowerW}`); else missing.push('load_power_w (panel_power_w / led_power_w)')
      if (missing.length > 0) return incompleteResult('driver_load_power_balance', m.module, missing, present)
      const driverTotalW = driverCount! * driverPowerW!
      const loadTotalW = loadCount! * loadPowerW!
      const ratio = driverTotalW / loadTotalW
      if (ratio >= 0.95) {
        return { score: 700, passed: true, reasons: [`power balance OK on ${m.module}: ${driverCount}×${driverPowerW}W driver = ${driverTotalW}W ≥ ${loadCount}×${loadPowerW}W load = ${loadTotalW}W (${(ratio * 100).toFixed(0)}%)`], affected: [m.module] }
      }
      const requiredDriverW = Math.ceil(loadTotalW / driverCount!)
      return { score: -3000, passed: false, reasons: [`power balance FAIL on ${m.module}: ${driverTotalW}W driver capacity < ${loadTotalW}W load (${(ratio * 100).toFixed(0)}% — loads will be starved). FIX: upsize each driver to ≥ ${requiredDriverW}W OR increase driver_count to ${Math.ceil(loadTotalW / driverPowerW!)} to match load.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

/**
 * Pressure balance gate (2026-05-20 iter-8 council fix D): pump rated
 * pressure must meet or exceed downstream membrane/system required pressure.
 *
 * Closes the RO pump pressure mismatch class — VF iter-7 physics critic
 * caught "Dow Filmtec BW30-4040 RO membrane needs 15 bar (150 m head);
 * Grundfos CR 1-2 rated 2.5 bar — 6× short, zero RO permeate". No gate
 * existed for fluid-system pressure budget.
 *
 * Universal: applies to any product with a pump driving against a known
 * required pressure (RO, hydraulic, refrigerant, hydronic systems).
 */
const fluidPressureBalanceGate: ArithmeticGate = {
  name: 'fluid_pressure_balance',
  description: 'pump_rated_bar ≥ required_pressure_bar (membrane / loop / nozzle)',
  evaluate(modules) {
    for (const m of modules) {
      const dp = m.derived_parameters
      const pumpBar = num(dp, 'pump_rated_bar', 'pump_pressure_bar', 'pump_rated_pressure_bar')
      const pumpHeadM = num(dp, 'pump_rated_head_m', 'pump_head_m')
      const requiredBar = num(dp, 'required_pressure_bar', 'membrane_required_bar', 'system_required_bar', 'loop_required_bar')
      // Trigger: any pressure-related field declared → this is a pumped
      // fluid system. If pump and required are both missing, the gate can't
      // verify and surfaces as INCOMPLETE rather than silently skipping.
      const hasTrigger = pumpBar !== null || pumpHeadM !== null || requiredBar !== null
      if (!hasTrigger) continue
      const present: string[] = []
      const missing: string[] = []
      const effectivePumpBar = pumpBar !== null ? pumpBar : (pumpHeadM !== null ? pumpHeadM * 0.0981 : null)
      if (effectivePumpBar !== null) present.push(`pump_rated=${effectivePumpBar.toFixed(2)}bar${pumpHeadM !== null && pumpBar === null ? ` (from ${pumpHeadM}m head)` : ''}`); else missing.push('pump_rated_bar (or pump_rated_head_m)')
      if (requiredBar !== null) present.push(`required=${requiredBar}bar`); else missing.push('required_pressure_bar')
      if (missing.length > 0) return incompleteResult('fluid_pressure_balance', m.module, missing, present)
      if (effectivePumpBar! >= requiredBar!) {
        return { score: 600, passed: true, reasons: [`pressure OK on ${m.module}: pump ${effectivePumpBar!.toFixed(2)}bar ≥ required ${requiredBar}bar`], affected: [m.module] }
      }
      const shortfall = ((requiredBar! - effectivePumpBar!) / requiredBar!) * 100
      return { score: -2500, passed: false, reasons: [`pressure FAIL on ${m.module}: pump ${effectivePumpBar!.toFixed(2)}bar < required ${requiredBar}bar (${shortfall.toFixed(0)}% short → zero/negligible delivery). FIX: select a higher-stage pump rated ≥ ${requiredBar}bar (e.g. multi-stage CR 1-${Math.ceil(requiredBar! / 1.5)}) OR reduce required pressure if the loop allows.`], affected: [m.module] }
    }
    return emptyResult()
  },
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const UNIVERSAL_ARITHMETIC_GATES: ArithmeticGate[] = [
  cellsAhVoltageCapacityGate,
  moduleCellCountGate,
  seriesStackVoltageGate,
  usableEnergyClosureGate,
  copThermalElectricalGate,
  refrigerantMassFlowGate,
  ledPpfdAreaGate,
  irrigationFlowGate,
  dcBusVoltageConsistencyGate,
  currentRatingHeadroomGate,
  coolingPowerGate,
  costCeilingGate,
  massBudgetGate,
  cellDischargeRateGate,
  driverLoadPowerBalanceGate,
  fluidPressureBalanceGate,
]

export function runArithmeticGates(modules: ModuleSpec[]): {
  total_score: number
  fired: number
  passed: number
  failed: number
  results: Array<GateResult & { name: string }>
} {
  const results = UNIVERSAL_ARITHMETIC_GATES.map(g => ({ name: g.name, ...g.evaluate(modules) }))
  const fired = results.filter(r => r.score !== 0 || r.reasons.length > 0).length
  const passed = results.filter(r => r.passed && r.score > 0).length
  const failed = results.filter(r => !r.passed).length
  const total = results.reduce((a, r) => a + r.score, 0)
  return { total_score: total, fired, passed, failed, results }
}
