/**
 * scripts/lib/orchestrator/class-plans/evtol.ts
 *
 * eVTOL TOOL PLAN — Build #20a hand-tuned (2026-05-22).
 *
 * Tools (18):
 *   1. aerosandbox:airfoil-analysis   — wing + rotor airfoil polars
 *   2. ambiance:isa-atmosphere        — sea-level → cruise density profile
 *   3. pybamm:cell-sizing             — Li-ion high-power cell topology
 *   4. ngspice:pcs-simulation         — SiC inverter efficiency + losses
 *   5. bemt-propeller:thrust          — tilt-rotor disk loading + thrust
 *   6. motor-prop:matching            — motor/prop matching
 *   7. control-systems:pid-tuning     — flight control loops (yaw/pitch/roll/heave)
 *   8. rotor-tilt-transition:dynamics — VTOL → cruise transition corridor
 *   9. downwash-recirculation:multirotor — ground-effect + recirculation loss
 *  10. pilot-workload:cooper-harper   — Cooper-Harper handling rating
 *  11. bvlos-part23:certification     — Part 23 / SC-VTOL cert basis
 *  12. link-budget:rf                 — ATC + cellular comms link
 *  13. radiator:spacecraft-sizing     — battery cooling radiator (proxy)
 *  14. thermal-envelope:ladder        — motor inverter junction temp
 *  15. gust-response:drone           — gust load envelope (multirotor)
 *  16. regulatory-cert-cost:lookup    — overall cert cost summary
 *  17. lifecycle-co2:assessment       — programme LCA
 *  18. mass-aggregator:envelope-check — empty mass + MTOW closure
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// 1. aerosandbox:airfoil-analysis
// ---------------------------------------------------------------------------

const stepAerosandboxAirfoil: ToolStep = {
  tool_id: 'aerosandbox:airfoil-analysis',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    airfoil_name: 'NACA4412',
    alpha_deg: 4.0,
    reynolds: 2_000_000,
    mach: (c.quantities?.cruise_speed_km_h?.value ?? 250) / 3.6 / 340,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { CL: number; CD: number; L_over_D: number }
    const prov = (f: string) => ({ source: 'tool:aerosandbox:airfoil-analysis' as const, tool_id: 'aerosandbox:airfoil-analysis', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        wing_l_over_d: { value: out.L_over_D ?? 15, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cruise', provenance: prov('L_over_D') },
        wing_lift_coefficient_cl: { value: out.CL ?? 0.6, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cruise α=4°', provenance: prov('CL') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. ambiance:isa-atmosphere
// ---------------------------------------------------------------------------

const stepAmbiance: ToolStep = {
  tool_id: 'ambiance:isa-atmosphere',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ altitude_m: 500 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { density_kg_m3: number }
    const prov = (f: string) => ({ source: 'tool:ambiance:isa-atmosphere' as const, tool_id: 'ambiance:isa-atmosphere', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        air_density_kg_m3: { value: out.density_kg_m3 ?? 1.167, unit: 'kg/m³', family: 'density' as const, basis: 'rated' as const, scope: 'envelope' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: 'ISA @ 500 m', provenance: prov('density_kg_m3') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. pybamm:cell-sizing
// ---------------------------------------------------------------------------

const stepPybamm: ToolStep = {
  tool_id: 'pybamm:cell-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    target_energy_kwh: c.quantities?.battery_kwh?.value ?? 400,
    dod_fraction: 0.80,
    cell_chemistry: 'nmc' as const,
    cell_capacity_ah: 5.0,
    cell_voltage_v: 3.7,
    ambient_temp_c: 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cell_count: number; nameplate_capacity_kwh: number }
    const prov = (f: string) => ({ source: 'tool:pybamm:cell-sizing' as const, tool_id: 'pybamm:cell-sizing', invocation_output_field: f, duration_ms: 0 })
    const cellCount = out.cell_count ?? 21600
    const packMassKg = (c.quantities?.battery_kwh?.value ?? 400) * 4
    const batteryPackMacro = {
      word_name: 'lithium_high_power_cell',
      unit_price_gbp: 9,
      dimension_basis: 'count' as const,
      dimension_value: cellCount,
      total_gbp: 9 * cellCount,
      source_detail: `pybamm-derived: £9/cell × ${cellCount.toLocaleString()} cells = £${(9 * cellCount).toLocaleString()} (Molicel P50B / EnerSys ELiTE 21700 high-power, 5 Ah, 3.7 V)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'lithium_high_power_cell'),
        batteryPackMacro,
      ],
      quantities: {
        ...c.quantities,
        cell_count: { value: cellCount, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('cell_count') },
        nameplate_capacity_kwh: { value: out.nameplate_capacity_kwh ?? 400, unit: 'kWh', family: 'energy' as const, basis: 'nameplate' as const, scope: 'pack' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: null, provenance: prov('nameplate_capacity_kwh') },
        battery_pack_mass_kg: { value: packMassKg, unit: 'kg', family: 'mass' as const, basis: 'dry' as const, scope: 'pack' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'pack-level 250 Wh/kg', provenance: prov('pack_mass_derived') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. ngspice:pcs-simulation
// ---------------------------------------------------------------------------

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: (c.quantities?.hover_power_kw?.value ?? 200) * 1.0,
    dc_bus_voltage_v: 800,
    ac_output_voltage_v: 400,
    topology: 'sic_two_level' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { inverter_efficiency_pct: number; dissipated_power_kw: number }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        inverter_efficiency_pct: { value: out.inverter_efficiency_pct ?? 98.5, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 1, temporal_resolution_s: null, condition: 'SiC two-level @ hover', provenance: prov('inverter_efficiency_pct') },
        inverter_dissipated_kw: { value: out.dissipated_power_kw ?? 5, unit: 'kW', family: 'power' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'hover', provenance: prov('dissipated_power_kw') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. bemt-propeller:thrust
// ---------------------------------------------------------------------------

const stepBemtPropeller: ToolStep = {
  tool_id: 'bemt-propeller:thrust',
  required: false,
  feeds_into: ['motor-prop:matching'] as string[],
  input_from_contract: () => ({
    diameter_inch: 98,
    pitch_inch: 40,
    rpm: 1500,
    airspeed_m_s: 0,
    air_density_kg_m3: 1.167,
    num_blades: 5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { thrust_n: number; power_w: number; efficiency: number }
    const prov = (f: string) => ({ source: 'tool:bemt-propeller:thrust' as const, tool_id: 'bemt-propeller:thrust', invocation_output_field: f, duration_ms: 0 })
    const numRotors = c.quantities?.num_rotors?.value ?? 6
    const rotorMacro = {
      word_name: 'tilt_rotor_blade',
      unit_price_gbp: 12000,
      dimension_basis: 'each' as const,
      dimension_value: numRotors * 5,
      total_gbp: 12000 * numRotors * 5,
      source_detail: `bemt-derived: £12000/blade × ${numRotors * 5} blades (Joby Aviation 5-blade CFRP tilt-prop)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'tilt_rotor_blade'),
        rotorMacro,
      ],
      quantities: {
        ...c.quantities,
        rotor_thrust_n: { value: out.thrust_n ?? 5000, unit: 'N', family: 'force' as const, basis: 'peak' as const, scope: 'module' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'VTOL hover', provenance: prov('thrust_n') },
        rotor_power_w: { value: out.power_w ?? 40000, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'hover', provenance: prov('power_w') },
        rotor_efficiency: { value: out.efficiency ?? 0.78, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'hover', provenance: prov('efficiency') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 6. motor-prop:matching
// ---------------------------------------------------------------------------

const stepMotorPropMatch: ToolStep = {
  tool_id: 'motor-prop:matching',
  required: false,
  feeds_into: [] as string[],
  // 2026-05-22 smoke-fix #7c (evtol): the motor_prop_match.py wrapper applies
  // BEMT to no-load RPM (motor_kv × battery_voltage). At Kv=8, V=800 we got
  // 6400 rpm no-load × 2.49 m prop → 56 kN per motor → T/W ≈ 14. Real eVTOL
  // direct-drive motors have Kv 3-5 (Joby S4 inner rotor is ~3 Kv at 800V
  // → 2400 rpm). Drop to Kv=4 → 3200 rpm → 14 kN per motor → T/W ≈ 3.5,
  // realistic for hover-capable eVTOL with 30% margin.
  input_from_contract: (c: any) => ({
    motor_kv: 4,
    battery_voltage: 800,
    prop_diameter_inch: 98,
    prop_pitch_inch: 40,
    num_motors: c.quantities?.num_rotors?.value ?? 6,
    // 2026-05-22 smoke-fix #7 (evtol): motor_prop_match.py treats payload_kg
    // as TOTAL aircraft weight for T/W calc. Pass MTOW, not the passenger
    // cargo payload. Previously sent 350 kg → T/W ≈ 10203 (max_thrust well
    // above 350 kg weight); now sends 2500 kg MTOW giving a realistic ratio.
    payload_kg: c.quantities?.gross_takeoff_mass_kg?.value ?? 2500,
    drone_mtow_kg: c.quantities?.gross_takeoff_mass_kg?.value ?? 2500,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { hover_power_per_motor_w: number; thrust_to_weight_ratio: number }
    const prov = (f: string) => ({ source: 'tool:motor-prop:matching' as const, tool_id: 'motor-prop:matching', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        motor_continuous_kw: { value: (out.hover_power_per_motor_w ?? 200000) / 1000, unit: 'kW', family: 'power' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'hover', provenance: prov('hover_power_per_motor_w') },
        thrust_to_weight_ratio: { value: out.thrust_to_weight_ratio ?? 1.5, unit: '', family: 'dimensionless' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'all rotors full power', provenance: prov('thrust_to_weight_ratio') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 7. control-systems:pid-tuning
// ---------------------------------------------------------------------------

const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_type: 'foptd' as const,
    process_gain_K: 1.0,
    process_time_constant_s: 0.3,
    process_dead_time_s: 0.03,
    method: 'imc' as const,
    controller_type: 'pid' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { phase_margin_deg: number; settling_time_s: number }
    const prov = (f: string) => ({ source: 'tool:control-systems:pid-tuning' as const, tool_id: 'control-systems:pid-tuning', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        fbw_phase_margin_deg: { value: out.phase_margin_deg ?? 55, unit: 'deg', family: 'angle' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'pitch loop', provenance: prov('phase_margin_deg') },
        fbw_settling_time_s: { value: out.settling_time_s ?? 1.5, unit: 's', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'pitch loop', provenance: prov('settling_time_s') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 8. rotor-tilt-transition:dynamics
// ---------------------------------------------------------------------------

const stepRotorTiltTransition: ToolStep = {
  tool_id: 'rotor-tilt-transition:dynamics',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    mtow_kg: c.quantities?.gross_takeoff_mass_kg?.value ?? 2500,
    forward_speed_ms: 25,
    tilt_angle_deg: 45,
    wing_area_m2: 18,
    num_rotors: c.quantities?.num_rotors?.value ?? 6,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { lift_force_n: number; thrust_required_n: number; transition_corridor_stall_speed_ms: number }
    const prov = (f: string) => ({ source: 'tool:rotor-tilt-transition:dynamics' as const, tool_id: 'rotor-tilt-transition:dynamics', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        lift_force_n: { value: out.lift_force_n ?? 24500, unit: 'N', family: 'force' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'transition corridor', provenance: prov('lift_force_n') },
        thrust_required_transition_n: { value: out.thrust_required_n ?? 25000, unit: 'N', family: 'force' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: '45° tilt', provenance: prov('thrust_required_n') },
        transition_stall_speed_ms: { value: out.transition_corridor_stall_speed_ms ?? 32, unit: 'm/s', family: 'velocity' as const, basis: 'min' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: '1g wing-borne', provenance: prov('transition_corridor_stall_speed_ms') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 9. downwash-recirculation:multirotor
// ---------------------------------------------------------------------------

const stepDownwashRecirc: ToolStep = {
  tool_id: 'downwash-recirculation:multirotor',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    mtow_kg: c.quantities?.gross_takeoff_mass_kg?.value ?? 2500,
    num_rotors: c.quantities?.num_rotors?.value ?? 6,
    rotor_diameter_m: 2.5,
    rotor_spacing_d: 1.5,
    altitude_agl_m: 2.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { power_loss_pct: number; induced_velocity_ms: number }
    const prov = (f: string) => ({ source: 'tool:downwash-recirculation:multirotor' as const, tool_id: 'downwash-recirculation:multirotor', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        power_loss_pct: { value: out.power_loss_pct ?? 12, unit: '%', family: 'dimensionless' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: 'downwash recirculation IGE', provenance: prov('power_loss_pct') },
        induced_velocity_ms: { value: out.induced_velocity_ms ?? 15, unit: 'm/s', family: 'velocity' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'downwash', provenance: prov('induced_velocity_ms') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 10. pilot-workload:cooper-harper
// ---------------------------------------------------------------------------

const stepPilotWorkload: ToolStep = {
  tool_id: 'pilot-workload:cooper-harper',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    aircraft_type: 'evtol' as const,
    response_bandwidth_rad_s: 4.0,
    control_force_n: 22,
    autonomy_level: 'semi_autonomous' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cooper_harper_rating: number }
    const prov = (f: string) => ({ source: 'tool:pilot-workload:cooper-harper' as const, tool_id: 'pilot-workload:cooper-harper', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cooper_harper_rating: { value: out.cooper_harper_rating ?? 4, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: 'Cooper-Harper handling rating', provenance: prov('cooper_harper_rating') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 11. bvlos-part23:certification
// ---------------------------------------------------------------------------

const stepBvlosCert: ToolStep = {
  tool_id: 'bvlos-part23:certification',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    design_mass_kg: c.quantities?.gross_takeoff_mass_kg?.value ?? 2500,
    num_passengers: c.quantities?.num_passengers?.value ?? 4,
    autonomy_level: 'pilot_aboard' as const,
    operations: 'commercial_passenger' as const,
    region: 'EU' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cost_estimate_gbp_m: number; timeline_years: number; flight_test_hours_required: number }
    const prov = (f: string) => ({ source: 'tool:bvlos-part23:certification' as const, tool_id: 'bvlos-part23:certification', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cost_estimate_gbp_m: { value: out.cost_estimate_gbp_m ?? 250, unit: 'GBP_M', family: 'currency' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 30, temporal_resolution_s: null, condition: 'Part 23 / SC-VTOL DAL-A', provenance: prov('cost_estimate_gbp_m') },
        cert_timeline_years: { value: out.timeline_years ?? 5, unit: 'year', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 20, temporal_resolution_s: null, condition: null, provenance: prov('timeline_years') },
        flight_test_hours_required: { value: out.flight_test_hours_required ?? 1500, unit: 'hour', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: null, provenance: prov('flight_test_hours_required') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 12. link-budget:rf
// ---------------------------------------------------------------------------

const stepLinkBudgetRf: ToolStep = {
  tool_id: 'link-budget:rf',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    tx_power_w: 25,
    tx_antenna_gain_dbi: 3,
    frequency_ghz: 0.13,
    distance_km: 50,
    rx_antenna_gain_dbi: 6,
    system_noise_temp_k: 250,
    bandwidth_hz: 25e3,
    required_ebno_db: 10,
    modulation: 'qpsk' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { link_margin_db: number }
    const prov = (f: string) => ({ source: 'tool:link-budget:rf' as const, tool_id: 'link-budget:rf', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        rf_link_margin_db: { value: out.link_margin_db ?? 15, unit: 'dB', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: 'VHF ATC primary', provenance: prov('link_margin_db') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 13. radiator:spacecraft-sizing (used as proxy)
// ---------------------------------------------------------------------------

const stepRadiatorSizing: ToolStep = {
  tool_id: 'radiator:spacecraft-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const inverterDissKw = c.quantities?.inverter_dissipated_kw?.value ?? 5
    const cellDissipationKw = 8
    const totalQw = (inverterDissKw + cellDissipationKw) * 1000 * 1.5
    return {
      dissipation_w: totalQw,
      sink_temp_k: 288,
      radiator_temp_k: 333,
      view_factor_to_space: 0.0,
      surface_alpha: 0.3,
      surface_epsilon: 0.9,
      solar_incidence_factor: 0.0,
      safety_margin_pct: 25,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { radiator_area_m2: number; radiator_mass_kg: number }
    const prov = (f: string) => ({ source: 'tool:radiator:spacecraft-sizing' as const, tool_id: 'radiator:spacecraft-sizing', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        radiator_area_m2: { value: out.radiator_area_m2 ?? 4.0, unit: 'm²', family: 'area' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: 'aircraft radiator (battery + inverter thermal)', provenance: prov('radiator_area_m2') },
        radiator_mass_kg: { value: out.radiator_mass_kg ?? 30, unit: 'kg', family: 'mass' as const, basis: 'dry' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: null, provenance: prov('radiator_mass_kg') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 14. thermal-envelope:ladder
// ---------------------------------------------------------------------------

const stepThermalEnvelope: ToolStep = {
  tool_id: 'thermal-envelope:ladder',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    tdp_w: 5000,
    ambient_c: 40,
    enclosure: 'flowed_air' as const,
    heatsink_type: 'pin_fin_cold_plate' as const,
    max_junction_temp_c: 150,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { junction_temp_c: number }
    const prov = (f: string) => ({ source: 'tool:thermal-envelope:ladder' as const, tool_id: 'thermal-envelope:ladder', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        inverter_junction_temp_c: { value: out.junction_temp_c ?? 110, unit: '°C', family: 'temperature' as const, basis: 'peak' as const, scope: 'module' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'SiC IGBT junction @ hover', provenance: prov('junction_temp_c') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 15. gust-response:drone (cruise wing-borne)
// ---------------------------------------------------------------------------

const stepGustResponse: ToolStep = {
  tool_id: 'gust-response:drone',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    drone_mass_kg: c.quantities?.gross_takeoff_mass_kg?.value ?? 2500,
    wing_area_m2: 18,
    airspeed_m_s: (c.quantities?.cruise_speed_km_h?.value ?? 250) / 3.6,
    gust_speed_m_s: 15,
    is_multirotor: false,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { n_total_g: number }
    const prov = (f: string) => ({ source: 'tool:gust-response:drone' as const, tool_id: 'gust-response:drone', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        load_factor_n_total_g: { value: out.n_total_g ?? 2.5, unit: 'g', family: 'dimensionless' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'cruise gust', provenance: prov('n_total_g') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 16. regulatory-cert-cost:lookup
// ---------------------------------------------------------------------------

const stepRegulatoryCertCost: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'evtol' as const, region: 'EU' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { mandatory_certifications: any[] }
    const prov = (f: string) => ({ source: 'tool:regulatory-cert-cost:lookup' as const, tool_id: 'regulatory-cert-cost:lookup', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        regulatory_mandatory_count: { value: (out.mandatory_certifications ?? []).length || 6, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: 'Part 23 / SC-VTOL + DO-178C + DO-254 + AS 9100 + ARP 4761', provenance: prov('mandatory_certifications.length') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 17. lifecycle-co2:assessment
// ---------------------------------------------------------------------------

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'evtol' as const, units_per_year: 100, lifetime_years: 10 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { lifetime_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        lifetime_co2_kg: { value: out.lifetime_co2_kg ?? 80000, unit: 'kg CO₂e', family: 'mass' as const, basis: 'lifetime' as const, scope: 'system' as const, uncertainty_pct: 25, temporal_resolution_s: null, condition: null, provenance: prov('lifetime_co2_kg') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 18. mass-aggregator:envelope-check
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    total_cell_mass_kg: c.quantities?.battery_pack_mass_kg?.value ?? 1600,
    rack_count: 8,
    max_mass_kg_envelope: c.quantities?.gross_takeoff_mass_kg?.value ?? 2500,
    pcs_mass_kg_estimate: 50,
    container_tare_kg_estimate: 0,
    rack_mass_kg_each_estimate: 5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number; mass_budget_utilisation_pct: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 2300, unit: 'kg', family: 'mass' as const, basis: 'empty' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'empty', provenance: prov('total_system_mass_kg') },
        mass_budget_utilisation_pct: { value: out.mass_budget_utilisation_pct ?? 92, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'evtol.cruise_range_min',
    'Cruise range ≥ 50 km commercial viability',
    'cruise_range_km',
    50,
    1000,
    'warning',
  ),
  ruleRange(
    'evtol.thrust_to_weight',
    'Thrust-to-weight ratio ≥ 1.2 for VTOL + manoeuvre',
    'thrust_to_weight_ratio',
    1.2,
    5,
    'fatal',
  ),
  ruleRange(
    'evtol.cooper_harper',
    'Cooper-Harper rating ≤ 4 (satisfactory)',
    'cooper_harper_rating',
    1,
    4,
    'warning',
  ),
  ruleRange(
    'evtol.inverter_efficiency',
    'Inverter efficiency ≥ 97%',
    'inverter_efficiency_pct',
    97,
    100,
    'warning',
  ),
  ruleQuantityRatio(
    'evtol.thermal_balance',
    'Radiator area sized for inverter+battery dissipation',
    'inverter_dissipated_kw',
    'radiator_area_m2',
    1.0,
    'info',
  ),
  ruleRange(
    'evtol.regulatory_coverage',
    '≥ 5 mandatory regulatory standards tagged',
    'regulatory_mandatory_count',
    5,
    20,
    'warning',
  ),
  ruleRange(
    'evtol.mass_envelope',
    'MTOW within 1000-4000 kg eVTOL class',
    'gross_takeoff_mass_kg',
    1000,
    4000,
    'warning',
  ),
]

export const EVTOL_PLAN: ClassToolPlan = {
  id: 'evtol:passenger',
  envelope_predicate: (e) => e.class === 'evtol',
  tools: [
    stepAmbiance,
    stepAerosandboxAirfoil,
    stepBemtPropeller,
    stepMotorPropMatch,
    stepPybamm,
    stepNgspice,
    stepControlSystems,
    stepRotorTiltTransition,
    stepDownwashRecirc,
    stepPilotWorkload,
    stepBvlosCert,
    stepLinkBudgetRf,
    stepRadiatorSizing,
    stepThermalEnvelope,
    stepGustResponse,
    stepRegulatoryCertCost,
    stepLifecycleCo2,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['bemt-propeller:thrust', 'motor-prop:matching'],
    ['pybamm:cell-sizing', 'ngspice:pcs-simulation'],
    ['rotor-tilt-transition:dynamics', 'downwash-recirculation:multirotor'],
  ] as Array<[string, string]>,
  max_iterations: 3,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(EVTOL_PLAN)
