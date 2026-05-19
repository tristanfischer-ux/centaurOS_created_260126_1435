/**
 * @file class-arithmetic-gates.ts — Universal + class-specific arithmetic gates
 * used by the global-anchor emitter selection in council-synthesis.ts.
 *
 * Background (2026-05-14, Tristan directive after council review):
 * The previous architecture hard-coded BESS-specific arithmetic checks
 * (`cells × Ah × V ≈ kWh`) into `scoreVariantForAnchor`. This worked for the
 * 3.5 MWh battery test brief but would either skip checks (best case) or
 * false-positive flag everything (worst case) for non-BESS products like
 * heat pumps, vertical farms, bioreactors.
 *
 * This file is the universal home for both:
 *   • UNIVERSAL gates that apply regardless of product class (sub-module
 *     count, overview prose presence, overview mentions every sub-module).
 *   • CLASS_GATES — per-product-class arithmetic + cross-module gates,
 *     looked up by normalised product class.
 *
 * Adding a new product class:
 *   1. Add an entry to CLASS_GATES keyed by the normalised class name
 *      (matches the keys in class-module-priors.ts).
 *   2. Populate perModule[<UniversalModule>] with the arithmetic
 *      relations specific to that class (e.g. heat pump COP closure).
 *   3. Populate crossModule[] with system-wide checks (e.g. thermal
 *      balance, flow continuity).
 *
 * Each gate returns { score, reasons[] }. Positive scores reward emitters
 * whose math closes; negative scores below −1000 effectively reject the
 * variant from winning the global anchor.
 *
 * Status today: energy_storage fully populated. heat_pump and vertical_farm
 * stubbed with example gates as proof of universality. Other classes get
 * universal gates only until populated.
 */

import type { ModuleSpec, UniversalModule } from '../types/module-decomposition'

export interface GateResult {
  score: number
  reasons: string[]
}

/** Score one module against the gates that apply to it. */
export type ModuleGate = (m: ModuleSpec) => GateResult

/** Score the full module list (cross-module relations). */
export type CrossModuleGate = (modules: ModuleSpec[]) => GateResult

export interface ClassGateRegistry {
  /** Map from UniversalModule id to gates that apply to that module. */
  perModule: Partial<Record<UniversalModule, ModuleGate[]>>
  /** Gates that span multiple modules. */
  crossModule: CrossModuleGate[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function moduleByKey(modules: ModuleSpec[], key: UniversalModule): ModuleSpec | undefined {
  return modules.find(m => m.module === key)
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL gates — run for every product class
// ═══════════════════════════════════════════════════════════════════════════

const subModuleCountGate: ModuleGate = (m) => {
  const n = (m.sub_modules ?? []).length
  return { score: Math.min(n, 8) * 100, reasons: [`${n} sub-modules`] }
}

const overviewPresenceGate: ModuleGate = (m) => {
  const o = m.overview_paragraph_en ?? ''
  if (o.length >= 250) return { score: 50, reasons: [`overview ${o.length} chars`] }
  if (o.length > 0) return { score: 10, reasons: [`overview short: ${o.length} chars`] }
  return { score: 0, reasons: [`overview missing`] }
}

const overviewMentionsSubModulesGate: ModuleGate = (m) => {
  const o = (m.overview_paragraph_en ?? '').toLowerCase()
  if (!o) return { score: 0, reasons: [] }
  const subs = m.sub_modules ?? []
  let mentioned = 0
  for (const sm of subs) {
    const name = (sm.name_human ?? '').toLowerCase().trim()
    if (!name) continue
    // 2-token prefix to reduce false matches ("battery cell" vs "battery module")
    const tokens = name.split(/\s+/).filter(t => t.length > 0)
    const probe = tokens.slice(0, 2).join(' ')
    if (probe && o.includes(probe)) mentioned++
  }
  return { score: mentioned * 25, reasons: [`overview mentions ${mentioned}/${subs.length}`] }
}

export const UNIVERSAL_PER_MODULE_GATES: ModuleGate[] = [
  subModuleCountGate,
  overviewPresenceGate,
  overviewMentionsSubModulesGate,
]

// ═══════════════════════════════════════════════════════════════════════════
// ENERGY_STORAGE (BESS) — fully populated
// ═══════════════════════════════════════════════════════════════════════════

/** cells × Ah × V / 1000 ≈ nameplate kWh (±2 %). The flagship BESS gate. */
const bessCapacityGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const cells = num(dp, 'cell_count')
  const Ah = num(dp, 'cell_capacity_ah', 'cell_ah')
  const V = num(dp, 'cell_voltage_v', 'cell_voltage_nominal_v')
  const nameplateKwh = num(dp, 'nameplate_capacity_mwh') !== null
    ? (num(dp, 'nameplate_capacity_mwh') as number) * 1000
    : num(dp, 'capacity_kwh_total', 'capacity_kwh_gross', 'capacity_kwh_nameplate', 'capacity_kwh')
  if (!cells || !Ah || !V || !nameplateKwh) return { score: 0, reasons: [] }
  const product = (cells * Ah * V) / 1000
  const errPct = Math.abs(product - nameplateKwh) / nameplateKwh
  if (errPct <= 0.02) return { score: 1000, reasons: [`capacity OK: ${cells}×${Ah}×${V}/1000=${product.toFixed(0)}≈${nameplateKwh}`] }
  if (errPct <= 0.05) return { score: 200, reasons: [`capacity loose: ${product.toFixed(0)} vs ${nameplateKwh} (${(errPct*100).toFixed(1)}%)`] }
  return { score: -5000, reasons: [`capacity FAIL: ${product.toFixed(0)} vs ${nameplateKwh} (${(errPct*100).toFixed(1)}%)`] }
}

/** module_count × cells_per_module = cell_count exactly. */
const bessModuleCountGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const cells = num(dp, 'cell_count')
  const mods = num(dp, 'module_count', 'modules_count')
  const cpm = num(dp, 'cells_per_module')
  if (!cells || !mods || !cpm) return { score: 0, reasons: [] }
  if (mods * cpm === cells) return { score: 500, reasons: [`mod-count OK: ${mods}×${cpm}=${cells}`] }
  return { score: -2000, reasons: [`mod-count FAIL: ${mods}×${cpm}=${mods * cpm} ≠ ${cells}`] }
}

/** cells_per_module × modules_per_string × V_cell ≈ dc_bus_V ±2 %. */
const bessSeriesVoltageGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const cpm = num(dp, 'cells_per_module')
  const mps = num(dp, 'modules_per_string')
  const V = num(dp, 'cell_voltage_v', 'cell_voltage_nominal_v')
  const bus = num(dp, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v')
  if (!cpm || !mps || !V || !bus) return { score: 0, reasons: [] }
  const stackV = cpm * mps * V
  if (approxEqual(stackV, bus, 0.02)) return { score: 800, reasons: [`series-V OK: ${cpm}×${mps}×${V}=${stackV.toFixed(1)}≈${bus}`] }
  return { score: -2000, reasons: [`series-V FAIL: ${cpm}×${mps}×${V}=${stackV.toFixed(1)} ≠ ${bus}`] }
}

/** cells_per_module × modules_per_string × parallel_strings = cell_count. */
const bessTopologyGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const cpm = num(dp, 'cells_per_module')
  const mps = num(dp, 'modules_per_string')
  const ps = num(dp, 'parallel_strings')
  const cells = num(dp, 'cell_count')
  if (!cpm || !mps || !ps || !cells) return { score: 0, reasons: [] }
  const total = cpm * mps * ps
  if (total === cells) return { score: 400, reasons: [`topology OK: ${cpm}×${mps}×${ps}=${cells}`] }
  return { score: -1500, reasons: [`topology FAIL: ${cpm}×${mps}×${ps}=${total} ≠ ${cells}`] }
}

/** usable_kWh = nameplate_kWh × DoD ±1 %. */
const bessUsableEnergyGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const nameplate = num(dp, 'nameplate_capacity_mwh') !== null
    ? (num(dp, 'nameplate_capacity_mwh') as number) * 1000
    : num(dp, 'capacity_kwh_total', 'capacity_kwh_gross', 'capacity_kwh')
  const usable = num(dp, 'usable_capacity_kwh', 'capacity_kwh_usable', 'usable_kwh')
  const dod = num(dp, 'dod_fraction', 'dod_max')
  if (!nameplate || !usable || !dod) return { score: 0, reasons: [] }
  const expected = nameplate * dod
  if (approxEqual(expected, usable, 0.01)) return { score: 600, reasons: [`usable OK: ${nameplate}×${dod}=${expected.toFixed(0)}≈${usable}`] }
  return { score: -1800, reasons: [`usable FAIL: ${nameplate}×${dod}=${expected.toFixed(0)} ≠ ${usable}`] }
}

/** DC bus voltage consistent across every module that declares it (±2 %). */
const dcBusVoltageConsistencyGate: CrossModuleGate = (modules) => {
  const dcVoltages: Array<{ mod: string; v: number }> = []
  for (const m of modules) {
    const v = num(m.derived_parameters, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v', 'dc_input_voltage_v', 'nominal_voltage_v')
    if (v !== null) dcVoltages.push({ mod: m.module, v })
  }
  if (dcVoltages.length < 2) return { score: 0, reasons: [] }
  const sorted = [...dcVoltages].sort((a, b) => a.v - b.v)
  const ref = sorted[Math.floor(sorted.length / 2)].v
  const fails = dcVoltages.filter(d => !approxEqual(d.v, ref, 0.02))
  if (fails.length === 0) return { score: 600, reasons: [`cross-mod DC-V OK: all ${dcVoltages.length} at ${ref}V`] }
  return { score: -1000 * fails.length, reasons: [`cross-mod DC-V FAIL: ${fails.length}/${dcVoltages.length} disagree (median ${ref})`] }
}

/** DC bus current ≥ peak_kW / dc_V × 1.15 (15 % headroom). */
const dcBusCurrentHeadroomGate: CrossModuleGate = (modules) => {
  const ess = moduleByKey(modules, 'energy_storage_source')
  const ect = moduleByKey(modules, 'energy_conversion_transduction')
  const pd = moduleByKey(modules, 'power_distribution')
  const peakKw = num(ect?.derived_parameters, 'rated_power_peak_kw', 'peak_power_kw')
  const dcV = num(ect?.derived_parameters, 'dc_input_voltage_v') ?? num(ess?.derived_parameters, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v')
  const busA = num(pd?.derived_parameters, 'dc_bus_rating_a', 'dc_bus_current_rating_a')
  if (!peakKw || !dcV || !busA) return { score: 0, reasons: [] }
  const required = (peakKw * 1000) / dcV
  const ratio = busA / required
  if (ratio >= 1.15) return { score: 500, reasons: [`bus-A OK: ${busA}≥${required.toFixed(0)}×1.15`] }
  if (ratio >= 1.0) return { score: -800, reasons: [`bus-A TIGHT: ${busA} vs ${required.toFixed(0)} (no 15% margin)`] }
  return { score: -3000, reasons: [`bus-A UNDER: ${busA}<${required.toFixed(0)} required`] }
}

/** Cooling capacity ≥ heat estimate × 1.25 (25 % margin). */
const coolingPowerGate: CrossModuleGate = (modules) => {
  const ect = moduleByKey(modules, 'energy_conversion_transduction')
  const env = moduleByKey(modules, 'environmental_interface')
  const contKw = num(ect?.derived_parameters, 'rated_power_continuous_kw', 'continuous_power_kw', 'rated_power_kw')
  const effPct = num(ect?.derived_parameters, 'efficiency_percent', 'round_trip_efficiency_percent')
  const coolKw = num(env?.derived_parameters, 'cooling_capacity_kw', 'thermal_capacity_kw')
  if (!contKw || !coolKw) return { score: 0, reasons: [] }
  const eff = (effPct ?? 95) / 100
  const heatEstKw = contKw * (1 - eff) + contKw * 0.02
  const required = heatEstKw * 1.25
  if (coolKw >= required) return { score: 400, reasons: [`cooling OK: ${coolKw}≥${required.toFixed(0)}`] }
  return { score: -1500, reasons: [`cooling UNDER: ${coolKw}<${required.toFixed(0)} (heat est ${heatEstKw.toFixed(0)}×1.25)`] }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEAT_PUMP — proof-of-universality stub
// ═══════════════════════════════════════════════════════════════════════════

/** COP × rated_thermal_kw ≈ rated_electrical_kw (within 5 %). */
const hpCopGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const cop = num(dp, 'cop_target', 'cop', 'cop_rated')
  const thermalKw = num(dp, 'rated_thermal_kw', 'heat_output_kw')
  const electricKw = num(dp, 'rated_electrical_kw', 'compressor_power_kw', 'electrical_input_kw')
  if (!cop || !thermalKw || !electricKw) return { score: 0, reasons: [] }
  const expectedElectric = thermalKw / cop
  if (approxEqual(expectedElectric, electricKw, 0.05)) {
    return { score: 800, reasons: [`COP OK: ${thermalKw}/${cop}=${expectedElectric.toFixed(2)}≈${electricKw}kW`] }
  }
  return { score: -1500, reasons: [`COP FAIL: ${thermalKw}/${cop}=${expectedElectric.toFixed(2)} ≠ ${electricKw}kW`] }
}

/** Refrigerant mass flow × Δh ≈ thermal capacity. */
const hpRefrigerantMassFlowGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const mFlow = num(dp, 'refrigerant_mass_flow_kg_s')
  const dh = num(dp, 'enthalpy_change_kj_kg', 'evap_delta_h_kj_kg')
  const thermalKw = num(dp, 'rated_thermal_kw', 'heat_output_kw')
  if (!mFlow || !dh || !thermalKw) return { score: 0, reasons: [] }
  const expected = mFlow * dh
  if (approxEqual(expected, thermalKw, 0.05)) {
    return { score: 600, reasons: [`refrigerant OK: ${mFlow}×${dh}=${expected.toFixed(1)}≈${thermalKw}kW`] }
  }
  return { score: -1200, reasons: [`refrigerant FAIL: ${mFlow}×${dh}=${expected.toFixed(1)} ≠ ${thermalKw}kW`] }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERTICAL_FARM — proof-of-universality stub
// ═══════════════════════════════════════════════════════════════════════════

/** LED total power = PPFD × area × efficacy. */
const vfLedPowerGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const ppfd = num(dp, 'ppfd_umol_m2_s', 'ppfd', 'target_ppfd')
  const area = num(dp, 'canopy_area_m2', 'growing_area_m2')
  const efficacy = num(dp, 'led_efficacy_umol_j', 'photon_efficacy')
  const ledKw = num(dp, 'led_power_kw', 'lighting_power_kw')
  if (!ppfd || !area || !efficacy || !ledKw) return { score: 0, reasons: [] }
  // ppfd (µmol/m²/s) × area (m²) / efficacy (µmol/J) = W ; / 1000 = kW
  const expectedKw = (ppfd * area) / efficacy / 1000
  if (approxEqual(expectedKw, ledKw, 0.10)) {
    return { score: 600, reasons: [`LED-power OK: ${ppfd}×${area}/${efficacy}≈${expectedKw.toFixed(1)}kW`] }
  }
  return { score: -1200, reasons: [`LED-power FAIL: ${expectedKw.toFixed(1)}kW vs ${ledKw}kW`] }
}

/** Irrigation flow = plant_count × per-plant flow rate. */
const vfIrrigationFlowGate: ModuleGate = (m) => {
  const dp = m.derived_parameters
  const plants = num(dp, 'plant_count', 'total_plants')
  const flowPerPlant = num(dp, 'flow_per_plant_l_h', 'water_per_plant_l_h')
  const totalFlow = num(dp, 'total_flow_l_h', 'irrigation_flow_l_h')
  if (!plants || !flowPerPlant || !totalFlow) return { score: 0, reasons: [] }
  const expected = plants * flowPerPlant
  if (approxEqual(expected, totalFlow, 0.05)) {
    return { score: 500, reasons: [`flow OK: ${plants}×${flowPerPlant}=${expected.toFixed(0)}≈${totalFlow}`] }
  }
  return { score: -1000, reasons: [`flow FAIL: ${plants}×${flowPerPlant}=${expected.toFixed(0)} ≠ ${totalFlow}`] }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASS_GATES registry
// ═══════════════════════════════════════════════════════════════════════════

export const CLASS_GATES: Record<string, ClassGateRegistry> = {
  energy_storage: {
    perModule: {
      energy_storage_source: [
        bessCapacityGate,
        bessModuleCountGate,
        bessSeriesVoltageGate,
        bessTopologyGate,
        bessUsableEnergyGate,
      ],
    },
    crossModule: [
      dcBusVoltageConsistencyGate,
      dcBusCurrentHeadroomGate,
      coolingPowerGate,
    ],
  },
  heat_pump: {
    perModule: {
      energy_conversion_transduction: [hpCopGate, hpRefrigerantMassFlowGate],
    },
    crossModule: [],
  },
  vertical_farm: {
    perModule: {
      energy_conversion_transduction: [vfLedPowerGate],
      mass_fluid_transport_process: [vfIrrigationFlowGate],
    },
    crossModule: [],
  },
  // Other classes (CGM, drone, edge_ai, EV-charger, bioreactor, AUV, HAPS):
  // universal gates only until class-specific gates are populated. Adding
  // entries here is the documented extension path.
}

/**
 * Look up the gate registry for a product class. Returns an empty registry
 * (universal gates only) for unknown / null / undefined classes.
 */
export function gatesForClass(productClass: string | null | undefined): ClassGateRegistry {
  if (!productClass) return { perModule: {}, crossModule: [] }
  return CLASS_GATES[productClass] ?? { perModule: {}, crossModule: [] }
}

/**
 * Score one module variant: applies (a) universal per-module gates, (b) any
 * class-specific per-module gates registered for this module's id.
 */
export function scoreModuleAllGates(m: ModuleSpec, productClass: string | null | undefined): GateResult {
  const reasons: string[] = []
  let score = 0
  for (const g of UNIVERSAL_PER_MODULE_GATES) {
    const r = g(m)
    score += r.score
    reasons.push(...r.reasons)
  }
  const reg = gatesForClass(productClass)
  const classGates = reg.perModule[m.module as UniversalModule] ?? []
  for (const g of classGates) {
    const r = g(m)
    score += r.score
    reasons.push(...r.reasons)
  }
  return { score, reasons }
}

/** Score the full module list against this class's cross-module gates. */
export function scoreCrossModuleAllGates(modules: ModuleSpec[], productClass: string | null | undefined): GateResult {
  const reasons: string[] = []
  let score = 0
  const reg = gatesForClass(productClass)
  for (const g of reg.crossModule) {
    const r = g(modules)
    score += r.score
    reasons.push(...r.reasons)
  }
  return { score, reasons }
}
