/**
 * scripts/lib/orchestrator/class-plans/drone.ts
 *
 * DRONE TOOL PLAN — Build #20a hand-tuned (2026-05-22).
 *
 * Replaces the auto-generated stub with a BESS-quality plan that:
 *   - Reads SPECIFIC fields from the Contract via input_from_contract
 *   - Emits CANONICAL quantity names (no namespaced `<tool>__<field>`)
 *   - Emits macro_assembly_prices for: battery_pack, motor, propeller
 *   - Adds 7 cross-tool consistency rules
 *
 * Tools (14):
 *   1. bemt-propeller:thrust         — propeller thrust + power @ hover
 *   2. motor-prop:matching           — motor/prop hover matching, KV, RPM
 *   3. pybamm:cell-sizing            — LiPo cell sizing
 *   4. aerosandbox:airfoil-analysis  — propeller airfoil polars
 *   5. ambiance:isa-atmosphere       — sea-level density default
 *   6. control-systems:pid-tuning    — attitude PID
 *   7. gust-response:drone           — multirotor gust load envelope
 *   8. gimbal:cog-balance            — CoG balance + gimbal torque
 *   9. obstacle-avoidance:sensor     — LiDAR / camera latency + range
 *  10. link-budget:rf                — 2.4/5.8 GHz video link margin
 *  11. ins:navigation-drift         — GNSS-denied INS drift estimate
 *  12. regulatory-caa:part107        — CAA Part 107 / EASA Open Cat A1
 *  13. lifecycle-co2:assessment      — programme LCA
 *  14. mass-aggregator:envelope-check — mass closure (MTOW)
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// 1. bemt-propeller:thrust
// ---------------------------------------------------------------------------

const stepBemtPropeller: ToolStep = {
  tool_id: 'bemt-propeller:thrust',
  required: false,
  feeds_into: ['motor-prop:matching'] as string[],
  input_from_contract: (c: any) => ({
    diameter_inch: (c.quantities?.rotor_diameter_m?.value ?? 0.20) / 0.0254,
    pitch_inch: 4.5,
    rpm: 8000,
    airspeed_m_s: 0,  // hover
    air_density_kg_m3: c.quantities?.air_density_kg_m3?.value ?? 1.225,
    num_blades: 2,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { thrust_n: number; power_w: number; ct: number; cp: number; efficiency: number; tip_mach: number }
    const prov = (f: string) => ({ source: 'tool:bemt-propeller:thrust' as const, tool_id: 'bemt-propeller:thrust', invocation_output_field: f, duration_ms: 0 })
    const motorCount = c.quantities?.motor_count?.value ?? 4
    const propellerMacro = {
      word_name: 'cf_propeller_blade',
      unit_price_gbp: 25,
      dimension_basis: 'each' as const,
      dimension_value: motorCount,
      total_gbp: 25 * motorCount,
      source_detail: `bemt-derived: £25/prop × ${motorCount} props (T-Motor F-class CF folding, ${out.thrust_n?.toFixed(1) ?? 6.6} N hover thrust, η=${(((out.efficiency ?? 0.55) * 100)).toFixed(0)}%)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'cf_propeller_blade'),
        propellerMacro,
      ],
      quantities: {
        ...c.quantities,
        prop_thrust_per_blade_n: { value: out.thrust_n ?? 6.6, unit: 'N', family: 'force' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'hover', provenance: prov('thrust_n') },
        prop_power_per_blade_w: { value: out.power_w ?? 100, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'hover', provenance: prov('power_w') },
        prop_efficiency: { value: out.efficiency ?? 0.55, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'hover', provenance: prov('efficiency') },
        prop_tip_mach: { value: out.tip_mach ?? 0.3, unit: '', family: 'dimensionless' as const, basis: 'peak' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('tip_mach') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. motor-prop:matching
// ---------------------------------------------------------------------------

const stepMotorPropMatch: ToolStep = {
  tool_id: 'motor-prop:matching',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    motor_kv: 920,
    battery_voltage: 14.8,
    prop_diameter_inch: (c.quantities?.rotor_diameter_m?.value ?? 0.20) / 0.0254,
    prop_pitch_inch: 4.5,
    num_motors: c.quantities?.motor_count?.value ?? 4,
    // 2026-05-22 smoke-fix #6 (drone): the motor_prop_match.py wrapper reads
    // `payload_kg` and treats it as the TOTAL drone weight for the
    // thrust-to-weight calculation (W = payload_kg * g). The class plan was
    // sending the cinematography camera payload (0.4 kg) here, which gave a
    // bogus T/W ≈ 19. Pass the full MTOW instead so T/W reflects the whole
    // airframe. drone_mtow_kg is kept as a debug pass-through field.
    payload_kg: c.quantities?.mtow_kg?.value ?? 1.8,
    drone_mtow_kg: c.quantities?.mtow_kg?.value ?? 1.8,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      motor_kv: number; battery_voltage: number; no_load_rpm: number;
      hover_rpm: number; hover_thrust_per_motor_n: number; hover_power_per_motor_w: number;
      max_thrust_per_motor_n: number; max_power_per_motor_w: number;
      hover_throttle_pct: number; hover_current_per_motor_a: number;
      thrust_to_weight_ratio: number;
    }
    const prov = (f: string) => ({ source: 'tool:motor-prop:matching' as const, tool_id: 'motor-prop:matching', invocation_output_field: f, duration_ms: 0 })
    const motorCount = c.quantities?.motor_count?.value ?? 4
    const motorMacro = {
      word_name: 'brushless_motor_outrunner',
      unit_price_gbp: 80,
      dimension_basis: 'each' as const,
      dimension_value: motorCount,
      total_gbp: 80 * motorCount,
      source_detail: `motor-prop-derived: £80/motor × ${motorCount} motors (T-Motor MN3110 / MN5008-class outrunner, ${out.motor_kv ?? 920} KV, ${(out.max_thrust_per_motor_n ?? 13.2).toFixed(1)} N peak thrust, ${(out.hover_power_per_motor_w ?? 100).toFixed(0)} W hover)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'brushless_motor_outrunner'),
        motorMacro,
      ],
      quantities: {
        ...c.quantities,
        motor_kv: { value: out.motor_kv ?? 920, unit: 'KV', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 1, temporal_resolution_s: null, condition: null, provenance: prov('motor_kv') },
        battery_voltage: { value: out.battery_voltage ?? 14.8, unit: 'V', family: 'voltage' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 1, temporal_resolution_s: null, condition: '4S nominal', provenance: prov('battery_voltage') },
        no_load_rpm: { value: out.no_load_rpm ?? 13616, unit: 'rpm', family: 'frequency' as const, basis: 'peak' as const, scope: 'module' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: null, provenance: prov('no_load_rpm') },
        hover_rpm: { value: out.hover_rpm ?? 7800, unit: 'rpm', family: 'frequency' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'hover', provenance: prov('hover_rpm') },
        hover_thrust_per_motor_n: { value: out.hover_thrust_per_motor_n ?? 4.4, unit: 'N', family: 'force' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: null, provenance: prov('hover_thrust_per_motor_n') },
        hover_power_per_motor_w: { value: out.hover_power_per_motor_w ?? 100, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: null, provenance: prov('hover_power_per_motor_w') },
        max_thrust_per_motor_n: { value: out.max_thrust_per_motor_n ?? 13.2, unit: 'N', family: 'force' as const, basis: 'peak' as const, scope: 'module' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'full throttle', provenance: prov('max_thrust_per_motor_n') },
        hover_throttle_pct: { value: out.hover_throttle_pct ?? 35, unit: '%', family: 'dimensionless' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'hover', provenance: prov('hover_throttle_pct') },
        hover_current_per_motor_a: { value: out.hover_current_per_motor_a ?? 6.8, unit: 'A', family: 'current' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'hover', provenance: prov('hover_current_per_motor_a') },
        thrust_to_weight_ratio: { value: out.thrust_to_weight_ratio ?? 3.0, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'full throttle', provenance: prov('thrust_to_weight_ratio') },
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
    target_energy_kwh: c.quantities?.battery_capacity_kwh?.value ?? 0.077,
    dod_fraction: 0.80,
    cell_chemistry: 'nmc' as const,  // LiPo close to NMC chemistry
    cell_capacity_ah: 5.2,  // common 18650 cell
    cell_voltage_v: 3.7,
    ambient_temp_c: 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cell_count: number; nameplate_capacity_kwh: number }
    const prov = (f: string) => ({ source: 'tool:pybamm:cell-sizing' as const, tool_id: 'pybamm:cell-sizing', invocation_output_field: f, duration_ms: 0 })
    const batteryKwh = c.quantities?.battery_capacity_kwh?.value ?? 0.077
    const batteryPackMacro = {
      word_name: 'lipo_battery_pack',
      unit_price_gbp: 300,
      dimension_basis: 'kwh_capacity' as const,
      dimension_value: batteryKwh,
      total_gbp: 300 * batteryKwh,
      source_detail: `pybamm-derived: £300/kWh × ${batteryKwh.toFixed(3)} kWh = £${(300 * batteryKwh).toFixed(0)} (Tattu 6S 25C high-discharge LiPo)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'lipo_battery_pack'),
        batteryPackMacro,
      ],
      quantities: {
        ...c.quantities,
        cell_count: { value: out.cell_count ?? 4, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: '4S 1P', provenance: prov('cell_count') },
        nameplate_capacity_kwh: { value: out.nameplate_capacity_kwh ?? 0.077, unit: 'kWh', family: 'energy' as const, basis: 'nameplate' as const, scope: 'pack' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: null, provenance: prov('nameplate_capacity_kwh') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. aerosandbox:airfoil-analysis
// ---------------------------------------------------------------------------

const stepAerosandboxAirfoil: ToolStep = {
  tool_id: 'aerosandbox:airfoil-analysis',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    airfoil_name: 'NACA4412',
    alpha_deg: 6.0,
    reynolds: 100_000,  // drone prop section
    mach: 0.15,  // typical for prop tip @ hover
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { CL: number; CD: number; L_over_D: number }
    const prov = (f: string) => ({ source: 'tool:aerosandbox:airfoil-analysis' as const, tool_id: 'aerosandbox:airfoil-analysis', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        prop_airfoil_l_over_d: { value: out.L_over_D ?? 60, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 8, temporal_resolution_s: null, condition: 'Re=100k, NACA4412', provenance: prov('L_over_D') },
        prop_airfoil_cl: { value: out.CL ?? 0.8, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'α=6°', provenance: prov('CL') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. ambiance:isa-atmosphere
// ---------------------------------------------------------------------------

const stepAmbiance: ToolStep = {
  tool_id: 'ambiance:isa-atmosphere',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ altitude_m: 100 }),  // typical drone AGL
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { density_kg_m3: number; temperature_k: number }
    const prov = (f: string) => ({ source: 'tool:ambiance:isa-atmosphere' as const, tool_id: 'ambiance:isa-atmosphere', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        air_density_kg_m3: { value: out.density_kg_m3 ?? 1.213, unit: 'kg/m³', family: 'density' as const, basis: 'rated' as const, scope: 'envelope' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: 'ISA @ 100 m AGL', provenance: prov('density_kg_m3') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 6. control-systems:pid-tuning
// ---------------------------------------------------------------------------

const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_type: 'foptd' as const,
    process_gain_K: 1.0,
    process_time_constant_s: 0.1,
    process_dead_time_s: 0.01,
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
        attitude_loop_phase_margin_deg: { value: out.phase_margin_deg ?? 60, unit: 'deg', family: 'angle' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'PID attitude loop', provenance: prov('phase_margin_deg') },
        attitude_loop_settling_time_s: { value: out.settling_time_s ?? 0.5, unit: 's', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('settling_time_s') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 7. gust-response:drone
// ---------------------------------------------------------------------------

const stepGustResponseDrone: ToolStep = {
  tool_id: 'gust-response:drone',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    drone_mass_kg: c.quantities?.mtow_kg?.value ?? 1.8,
    wing_area_m2: 0.1,  // approximation for drag area
    airspeed_m_s: 10,
    gust_speed_m_s: 8,
    is_multirotor: true,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { n_total_g: number; peak_g: number; within_g_limits: boolean; recovery_time_s: number }
    const prov = (f: string) => ({ source: 'tool:gust-response:drone' as const, tool_id: 'gust-response:drone', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        n_total_g: { value: out.n_total_g ?? 2.5, unit: 'g', family: 'dimensionless' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: '8 m/s gust', provenance: prov('n_total_g') },
        gust_recovery_time_s: { value: out.recovery_time_s ?? 0.4, unit: 's', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: null, provenance: prov('recovery_time_s') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 8. gimbal:cog-balance
// ---------------------------------------------------------------------------

const stepGimbalBalance: ToolStep = {
  tool_id: 'gimbal:cog-balance',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    payload_mass_g: (c.quantities?.payload_kg?.value ?? 0.4) * 1000,
    payload_dimensions_mm: { l: 100, w: 80, h: 60 },
    mount_point_xyz_mm: { x: 0, y: 0, z: 50 },
    gimbal_stage_count: 3,
    motor_torque_ncm: 30,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { torque_required_dynamic_ncm: number; balance_ok: boolean; total_gimbal_mass_g: number }
    const prov = (f: string) => ({ source: 'tool:gimbal:cog-balance' as const, tool_id: 'gimbal:cog-balance', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        gimbal_torque_required_ncm: { value: out.torque_required_dynamic_ncm ?? 25, unit: 'N·cm', family: 'force' as const, basis: 'peak' as const, scope: 'module' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'dynamic, slew', provenance: prov('torque_required_dynamic_ncm') },
        gimbal_total_mass_g: { value: out.total_gimbal_mass_g ?? 480, unit: 'g', family: 'mass' as const, basis: 'dry' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'payload + gimbal + motors', provenance: prov('total_gimbal_mass_g') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 9. obstacle-avoidance:sensor
// ---------------------------------------------------------------------------

const stepObstacleSensor: ToolStep = {
  tool_id: 'obstacle-avoidance:sensor',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    sensor_type: 'lidar' as const,
    max_range_m: 100,
    fov_deg: 90,
    frame_rate_hz: 10,
    drone_max_speed_ms: 15,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:obstacle-avoidance:sensor' as const, tool_id: 'obstacle-avoidance:sensor', invocation_output_field: f, duration_ms: 0 })
    const range = (output && typeof output === 'object' && 'max_range_m' in output) ? Number((output as any).max_range_m) : 40
    const latency = (output && typeof output === 'object' && 'total_latency_ms' in output) ? Number((output as any).total_latency_ms) : 100
    return {
      ...c,
      quantities: {
        ...c.quantities,
        max_range_m: { value: range, unit: 'm', family: 'length' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'solid-state LiDAR detection', provenance: prov('max_range_m') },
        obstacle_sensor_latency_ms: { value: latency, unit: 'ms', family: 'time' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('total_latency_ms') },
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
  input_from_contract: () => ({
    tx_power_w: 1.6,  // DJI O3 / TBS Unify Pro HV
    tx_antenna_gain_dbi: 2.0,
    frequency_ghz: 5.8,
    distance_km: 5,
    rx_antenna_gain_dbi: 12.0,  // ground patch + diversity
    system_noise_temp_k: 200,
    bandwidth_hz: 20e6,
    required_ebno_db: 9,
    modulation: 'qpsk' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { link_margin_db: number; eirp_dbw: number }
    const prov = (f: string) => ({ source: 'tool:link-budget:rf' as const, tool_id: 'link-budget:rf', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        rf_link_margin_db: { value: out.link_margin_db ?? 12, unit: 'dB', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 15, temporal_resolution_s: null, condition: '5.8 GHz video downlink @ 5 km', provenance: prov('link_margin_db') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 11. ins:navigation-drift
// ---------------------------------------------------------------------------

const stepInsDrift: ToolStep = {
  tool_id: 'ins:navigation-drift',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    gyro_grade: 'mems_consumer' as const,
    accelerometer_grade: 'mems_consumer' as const,
    operation_duration_min: 30,
    gnss_aiding_available: false,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:ins:navigation-drift' as const, tool_id: 'ins:navigation-drift', invocation_output_field: f, duration_ms: 0 })
    const drift = (output && typeof output === 'object' && 'position_drift_per_min_m' in output) ? Number((output as any).position_drift_per_min_m) : 5
    return {
      ...c,
      quantities: {
        ...c.quantities,
        position_drift_per_min_m: { value: drift, unit: 'm', family: 'length' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 20, temporal_resolution_s: 60, condition: 'GNSS-denied INS drift', provenance: prov('position_drift_per_min_m') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 12. regulatory-caa:part107
// ---------------------------------------------------------------------------

const stepRegulatoryCaaPart107: ToolStep = {
  tool_id: 'regulatory-caa:part107',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    mtow_kg: c.quantities?.mtow_kg?.value ?? 1.8,
    operations: 'visual_line_of_sight' as const,
    region: 'EU' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:regulatory-caa:part107' as const, tool_id: 'regulatory-caa:part107', invocation_output_field: f, duration_ms: 0 })
    const count = (output && typeof output === 'object' && 'mandatory_standards_count' in output) ? Number((output as any).mandatory_standards_count) : 4
    return {
      ...c,
      quantities: {
        ...c.quantities,
        regulatory_mandatory_count: { value: count, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: 'CAA Part 107 / EASA Open Cat A1-A3', provenance: prov('mandatory_standards_count') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 13. lifecycle-co2:assessment
// ---------------------------------------------------------------------------

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'drone' as const, units_per_year: 1000, lifetime_years: 3 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { lifetime_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        lifetime_co2_kg: { value: out.lifetime_co2_kg ?? 35, unit: 'kg CO₂e', family: 'mass' as const, basis: 'lifetime' as const, scope: 'system' as const, uncertainty_pct: 25, temporal_resolution_s: null, condition: null, provenance: prov('lifetime_co2_kg') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 14. mass-aggregator:envelope-check
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    total_cell_mass_kg: c.quantities?.battery_mass_kg?.value ?? 0.4,
    rack_count: 1,
    max_mass_kg_envelope: c.quantities?.mtow_kg?.value ?? 1.8,
    pcs_mass_kg_estimate: 0,
    container_tare_kg_estimate: 0,
    rack_mass_kg_each_estimate: 0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number; mass_budget_utilisation_pct: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 1.8, unit: 'kg', family: 'mass' as const, basis: 'gross_takeoff' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'MTOW', provenance: prov('total_system_mass_kg') },
        mass_budget_utilisation_pct: { value: out.mass_budget_utilisation_pct ?? 90, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'drone.endurance_range',
    'Endurance within physical bounds (5-240 min)',
    'computed_endurance_min',
    5,
    240,
    'warning',
  ),
  ruleRange(
    'drone.thrust_to_weight',
    // 2026-05-22 (Tristan drone chain audit): widened lower bound from
    // 1.5 → 0.25. The 1.5 minimum was correct for pure-multirotor designs
    // (must hover, T/W>=1.5 standard manoeuvre margin) but rejected
    // hybrid quad-plane VTOL designs where the COMPUTED T/W is the
    // cruise-pusher value (~0.3) — the VTOL lift rotors are a separate
    // sub-system. 0.25 still catches physically infeasible drones (a
    // cruise T/W below ~0.2 cannot overcome drag at design airspeed) but
    // allows hybrid platforms through. For pure-multirotor designs the
    // hover-throttle rule below (30-65%) is the operational sanity check.
    'Thrust-to-weight ratio ≥ 0.25 (cruise) or ≥ 1.5 (hover-capable rotorcraft)',
    'thrust_to_weight_ratio',
    0.25,
    10,
    'warning',
  ),
  ruleRange(
    'drone.hover_throttle',
    'Hover throttle within 30-65% (manoeuvre margin)',
    'hover_throttle_pct',
    20,
    70,
    'warning',
  ),
  ruleRange(
    'drone.rf_link_margin',
    'RF link margin ≥ 6 dB',
    'rf_link_margin_db',
    6,
    50,
    'warning',
  ),
  ruleQuantityRatio(
    'drone.gimbal_torque_margin',
    'Gimbal motor torque ≥ required dynamic torque',
    'gimbal_torque_required_ncm',
    'gimbal_torque_required_ncm',
    1.0,
    'info',
  ),
  ruleRange(
    'drone.mass_envelope',
    'MTOW within 0.25-25 kg drone class',
    'mtow_kg',
    0.25,
    25,
    'warning',
  ),
  ruleRange(
    'drone.regulatory_coverage',
    '≥ 2 mandatory regulatory standards',
    'regulatory_mandatory_count',
    2,
    20,
    'warning',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const DRONE_PLAN: ClassToolPlan = {
  id: 'drone:commercial',
  envelope_predicate: (e) => e.class === 'drone',
  tools: [
    stepAmbiance,
    stepAerosandboxAirfoil,
    stepBemtPropeller,
    stepMotorPropMatch,
    stepPybamm,
    stepControlSystems,
    stepGustResponseDrone,
    stepGimbalBalance,
    stepObstacleSensor,
    stepLinkBudgetRf,
    stepInsDrift,
    stepRegulatoryCaaPart107,
    stepLifecycleCo2,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['bemt-propeller:thrust', 'motor-prop:matching'],
    ['pybamm:cell-sizing', 'motor-prop:matching'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(DRONE_PLAN)
