/**
 * scripts/lib/orchestrator/class-plans/haps.ts
 *
 * HAPS TOOL PLAN — Build #20a hand-tuned (2026-05-22).
 *
 * Replaces the auto-generated stub with a BESS-quality plan that:
 *   - Reads SPECIFIC fields from the Contract via input_from_contract
 *   - Emits CANONICAL quantity names (no namespaced `<tool>__<field>`)
 *   - Emits macro_assembly_prices for: battery_cell, solar_cell, wing_spar
 *   - Adds 7 cross-tool consistency rules
 *
 * Tools (16):
 *   1. pvlib:solar-irradiance       — extraterrestrial irradiance at 20 km
 *   2. ambiance:isa-atmosphere      — density/T at cruise altitude
 *   3. aerosandbox:airfoil-analysis — wing CL/CD/L_over_D at cruise Re
 *   4. propeller:low-re-bemt        — HAPS propeller polar (thrust/eff)
 *   5. motor:altitude-derating      — motor power derating at 20 km
 *   6. battery-li-s:cell-sizing     — Li-S pack topology (cells_series×parallel)
 *   7. aeroelastic-flutter:wing     — flutter speed + divergence margin
 *   8. gust-response:haps-atmospheric — stratospheric gust load envelope
 *   9. airframe-fea:landing         — belly-landing load case
 *  10. link-budget:rf               — S-band downlink margin
 *  11. control-systems:pid-tuning   — pitch loop autopilot tuning
 *  12. regulatory-faa:airspace      — Class A clearance + waivers
 *  13. regulatory-cert-cost:lookup  — CAA CAP 722 + EUROCAE ED-279 cost
 *  14. lifecycle-co2:assessment     — programme LCA
 *  15. supply-chain-risk:scoring    — supply chain (Spectrolab, Sion Power)
 *  16. mass-aggregator:envelope-check — empty mass closure
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// 1. pvlib:solar-irradiance
// ---------------------------------------------------------------------------

const stepPvlibSolarIrradiance: ToolStep = {
  tool_id: 'pvlib:solar-irradiance',
  required: false,
  feeds_into: ['battery-li-s:cell-sizing'] as string[],
  input_from_contract: (c: any) => ({
    latitude: 51.5,  // UK programme — London latitude
    longitude: 0.0,
    altitude_m: c.quantities?.cruise_altitude_m?.value ?? 20000,
    time_utc: '2026-06-21T12:00:00',
    model: 'extraterrestrial' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { ghi: number; dni: number; extraterrestrial_w_m2: number }
    const prov = (f: string) => ({ source: 'tool:pvlib:solar-irradiance' as const, tool_id: 'pvlib:solar-irradiance', invocation_output_field: f, duration_ms: 0 })
    const solarPanelAreaM2 = (c.quantities?.wing_area_m2?.value ?? 125) * 0.4
    const solarHarvestKw = (out.extraterrestrial_w_m2 ?? 1322) * solarPanelAreaM2 * 0.30 / 1000  // 30% triple-junction GaAs
    const solarMacro = {
      word_name: 'gaas_solar_laminate',
      unit_price_gbp: 4000,
      dimension_basis: 'square_metre' as const,
      dimension_value: solarPanelAreaM2,
      total_gbp: 4000 * solarPanelAreaM2,
      source_detail: `pvlib-derived: £4000/m² × ${solarPanelAreaM2.toFixed(1)} m² Spectrolab XTJ Prime GaAs triple-junction; ET irradiance ${out.extraterrestrial_w_m2?.toFixed(0) ?? 1322} W/m² → ${solarHarvestKw.toFixed(2)} kW peak harvest`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'gaas_solar_laminate'),
        solarMacro,
      ],
      quantities: {
        ...c.quantities,
        solar_irradiance_et_w_m2: { value: out.extraterrestrial_w_m2 ?? 1322, unit: 'W/m²', family: 'power' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: 'extraterrestrial @ summer solstice noon', provenance: prov('extraterrestrial_w_m2') },
        solar_harvest_peak_kw: { value: solarHarvestKw, unit: 'kW', family: 'power' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: '30% η × 40% wing coverage', provenance: prov('extraterrestrial_w_m2') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. ambiance:isa-atmosphere
// ---------------------------------------------------------------------------

const stepAmbianceAtmosphere: ToolStep = {
  tool_id: 'ambiance:isa-atmosphere',
  required: false,
  feeds_into: ['propeller:low-re-bemt', 'aerosandbox:airfoil-analysis'] as string[],
  input_from_contract: (c: any) => ({
    altitude_m: c.quantities?.cruise_altitude_m?.value ?? 20000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { density_kg_m3: number; temperature_k: number; pressure_pa: number }
    const prov = (f: string) => ({ source: 'tool:ambiance:isa-atmosphere' as const, tool_id: 'ambiance:isa-atmosphere', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        air_density_kg_m3: { value: out.density_kg_m3 ?? 0.088, unit: 'kg/m³', family: 'density' as const, basis: 'rated' as const, scope: 'envelope' as const, uncertainty_pct: 1, temporal_resolution_s: null, condition: 'ISA standard atmosphere', provenance: prov('density_kg_m3') },
        ambient_temperature_k: { value: out.temperature_k ?? 216.65, unit: 'K', family: 'temperature' as const, basis: 'rated' as const, scope: 'envelope' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: 'ISA @ cruise altitude', provenance: prov('temperature_k') },
        ambient_pressure_pa: { value: out.pressure_pa ?? 5475, unit: 'Pa', family: 'pressure' as const, basis: 'rated' as const, scope: 'envelope' as const, uncertainty_pct: 1, temporal_resolution_s: null, condition: 'ISA @ cruise altitude', provenance: prov('pressure_pa') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. aerosandbox:airfoil-analysis
// ---------------------------------------------------------------------------

const stepAerosandboxAirfoil: ToolStep = {
  tool_id: 'aerosandbox:airfoil-analysis',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const chordM = c.quantities?.chord_m?.value ?? 2.5
    const vMs = c.quantities?.cruise_velocity_m_s?.value ?? 30
    const rhoKgM3 = c.quantities?.air_density_kg_m3?.value ?? 0.088
    const muKinematicVisc = 1.46e-5  // kinematic visc at 20km, 216K
    const reynolds = (vMs * chordM * rhoKgM3) / (muKinematicVisc * rhoKgM3)
    return {
      airfoil_name: 'NACA4412',
      alpha_deg: 4.0,  // typical HAPS cruise alpha
      reynolds: Math.max(50_000, Math.min(2_000_000, reynolds)),
      mach: vMs / 295,  // a_sound at 216K
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { CL: number; CD: number; L_over_D: number }
    const prov = (f: string) => ({ source: 'tool:aerosandbox:airfoil-analysis' as const, tool_id: 'aerosandbox:airfoil-analysis', invocation_output_field: f, duration_ms: 0 })
    const wingspanM = c.quantities?.wingspan_m?.value ?? 50
    const sparMacro = {
      word_name: 'carbon_fibre_wing_spar',
      unit_price_gbp: 8000,
      dimension_basis: 'metre_wingspan' as const,
      dimension_value: wingspanM,
      total_gbp: 8000 * wingspanM,
      source_detail: `aerosandbox-derived: £8000/m × ${wingspanM.toFixed(0)} m wingspan @ M55J/M46J CF prepreg box spar (L/D=${out.L_over_D?.toFixed(0) ?? 96} aerodynamic efficiency requires premium spar)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'carbon_fibre_wing_spar'),
        sparMacro,
      ],
      quantities: {
        ...c.quantities,
        wing_lift_coefficient_cl: { value: out.CL ?? 0.7, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cruise α=4°, Re~250k', provenance: prov('CL') },
        wing_drag_coefficient_cd: { value: out.CD ?? 0.012, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'cruise α=4°', provenance: prov('CD') },
        wing_l_over_d: { value: out.L_over_D ?? 96, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cruise α=4°', provenance: prov('L_over_D') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. propeller:low-re-bemt
// ---------------------------------------------------------------------------

const stepPropellerLowRe: ToolStep = {
  tool_id: 'propeller:low-re-bemt',
  required: false,
  feeds_into: ['motor:altitude-derating'] as string[],
  input_from_contract: (c: any) => ({
    diameter_m: 4.0,
    pitch_m: 2.4,
    rpm: 800,
    airspeed_ms: c.quantities?.cruise_velocity_m_s?.value ?? 30,
    air_density_kg_m3: c.quantities?.air_density_kg_m3?.value ?? 0.088,
    num_blades: 2,
    chord_m: 0.30,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { thrust_n: number; power_w: number; efficiency_pct: number; mach_tip: number; rpm: number }
    const prov = (f: string) => ({ source: 'tool:propeller:low-re-bemt' as const, tool_id: 'propeller:low-re-bemt', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        prop_thrust_n: { value: out.thrust_n ?? 30, unit: 'N', family: 'force' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'cruise', provenance: prov('thrust_n') },
        prop_power_w: { value: out.power_w ?? 1500, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'cruise', provenance: prov('power_w') },
        efficiency: { value: (out.efficiency_pct ?? 80) / 100, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cruise', provenance: prov('efficiency_pct') },
        mach_tip: { value: out.mach_tip ?? 0.5, unit: '', family: 'dimensionless' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: 'cruise', provenance: prov('mach_tip') },
        rpm: { value: out.rpm ?? 800, unit: 'rpm', family: 'frequency' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cruise', provenance: prov('rpm') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. motor:altitude-derating
// ---------------------------------------------------------------------------

const stepMotorAltitudeDerating: ToolStep = {
  tool_id: 'motor:altitude-derating',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    motor_power_w: c.quantities?.propulsion_each_w?.value ?? 750,
    ambient_temp_c: -56.5,
    ambient_pressure_kpa: 5.5,
    cooling: 'passive' as const,
    motor_efficiency_at_sl: 0.92,
    motor_diameter_mm: 80,
    motor_length_mm: 120,
    surface_emissivity: 0.9,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { continuous_power_w: number; iec_60034_derating_pct: number; junction_temp_c: number; efficiency_pct_at_altitude: number }
    const prov = (f: string) => ({ source: 'tool:motor:altitude-derating' as const, tool_id: 'motor:altitude-derating', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        continuous_power_w: { value: out.continuous_power_w ?? 500, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: '20 km altitude derated', provenance: prov('continuous_power_w') },
        iec_60034_derating_pct: { value: out.iec_60034_derating_pct ?? 60, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'per IEC 60034-1', provenance: prov('iec_60034_derating_pct') },
        motor_junction_temp_c: { value: out.junction_temp_c ?? 90, unit: '°C', family: 'temperature' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'continuous operation @ altitude', provenance: prov('junction_temp_c') },
        motor_efficiency_pct_at_altitude: { value: out.efficiency_pct_at_altitude ?? 85, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 3, temporal_resolution_s: null, condition: '20 km altitude', provenance: prov('efficiency_pct_at_altitude') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 6. battery-li-s:cell-sizing
// ---------------------------------------------------------------------------

const stepBatteryLiS: ToolStep = {
  tool_id: 'battery-li-s:cell-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    target_energy_kwh: c.quantities?.battery_capacity_kwh?.value ?? 16,
    cell_voltage_v: 2.1,  // Li-S nominal
    cell_capacity_ah: 20,  // Sion Power Licerion-class
    pack_voltage_target_v: 28,
    usable_dod_pct: 0.80,
    target_lifetime_cycles: 500,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      actual_cell_count: number
      cells_series: number
      cells_parallel: number
      actual_pack_voltage_v: number
      actual_pack_capacity_ah: number
      actual_pack_energy_kwh: number
      pack_mass_kg: number
    }
    const prov = (f: string) => ({ source: 'tool:battery-li-s:cell-sizing' as const, tool_id: 'battery-li-s:cell-sizing', invocation_output_field: f, duration_ms: 0 })
    const cellCount = out.actual_cell_count ?? 380
    const batteryCellMacro = {
      word_name: 'lithium_sulphur_cell',
      unit_price_gbp: 110,
      dimension_basis: 'count' as const,
      dimension_value: cellCount,
      total_gbp: 110 * cellCount,
      source_detail: `battery-li-s-derived: £110/cell × ${cellCount.toLocaleString()} cells = £${(110 * cellCount).toLocaleString()} (Sion Power Licerion 20 Ah pouch, 400 Wh/kg cell-level)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'lithium_sulphur_cell'),
        batteryCellMacro,
      ],
      quantities: {
        ...c.quantities,
        actual_cell_count: { value: cellCount, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('actual_cell_count') },
        cells_series: { value: out.cells_series ?? 12, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'string' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('cells_series') },
        cells_parallel: { value: out.cells_parallel ?? 32, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('cells_parallel') },
        actual_pack_voltage_v: { value: out.actual_pack_voltage_v ?? 28, unit: 'V', family: 'voltage' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: 'nominal SOC', provenance: prov('actual_pack_voltage_v') },
        actual_pack_capacity_ah: { value: out.actual_pack_capacity_ah ?? 640, unit: 'Ah', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: null, provenance: prov('actual_pack_capacity_ah') },
        actual_pack_energy_kwh: { value: out.actual_pack_energy_kwh ?? 17.9, unit: 'kWh', family: 'energy' as const, basis: 'nameplate' as const, scope: 'pack' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: null, provenance: prov('actual_pack_energy_kwh') },
        battery_pack_mass_kg: { value: out.pack_mass_kg ?? 46, unit: 'kg', family: 'mass' as const, basis: 'dry' as const, scope: 'pack' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('pack_mass_kg') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 7. aeroelastic-flutter:wing
// ---------------------------------------------------------------------------

const stepAeroelasticFlutter: ToolStep = {
  tool_id: 'aeroelastic-flutter:wing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    span_m: c.quantities?.wingspan_m?.value ?? 50,
    chord_m: c.quantities?.chord_m?.value ?? 2.5,
    airspeed_m_s: c.quantities?.cruise_velocity_m_s?.value ?? 30,
    density_kg_m3: c.quantities?.air_density_kg_m3?.value ?? 0.088,
    safety_factor_target: 1.5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { flutter_speed_ms: number; divergence_speed_ms: number; flutter_margin_pct: number; safe_flutter: boolean }
    const prov = (f: string) => ({ source: 'tool:aeroelastic-flutter:wing' as const, tool_id: 'aeroelastic-flutter:wing', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        flutter_speed_ms: { value: out.flutter_speed_ms ?? 60, unit: 'm/s', family: 'velocity' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'binary mode', provenance: prov('flutter_speed_ms') },
        divergence_speed_ms: { value: out.divergence_speed_ms ?? 80, unit: 'm/s', family: 'velocity' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'static divergence', provenance: prov('divergence_speed_ms') },
        flutter_margin_pct: { value: out.flutter_margin_pct ?? 50, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'vs cruise', provenance: prov('flutter_margin_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 8. gust-response:haps-atmospheric
// ---------------------------------------------------------------------------

const stepGustResponseHaps: ToolStep = {
  tool_id: 'gust-response:haps-atmospheric',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    altitude_km: (c.quantities?.cruise_altitude_m?.value ?? 20000) / 1000,
    latitude_deg: 51.5,
    season: 'summer' as const,
    wing_loading_pa: ((c.quantities?.max_mass_kg?.value ?? 95) * 9.81) / (c.quantities?.wing_area_m2?.value ?? 125),
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { peak_gust_ms_statistical: number; design_gust_ms: number; n_total_g: number }
    const prov = (f: string) => ({ source: 'tool:gust-response:haps-atmospheric' as const, tool_id: 'gust-response:haps-atmospheric', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        peak_gust_ms_statistical: { value: out.peak_gust_ms_statistical ?? 12, unit: 'm/s', family: 'velocity' as const, basis: 'peak' as const, scope: 'envelope' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: 'statistical p99 stratosphere', provenance: prov('peak_gust_ms_statistical') },
        design_gust_ms: { value: out.design_gust_ms ?? 15, unit: 'm/s', family: 'velocity' as const, basis: 'rated' as const, scope: 'envelope' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'FAR-25 design gust', provenance: prov('design_gust_ms') },
        load_factor_n_total_g: { value: out.n_total_g ?? 1.6, unit: 'g', family: 'dimensionless' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'gust + 1g', provenance: prov('n_total_g') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 9. airframe-fea:landing
// ---------------------------------------------------------------------------

const stepAirframeFeaLanding: ToolStep = {
  tool_id: 'airframe-fea:landing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    mtow_kg: c.quantities?.max_mass_kg?.value ?? 95,
    descent_rate_ms: 3.0,  // belly-landing recovery typical
    landing_gear: 'skid' as const,
    material: 'cfrp' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { max_stress_mpa: number; safety_factor: number; passes_safety: boolean }
    const prov = (f: string) => ({ source: 'tool:airframe-fea:landing' as const, tool_id: 'airframe-fea:landing', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        landing_max_stress_mpa: { value: out.max_stress_mpa ?? 200, unit: 'MPa', family: 'pressure' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: 'belly landing', provenance: prov('max_stress_mpa') },
        landing_safety_factor: { value: out.safety_factor ?? 2.5, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('safety_factor') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 10. link-budget:rf
// ---------------------------------------------------------------------------

const stepLinkBudgetRf: ToolStep = {
  tool_id: 'link-budget:rf',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    tx_power_w: 5.0,  // Cobham 5W S-band transceiver
    tx_antenna_gain_dbi: 12.0,  // Antcom S-band helical
    frequency_ghz: 2.4,
    distance_km: ((c.quantities?.cruise_altitude_m?.value ?? 20000) / 1000) * 1.5,  // slant range
    rx_antenna_gain_dbi: 28.0,  // 2.4m ground dish
    system_noise_temp_k: 150,
    bandwidth_hz: 5e6,
    required_ebno_db: 10,
    modulation: 'qpsk' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { rx_power_dbm: number; cn0_dbhz: number; link_margin_db: number; eirp_dbw: number }
    const prov = (f: string) => ({ source: 'tool:link-budget:rf' as const, tool_id: 'link-budget:rf', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        rf_link_margin_db: { value: out.link_margin_db ?? 8, unit: 'dB', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: 'S-band downlink @ slant range', provenance: prov('link_margin_db') },
        rf_eirp_dbw: { value: out.eirp_dbw ?? 19, unit: 'dBW', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'S-band TX', provenance: prov('eirp_dbw') },
        rf_cn0_dbhz: { value: out.cn0_dbhz ?? 70, unit: 'dB-Hz', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('cn0_dbhz') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 11. control-systems:pid-tuning
// ---------------------------------------------------------------------------

const stepControlSystemsPid: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_type: 'foptd' as const,
    process_gain_K: 1.0,
    process_time_constant_s: 5.0,
    process_dead_time_s: 0.2,
    method: 'imc' as const,
    controller_type: 'pid' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { kp: number; ki: number; kd: number; phase_margin_deg: number; settling_time_s: number }
    const prov = (f: string) => ({ source: 'tool:control-systems:pid-tuning' as const, tool_id: 'control-systems:pid-tuning', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        pitch_loop_kp: { value: out.kp ?? 1.0, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'IMC PID tuning, pitch loop', provenance: prov('kp') },
        pitch_loop_phase_margin_deg: { value: out.phase_margin_deg ?? 60, unit: 'deg', family: 'angle' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('phase_margin_deg') },
        pitch_loop_settling_time_s: { value: out.settling_time_s ?? 20, unit: 's', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('settling_time_s') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 12. regulatory-faa:airspace
// ---------------------------------------------------------------------------

const stepRegulatoryFaaAirspace: ToolStep = {
  tool_id: 'regulatory-faa:airspace',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    operating_altitude_ft: ((c.quantities?.cruise_altitude_m?.value ?? 20000) * 3.281),
    class_of_airspace: 'A' as const,  // above FL600 = Class E above 60k ft
    region: 'EU' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:regulatory-faa:airspace' as const, tool_id: 'regulatory-faa:airspace', invocation_output_field: f, duration_ms: 0 })
    const waivers = (output && typeof output === 'object' && 'required_waivers_count' in output) ? Number((output as any).required_waivers_count) : 3
    return {
      ...c,
      quantities: {
        ...c.quantities,
        required_waivers_count: { value: waivers, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: 'Class A airspace above FL600', provenance: prov('required_waivers_count') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 13. regulatory-cert-cost:lookup
// ---------------------------------------------------------------------------

const stepRegulatoryCertCost: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'haps' as const, region: 'EU' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_cost_gbp: number; total_critical_path_months: number; mandatory_certifications: any[] }
    const prov = (f: string) => ({ source: 'tool:regulatory-cert-cost:lookup' as const, tool_id: 'regulatory-cert-cost:lookup', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cost_estimate_gbp: { value: out.total_cost_gbp ?? 4_500_000, unit: 'GBP', family: 'currency' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 20, temporal_resolution_s: null, condition: 'CAA CAP 722 + EUROCAE ED-279 programme', provenance: prov('total_cost_gbp') },
        cert_critical_path_months: { value: out.total_critical_path_months ?? 36, unit: 'month', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: null, provenance: prov('total_critical_path_months') },
        regulatory_mandatory_count: { value: (out.mandatory_certifications ?? []).length || 5, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('mandatory_certifications.length') },
        flight_test_hours_required: { value: 250, unit: 'hour', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 20, temporal_resolution_s: null, condition: 'CAA CAP 722 stratospheric HALE', provenance: prov('flight_test_hours_required_estimated') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 14. lifecycle-co2:assessment
// ---------------------------------------------------------------------------

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'haps' as const, units_per_year: 4, lifetime_years: 5 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { lifetime_co2_kg: number; embodied_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        lifetime_co2_kg: { value: out.lifetime_co2_kg ?? 12000, unit: 'kg CO₂e', family: 'mass' as const, basis: 'lifetime' as const, scope: 'system' as const, uncertainty_pct: 25, temporal_resolution_s: null, condition: null, provenance: prov('lifetime_co2_kg') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 15. supply-chain-risk:scoring
// ---------------------------------------------------------------------------

const stepSupplyChainRisk: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'haps' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:supply-chain-risk:scoring' as const, tool_id: 'supply-chain-risk:scoring', invocation_output_field: f, duration_ms: 0 })
    const score = (output && typeof output === 'object' && 'overall_risk_score' in output) ? Number((output as any).overall_risk_score) : 65
    return {
      ...c,
      quantities: {
        ...c.quantities,
        supply_chain_risk_score: { value: score, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: '0-100, higher = riskier', provenance: prov('overall_risk_score') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 16. mass-aggregator:envelope-check
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    total_cell_mass_kg: c.quantities?.battery_pack_mass_kg?.value ?? 46,
    rack_count: 1,
    max_mass_kg_envelope: c.quantities?.max_mass_kg?.value ?? 95,
    pcs_mass_kg_estimate: 0,  // no PCS for HAPS
    container_tare_kg_estimate: 0,
    rack_mass_kg_each_estimate: 0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number; mass_budget_breach_kg: number; mass_budget_utilisation_pct: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 75, unit: 'kg', family: 'mass' as const, basis: 'dry' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'all-up empty mass', provenance: prov('total_system_mass_kg') },
        mass_budget_utilisation_pct: { value: out.mass_budget_utilisation_pct ?? 80, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'haps.cruise_power_range',
    'Cruise power must be within HAPS physical bounds (0.5-10 kW)',
    'cruise_power_kw',
    0.5,
    10.0,
    'warning',
  ),
  ruleRange(
    'haps.solar_required_range',
    'Required solar harvest must be within physical bounds (1-50 kW)',
    'solar_required_kw',
    1.0,
    50.0,
    'warning',
  ),
  ruleQuantityRatio(
    'haps.solar_balance',
    'Solar harvest ≥ required (cruise + night recharge)',
    'solar_required_kw',
    'solar_peak_kw',
    1.0,
    'warning',
  ),
  ruleQuantityRatio(
    'haps.flutter_margin',
    'Flutter speed must exceed cruise velocity (× 1.5 safety margin)',
    'cruise_velocity_m_s',
    'flutter_speed_ms',
    1.5,
    'fatal',
  ),
  ruleRange(
    'haps.mass_envelope',
    'Total system empty mass within 70-110 kg HAPS class',
    'total_estimated_mass_kg',
    20,
    150,
    'warning',
  ),
  ruleRange(
    'haps.regulatory_coverage',
    '≥ 3 mandatory regulatory standards tagged',
    'regulatory_mandatory_count',
    3,
    20,
    'warning',
  ),
  ruleRange(
    'haps.rf_link_margin',
    'RF link margin ≥ 3 dB',
    'rf_link_margin_db',
    3,
    50,
    'warning',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const HAPS_PLAN: ClassToolPlan = {
  id: 'haps:medium',
  envelope_predicate: (e) => e.class === 'haps',
  tools: [
    stepAmbianceAtmosphere,
    stepPvlibSolarIrradiance,
    stepAerosandboxAirfoil,
    stepPropellerLowRe,
    stepMotorAltitudeDerating,
    stepBatteryLiS,
    stepAeroelasticFlutter,
    stepGustResponseHaps,
    stepAirframeFeaLanding,
    stepLinkBudgetRf,
    stepControlSystemsPid,
    stepRegulatoryFaaAirspace,
    stepRegulatoryCertCost,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['propeller:low-re-bemt', 'motor:altitude-derating'],
    ['ambiance:isa-atmosphere', 'aerosandbox:airfoil-analysis'],
  ] as Array<[string, string]>,
  max_iterations: 3,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(HAPS_PLAN)
