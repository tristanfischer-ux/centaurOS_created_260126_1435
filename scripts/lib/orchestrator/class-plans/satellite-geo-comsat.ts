/**
 * scripts/lib/orchestrator/class-plans/satellite-geo-comsat.ts
 *
 * GEOSTATIONARY COMSAT TOOL PLAN — hand-tuned BESS-quality 2026-05-22.
 *
 * 1000-7000 kg, 15-year mission, multi-kW power. Architecture refs:
 * Lockheed A2100, Boeing 702SP, Airbus Eurostar Neo, Thales Alenia
 * Spacebus 4000. All-electric or hybrid propulsion.
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

const stepPvlib: ToolStep = {
  tool_id: 'pvlib:solar-irradiance',
  required: true,
  feeds_into: ['solar-array:spacecraft'] as string[],
  input_from_contract: () => ({ altitude_km: 35786, latitude_deg: 0, surface_tilt_deg: 0, time_utc: '2026-06-21T12:00:00' }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('pvlib:solar-irradiance', '0.15.1')
    const solarConstant = typeof output?.solar_constant_w_m2 === 'number' ? output.solar_constant_w_m2 : 1361
    return {
      ...c,
      quantities: {
        ...c.quantities,
        solar_constant_w_m2: { value: solarConstant, unit: 'W/m²', family: 'photon_flux_density', basis: 'rated', scope: 'envelope', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'AM0 GEO', provenance: prov('solar_constant_w_m2') },
      },
    }
  },
}

const stepSolarArray: ToolStep = {
  tool_id: 'solar-array:spacecraft',
  required: true,
  feeds_into: ['battery-eclipse:cycle', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: any) => {
    const bolPowerKw = c.quantities?.bol_power_kw?.value ?? 12
    return {
      avg_power_w: bolPowerKw * 1000 * 0.7,
      bol_power_w: bolPowerKw * 1000,
      altitude_km: 35786,
      solar_constant_w_m2: c.quantities?.solar_constant_w_m2?.value ?? 1361,
      cell_type: 'gaas_triple_junction' as const,
      orbit_avg_eclipse_fraction: 0.05,
      degradation_years: c.quantities?.design_life_years?.value ?? 15,
      orientation: 'deployable' as const,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('solar-array:spacecraft')
    const panelArea = typeof output?.panel_area_m2 === 'number' ? output.panel_area_m2 : 60
    const bolPowerW = typeof output?.bol_power_w === 'number' ? output.bol_power_w : 12000
    const eolPowerW = typeof output?.eol_power_w === 'number' ? output.eol_power_w : 9600
    const panelMass = typeof output?.panel_mass_kg === 'number' ? output.panel_mass_kg : panelArea * 3.0
    const cellCount = typeof output?.cell_count === 'number' ? Math.round(output.cell_count) : Math.round(panelArea / 0.0027)
    const solarMacro = {
      word_name: 'solar_panel_assembly',
      unit_price_gbp: 5500,
      dimension_basis: 'square_metre' as const,
      dimension_value: panelArea,
      total_gbp: 5500 * panelArea,
      source_detail: `solar-array-derived: £5500/m² × ${panelArea.toFixed(1)} m² = £${(5500 * panelArea).toLocaleString()} (Spectrolab UTJ on Boeing/Airbus 5-panel wings + MOOG SADM)`,
    }
    return {
      ...c,
      macro_assembly_prices: [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'solar_panel_assembly'), solarMacro],
      quantities: {
        ...c.quantities,
        solar_array_area_m2: { value: panelArea, unit: 'm²', family: 'area', basis: 'aperture', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'deployed', provenance: prov('panel_area_m2') },
        bol_power_w: { value: bolPowerW, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'BoL', provenance: prov('bol_power_w') },
        eol_power_w: { value: eolPowerW, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'EoL 15 yr', provenance: prov('eol_power_w') },
        solar_array_mass_kg: { value: panelMass, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'inc. yoke + SADM', provenance: prov('panel_mass_kg') },
        solar_cell_count: { value: cellCount, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'GaAs TJ', provenance: prov('cell_count') },
      },
    }
  },
}

const stepBattery: ToolStep = {
  tool_id: 'battery-eclipse:cycle',
  required: true,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: any) => ({
    avg_power_w: (c.quantities?.bol_power_kw?.value ?? 12) * 1000 * 0.7,
    eclipse_minutes: 72,
    orbital_period_minutes: 1436,
    design_life_years: c.quantities?.design_life_years?.value ?? 15,
    max_dod_pct: 80,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('battery-eclipse:cycle')
    const capacityWh = typeof output?.battery_capacity_wh === 'number' ? output.battery_capacity_wh : 12000
    const batteryMass = typeof output?.battery_mass_kg === 'number' ? output.battery_mass_kg : capacityWh / 165
    const cyclesTotal = typeof output?.cycles_total === 'number' ? Math.round(output.cycles_total) : 90 * 15
    const batteryMacro = {
      word_name: 'lithium_battery_pack',
      unit_price_gbp: 340,
      dimension_basis: 'kwh_capacity' as const,
      dimension_value: capacityWh / 1000,
      total_gbp: 340 * capacityWh,
      source_detail: `battery-eclipse-derived: £340/Wh × ${capacityWh.toFixed(0)} Wh = £${(340 * capacityWh).toLocaleString()} (Saft VES100 / EaglePicher GEO-class li-ion, ${cyclesTotal} cycles)`,
    }
    return {
      ...c,
      macro_assembly_prices: [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'lithium_battery_pack'), batteryMacro],
      quantities: {
        ...c.quantities,
        battery_capacity_wh: { value: capacityWh, unit: 'Wh', family: 'energy', basis: 'nameplate', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'BoL', provenance: prov('battery_capacity_wh') },
        battery_mass_kg: { value: batteryMass, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '165 Wh/kg', provenance: prov('battery_mass_kg') },
        battery_eclipse_cycles_total: { value: cyclesTotal, unit: '', family: 'dimensionless', basis: 'lifetime', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'GEO eclipse seasons', provenance: prov('cycles_total') },
      },
    }
  },
}

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

const stepOrbitalThermal = makeStep('orbital-thermal:sat-balance',
  (c: any) => ({
    avg_power_dissipation_w: (c.quantities?.bol_power_kw?.value ?? 12) * 1000 * 0.65,
    surface_area_m2: 18,
    solar_absorptance: 0.25,
    ir_emittance: 0.88,
    altitude_km: 35786,
    beta_angle_deg: 0,
  }),
  (_c, out) => ({
    hot_case_temp_c: { value: out?.hot_case_temp_c ?? 42, unit: '°C', family: 'temperature', basis: 'max', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'noon sun', provenance: PROV('orbital-thermal:sat-balance')('hot_case_temp_c') },
    cold_case_temp_c: { value: out?.cold_case_temp_c ?? -15, unit: '°C', family: 'temperature', basis: 'min', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'eclipse', provenance: PROV('orbital-thermal:sat-balance')('cold_case_temp_c') },
    thermal_rejection_min_kw: { value: (out?.avg_radiated_w ?? 8000) / 1000, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'hot case', provenance: PROV('orbital-thermal:sat-balance')('avg_radiated_w') },
  }),
  ['mli:multi-layer-insulation', 'radiator:spacecraft-sizing'],
)

const stepMli = makeStep('mli:multi-layer-insulation',
  (c: any) => ({
    area_m2: 30,
    layer_count: 22,
    hot_side_temp_c: c.quantities?.hot_case_temp_c?.value ?? 42,
    cold_side_temp_c: c.quantities?.cold_case_temp_c?.value ?? -15,
  }),
  (_c, out) => ({
    mli_area_m2: { value: out?.mli_area_m2 ?? 30, unit: 'm²', family: 'area', basis: 'footprint', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '22-layer', provenance: PROV('mli:multi-layer-insulation')('mli_area_m2') },
    mli_mass_kg: { value: out?.mli_mass_kg ?? 22, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: PROV('mli:multi-layer-insulation')('mli_mass_kg') },
  }),
  [],
  (_c, _out) => ({ word_name: 'mli_thermal_blanket', unit_price_gbp: 2000, dimension_basis: 'square_metre' as const, dimension_value: 30, total_gbp: 60000, source_detail: 'mli-derived: £2000/m² × 30 m² = £60,000 (Sheldahl 22-layer Mylar/Kapton)' }),
)

const stepRadiator = makeStep('radiator:spacecraft-sizing',
  (c: any) => ({
    heat_rejection_w: (c.quantities?.thermal_rejection_min_kw?.value ?? 8) * 1000,
    radiator_temp_c: 30,
    deep_space_temp_k: 4,
    coating_emittance: 0.88,
    sun_factor: 0.18,
  }),
  (_c, out) => ({
    radiator_area_m2: { value: out?.radiator_area_m2 ?? 12, unit: 'm²', family: 'area', basis: 'aperture', scope: 'subassembly', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'deployable + body-mounted', provenance: PROV('radiator:spacecraft-sizing')('radiator_area_m2') },
    radiator_mass_kg: { value: out?.radiator_mass_kg ?? 12 * 3.2, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'honeycomb + LHP', provenance: PROV('radiator:spacecraft-sizing')('radiator_mass_kg') },
    deployable_radiator_count: { value: 2, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'N+S panels', provenance: PROV('radiator:spacecraft-sizing')('deployable_radiator_count') },
  }),
  [],
  (_c, _out) => ({ word_name: 'deployable_radiator', unit_price_gbp: 28000, dimension_basis: 'square_metre' as const, dimension_value: 12, total_gbp: 336000, source_detail: 'radiator-derived: £28000/m² × 12 m² = £336,000 (deployable Northrop Grumman radiator + LHP)' }),
)

const stepHeatPipe = makeStep('heat-pipe:sizing',
  (c: any) => ({ heat_load_w: (c.quantities?.thermal_rejection_min_kw?.value ?? 8) * 1000 * 0.7, working_fluid: 'ammonia' as const, operating_temp_c: 30, length_m: 1.2 }),
  (_c, out) => ({
    heat_pipe_capacity_w: { value: out?.capacity_w ?? 1200, unit: 'W', family: 'power', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'loop heat pipe', provenance: PROV('heat-pipe:sizing')('capacity_w') },
    heat_pipe_count: { value: out?.heat_pipe_count ?? 18, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'LHPs + CCHPs', provenance: PROV('heat-pipe:sizing')('heat_pipe_count') },
  }),
)

const stepThermalStrap = makeStep('thermal-strap:conduction',
  (c: any) => ({ heat_load_w: (c.quantities?.thermal_rejection_min_kw?.value ?? 8) * 1000 * 0.1, temp_drop_c: 5, strap_length_m: 0.3 }),
  (_c, out) => ({ thermal_strap_count: { value: out?.strap_count ?? 30, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'copper braid', provenance: PROV('thermal-strap:conduction')('strap_count') } }),
)

const stepPcm = makeStep('pcm:thermal-storage',
  () => ({ heat_buffer_kj: 5000, pcm_material: 'n_octadecane' as const, operating_temp_c: 25 }),
  (_c, out) => ({ pcm_mass_kg: { value: out?.pcm_mass_kg ?? 22, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'n-octadecane PCM', provenance: PROV('pcm:thermal-storage')('pcm_mass_kg') } }),
)

const stepReactionWheel = makeStep('reaction-wheel:sizing',
  (c: any) => {
    const massKg = c.quantities?.mass_kg?.value ?? 5000
    return { spacecraft_mass_kg: massKg, moment_inertia_kgm2: massKg * 5, max_slew_rate_deg_s: 0.05, disturbance_torque_nm: 0.001, wheel_count: 4 }
  },
  (_c, out) => ({
    reaction_wheel_torque_nm: { value: out?.wheel_torque_nm ?? 0.2, unit: 'N·m', family: 'force', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per wheel', provenance: PROV('reaction-wheel:sizing')('wheel_torque_nm') },
    reaction_wheel_momentum_nms: { value: out?.wheel_momentum_nms ?? 70, unit: 'N·m·s', family: 'force', basis: 'max', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per wheel', provenance: PROV('reaction-wheel:sizing')('wheel_momentum_nms') },
    reaction_wheel_count: { value: 4, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'pyramidal', provenance: PROV('reaction-wheel:sizing')('wheel_count') },
    reaction_wheel_mass_kg: { value: (out?.wheel_mass_kg ?? 12) * 4, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '4 wheels', provenance: PROV('reaction-wheel:sizing')('wheel_mass_kg') },
  }),
  [],
  (_c, _out) => ({ word_name: 'reaction_wheel_assembly', unit_price_gbp: 240000, dimension_basis: 'each' as const, dimension_value: 4, total_gbp: 960000, source_detail: 'reaction-wheel-derived: £240000 × 4 = £960,000 (Honeywell HR16/HR50 class, 0.2 N·m, 70 N·m·s)' }),
)

const stepMagnetorquer = makeStep('magnetorquer:sizing',
  () => ({ altitude_km: 35786, target_torque_nm: 0, coil_count: 0, available_power_w: 0 }),
  (_c, _out) => ({ magnetorquer_mass_kg: { value: 0, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'not used at GEO', provenance: PROV('magnetorquer:sizing')('coil_mass_kg') } }),
)

const stepAttitudeTorque = makeStep('attitude:disturbance-torque',
  (c: any) => ({ altitude_km: 35786, spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 5000, cross_section_m2: 30, drag_coefficient: 0, sp_pressure_n_m2: 4.5e-6 }),
  (_c, out) => ({ attitude_disturbance_torque_nm: { value: out?.total_disturbance_nm ?? 1e-4, unit: 'N·m', family: 'force', basis: 'peak', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'SRP + GG dominant', provenance: PROV('attitude:disturbance-torque')('total_disturbance_nm') } }),
)

const stepLinkBudget = makeStep('link-budget:rf',
  () => ({
    frequency_ghz: 20, transmit_power_w: 300, transmit_antenna_gain_dbi: 42,
    receive_antenna_gain_dbi: 35, receive_system_temp_k: 150, bandwidth_hz: 500e6,
    range_km: 35786, required_margin_db: 4,
  }),
  (_c, out) => ({
    downlink_eirp_dbw: { value: out?.eirp_dbw ?? 66.8, unit: 'dBW', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'Ka-band', provenance: PROV('link-budget:rf')('eirp_dbw') },
    downlink_margin_db: { value: out?.link_margin_db ?? 6, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: PROV('link-budget:rf')('link_margin_db') },
    downlink_data_rate_mbps: { value: out?.data_rate_mbps ?? 1200, unit: 'Mbps', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'spot beam DVB-S2X', provenance: PROV('link-budget:rf')('data_rate_mbps') },
  }),
)

const stepOrbitProp = makeStep('orbit-propagator:j2',
  (c: any) => ({ altitude_km: 35786, inclination_deg: 0, eccentricity: 0.0001, spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 5000, drag_coefficient: 0, drag_area_m2: 0, propagation_days: 5475 }),
  (_c, out) => ({
    orbital_period_minutes: { value: out?.orbital_period_minutes ?? 1436, unit: 'min', family: 'time', basis: 'cycle', scope: 'system', uncertainty_pct: 0.01, temporal_resolution_s: null, condition: 'sidereal day', provenance: PROV('orbit-propagator:j2')('orbital_period_minutes') },
    altitude_decay_km_yr: { value: 0, unit: 'km/yr', family: 'velocity', basis: 'mean', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'no drag', provenance: PROV('orbit-propagator:j2')('altitude_decay_km_per_year') },
    deorbit_lifetime_years: { value: 0, unit: 'yr', family: 'time', basis: 'lifetime', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'graveyard at EoL', provenance: PROV('orbit-propagator:j2')('deorbit_years') },
  }),
)

const stepDeltaV = makeStep('delta-v-budget:mission',
  (c: any) => ({
    altitude_km: 35786,
    design_life_years: c.quantities?.design_life_years?.value ?? 15,
    drag_makeup_required: false,
    collision_avoidance_required: true,
    deorbit_required: true,
  }),
  (_c, out) => ({ delta_v_budget_ms: { value: out?.total_delta_v_ms ?? 1500, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '15-yr stationkeeping + graveyard', provenance: PROV('delta-v-budget:mission')('total_delta_v_ms') } }),
  ['electric-propulsion:sizing', 'chemical-propulsion:sizing', 'propellant-tank:sizing'],
)

const stepElectricProp = makeStep('electric-propulsion:sizing',
  (c: any) => ({
    thrust_mn: 220, isp_s: 1800, power_w: 5000, propellant: 'xenon' as const,
    delta_v_required_ms: c.quantities?.delta_v_budget_ms?.value ?? 1500,
    spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 5000,
  }),
  (_c, out) => ({
    ep_thrust_n: { value: out?.thrust_n ?? 0.22, unit: 'N', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Hall', provenance: PROV('electric-propulsion:sizing')('thrust_n') },
    ep_isp_s: { value: out?.isp_s ?? 1800, unit: 's', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'XR-5 / SPT-140', provenance: PROV('electric-propulsion:sizing')('isp_s') },
    ep_power_w: { value: out?.input_power_w ?? 5000, unit: 'W', family: 'power', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'PPU input', provenance: PROV('electric-propulsion:sizing')('input_power_w') },
    ep_thruster_count: { value: 4, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: '4 thrusters (N-S + E-W)', provenance: PROV('electric-propulsion:sizing')('thruster_count') },
    propellant_mass_kg: { value: out?.propellant_mass_kg ?? 380, unit: 'kg', family: 'mass', basis: 'fuel', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'xenon', provenance: PROV('electric-propulsion:sizing')('propellant_mass_kg') },
  }),
  [],
  (_c, _out) => ({ word_name: 'electric_propulsion_thruster', unit_price_gbp: 1100000, dimension_basis: 'each' as const, dimension_value: 4, total_gbp: 4400000, source_detail: 'EP-derived: £1.1M × 4 = £4.4M (Aerojet XR-5 / SPT-140 class)' }),
)

const stepChemProp = makeStep('chemical-propulsion:sizing',
  (c: any) => ({ thrust_n: 400, isp_s: 320, propellant: 'mon3_mmh' as const, delta_v_required_ms: 1800, spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 5000 }),
  (_c, out) => ({
    chem_thrust_n: { value: out?.thrust_n ?? 400, unit: 'N', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'MON3/MMH bi-prop apogee kick', provenance: PROV('chemical-propulsion:sizing')('thrust_n') },
    chem_isp_s: { value: out?.isp_s ?? 320, unit: 's', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'AKM', provenance: PROV('chemical-propulsion:sizing')('isp_s') },
  }),
)

const stepPropTank = makeStep('propellant-tank:sizing',
  (c: any) => ({
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 380,
    propellant: 'xenon' as const,
    operating_pressure_bar: 160,
    safety_factor: 2.0,
  }),
  (_c, out) => ({
    propellant_tank_volume_l: { value: out?.tank_volume_l ?? 200, unit: 'L', family: 'volume', basis: 'gross', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'xenon 160 bar', provenance: PROV('propellant-tank:sizing')('tank_volume_l') },
    propellant_tank_mass_kg: { value: out?.tank_mass_kg ?? 90, unit: 'kg', family: 'mass', basis: 'empty', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Ti-6Al-4V', provenance: PROV('propellant-tank:sizing')('tank_mass_kg') },
  }),
)

const stepTsiolkovsky = makeStep('tsiolkovsky:delta-v',
  (c: any) => ({
    isp_s: c.quantities?.ep_isp_s?.value ?? 1800,
    initial_mass_kg: c.quantities?.mass_kg?.value ?? 5000,
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 380,
    g0_m_s2: 9.80665,
  }),
  (_c, out) => ({ achievable_delta_v_ms: { value: out?.achievable_delta_v_ms ?? 1550, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'closed-form', provenance: PROV('tsiolkovsky:delta-v')('achievable_delta_v_ms') } }),
)

const stepCantera: ToolStep = {
  tool_id: 'cantera:thermochemistry',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ fuel: 'MMH', oxidizer: 'MON3', mixture_ratio: 1.65, chamber_pressure_bar: 12, expansion_ratio: 100 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('cantera:thermochemistry', '3.2.0')
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cantera_flame_temp_k: { value: output?.adiabatic_flame_temp_k ?? 3100, unit: 'K', family: 'temperature', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'MMH/MON3 hypergolic', provenance: prov('adiabatic_flame_temp_k') },
      },
    }
  },
}

const stepLaunchVib = makeStep('launch-vibration:miles-eqn',
  (c: any) => ({ spacecraft_mass_kg: c.quantities?.mass_kg?.value ?? 5000, natural_frequency_hz: 35, damping_ratio: 0.02, psd_g2_hz: 0.03 }),
  (_c, out) => ({
    launch_vibration_rms_g: { value: out?.rms_acceleration_g ?? 7, unit: 'g', family: 'dimensionless', basis: 'rms', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'Ariane 6 envelope', provenance: PROV('launch-vibration:miles-eqn')('rms_acceleration_g') },
    launch_vibration_peak_g: { value: out?.peak_load_g ?? 21, unit: 'g', family: 'dimensionless', basis: 'peak', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '3-sigma', provenance: PROV('launch-vibration:miles-eqn')('peak_load_g') },
  }),
)

const stepMassAgg = makeStep('mass-aggregator:envelope-check',
  (c: any) => ({
    solar_array_mass_kg: c.quantities?.solar_array_mass_kg?.value ?? 180,
    battery_mass_kg: c.quantities?.battery_mass_kg?.value ?? 75,
    reaction_wheel_mass_kg: c.quantities?.reaction_wheel_mass_kg?.value ?? 48,
    radiator_mass_kg: c.quantities?.radiator_mass_kg?.value ?? 40,
    mli_mass_kg: c.quantities?.mli_mass_kg?.value ?? 22,
    propellant_mass_kg: c.quantities?.propellant_mass_kg?.value ?? 380,
    propellant_tank_mass_kg: c.quantities?.propellant_tank_mass_kg?.value ?? 90,
    pcm_mass_kg: c.quantities?.pcm_mass_kg?.value ?? 22,
    transponder_mass_kg: 380,
    antenna_mass_kg: 220,
    structure_mass_kg: 600,
    avionics_mass_kg: 220,
    max_mass_kg_envelope: c.quantities?.mass_kg?.value ?? 5000,
  }),
  (_c, out) => ({
    total_system_mass_kg: { value: out?.total_system_mass_kg ?? 4700, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'all-up', provenance: PROV('mass-aggregator:envelope-check')('total_system_mass_kg') },
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
  ruleRange('geo_comsat.mass_kg_range', '1000-7000 kg GEO comsat', 'mass_kg', 1000, 7500, 'warning'),
  ruleRange('geo_comsat.design_life_years', '12-18 yr typical', 'design_life_years', 10, 20, 'warning'),
  ruleRange('geo_comsat.downlink_margin_db', '≥3 dB link margin', 'downlink_margin_db', 3, 30, 'warning'),
  ruleRange('geo_comsat.mass_utilisation', '≤95% mass budget', 'mass_budget_utilisation_pct', 0, 95, 'warning'),
  ruleQuantityRatio('geo_comsat.delta_v_closure', 'achievable ≥ required ΔV', 'delta_v_budget_ms', 'achievable_delta_v_ms', 1.0, 'fatal'),
]

export const SATELLITE_GEO_COMSAT_PLAN: ClassToolPlan = {
  id: 'satellite_geo_comsat:geo_comsat',
  envelope_predicate: (e) => e.class === 'satellite_geo_comsat',
  tools: [
    stepPvlib, stepSolarArray, stepBattery, stepOrbitalThermal, stepMli, stepRadiator, stepHeatPipe, stepThermalStrap, stepPcm,
    stepReactionWheel, stepMagnetorquer, stepAttitudeTorque, stepLinkBudget, stepOrbitProp,
    stepDeltaV, stepElectricProp, stepChemProp, stepPropTank, stepTsiolkovsky, stepCantera, stepLaunchVib, stepMassAgg,
    stepRegulatory, stepLifecycleCo2, stepSupplyChain, stepReliability, stepCyber, stepTransport,
  ],
  coupled_pairs: [
    ['solar-array:spacecraft', 'battery-eclipse:cycle'],
    ['delta-v-budget:mission', 'electric-propulsion:sizing'],
    ['delta-v-budget:mission', 'propellant-tank:sizing'],
  ],
  max_iterations: 3,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(SATELLITE_GEO_COMSAT_PLAN)
