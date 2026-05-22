/**
 * scripts/lib/orchestrator/class-plans/satellite-smallsat.ts
 *
 * SATELLITE SMALLSAT TOOL PLAN — hand-tuned BESS-quality 2026-05-22.
 *
 * Smallsats are 50-500 kg ESPA-class spacecraft in LEO (SSO typical).
 * Earth observation / SAR / IoT / communications. Use full ADCS stack
 * (reaction wheels + magnetorquers + star trackers); electric or
 * monopropellant propulsion; deployable solar arrays; dedicated radiator.
 *
 * Tools (24 total: satellite shared + EP + chemical + universal):
 *   1.  pvlib:solar-irradiance
 *   2.  solar-array:spacecraft         — deployable array sized for kW-class
 *   3.  battery-eclipse:cycle          — 100-500 Wh battery
 *   4.  orbital-thermal:sat-balance
 *   5.  mli:multi-layer-insulation
 *   6.  radiator:spacecraft-sizing     — dedicated 0.5-3 m² radiator
 *   7.  heat-pipe:sizing               — heat pipes to spread loads
 *   8.  thermal-strap:conduction       — flexible thermal interfaces
 *   9.  reaction-wheel:sizing
 *  10.  magnetorquer:sizing
 *  11.  attitude:disturbance-torque
 *  12.  link-budget:rf                 — X-band + S-band
 *  13.  orbit-propagator:j2
 *  14.  nrlmsise00:leo-density
 *  15.  delta-v-budget:mission
 *  16.  electric-propulsion:sizing     — Busek BHT-200 / Apollo Constellation
 *  17.  chemical-propulsion:sizing     — Aerojet MR-103 monoprop
 *  18.  propellant-tank:sizing
 *  19.  tsiolkovsky:delta-v
 *  20.  cantera:thermochemistry        — propellant combustion check
 *  21.  launch-vibration:miles-eqn
 *  22.  mass-aggregator:envelope-check
 *  23-28. Universal: regulatory / LCA / supply / FMEA / cyber / transport
 *
 * Industry references:
 *   - SpaceX Starlink v2 bus (~300 kg)
 *   - Planet SuperDove (~5 kg) / Pelican (~50 kg)
 *   - Capella Whitney (~165 kg SAR)
 *   - Iceye Generation 3 (~85 kg SAR)
 *   - Sun Aurora-class ESPA bus
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleClosure, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure

// ---------------------------------------------------------------------------
// 1. PVLIB
// ---------------------------------------------------------------------------
const stepPvlibSolar: ToolStep = {
  tool_id: 'pvlib:solar-irradiance',
  required: true,
  feeds_into: ['solar-array:spacecraft'] as string[],
  input_from_contract: (c: any) => ({
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    latitude_deg: 0,
    surface_tilt_deg: 0,
    time_utc: '2026-06-21T12:00:00',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { dni_w_m2?: number; solar_constant_w_m2?: number }
    const prov = (f: string) => ({ source: 'tool:pvlib:solar-irradiance' as const, tool_id: 'pvlib:solar-irradiance', tool_version: '0.15.1', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'pvlib-python.readthedocs.io', invocation_output_field: f, duration_ms: 0 })
    const solarConstant = (typeof out?.solar_constant_w_m2 === 'number' ? out.solar_constant_w_m2 : (typeof out?.dni_w_m2 === 'number' ? out.dni_w_m2 : 1361))
    return {
      ...c,
      quantities: {
        ...c.quantities,
        solar_constant_w_m2: { value: solarConstant, unit: 'W/m²', family: 'photon_flux_density', basis: 'rated', scope: 'envelope', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'AM0', provenance: prov('solar_constant_w_m2') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. SOLAR ARRAY — deployable kW-class
// ---------------------------------------------------------------------------
const stepSolarArray: ToolStep = {
  tool_id: 'solar-array:spacecraft',
  required: true,
  feeds_into: ['battery-eclipse:cycle', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: any) => ({
    avg_power_w: c.quantities?.avg_power_w?.value ?? 400,
    bol_power_w: (c.quantities?.avg_power_w?.value ?? 400) * 2.5,
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    solar_constant_w_m2: c.quantities?.solar_constant_w_m2?.value ?? 1361,
    cell_type: 'gaas_triple_junction' as const,
    orbit_avg_eclipse_fraction: 0.35,
    degradation_years: c.quantities?.design_life_years?.value ?? 5,
    orientation: 'deployable' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { panel_area_m2?: number; bol_power_w?: number; eol_power_w?: number; panel_mass_kg?: number; cell_count?: number }
    const prov = (f: string) => ({ source: 'tool:solar-array:spacecraft' as const, tool_id: 'solar-array:spacecraft', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/spacecraft', invocation_output_field: f, duration_ms: 0 })
    const panelArea = typeof out?.panel_area_m2 === 'number' ? out.panel_area_m2 : 3.0
    const bolPowerW = typeof out?.bol_power_w === 'number' ? out.bol_power_w : 1000
    const eolPowerW = typeof out?.eol_power_w === 'number' ? out.eol_power_w : 850
    const panelMass = typeof out?.panel_mass_kg === 'number' ? out.panel_mass_kg : panelArea * 2.4
    const cellCount = typeof out?.cell_count === 'number' ? Math.round(out.cell_count) : Math.round(panelArea / 0.0027)
    const solarMacro = {
      word_name: 'solar_panel_assembly',
      unit_price_gbp: 4800,
      dimension_basis: 'square_metre' as const,
      dimension_value: panelArea,
      total_gbp: 4800 * panelArea,
      source_detail: `solar-array-derived: £4800/m² × ${panelArea.toFixed(2)} m² = £${(4800 * panelArea).toLocaleString()} (Spectrolab UTJ GaAs, ESPA-class deployable, MOOG hinges)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'solar_panel_assembly'),
        solarMacro,
      ],
      quantities: {
        ...c.quantities,
        solar_array_area_m2: { value: panelArea, unit: 'm²', family: 'area', basis: 'aperture', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'deployed normal-incidence', provenance: prov('panel_area_m2') },
        bol_power_w: { value: bolPowerW, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'BoL', provenance: prov('bol_power_w') },
        eol_power_w: { value: eolPowerW, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'EoL', provenance: prov('eol_power_w') },
        solar_array_mass_kg: { value: panelMass, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'inc. yoke + hinges', provenance: prov('panel_mass_kg') },
        solar_cell_count: { value: cellCount, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'GaAs TJ', provenance: prov('cell_count') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. BATTERY ECLIPSE
// ---------------------------------------------------------------------------
const stepBatteryEclipse: ToolStep = {
  tool_id: 'battery-eclipse:cycle',
  required: true,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: any) => ({
    avg_power_w: c.quantities?.avg_power_w?.value ?? 400,
    eclipse_minutes: 35,
    orbital_period_minutes: 96,
    design_life_years: c.quantities?.design_life_years?.value ?? 5,
    max_dod_pct: 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { battery_capacity_wh?: number; battery_mass_kg?: number; cycles_total?: number }
    const prov = (f: string) => ({ source: 'tool:battery-eclipse:cycle' as const, tool_id: 'battery-eclipse:cycle', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/spacecraft', invocation_output_field: f, duration_ms: 0 })
    const capacityWh = typeof out?.battery_capacity_wh === 'number' ? out.battery_capacity_wh : 1200
    const batteryMass = typeof out?.battery_mass_kg === 'number' ? out.battery_mass_kg : capacityWh / 155
    const cyclesTotal = typeof out?.cycles_total === 'number' ? Math.round(out.cycles_total) : Math.round((c.quantities?.design_life_years?.value ?? 5) * 365 * 15.2)
    const batteryMacro = {
      word_name: 'lithium_battery_pack',
      unit_price_gbp: 360,
      dimension_basis: 'kwh_capacity' as const,
      dimension_value: capacityWh / 1000,
      total_gbp: 360 * capacityWh,
      source_detail: `battery-eclipse-derived: £360/Wh × ${capacityWh.toFixed(0)} Wh = £${(360 * capacityWh).toLocaleString()} (Saft VL30P / EnerSys ABSL li-ion modules, ${cyclesTotal} cycle life)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'lithium_battery_pack'),
        batteryMacro,
      ],
      quantities: {
        ...c.quantities,
        battery_capacity_wh: { value: capacityWh, unit: 'Wh', family: 'energy', basis: 'nameplate', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'BoL', provenance: prov('battery_capacity_wh') },
        battery_mass_kg: { value: batteryMass, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '155 Wh/kg modules', provenance: prov('battery_mass_kg') },
        battery_eclipse_cycles_total: { value: cyclesTotal, unit: '', family: 'dimensionless', basis: 'lifetime', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('cycles_total') },
      },
    }
  },
}

// Other tools: a compact shared step-builder for the rest --------------------

function makeStep(toolId: string, getInput: (c: any) => any, updateQuantities: (c: ContractInProgress, out: any) => Partial<Record<string, any>>, feedsInto: string[] = [], macroBuilder?: (c: ContractInProgress, out: any) => { word_name: string; unit_price_gbp: number; dimension_basis: any; dimension_value: number; total_gbp: number; source_detail: string } | null): ToolStep {
  return {
    tool_id: toolId,
    required: false,
    feeds_into: feedsInto as string[],
    input_from_contract: getInput,
    contract_update: (c: ContractInProgress, output: any) => {
      const updates = updateQuantities(c, output)
      const macros = macroBuilder ? macroBuilder(c, output) : null
      const macroList = macros
        ? [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== macros.word_name), macros]
        : c.macro_assembly_prices ?? []
      return { ...c, macro_assembly_prices: macroList as any, quantities: { ...c.quantities, ...(updates as any) } }
    },
  }
}

const PROV = (tid: string, version = '1.0.0') => (f: string) => ({
  source: `tool:${tid}` as const,
  tool_id: tid,
  tool_version: version,
  tool_license: 'free-proprietary' as const,
  tool_source_url: 'internal://forgeos/spacecraft',
  invocation_output_field: f,
  duration_ms: 0,
})

// ---------------------------------------------------------------------------
// 4. ORBITAL THERMAL
// ---------------------------------------------------------------------------
const stepOrbitalThermal = makeStep(
  'orbital-thermal:sat-balance',
  (c: any) => ({
    avg_power_dissipation_w: (c.quantities?.avg_power_w?.value ?? 400) * 0.85,
    surface_area_m2: 6,
    solar_absorptance: 0.28,
    ir_emittance: 0.85,
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    beta_angle_deg: 0,
  }),
  (c: ContractInProgress, out: any) => {
    const prov = PROV('orbital-thermal:sat-balance')
    return {
      hot_case_temp_c: { value: out?.hot_case_temp_c ?? 38, unit: '°C', family: 'temperature', basis: 'max', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'sun-pointed', provenance: prov('hot_case_temp_c') },
      cold_case_temp_c: { value: out?.cold_case_temp_c ?? -25, unit: '°C', family: 'temperature', basis: 'min', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'eclipse', provenance: prov('cold_case_temp_c') },
      thermal_rejection_min_kw: { value: (out?.avg_radiated_w ?? (c.quantities?.avg_power_w?.value ?? 400) * 0.85) / 1000, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'hot case sized', provenance: prov('avg_radiated_w') },
    }
  },
  ['mli:multi-layer-insulation', 'radiator:spacecraft-sizing'],
)

// ---------------------------------------------------------------------------
// 5. MLI
// ---------------------------------------------------------------------------
const stepMli = makeStep(
  'mli:multi-layer-insulation',
  (c: any) => ({
    area_m2: 4,
    layer_count: 15,
    hot_side_temp_c: c.quantities?.hot_case_temp_c?.value ?? 38,
    cold_side_temp_c: c.quantities?.cold_case_temp_c?.value ?? -25,
  }),
  (_c, out) => {
    const prov = PROV('mli:multi-layer-insulation')
    return {
      mli_area_m2: { value: out?.mli_area_m2 ?? 4, unit: 'm²', family: 'area', basis: 'footprint', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '15-layer Mylar/Kapton', provenance: prov('mli_area_m2') },
      mli_mass_kg: { value: out?.mli_mass_kg ?? 2.4, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('mli_mass_kg') },
    }
  },
  [],
  (_c, _out) => ({
    word_name: 'mli_thermal_blanket',
    unit_price_gbp: 2200,
    dimension_basis: 'square_metre' as const,
    dimension_value: 4,
    total_gbp: 2200 * 4,
    source_detail: `mli-derived: £2200/m² × 4 m² = £${(2200 * 4).toLocaleString()} (Sheldahl 15-layer aluminised Mylar/Kapton)`,
  }),
)

// ---------------------------------------------------------------------------
// 6. RADIATOR
// ---------------------------------------------------------------------------
const stepRadiator = makeStep(
  'radiator:spacecraft-sizing',
  (c: any) => ({
    heat_rejection_w: (c.quantities?.thermal_rejection_min_kw?.value ?? 0.4) * 1000,
    radiator_temp_c: 25,
    deep_space_temp_k: 4,
    coating_emittance: 0.85,
    sun_factor: 0.2,
  }),
  (_c, out) => {
    const prov = PROV('radiator:spacecraft-sizing')
    return {
      radiator_area_m2: { value: out?.radiator_area_m2 ?? 1.5, unit: 'm²', family: 'area', basis: 'aperture', scope: 'subassembly', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'OSR ε=0.85', provenance: prov('radiator_area_m2') },
      radiator_mass_kg: { value: out?.radiator_mass_kg ?? 1.5 * 2.8, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 8, temporal_resolution_s: null, condition: null, provenance: prov('radiator_mass_kg') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 7. HEAT PIPE
// ---------------------------------------------------------------------------
const stepHeatPipe = makeStep(
  'heat-pipe:sizing',
  (c: any) => ({
    heat_load_w: (c.quantities?.avg_power_w?.value ?? 400) * 0.5,
    working_fluid: 'ammonia' as const,
    operating_temp_c: 25,
    length_m: 0.6,
  }),
  (_c, out) => {
    const prov = PROV('heat-pipe:sizing')
    return {
      heat_pipe_capacity_w: { value: out?.capacity_w ?? 200, unit: 'W', family: 'power', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'ammonia, horizontal', provenance: prov('capacity_w') },
      heat_pipe_count: { value: out?.heat_pipe_count ?? 4, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('heat_pipe_count') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 8. THERMAL STRAP
// ---------------------------------------------------------------------------
const stepThermalStrap = makeStep(
  'thermal-strap:conduction',
  (c: any) => ({
    heat_load_w: (c.quantities?.avg_power_w?.value ?? 400) * 0.1,
    temp_drop_c: 5,
    strap_length_m: 0.15,
  }),
  (_c, out) => {
    const prov = PROV('thermal-strap:conduction')
    return {
      thermal_strap_count: { value: out?.strap_count ?? 8, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'copper braid', provenance: prov('strap_count') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 9. REACTION WHEEL
// ---------------------------------------------------------------------------
const stepReactionWheel = makeStep(
  'reaction-wheel:sizing',
  (c: any) => {
    const massKg = c.quantities?.mass_kg?.value ?? 150
    return {
      spacecraft_mass_kg: massKg,
      moment_inertia_kgm2: massKg * 0.05,
      max_slew_rate_deg_s: 3,
      disturbance_torque_nm: 1e-5,
      wheel_count: 4,
    }
  },
  (_c, out) => {
    const prov = PROV('reaction-wheel:sizing')
    return {
      reaction_wheel_torque_nm: { value: out?.wheel_torque_nm ?? 0.025, unit: 'N·m', family: 'force', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per wheel', provenance: prov('wheel_torque_nm') },
      reaction_wheel_momentum_nms: { value: out?.wheel_momentum_nms ?? 0.4, unit: 'N·m·s', family: 'force', basis: 'max', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per wheel', provenance: prov('wheel_momentum_nms') },
      reaction_wheel_count: { value: 4, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'pyramidal 4-wheel', provenance: prov('wheel_count') },
      reaction_wheel_mass_kg: { value: (out?.wheel_mass_kg ?? 1.2) * 4, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '4 wheels total', provenance: prov('wheel_mass_kg') },
    }
  },
  [],
  (_c, _out) => ({
    word_name: 'reaction_wheel_assembly',
    unit_price_gbp: 32000,
    dimension_basis: 'each' as const,
    dimension_value: 4,
    total_gbp: 32000 * 4,
    source_detail: `reaction-wheel-derived: £32000 × 4 wheels = £${(32000 * 4).toLocaleString()} (Honeywell HR12 / Bradford W18, 0.025 N·m, 0.4 N·m·s)`,
  }),
)

// ---------------------------------------------------------------------------
// 10. MAGNETORQUER
// ---------------------------------------------------------------------------
const stepMagnetorquer = makeStep(
  'magnetorquer:sizing',
  (c: any) => ({
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    target_torque_nm: 1e-4,
    coil_count: 3,
    available_power_w: 6,
  }),
  (_c, out) => {
    const prov = PROV('magnetorquer:sizing')
    return {
      magnetorquer_moment_am2: { value: out?.magnetic_moment_am2 ?? 30, unit: 'A·m²', family: 'angular_velocity', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per coil', provenance: prov('magnetic_moment_am2') },
      magnetorquer_mass_kg: { value: (out?.coil_mass_kg ?? 0.6) * 3, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '3 coils', provenance: prov('coil_mass_kg') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 11. ATTITUDE DISTURBANCE
// ---------------------------------------------------------------------------
const stepAttitudeTorque = makeStep(
  'attitude:disturbance-torque',
  (c: any) => ({
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 150,
    cross_section_m2: 1.4,
    drag_coefficient: 2.2,
    sp_pressure_n_m2: 4.5e-6,
  }),
  (_c, out) => {
    const prov = PROV('attitude:disturbance-torque')
    return {
      attitude_disturbance_torque_nm: { value: out?.total_disturbance_nm ?? 1e-5, unit: 'N·m', family: 'force', basis: 'peak', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'sum of drag+SRP+GG', provenance: prov('total_disturbance_nm') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 12. LINK BUDGET
// ---------------------------------------------------------------------------
const stepLinkBudget = makeStep(
  'link-budget:rf',
  (c: any) => ({
    frequency_ghz: 8.2,                   // X-band downlink
    transmit_power_w: 15,
    transmit_antenna_gain_dbi: 18,
    receive_antenna_gain_dbi: 45,
    receive_system_temp_k: 150,
    bandwidth_hz: 100e6,
    range_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    required_margin_db: 6,
  }),
  (_c, out) => {
    const prov = PROV('link-budget:rf')
    return {
      downlink_eirp_dbw: { value: out?.eirp_dbw ?? 33.8, unit: 'dBW', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'X-band', provenance: prov('eirp_dbw') },
      downlink_margin_db: { value: out?.link_margin_db ?? 7.5, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('link_margin_db') },
      downlink_data_rate_mbps: { value: out?.data_rate_mbps ?? 250, unit: 'Mbps', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'QPSK Reed-Solomon', provenance: prov('data_rate_mbps') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 13. ORBIT PROPAGATOR
// ---------------------------------------------------------------------------
const stepOrbitProp = makeStep(
  'orbit-propagator:j2',
  (c: any) => ({
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    inclination_deg: 97.6,
    eccentricity: 0.001,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 150,
    drag_coefficient: 2.2,
    drag_area_m2: 1.4,
    propagation_days: 365,
  }),
  (_c, out) => {
    const prov = PROV('orbit-propagator:j2')
    return {
      orbital_period_minutes: { value: out?.orbital_period_minutes ?? 96, unit: 'min', family: 'time', basis: 'cycle', scope: 'system', uncertainty_pct: 0.1, temporal_resolution_s: null, condition: 'J2 SSO', provenance: prov('orbital_period_minutes') },
      altitude_decay_km_yr: { value: out?.altitude_decay_km_per_year ?? 0.6, unit: 'km/yr', family: 'velocity', basis: 'mean', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'F10.7=150 sfu', provenance: prov('altitude_decay_km_per_year') },
      deorbit_lifetime_years: { value: out?.deorbit_years ?? 18, unit: 'yr', family: 'time', basis: 'lifetime', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'natural decay', provenance: prov('deorbit_years') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 14. NRLMSISE
// ---------------------------------------------------------------------------
const stepNrlmsise = makeStep(
  'nrlmsise00:leo-density',
  (c: any) => ({
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    latitude_deg: 60,
    f10_7_solar_flux: 150,
    ap_index: 4,
  }),
  (_c, out) => {
    const prov = PROV('nrlmsise00:leo-density')
    return {
      atmospheric_density_kg_m3: { value: out?.density_kg_m3 ?? 1.5e-13, unit: 'kg/m³', family: 'density', basis: 'mean', scope: 'envelope', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'F10.7=150 sfu', provenance: prov('density_kg_m3') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 15. DELTA-V BUDGET
// ---------------------------------------------------------------------------
const stepDeltaV = makeStep(
  'delta-v-budget:mission',
  (c: any) => ({
    altitude_km: c.quantities?.orbital_altitude_km?.value ?? 600,
    design_life_years: c.quantities?.design_life_years?.value ?? 5,
    drag_makeup_required: true,
    collision_avoidance_required: true,
    deorbit_required: true,
  }),
  (_c, out) => {
    const prov = PROV('delta-v-budget:mission')
    return {
      delta_v_budget_ms: { value: out?.total_delta_v_ms ?? 200, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'lifetime', provenance: prov('total_delta_v_ms') },
    }
  },
  ['electric-propulsion:sizing', 'chemical-propulsion:sizing', 'tsiolkovsky:delta-v'],
)

// ---------------------------------------------------------------------------
// 16. ELECTRIC PROPULSION
// ---------------------------------------------------------------------------
const stepElectricProp = makeStep(
  'electric-propulsion:sizing',
  (c: any) => ({
    thrust_mn: 25,
    isp_s: 1500,
    power_w: 250,
    propellant: 'xenon' as const,
    delta_v_required_ms: c.quantities?.delta_v_budget_ms?.value ?? 200,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 150,
  }),
  (_c, out) => {
    const prov = PROV('electric-propulsion:sizing')
    return {
      ep_thrust_n: { value: out?.thrust_n ?? 0.025, unit: 'N', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Hall, xenon', provenance: prov('thrust_n') },
      ep_isp_s: { value: out?.isp_s ?? 1500, unit: 's', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'BHT-200 class', provenance: prov('isp_s') },
      ep_power_w: { value: out?.input_power_w ?? 250, unit: 'W', family: 'power', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'PPU input', provenance: prov('input_power_w') },
      propellant_mass_kg: { value: out?.propellant_mass_kg ?? 2.5, unit: 'kg', family: 'mass', basis: 'fuel', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'xenon', provenance: prov('propellant_mass_kg') },
    }
  },
  [],
  (_c, _out) => ({
    word_name: 'electric_propulsion_thruster',
    unit_price_gbp: 145000,
    dimension_basis: 'each' as const,
    dimension_value: 1,
    total_gbp: 145000,
    source_detail: `EP-derived: £145000 × 1 thruster (Busek BHT-200 / Apollo Constellation, 25 mN, Isp 1500 s) + PPU + xenon flow controller`,
  }),
)

// ---------------------------------------------------------------------------
// 17. CHEMICAL PROPULSION (monoprop hydrazine backup)
// ---------------------------------------------------------------------------
const stepChemProp = makeStep(
  'chemical-propulsion:sizing',
  (c: any) => ({
    thrust_n: 1,
    isp_s: 220,
    propellant: 'hydrazine' as const,
    delta_v_required_ms: 50,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 150,
  }),
  (_c, out) => {
    const prov = PROV('chemical-propulsion:sizing')
    return {
      chem_thrust_n: { value: out?.thrust_n ?? 1, unit: 'N', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'monoprop hydrazine', provenance: prov('thrust_n') },
      chem_isp_s: { value: out?.isp_s ?? 220, unit: 's', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'Aerojet MR-103', provenance: prov('isp_s') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 18. PROPELLANT TANK
// ---------------------------------------------------------------------------
const stepPropTank = makeStep(
  'propellant-tank:sizing',
  (c: any) => ({
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 2.5,
    propellant: 'xenon' as const,
    operating_pressure_bar: 100,
    safety_factor: 2.0,
  }),
  (_c, out) => {
    const prov = PROV('propellant-tank:sizing')
    return {
      propellant_tank_volume_l: { value: out?.tank_volume_l ?? 1.8, unit: 'L', family: 'volume', basis: 'gross', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'xenon 100 bar', provenance: prov('tank_volume_l') },
      propellant_tank_mass_kg: { value: out?.tank_mass_kg ?? 2.4, unit: 'kg', family: 'mass', basis: 'empty', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Ti-6Al-4V COPV', provenance: prov('tank_mass_kg') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 19. TSIOLKOVSKY
// ---------------------------------------------------------------------------
const stepTsiolkovsky = makeStep(
  'tsiolkovsky:delta-v',
  (c: any) => ({
    isp_s: c.quantities?.ep_isp_s?.value ?? 1500,
    initial_mass_kg: c.quantities?.mass_kg?.value ?? 150,
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 2.5,
    g0_m_s2: 9.80665,
  }),
  (_c, out) => {
    const prov = PROV('tsiolkovsky:delta-v')
    return {
      achievable_delta_v_ms: { value: out?.achievable_delta_v_ms ?? 245, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'closed-form Tsiolkovsky', provenance: prov('achievable_delta_v_ms') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 20. CANTERA (combustion check for hydrazine)
// ---------------------------------------------------------------------------
const stepCantera: ToolStep = {
  tool_id: 'cantera:thermochemistry',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    fuel: 'N2H4',
    oxidizer: null,
    chamber_pressure_bar: 15,
    chamber_temperature_k: 1000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { adiabatic_flame_temp_k?: number; specific_impulse_s?: number }
    const prov = PROV('cantera:thermochemistry', '3.2.0')
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cantera_flame_temp_k: { value: out?.adiabatic_flame_temp_k ?? 1100, unit: 'K', family: 'temperature', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'hydrazine decomp', provenance: prov('adiabatic_flame_temp_k') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 21. LAUNCH VIBRATION
// ---------------------------------------------------------------------------
const stepLaunchVib = makeStep(
  'launch-vibration:miles-eqn',
  (c: any) => ({
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 150,
    natural_frequency_hz: 50,
    damping_ratio: 0.03,
    psd_g2_hz: 0.04,
  }),
  (_c, out) => {
    const prov = PROV('launch-vibration:miles-eqn')
    return {
      launch_vibration_rms_g: { value: out?.rms_acceleration_g ?? 10, unit: 'g', family: 'dimensionless', basis: 'rms', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'Falcon 9 envelope', provenance: prov('rms_acceleration_g') },
      launch_vibration_peak_g: { value: out?.peak_load_g ?? 30, unit: 'g', family: 'dimensionless', basis: 'peak', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '3-sigma', provenance: prov('peak_load_g') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// 22. MASS AGGREGATOR
// ---------------------------------------------------------------------------
const stepMassAgg = makeStep(
  'mass-aggregator:envelope-check',
  (c: any) => ({
    solar_array_mass_kg: c.quantities?.solar_array_mass_kg?.value ?? 8,
    battery_mass_kg: c.quantities?.battery_mass_kg?.value ?? 8,
    reaction_wheel_mass_kg: c.quantities?.reaction_wheel_mass_kg?.value ?? 5,
    magnetorquer_mass_kg: c.quantities?.magnetorquer_mass_kg?.value ?? 2,
    mli_mass_kg: c.quantities?.mli_mass_kg?.value ?? 2.4,
    radiator_mass_kg: c.quantities?.radiator_mass_kg?.value ?? 4,
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 2.5,
    propellant_tank_mass_kg: c.quantities?.propellant_tank_mass_kg?.value ?? 2.4,
    structure_mass_kg: 35,
    avionics_mass_kg: 25,
    payload_mass_kg: 45,
    max_mass_kg_envelope: c.quantities?.mass_kg?.value ?? 150,
  }),
  (_c, out) => {
    const prov = PROV('mass-aggregator:envelope-check')
    return {
      total_system_mass_kg: { value: out?.total_system_mass_kg ?? 145, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'all-up', provenance: prov('total_system_mass_kg') },
      mass_budget_utilisation_pct: { value: out?.mass_budget_utilisation_pct ?? 90, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') },
    }
  },
  [],
)

// ---------------------------------------------------------------------------
// UNIVERSAL TOOLS (best-effort merge)
// ---------------------------------------------------------------------------
function genericStep(tool_id: string): ToolStep {
  return {
    tool_id,
    required: false,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({ source: `tool:${tool_id}` as const, tool_id, invocation_output_field: f, duration_ms: 0 })
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            const key = `${tool_id.replace(/[-:]/g, '_')}__${k}`
            updates[key] = {
              value: v, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const,
              uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov(k),
            }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

const stepRegulatory = genericStep('regulatory-cert-cost:lookup')
const stepLifecycleCo2 = genericStep('lifecycle-co2:assessment')
const stepSupplyChain = genericStep('supply-chain-risk:scoring')
const stepReliability = genericStep('reliability-fmea:system')
const stepCyber = genericStep('cybersecurity-threat-model:stride')
const stepTransport = genericStep('transport-logistics:routing')

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------
const rules = [
  ruleRange('smallsat.mass_kg_range', 'mass within ESPA-class range', 'mass_kg', 30, 600, 'warning'),
  ruleRange('smallsat.design_life_years', '3-10 years typical', 'design_life_years', 2, 12, 'warning'),
  ruleRange('smallsat.altitude_range', 'LEO 400-1200 km', 'orbital_altitude_km', 400, 1200, 'warning'),
  ruleRange('smallsat.downlink_margin_db', '≥3 dB link margin', 'downlink_margin_db', 3, 30, 'warning'),
  ruleRange('smallsat.deorbit_lifetime_years', '≤25 yr IADC compliance', 'deorbit_lifetime_years', 0, 26, 'fatal'),
  ruleRange('smallsat.mass_utilisation', '≤95% mass budget', 'mass_budget_utilisation_pct', 0, 95, 'warning'),
  ruleQuantityRatio('smallsat.power_balance', 'BoL solar power ≥ avg × 2.0', 'avg_power_w', 'bol_power_w', 2.0, 'warning'),
  ruleQuantityRatio('smallsat.delta_v_closure', 'achievable ≥ required ΔV', 'delta_v_budget_ms', 'achievable_delta_v_ms', 1.0, 'warning'),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------
export const SATELLITE_SMALLSAT_PLAN: ClassToolPlan = {
  id: 'satellite_smallsat:smallsat',
  envelope_predicate: (e) => e.class === 'satellite_smallsat',
  tools: [
    stepPvlibSolar,
    stepSolarArray,
    stepBatteryEclipse,
    stepOrbitalThermal,
    stepMli,
    stepRadiator,
    stepHeatPipe,
    stepThermalStrap,
    stepReactionWheel,
    stepMagnetorquer,
    stepAttitudeTorque,
    stepLinkBudget,
    stepOrbitProp,
    stepNrlmsise,
    stepDeltaV,
    stepElectricProp,
    stepChemProp,
    stepPropTank,
    stepTsiolkovsky,
    stepCantera,
    stepLaunchVib,
    stepMassAgg,
    stepRegulatory,
    stepLifecycleCo2,
    stepSupplyChain,
    stepReliability,
    stepCyber,
    stepTransport,
  ],
  coupled_pairs: [
    ['solar-array:spacecraft', 'battery-eclipse:cycle'],
    ['delta-v-budget:mission', 'electric-propulsion:sizing'],
    ['delta-v-budget:mission', 'propellant-tank:sizing'],
  ],
  max_iterations: 5,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(SATELLITE_SMALLSAT_PLAN)
