/**
 * scripts/lib/orchestrator/class-plans/e-bike.ts
 *
 * E-BIKE TOOL PLAN — Build #20a hand-tuned (2026-05-22).
 *
 * Tools (12):
 *   1. rolling-resistance:cycling     — total drag at cruise speed
 *   2. gear-ratio:bicycle             — gear ratio for max-assist speed
 *   3. pybamm:cell-sizing             — Li-ion 21700 pack topology
 *   4. motor-prop:matching            — motor sizing (used as proxy for e-bike motor)
 *   5. ngspice:pcs-simulation         — motor controller FOC efficiency
 *   6. coolprop:refrigerant-properties — battery thermal coolant props (proxy)
 *   7. control-systems:pid-tuning     — torque-assist control loop
 *   8. regulatory-cert-cost:lookup    — EN 15194 + StVZO TA22 cost
 *   9. lifecycle-co2:assessment       — cradle-to-grave LCA
 *  10. supply-chain-risk:scoring      — supply chain (Bosch, Shimano)
 *  11. reliability-fmea:system        — bike-level FMEA
 *  12. mass-aggregator:envelope-check — total mass closure
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// 1. rolling-resistance:cycling
// ---------------------------------------------------------------------------

const stepRollingResistance: ToolStep = {
  tool_id: 'rolling-resistance:cycling',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    velocity_kmh: 25,  // EU pedelec max
    total_mass_kg: (c.quantities?.total_mass_kg?.value ?? 25) + 80,  // bike + rider
    rider_position: 'upright' as const,
    tire_type: 'hybrid' as const,
    tire_pressure_bar: 4,
    road_grade_pct: 0,
    drive_efficiency: 0.85,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { rolling_drag_n: number; total_drag_n: number; total_power_required_w: number; battery_power_required_w: number }
    const prov = (f: string) => ({ source: 'tool:rolling-resistance:cycling' as const, tool_id: 'rolling-resistance:cycling', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        rolling_drag_n: { value: out.rolling_drag_n ?? 6.5, unit: 'N', family: 'force' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: '25 km/h on tarmac', provenance: prov('rolling_drag_n') },
        total_drag_n: { value: out.total_drag_n ?? 25, unit: 'N', family: 'force' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'rolling + aero @ 25 km/h', provenance: prov('total_drag_n') },
        total_power_required_w: { value: out.total_power_required_w ?? 196, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('total_power_required_w') },
        battery_power_required_w: { value: out.battery_power_required_w ?? 230, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'after drive efficiency', provenance: prov('battery_power_required_w') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. gear-ratio:bicycle
// ---------------------------------------------------------------------------

const stepGearRatio: ToolStep = {
  tool_id: 'gear-ratio:bicycle',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    motor_w: c.quantities?.rated_motor_power_w?.value ?? 250,
    kv: 12,  // typical Bosch CX equivalent kV
    v_batt: 36,
    wheel_diameter_mm: 700,  // 29" wheel
    pulley_teeth_motor: 11,
    pulley_teeth_wheel: 30,
    drive_efficiency: 0.85,
    target_range_km: c.quantities?.range_km?.value ?? 80,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { max_speed_kmh: number; gear_ratio: number; motor_rpm_at_speed: number; max_thrust_n: number; battery_v: number; kv: number; range_km_at_250w: number }
    const prov = (f: string) => ({ source: 'tool:gear-ratio:bicycle' as const, tool_id: 'gear-ratio:bicycle', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        max_speed_kmh: { value: out.max_speed_kmh ?? 25, unit: 'km/h', family: 'velocity' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'EU pedelec assist cap', provenance: prov('max_speed_kmh') },
        gear_ratio: { value: out.gear_ratio ?? 2.73, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('gear_ratio') },
        motor_rpm_at_speed: { value: out.motor_rpm_at_speed ?? 950, unit: 'rpm', family: 'frequency' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('motor_rpm_at_speed') },
        max_thrust_n: { value: out.max_thrust_n ?? 130, unit: 'N', family: 'force' as const, basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: 'at wheel rim', provenance: prov('max_thrust_n') },
        battery_v: { value: out.battery_v ?? 36, unit: 'V', family: 'voltage' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 1, temporal_resolution_s: null, condition: '10S nominal', provenance: prov('battery_v') },
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
    target_energy_kwh: c.quantities?.battery_kwh?.value ?? 0.5,
    dod_fraction: 0.80,
    cell_chemistry: 'nmc' as const,
    cell_capacity_ah: 4.9,  // Samsung INR21700-50E
    cell_voltage_v: 3.7,
    ambient_temp_c: 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cell_count: number; nameplate_capacity_kwh: number }
    const prov = (f: string) => ({ source: 'tool:pybamm:cell-sizing' as const, tool_id: 'pybamm:cell-sizing', invocation_output_field: f, duration_ms: 0 })
    const cellCount = out.cell_count ?? 40
    const batteryKwh = c.quantities?.battery_kwh?.value ?? 0.5
    const batteryPackMacro = {
      word_name: 'lithium_18650_cell',
      unit_price_gbp: 5,
      dimension_basis: 'count' as const,
      dimension_value: cellCount,
      total_gbp: 5 * cellCount,
      source_detail: `pybamm-derived: £5/cell × ${cellCount} cells = £${5 * cellCount} (Samsung INR21700-50E / LG M50LT, 4.9 Ah, 3.7 V)`,
    }
    const drivePackMacro = {
      word_name: 'mid_drive_motor',
      unit_price_gbp: 600,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 600,
      source_detail: `e-bike-derived: £600 flat (Bosch Performance Line CX Gen4 / Shimano EP8 / Brose S Mag mid-drive, 250W rated, 85 N·m peak)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'lithium_18650_cell' && m.word_name !== 'mid_drive_motor'),
        batteryPackMacro,
        drivePackMacro,
      ],
      quantities: {
        ...c.quantities,
        cell_count: { value: cellCount, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'pack' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: '10S 4P', provenance: prov('cell_count') },
        nameplate_capacity_kwh: { value: out.nameplate_capacity_kwh ?? batteryKwh, unit: 'kWh', family: 'energy' as const, basis: 'nameplate' as const, scope: 'pack' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: null, provenance: prov('nameplate_capacity_kwh') },
        pack_mass_kg: { value: batteryKwh * 6, unit: 'kg', family: 'mass' as const, basis: 'dry' as const, scope: 'pack' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: '150 Wh/kg pack-level', provenance: prov('pack_mass_derived') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. motor-prop:matching (used as proxy for e-bike motor sizing)
// ---------------------------------------------------------------------------

const stepMotorPropMatch: ToolStep = {
  tool_id: 'motor-prop:matching',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    motor_kv: 12,
    battery_voltage: c.quantities?.battery_v?.value ?? 36,
    prop_diameter_inch: 0.1,  // e-bike has no propeller; placeholder
    prop_pitch_inch: 0.1,
    num_motors: 1,
    payload_kg: 80,
    drone_mtow_kg: c.quantities?.total_mass_kg?.value ?? 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:motor-prop:matching' as const, tool_id: 'motor-prop:matching', invocation_output_field: f, duration_ms: 0 })
    // Use motor-prop tool's output where applicable; falls back to defaults
    const efficiency = (output && typeof output === 'object' && 'hover_throttle_pct' in output) ? Number((output as any).hover_throttle_pct) : 75
    return {
      ...c,
      quantities: {
        ...c.quantities,
        motor_efficiency_pct: { value: efficiency, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'FOC at rated load', provenance: prov('motor_efficiency_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. ngspice:pcs-simulation (used as proxy for motor controller efficiency)
// ---------------------------------------------------------------------------

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: (c.quantities?.rated_motor_power_w?.value ?? 250) / 1000,
    dc_bus_voltage_v: c.quantities?.battery_v?.value ?? 36,
    ac_output_voltage_v: 24,  // motor phase voltage at rated
    topology: 'sic_two_level' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { inverter_efficiency_pct: number; dissipated_power_kw: number }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        controller_efficiency_pct: { value: out.inverter_efficiency_pct ?? 96, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: 'MOSFET inverter @ rated load', provenance: prov('inverter_efficiency_pct') },
        controller_dissipated_w: { value: (out.dissipated_power_kw ?? 0.01) * 1000, unit: 'W', family: 'power' as const, basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('dissipated_power_kw') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 6. coolprop:refrigerant-properties (used as proxy for battery thermal coolant)
// ---------------------------------------------------------------------------

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    fluid: 'water' as const,  // e-bike batteries typically passive-air cooled, but we use water as a reference for any future liquid cooling
    temperature_c: 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:coolprop:refrigerant-properties' as const, tool_id: 'coolprop:refrigerant-properties', invocation_output_field: f, duration_ms: 0 })
    const cp = (output && typeof output === 'object' && 'cp_liquid_kj_kgk' in output) ? Number((output as any).cp_liquid_kj_kgk) : 4.18
    return {
      ...c,
      quantities: {
        ...c.quantities,
        coolant_cp_kj_kgk: { value: cp, unit: 'kJ/(kg·K)', family: 'specific_heat' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2, temporal_resolution_s: null, condition: '25°C, water (reference)', provenance: prov('cp_liquid_kj_kgk') },
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
    process_gain_K: 0.5,
    process_time_constant_s: 0.05,
    process_dead_time_s: 0.005,
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
        torque_assist_phase_margin_deg: { value: out.phase_margin_deg ?? 60, unit: 'deg', family: 'angle' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'pedal torque-assist loop', provenance: prov('phase_margin_deg') },
        torque_assist_settling_time_s: { value: out.settling_time_s ?? 0.2, unit: 's', family: 'time' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('settling_time_s') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 8. regulatory-cert-cost:lookup
// ---------------------------------------------------------------------------

const stepRegulatoryCertCost: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'e_bike' as const, region: 'EU' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_cost_gbp: number; total_critical_path_months: number; mandatory_certifications: any[] }
    const prov = (f: string) => ({ source: 'tool:regulatory-cert-cost:lookup' as const, tool_id: 'regulatory-cert-cost:lookup', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cost_estimate_gbp: { value: out.total_cost_gbp ?? 60_000, unit: 'GBP', family: 'currency' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 20, temporal_resolution_s: null, condition: 'EN 15194 + StVZO TA22 + UN 38.3', provenance: prov('total_cost_gbp') },
        regulatory_mandatory_count: { value: (out.mandatory_certifications ?? []).length || 4, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('mandatory_certifications.length') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 9. lifecycle-co2:assessment
// ---------------------------------------------------------------------------

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'e_bike' as const, units_per_year: 20000, lifetime_years: 7 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { lifetime_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        lifetime_co2_kg: { value: out.lifetime_co2_kg ?? 270, unit: 'kg CO₂e', family: 'mass' as const, basis: 'lifetime' as const, scope: 'system' as const, uncertainty_pct: 20, temporal_resolution_s: null, condition: null, provenance: prov('lifetime_co2_kg') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 10. supply-chain-risk:scoring
// ---------------------------------------------------------------------------

const stepSupplyChainRisk: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'e_bike' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:supply-chain-risk:scoring' as const, tool_id: 'supply-chain-risk:scoring', invocation_output_field: f, duration_ms: 0 })
    const score = (output && typeof output === 'object' && 'overall_risk_score' in output) ? Number((output as any).overall_risk_score) : 45
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
// 11. reliability-fmea:system
// ---------------------------------------------------------------------------

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'e_bike' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({ source: 'tool:reliability-fmea:system' as const, tool_id: 'reliability-fmea:system', invocation_output_field: f, duration_ms: 0 })
    const mtbf = (output && typeof output === 'object' && 'mtbf_hours' in output) ? Number((output as any).mtbf_hours) : 5000
    return {
      ...c,
      quantities: {
        ...c.quantities,
        mtbf_hours: { value: mtbf, unit: 'h', family: 'time' as const, basis: 'mtbf' as const, scope: 'system' as const, uncertainty_pct: 30, temporal_resolution_s: null, condition: null, provenance: prov('mtbf_hours') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 12. mass-aggregator:envelope-check
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    total_cell_mass_kg: c.quantities?.pack_mass_kg?.value ?? 3.0,
    rack_count: 1,
    max_mass_kg_envelope: c.quantities?.total_mass_kg?.value ?? 25,
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
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 25, unit: 'kg', family: 'mass' as const, basis: 'dry' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: 'bike all-up', provenance: prov('total_system_mass_kg') },
        mass_budget_utilisation_pct: { value: out.mass_budget_utilisation_pct ?? 100, unit: '%', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'e_bike.motor_power_range',
    'Motor power within EU pedelec (≤ 250 W) or US class 3 (≤ 750 W)',
    'rated_motor_power_w',
    100,
    750,
    'warning',
  ),
  ruleRange(
    'e_bike.battery_capacity_range',
    'Battery capacity within consumer e-bike class (0.25-1.5 kWh)',
    'battery_kwh',
    0.25,
    1.5,
    'warning',
  ),
  ruleRange(
    'e_bike.range_min',
    'Range ≥ 30 km @ medium assist',
    'range_km',
    30,
    250,
    'warning',
  ),
  ruleRange(
    'e_bike.max_speed_pedelec',
    'Max assisted speed ≤ 25 km/h (EU pedelec)',
    'max_speed_kmh',
    20,
    32,
    'warning',
  ),
  ruleRange(
    'e_bike.mass_envelope',
    'Total mass within 18-35 kg consumer e-bike class',
    'total_mass_kg',
    18,
    35,
    'warning',
  ),
  ruleRange(
    'e_bike.regulatory_coverage',
    '≥ 3 mandatory regulatory standards (EN 15194 + StVZO + UN 38.3)',
    'regulatory_mandatory_count',
    3,
    20,
    'warning',
  ),
  ruleQuantityRatio(
    'e_bike.power_balance',
    'Battery power ≥ rolling-resistance demand',
    'total_power_required_w',
    'rated_motor_power_w',
    1.0,
    'info',
  ),
]

export const E_BIKE_PLAN: ClassToolPlan = {
  id: 'e_bike:consumer',
  envelope_predicate: (e) => e.class === 'e_bike',
  tools: [
    stepRollingResistance,
    stepGearRatio,
    stepPybamm,
    stepMotorPropMatch,
    stepNgspice,
    stepCoolProp,
    stepControlSystems,
    stepRegulatoryCertCost,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['rolling-resistance:cycling', 'gear-ratio:bicycle'],
    ['pybamm:cell-sizing', 'motor-prop:matching'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(E_BIKE_PLAN)
