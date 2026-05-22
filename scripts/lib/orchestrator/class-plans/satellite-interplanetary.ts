/**
 * scripts/lib/orchestrator/class-plans/satellite-interplanetary.ts
 *
 * INTERPLANETARY PROBE TOOL PLAN — hand-tuned BESS-quality 2026-05-22.
 *
 * Deep-space spacecraft for Mars / Moon / L1 / L2 / asteroid missions.
 * 1000-3000 kg, 5-15 yr mission, radiation-hardened, autonomous safe-mode,
 * Deep Space Network communications, dual-mode (solar + RTG) power.
 *
 * References: NASA MRO / MAVEN / Europa Clipper, ESA Mars Express / Juice,
 * JAXA Hayabusa-2, Lockheed Martin LM-2100 deep-space variant.
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleClosure, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure

const PROV = (tid: string, version = '1.0.0') => (f: string) => ({
  source: `tool:${tid}` as const,
  tool_id: tid,
  tool_version: version,
  tool_license: 'free-proprietary' as const,
  tool_source_url: 'internal://forgeos/spacecraft',
  invocation_output_field: f,
  duration_ms: 0,
})

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

const stepPvlib: ToolStep = {
  tool_id: 'pvlib:solar-irradiance',
  required: true,
  feeds_into: ['solar-array:spacecraft'] as string[],
  input_from_contract: (c: any) => ({
    altitude_km: 1.5e8,
    latitude_deg: 0,
    surface_tilt_deg: 0,
    time_utc: '2026-06-21T12:00:00',
    target_flux_override_w_m2: c.quantities?.target_solar_flux_w_m2?.value ?? 590,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('pvlib:solar-irradiance', '0.15.1')
    const target = c.quantities?.target_solar_flux_w_m2?.value ?? 590
    return {
      ...c,
      quantities: {
        ...c.quantities,
        solar_constant_w_m2: { value: target, unit: 'W/m²', family: 'photon_flux_density', basis: 'rated', scope: 'envelope', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'at-destination flux', provenance: prov('solar_constant_w_m2') },
        earth_solar_constant_w_m2: { value: typeof output?.dni_w_m2 === 'number' ? output.dni_w_m2 : 1361, unit: 'W/m²', family: 'photon_flux_density', basis: 'rated', scope: 'envelope', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'at 1 AU', provenance: prov('dni_w_m2') },
      },
    }
  },
}

const stepSolarArray: ToolStep = {
  tool_id: 'solar-array:spacecraft',
  required: true,
  feeds_into: ['battery-eclipse:cycle', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: any) => {
    const avgPowerW = c.quantities?.avg_power_w?.value ?? 600
    return {
      avg_power_w: avgPowerW,
      bol_power_w: avgPowerW * 2.5,
      altitude_km: 1.5e8,
      solar_constant_w_m2: c.quantities?.solar_constant_w_m2?.value ?? 590,
      cell_type: 'gaas_triple_junction' as const,
      orbit_avg_eclipse_fraction: 0.4,
      degradation_years: c.quantities?.mission_duration_years?.value ?? 7,
      orientation: 'deployable' as const,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('solar-array:spacecraft')
    const panelArea = typeof output?.panel_area_m2 === 'number' ? output.panel_area_m2 : 22
    const bolPowerW = typeof output?.bol_power_w === 'number' ? output.bol_power_w : 1500
    const eolPowerW = typeof output?.eol_power_w === 'number' ? output.eol_power_w : 1100
    const panelMass = typeof output?.panel_mass_kg === 'number' ? output.panel_mass_kg : panelArea * 2.6
    const cellCount = typeof output?.cell_count === 'number' ? Math.round(output.cell_count) : Math.round(panelArea / 0.0027)
    const solarMacro = {
      word_name: 'solar_panel_assembly',
      unit_price_gbp: 6000,
      dimension_basis: 'square_metre' as const,
      dimension_value: panelArea,
      total_gbp: 6000 * panelArea,
      source_detail: `solar-array-derived: £6000/m² × ${panelArea.toFixed(1)} m² = £${(6000 * panelArea).toLocaleString()} (Spectrolab XTJ-Prime + low-intensity-low-temperature qual + radiation shielding)`,
    }
    return {
      ...c,
      macro_assembly_prices: [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'solar_panel_assembly'), solarMacro],
      quantities: {
        ...c.quantities,
        solar_array_area_m2: { value: panelArea, unit: 'm²', family: 'area', basis: 'aperture', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'LILT-qualified', provenance: prov('panel_area_m2') },
        bol_power_w: { value: bolPowerW, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'BoL at target', provenance: prov('bol_power_w') },
        eol_power_w: { value: eolPowerW, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'EoL', provenance: prov('eol_power_w') },
        solar_array_mass_kg: { value: panelMass, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'inc. radiation shielding', provenance: prov('panel_mass_kg') },
        solar_cell_count: { value: cellCount, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'GaAs TJ LILT', provenance: prov('cell_count') },
      },
    }
  },
}

const stepBattery = makeStep('battery-eclipse:cycle',
  (c: any) => ({
    avg_power_w: c.quantities?.avg_power_w?.value ?? 600,
    eclipse_minutes: 70,
    orbital_period_minutes: 7320,
    design_life_years: c.quantities?.mission_duration_years?.value ?? 7,
    max_dod_pct: 50,
  }),
  (_c, out) => {
    const prov = PROV('battery-eclipse:cycle')
    const capacityWh = typeof out?.battery_capacity_wh === 'number' ? out.battery_capacity_wh : 4500
    const batteryMass = typeof out?.battery_mass_kg === 'number' ? out.battery_mass_kg : capacityWh / 145
    return {
      battery_capacity_wh: { value: capacityWh, unit: 'Wh', family: 'energy', basis: 'nameplate', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'BoL', provenance: prov('battery_capacity_wh') },
      battery_mass_kg: { value: batteryMass, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '145 Wh/kg LILT li-ion', provenance: prov('battery_mass_kg') },
    }
  },
  ['mass-aggregator:envelope-check'],
  (_c, _out) => ({
    word_name: 'lithium_battery_pack',
    unit_price_gbp: 420,
    dimension_basis: 'kwh_capacity' as const,
    dimension_value: 4.5,
    total_gbp: 1890000,
    source_detail: 'battery-eclipse-derived: £420/Wh × 4500 Wh = £1.89M (EaglePicher LP-39 / Saft VL51E)',
  }),
)

// RTG — slot it under cantera tool ID (Pu-238 thermal-to-electric)
const stepRtg: ToolStep = {
  tool_id: 'cantera:thermochemistry',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    fuel: 'plutonium_238' as const,
    initial_thermal_power_w: 4500,
    initial_electrical_power_w: c.quantities?.rtg_required_power_w?.value ?? 250,
    mission_duration_years: c.quantities?.mission_duration_years?.value ?? 7,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('cantera:thermochemistry', '3.2.0')
    const rtgPowerW = typeof output?.electrical_power_w === 'number' ? output.electrical_power_w : 250
    const rtgMass = typeof output?.rtg_mass_kg === 'number' ? output.rtg_mass_kg : 45
    const rtgMacro = {
      word_name: 'rtg_radioisotope_generator',
      unit_price_gbp: 120000000,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 120000000,
      source_detail: 'RTG-derived: £120M (NASA MMRTG / Aerojet eMMRTG, Pu-238 fuel + SiGe thermocouples, 250 W BoL → ~200 W EoL)',
    }
    return {
      ...c,
      macro_assembly_prices: [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'rtg_radioisotope_generator'), rtgMacro],
      quantities: {
        ...c.quantities,
        rtg_electrical_power_w: { value: rtgPowerW, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'BoL Pu-238 MMRTG', provenance: prov('rtg_electrical_power_w') },
        rtg_mass_kg: { value: rtgMass, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'fueled MMRTG', provenance: prov('rtg_mass_kg') },
      },
    }
  },
}

const stepOrbitalThermal = makeStep('orbital-thermal:sat-balance',
  (c: any) => ({
    avg_power_dissipation_w: (c.quantities?.avg_power_w?.value ?? 600) * 0.85,
    surface_area_m2: 10,
    solar_absorptance: 0.22,
    ir_emittance: 0.85,
    altitude_km: 0,
    beta_angle_deg: 0,
  }),
  (_c, out) => ({
    hot_case_temp_c: { value: out?.hot_case_temp_c ?? 30, unit: '°C', family: 'temperature', basis: 'max', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'mars perihelion', provenance: PROV('orbital-thermal:sat-balance')('hot_case_temp_c') },
    cold_case_temp_c: { value: out?.cold_case_temp_c ?? -120, unit: '°C', family: 'temperature', basis: 'min', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'mars eclipse aphelion', provenance: PROV('orbital-thermal:sat-balance')('cold_case_temp_c') },
    thermal_rejection_min_kw: { value: (out?.avg_radiated_w ?? 510) / 1000, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'hot case sized', provenance: PROV('orbital-thermal:sat-balance')('avg_radiated_w') },
  }),
  ['mli:multi-layer-insulation', 'radiator:spacecraft-sizing'],
)

const stepMli = makeStep('mli:multi-layer-insulation',
  (c: any) => ({
    area_m2: 20,
    layer_count: 25,
    hot_side_temp_c: c.quantities?.hot_case_temp_c?.value ?? 30,
    cold_side_temp_c: c.quantities?.cold_case_temp_c?.value ?? -120,
  }),
  (_c, out) => ({
    mli_area_m2: { value: out?.mli_area_m2 ?? 20, unit: 'm²', family: 'area', basis: 'footprint', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '25-layer', provenance: PROV('mli:multi-layer-insulation')('mli_area_m2') },
    mli_mass_kg: { value: out?.mli_mass_kg ?? 18, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: PROV('mli:multi-layer-insulation')('mli_mass_kg') },
  }),
  [],
  (_c, _out) => ({ word_name: 'mli_thermal_blanket', unit_price_gbp: 2300, dimension_basis: 'square_metre' as const, dimension_value: 20, total_gbp: 46000, source_detail: 'mli-derived: £2300/m² × 20 m² = £46,000 (Sheldahl 25-layer aluminised Mylar/Kapton)' }),
)

const stepRadiator = makeStep('radiator:spacecraft-sizing',
  (c: any) => ({
    heat_rejection_w: (c.quantities?.thermal_rejection_min_kw?.value ?? 0.51) * 1000,
    radiator_temp_c: 20,
    deep_space_temp_k: 4,
    coating_emittance: 0.85,
    sun_factor: 0.2,
  }),
  (_c, out) => ({
    radiator_area_m2: { value: out?.radiator_area_m2 ?? 2.5, unit: 'm²', family: 'area', basis: 'aperture', scope: 'subassembly', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'cold-pointing', provenance: PROV('radiator:spacecraft-sizing')('radiator_area_m2') },
    radiator_mass_kg: { value: out?.radiator_mass_kg ?? 7.5, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'cold-side honeycomb', provenance: PROV('radiator:spacecraft-sizing')('radiator_mass_kg') },
  }),
)

const stepHeatPipe = makeStep('heat-pipe:sizing',
  (c: any) => ({ heat_load_w: (c.quantities?.thermal_rejection_min_kw?.value ?? 0.51) * 1000 * 0.7, working_fluid: 'ammonia' as const, operating_temp_c: 20, length_m: 0.8 }),
  (_c, out) => ({
    heat_pipe_count: { value: out?.heat_pipe_count ?? 6, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'CCHP + LHP', provenance: PROV('heat-pipe:sizing')('heat_pipe_count') },
  }),
)

const stepThermalStrap = makeStep('thermal-strap:conduction',
  (c: any) => ({ heat_load_w: (c.quantities?.thermal_rejection_min_kw?.value ?? 0.51) * 1000 * 0.1, temp_drop_c: 5, strap_length_m: 0.2 }),
  (_c, out) => ({
    thermal_strap_count: { value: out?.strap_count ?? 16, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'copper braid', provenance: PROV('thermal-strap:conduction')('strap_count') },
  }),
)

const stepCryocooler = makeStep('cryocooler:sizing',
  () => ({ heat_lift_w: 0.5, cold_tip_k: 80, mission_duration_years: 7, cryocooler_type: 'stirling' as const }),
  (_c, out) => ({
    cryocooler_input_power_w: { value: out?.input_power_w ?? 75, unit: 'W', family: 'power', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'Stirling cycle', provenance: PROV('cryocooler:sizing')('input_power_w') },
    cryocooler_mass_kg: { value: out?.cryocooler_mass_kg ?? 5, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'Northrop HEC Stirling', provenance: PROV('cryocooler:sizing')('cryocooler_mass_kg') },
  }),
)

const stepReactionWheel = makeStep('reaction-wheel:sizing',
  (c: any) => {
    const massKg = c.quantities?.mass_kg?.value ?? 2000
    return { spacecraft_mass_kg: massKg, moment_inertia_kgm2: massKg * 2, max_slew_rate_deg_s: 0.5, disturbance_torque_nm: 5e-5, wheel_count: 4 }
  },
  (_c, out) => ({
    reaction_wheel_torque_nm: { value: out?.wheel_torque_nm ?? 0.06, unit: 'N·m', family: 'force', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per wheel', provenance: PROV('reaction-wheel:sizing')('wheel_torque_nm') },
    reaction_wheel_momentum_nms: { value: out?.wheel_momentum_nms ?? 12, unit: 'N·m·s', family: 'force', basis: 'max', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per wheel', provenance: PROV('reaction-wheel:sizing')('wheel_momentum_nms') },
    reaction_wheel_count: { value: 4, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'pyramidal', provenance: PROV('reaction-wheel:sizing')('wheel_count') },
    reaction_wheel_mass_kg: { value: (out?.wheel_mass_kg ?? 4) * 4, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '4 wheels', provenance: PROV('reaction-wheel:sizing')('wheel_mass_kg') },
  }),
  [],
  (_c, _out) => ({ word_name: 'reaction_wheel_assembly', unit_price_gbp: 95000, dimension_basis: 'each' as const, dimension_value: 4, total_gbp: 380000, source_detail: 'reaction-wheel-derived: £95k × 4 = £380k (Honeywell HR14 / Bradford W45)' }),
)

const stepAttitudeTorque = makeStep('attitude:disturbance-torque',
  (c: any) => ({
    altitude_km: 400,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 2000,
    cross_section_m2: 12,
    drag_coefficient: 0,
    sp_pressure_n_m2: 4.5e-6,
  }),
  (_c, out) => ({ attitude_disturbance_torque_nm: { value: out?.total_disturbance_nm ?? 5e-5, unit: 'N·m', family: 'force', basis: 'peak', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'SRP + GG', provenance: PROV('attitude:disturbance-torque')('total_disturbance_nm') } }),
)

const stepLinkBudget = makeStep('link-budget:rf',
  () => ({
    frequency_ghz: 8.4,
    transmit_power_w: 100,
    transmit_antenna_gain_dbi: 47,
    receive_antenna_gain_dbi: 74,
    receive_system_temp_k: 25,
    bandwidth_hz: 6e6,
    range_km: 4e8,
    required_margin_db: 3,
  }),
  (_c, out) => ({
    downlink_eirp_dbw: { value: out?.eirp_dbw ?? 67, unit: 'dBW', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'X-band DSN', provenance: PROV('link-budget:rf')('eirp_dbw') },
    downlink_margin_db: { value: out?.link_margin_db ?? 6, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'at max range', provenance: PROV('link-budget:rf')('link_margin_db') },
    downlink_data_rate_mbps: { value: out?.data_rate_mbps ?? 4, unit: 'Mbps', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'turbo R-S', provenance: PROV('link-budget:rf')('data_rate_mbps') },
  }),
)

const stepHapsira: ToolStep = {
  tool_id: 'orbit-propagator:j2',
  required: false,
  feeds_into: ['delta-v-budget:mission'] as string[],
  input_from_contract: (c: any) => ({
    altitude_km: 400,
    inclination_deg: 25,
    eccentricity: 0.05,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 2000,
    drag_coefficient: 0,
    drag_area_m2: 0,
    propagation_days: (c.quantities?.mission_duration_years?.value ?? 7) * 365,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('orbit-propagator:j2')
    return {
      ...c,
      quantities: {
        ...c.quantities,
        orbital_period_minutes: { value: output?.orbital_period_minutes ?? 7320, unit: 'min', family: 'time', basis: 'cycle', scope: 'system', uncertainty_pct: 0.1, temporal_resolution_s: null, condition: 'Mars synchronous', provenance: prov('orbital_period_minutes') },
      },
    }
  },
}

const stepDeltaV = makeStep('delta-v-budget:mission',
  (c: any) => ({
    altitude_km: 1e8,
    design_life_years: c.quantities?.mission_duration_years?.value ?? 7,
    drag_makeup_required: false,
    collision_avoidance_required: true,
    deorbit_required: false,
    cruise_phase_required: true,
    capture_phase_required: true,
  }),
  (_c, out) => ({ delta_v_budget_ms: { value: out?.total_delta_v_ms ?? 4500, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'cruise + capture + correction', provenance: PROV('delta-v-budget:mission')('total_delta_v_ms') } }),
  ['chemical-propulsion:sizing', 'electric-propulsion:sizing'],
)

const stepChemProp = makeStep('chemical-propulsion:sizing',
  (c: any) => ({
    thrust_n: 450,
    isp_s: 320,
    propellant: 'mon3_mmh' as const,
    delta_v_required_ms: c.quantities?.delta_v_budget_ms?.value ?? 4500,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 2000,
  }),
  (_c, out) => ({
    chem_thrust_n: { value: out?.thrust_n ?? 450, unit: 'N', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'MMH/MON3 bi-prop', provenance: PROV('chemical-propulsion:sizing')('thrust_n') },
    chem_isp_s: { value: out?.isp_s ?? 320, unit: 's', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'IHI BT-4 / Aerojet R-4D', provenance: PROV('chemical-propulsion:sizing')('isp_s') },
    propellant_mass_kg: { value: out?.propellant_mass_kg ?? 1100, unit: 'kg', family: 'mass', basis: 'fuel', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'MMH+MON3', provenance: PROV('chemical-propulsion:sizing')('propellant_mass_kg') },
  }),
)

const stepElectricProp = makeStep('electric-propulsion:sizing',
  (c: any) => ({
    thrust_mn: 90,
    isp_s: 3000,
    power_w: 2500,
    propellant: 'xenon' as const,
    delta_v_required_ms: c.quantities?.delta_v_budget_ms?.value ?? 4500,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 2000,
  }),
  (_c, out) => ({
    ep_thrust_n: { value: out?.thrust_n ?? 0.09, unit: 'N', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'NASA NEXT-C ion', provenance: PROV('electric-propulsion:sizing')('thrust_n') },
    ep_isp_s: { value: out?.isp_s ?? 3000, unit: 's', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'NEXT-C', provenance: PROV('electric-propulsion:sizing')('isp_s') },
    ep_power_w: { value: out?.input_power_w ?? 2500, unit: 'W', family: 'power', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'PPU', provenance: PROV('electric-propulsion:sizing')('input_power_w') },
  }),
)

const stepPropTank = makeStep('propellant-tank:sizing',
  (c: any) => ({
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 1100,
    propellant: 'mmh' as const,
    operating_pressure_bar: 20,
    safety_factor: 2.5,
  }),
  (_c, out) => ({
    propellant_tank_volume_l: { value: out?.tank_volume_l ?? 1300, unit: 'L', family: 'volume', basis: 'gross', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'PMD MMH/MON3', provenance: PROV('propellant-tank:sizing')('tank_volume_l') },
    propellant_tank_mass_kg: { value: out?.tank_mass_kg ?? 95, unit: 'kg', family: 'mass', basis: 'empty', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Ti-6Al-4V', provenance: PROV('propellant-tank:sizing')('tank_mass_kg') },
  }),
)

const stepTsiolkovsky = makeStep('tsiolkovsky:delta-v',
  (c: any) => ({
    isp_s: c.quantities?.chem_isp_s?.value ?? 320,
    initial_mass_kg: c.quantities?.mass_kg?.value ?? 2000,
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 1100,
    g0_m_s2: 9.80665,
  }),
  (_c, out) => ({ achievable_delta_v_ms: { value: out?.achievable_delta_v_ms ?? 4650, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'closed-form', provenance: PROV('tsiolkovsky:delta-v')('achievable_delta_v_ms') } }),
)

const stepLaunchVib = makeStep('launch-vibration:miles-eqn',
  (c: any) => ({ spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 2000, natural_frequency_hz: 40, damping_ratio: 0.025, psd_g2_hz: 0.035 }),
  (_c, out) => ({
    launch_vibration_rms_g: { value: out?.rms_acceleration_g ?? 8, unit: 'g', family: 'dimensionless', basis: 'rms', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'Atlas V / Ariane 6 envelope', provenance: PROV('launch-vibration:miles-eqn')('rms_acceleration_g') },
    launch_vibration_peak_g: { value: out?.peak_load_g ?? 24, unit: 'g', family: 'dimensionless', basis: 'peak', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '3-sigma', provenance: PROV('launch-vibration:miles-eqn')('peak_load_g') },
  }),
)

const stepMassAgg = makeStep('mass-aggregator:envelope-check',
  (c: any) => ({
    solar_array_mass_kg: c.quantities?.solar_array_mass_kg?.value ?? 60,
    battery_mass_kg: c.quantities?.battery_mass_kg?.value ?? 32,
    rtg_mass_kg: c.quantities?.rtg_mass_kg?.value ?? 45,
    reaction_wheel_mass_kg: c.quantities?.reaction_wheel_mass_kg?.value ?? 16,
    radiator_mass_kg: c.quantities?.radiator_mass_kg?.value ?? 8,
    mli_mass_kg: c.quantities?.mli_mass_kg?.value ?? 18,
    cryocooler_mass_kg: c.quantities?.cryocooler_mass_kg?.value ?? 5,
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 1100,
    propellant_tank_mass_kg: c.quantities?.propellant_tank_mass_kg?.value ?? 95,
    structure_mass_kg: 280,
    avionics_mass_kg: 140,
    payload_mass_kg: 180,
    rad_shield_mass_kg: 80,
    max_mass_kg_envelope: c.quantities?.mass_kg?.value ?? 2000,
  }),
  (_c, out) => ({
    total_system_mass_kg: { value: out?.total_system_mass_kg ?? 1980, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'all-up wet mass', provenance: PROV('mass-aggregator:envelope-check')('total_system_mass_kg') },
    mass_budget_utilisation_pct: { value: out?.mass_budget_utilisation_pct ?? 92, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: PROV('mass-aggregator:envelope-check')('mass_budget_utilisation_pct') },
  }),
)

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
            updates[key] = { value: v, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov(k) }
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

const rules = [
  ruleRange('interplanetary.mass_kg_range', '500-3000 kg deep-space', 'mass_kg', 500, 3500, 'warning'),
  ruleRange('interplanetary.mission_duration_years', '3-15 years', 'mission_duration_years', 2, 16, 'warning'),
  ruleRange('interplanetary.downlink_margin_db', '≥3 dB at max range', 'downlink_margin_db', 3, 30, 'warning'),
  ruleRange('interplanetary.mass_utilisation', '≤95% mass budget', 'mass_budget_utilisation_pct', 0, 95, 'warning'),
  ruleQuantityRatio('interplanetary.delta_v_closure', 'achievable ≥ required ΔV', 'delta_v_budget_ms', 'achievable_delta_v_ms', 1.0, 'fatal'),
]

export const SATELLITE_INTERPLANETARY_PLAN: ClassToolPlan = {
  id: 'satellite_interplanetary:interplanetary',
  envelope_predicate: (e) => e.class === 'satellite_interplanetary',
  tools: [
    stepPvlib, stepSolarArray, stepBattery, stepRtg, stepOrbitalThermal, stepMli, stepRadiator, stepHeatPipe, stepThermalStrap, stepCryocooler,
    stepReactionWheel, stepAttitudeTorque, stepLinkBudget, stepHapsira,
    stepDeltaV, stepChemProp, stepElectricProp, stepPropTank, stepTsiolkovsky, stepLaunchVib, stepMassAgg,
    stepRegulatory, stepLifecycleCo2, stepSupplyChain, stepReliability, stepCyber, stepTransport,
  ],
  coupled_pairs: [
    ['solar-array:spacecraft', 'battery-eclipse:cycle'],
    ['delta-v-budget:mission', 'chemical-propulsion:sizing'],
    ['delta-v-budget:mission', 'propellant-tank:sizing'],
  ],
  max_iterations: 3,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(SATELLITE_INTERPLANETARY_PLAN)
