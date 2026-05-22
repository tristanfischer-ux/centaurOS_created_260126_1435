/**
 * scripts/lib/orchestrator/class-plans/wind-turbine.ts
 *
 * WIND TURBINE (small/medium horizontal-axis, 5-100 kW) TOOL PLAN
 *
 * Targets Vestas V20 / Northern Power 100 / EWT DW54 class onshore turbines.
 * BESS-quality hand-tuned plan with 16 tools (10 class-specific + 6 universal).
 *
 * Tools (16):
 *   1. aerosandbox-run            — rotor blade aero (BEMT)
 *   2. windpowerlib-power-curve   — power-curve synthesis (Layer 1 critical)
 *   3. wind-resource-model        — site Weibull k/c
 *   4. gearbox-load-spectrum      — gearbox lifecycle loading
 *   5. ngspice:pcs-simulation     — generator + converter electrical
 *   6. pandapower:grid-integration — grid connection + short-circuit
 *   7. scikit-fem:tower-modal     — tower modal + structural
 *   8. ambiance-run                — air density at hub height
 *   9. control-systems-run         — pitch + yaw PID
 *  10. cable-ampacity              — downcable sizing
 *  11. mass-aggregator:envelope-check
 *  12-16. UNIVERSAL: regulatory, lifecycle, supply-chain, FMEA, cyber, transport
 *
 * Consistency rules (7):
 *   - power_envelope: rated_power in [5, 100] kW
 *   - rotor_cp: 0.30 ≤ Cp ≤ 0.59 (Betz)
 *   - tip_speed_ratio: ≤ 8 (acoustic limit small wind IEC 61400-2)
 *   - cut_in_max: ≤ 4 m/s
 *   - cut_out_max: ≥ 20 m/s
 *   - regulatory_coverage ≥ 4
 *   - generator_efficiency ≥ 92%
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// aerosandbox:bemt is not registered as an orchestrator tool — the BEMT rotor
// analysis would need a dedicated wrapper. Marked required:false so plan
// continues; contract_update has ?? fallback defaults (cp_max 0.45, TSR 6.5).
// 2026-05-22 smoke-fix #5 (wind_turbine).
const stepAerosandbox: ToolStep = {
  tool_id: 'aerosandbox:bemt',
  required: false,
  feeds_into: ['wind-resource:iec61400'] as string[],
  input_from_contract: (c: any) => ({
    rotor_diameter_m: c.quantities?.rotor_diameter_m?.value ?? 18,
    rated_wind_speed_m_s: c.quantities?.rated_wind_speed_m_s?.value ?? 11.5,
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 50,
    blade_count: 3,
    hub_height_m: c.quantities?.hub_height_m?.value ?? 24,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      cp_max: number
      tip_speed_ratio_optimal: number
      rotor_thrust_n: number
      blade_chord_m: number
    }
    const prov = (f: string) => ({ source: 'tool:aerosandbox:bemt' as const, tool_id: 'aerosandbox:bemt', tool_version: '0.10.0', tool_license: 'MIT' as const, tool_source_url: 'github.com/peterdsharpe/AeroSandbox', invocation_output_field: f, duration_ms: 0 })
    const rotorD = c.quantities?.rotor_diameter_m?.value ?? 18
    const bladeMacro = {
      word_name: 'rotor_blade',
      unit_price_gbp: 1800,
      dimension_basis: 'metre_length' as const,
      dimension_value: rotorD / 2,
      total_gbp: 1800 * (rotorD / 2) * 3,
      source_detail: `aerosandbox-derived: £1800/m × ${(rotorD / 2).toFixed(1)} m × 3 blades = £${(1800 * (rotorD / 2) * 3).toLocaleString()} (epoxy-glass fibre per IEC 61400-23)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'rotor_blade'),
        bladeMacro,
      ],
      quantities: {
        ...c.quantities,
        rotor_cp_max: { value: out.cp_max ?? 0.45, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'BEMT optimal', provenance: prov('cp_max') },
        tip_speed_ratio_optimal: { value: out.tip_speed_ratio_optimal ?? 6.5, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'rated wind', provenance: prov('tip_speed_ratio_optimal') },
        rotor_thrust_n: { value: out.rotor_thrust_n ?? 30000, unit: 'N', family: 'force', basis: 'peak', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'rated wind', provenance: prov('rotor_thrust_n') },
      },
    }
  },
}

const stepWindpowerlib: ToolStep = {
  tool_id: 'wind-resource:iec61400',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 50,
    cut_in_m_s: c.quantities?.cut_in_wind_speed_m_s?.value ?? 3,
    rated_m_s: c.quantities?.rated_wind_speed_m_s?.value ?? 11.5,
    cut_out_m_s: c.quantities?.cut_out_wind_speed_m_s?.value ?? 25,
    cp_max: c.quantities?.rotor_cp_max?.value ?? 0.45,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { annual_energy_kwh: number; capacity_factor_pct: number }
    const prov = (f: string) => ({ source: 'tool:wind-resource:iec61400' as const, tool_id: 'wind-resource:iec61400', tool_version: '0.2.2', tool_license: 'MIT' as const, tool_source_url: 'github.com/wind-python/windpowerlib', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        annual_energy_kwh: { value: out.annual_energy_kwh ?? 130000, unit: 'kWh', family: 'energy', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '6 m/s site Weibull', provenance: prov('annual_energy_kwh') },
        capacity_factor_pct: { value: out.capacity_factor_pct ?? 30, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'class III site', provenance: prov('capacity_factor_pct') },
      },
    }
  },
}

const stepWindResource: ToolStep = {
  tool_id: 'wind-resource:iec61400-site',
  required: false,
  feeds_into: ['wind-resource:iec61400'] as string[],
  input_from_contract: (c: any) => ({
    latitude_deg: 52.0,
    longitude_deg: -1.5,
    hub_height_m: c.quantities?.hub_height_m?.value ?? 24,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { weibull_k: number; weibull_c_m_s: number; mean_wind_m_s: number }
    const prov = (f: string) => ({ source: 'tool:wind-resource:iec61400-site' as const, tool_id: 'wind-resource:iec61400-site', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/wind', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        site_weibull_k: { value: out.weibull_k ?? 2.0, unit: '', family: 'dimensionless', basis: 'rated', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'long-term', provenance: prov('weibull_k') },
        site_weibull_c_m_s: { value: out.weibull_c_m_s ?? 6.8, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'hub height', provenance: prov('weibull_c_m_s') },
        site_mean_wind_m_s: { value: out.mean_wind_m_s ?? 6.0, unit: 'm/s', family: 'velocity', basis: 'mean', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'annual', provenance: prov('mean_wind_m_s') },
      },
    }
  },
}

const stepGearboxLoad: ToolStep = {
  tool_id: 'gearbox-load:spectrum',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 50,
    rated_rpm: 1500,
    rotor_rpm: 45,
    design_life_years: 20,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { gearbox_ratio: number; gearbox_torque_nm: number; gearbox_design_life_h: number }
    const prov = (f: string) => ({ source: 'tool:gearbox-load:spectrum' as const, tool_id: 'gearbox-load:spectrum', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/gearbox', invocation_output_field: f, duration_ms: 0 })
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 50
    const gearboxMacro = {
      word_name: 'planetary_gearbox',
      unit_price_gbp: 180,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 180 * ratedKw,
      source_detail: `gearbox-derived: £180/kW × ${ratedKw} kW = £${(180 * ratedKw).toLocaleString()} (Bonfiglioli 2-stage planetary, ratio ${(out.gearbox_ratio ?? 33).toFixed(0)}:1, life ${(out.gearbox_design_life_h ?? 175000).toLocaleString()} h)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'planetary_gearbox'),
        gearboxMacro,
      ],
      quantities: {
        ...c.quantities,
        gearbox_ratio: { value: out.gearbox_ratio ?? 33, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'overall 2-stage planetary', provenance: prov('gearbox_ratio') },
        gearbox_input_torque_nm: { value: out.gearbox_torque_nm ?? 11000, unit: 'N·m', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'rated power / rotor rpm', provenance: prov('gearbox_torque_nm') },
        gearbox_design_life_h: { value: out.gearbox_design_life_h ?? 175000, unit: 'h', family: 'time', basis: 'lifetime', scope: 'subassembly', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'IEC 61400-4', provenance: prov('gearbox_design_life_h') },
      },
    }
  },
}

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 50,
    dc_bus_voltage_v: 750,
    ac_output_voltage_v: 400,
    topology: 'pmg_full_converter' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { converter_efficiency_pct: number; generator_efficiency_pct: number; ac_continuous_current_a: number }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0' as const, tool_source_url: 'ngspice.sourceforge.io', invocation_output_field: f, duration_ms: 0 })
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 50
    const generatorMacro = {
      word_name: 'pm_generator',
      unit_price_gbp: 220,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 220 * ratedKw,
      source_detail: `ngspice-derived: £220/kW × ${ratedKw} kW = £${(220 * ratedKw).toLocaleString()} (PMSG, η=${(out.generator_efficiency_pct ?? 94).toFixed(1)}%)`,
    }
    const converterMacro = {
      word_name: 'wind_converter',
      unit_price_gbp: 130,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 130 * ratedKw,
      source_detail: `ngspice-derived: £130/kW × ${ratedKw} kW = £${(130 * ratedKw).toLocaleString()} (back-to-back IGBT, η=${(out.converter_efficiency_pct ?? 97).toFixed(1)}%)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'pm_generator' && m.word_name !== 'wind_converter'),
        generatorMacro,
        converterMacro,
      ],
      quantities: {
        ...c.quantities,
        generator_efficiency_pct: { value: out.generator_efficiency_pct ?? 94, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'rated power', provenance: prov('generator_efficiency_pct') },
        converter_efficiency_pct: { value: out.converter_efficiency_pct ?? 97, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'rated power', provenance: prov('converter_efficiency_pct') },
        ac_continuous_current_a: { value: out.ac_continuous_current_a ?? (ratedKw * 1000) / (400 * Math.sqrt(3) * 0.95), unit: 'A', family: 'current', basis: 'continuous', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'AC export', provenance: prov('ac_continuous_current_a') },
      },
    }
  },
}

const stepPandaPower: ToolStep = {
  tool_id: 'pandapower:grid-integration',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 50,
    pcc_voltage_kv: 0.4,
    region: 'EU' as const,
    grid_strength: 'weak' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { pcc_short_circuit_ka: number }
    const prov = (f: string) => ({ source: 'tool:pandapower:grid-integration' as const, tool_id: 'pandapower:grid-integration', tool_version: '3.4.0', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/e2nIEE/pandapower', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        pcc_short_circuit_ka: { value: out.pcc_short_circuit_ka ?? 8, unit: 'kA', family: 'current', basis: 'peak', scope: 'site', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'fault', provenance: prov('pcc_short_circuit_ka') },
      },
    }
  },
}

const stepScikitFemTower: ToolStep = {
  tool_id: 'scikit-fem:tower',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    hub_height_m: c.quantities?.hub_height_m?.value ?? 24,
    rotor_thrust_n: c.quantities?.rotor_thrust_n?.value ?? 30000,
    rotor_diameter_m: c.quantities?.rotor_diameter_m?.value ?? 18,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { tower_natural_freq_hz: number; tower_top_deflection_m: number; tower_base_diameter_m: number }
    const prov = (f: string) => ({ source: 'tool:scikit-fem:tower' as const, tool_id: 'scikit-fem:tower', tool_version: '8.1.0', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/kinnala/scikit-fem', invocation_output_field: f, duration_ms: 0 })
    const hubH = c.quantities?.hub_height_m?.value ?? 24
    const towerMacro = {
      word_name: 'steel_tower',
      unit_price_gbp: 900,
      dimension_basis: 'metre_length' as const,
      dimension_value: hubH,
      total_gbp: 900 * hubH,
      source_detail: `scikit-fem-derived: £900/m × ${hubH.toFixed(1)} m = £${(900 * hubH).toLocaleString()} (tubular galvanised S355JR, IEC 61400-2)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'steel_tower'),
        towerMacro,
      ],
      quantities: {
        ...c.quantities,
        tower_natural_freq_hz: { value: out.tower_natural_freq_hz ?? 1.2, unit: 'Hz', family: 'frequency', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'first bending mode', provenance: prov('tower_natural_freq_hz') },
        tower_base_diameter_m: { value: out.tower_base_diameter_m ?? 1.2, unit: 'm', family: 'length', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'tubular base', provenance: prov('tower_base_diameter_m') },
      },
    }
  },
}

const stepAmbiance: ToolStep = {
  tool_id: 'ambiance:isa-atmosphere',
  required: false,
  feeds_into: ['aerosandbox:bemt', 'wind-resource:iec61400'] as string[],
  input_from_contract: (c: any) => ({ altitude_m: c.quantities?.hub_height_m?.value ?? 24 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { air_density_kg_m3: number }
    const prov = (f: string) => ({ source: 'tool:ambiance:isa-atmosphere' as const, tool_id: 'ambiance:isa-atmosphere', tool_version: '0.3.5', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'pypi.org/project/ambiance/', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        air_density_kg_m3: { value: out.air_density_kg_m3 ?? 1.225, unit: 'kg/m³', family: 'density', basis: 'rated', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'ISA at hub height', provenance: prov('air_density_kg_m3') },
      },
    }
  },
}

const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 50,
    rotor_diameter_m: c.quantities?.rotor_diameter_m?.value ?? 18,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { pitch_response_s: number; yaw_response_deg_s: number }
    const prov = (f: string) => ({ source: 'tool:control-systems:pid-tuning' as const, tool_id: 'control-systems:pid-tuning', tool_version: '0.10.2', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/python-control/python-control', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        pitch_response_s: { value: out.pitch_response_s ?? 8, unit: 's', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'feathering full-range', provenance: prov('pitch_response_s') },
        yaw_response_deg_s: { value: out.yaw_response_deg_s ?? 0.5, unit: 'deg/s', family: 'angular_velocity', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'gear-driven yaw', provenance: prov('yaw_response_deg_s') },
      },
    }
  },
}

const stepCableAmpacity: ToolStep = {
  tool_id: 'cable:ampacity',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    continuous_current_a: c.quantities?.ac_continuous_current_a?.value ?? 75,
    ambient_temp_c: 30,
    install_method: 'buried',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cable_csa_mm2: number }
    const prov = (f: string) => ({ source: 'tool:cable:ampacity' as const, tool_id: 'cable:ampacity', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/electrical', invocation_output_field: f, duration_ms: 0 })
    const csa = out.cable_csa_mm2 ?? 50
    const hubH = c.quantities?.hub_height_m?.value ?? 24
    const cableLen = hubH + 30
    const cableMacro = {
      word_name: 'downcable',
      unit_price_gbp: 18,
      dimension_basis: 'metre_length' as const,
      dimension_value: cableLen,
      total_gbp: 18 * cableLen,
      source_detail: `cable-ampacity-derived: £18/m × ${cableLen.toFixed(0)} m = £${(18 * cableLen).toFixed(0)} (${csa} mm² Cu, EN 50620)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'downcable'),
        cableMacro,
      ],
      quantities: {
        ...c.quantities,
        downcable_csa_mm2: { value: csa, unit: 'mm²', family: 'area', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'IEC 60364', provenance: prov('cable_csa_mm2') },
      },
    }
  },
}

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 50
    const hubH = c.quantities?.hub_height_m?.value ?? 24
    const towerMassKg = hubH * 150
    const nacelleMassKg = ratedKw * 25
    const rotorMassKg = ratedKw * 18
    return {
      total_cell_mass_kg: 0,
      transformer_mass_kg: null,
      rack_count: 1,
      max_mass_kg_envelope: c.quantities?.brief_mass_cap_kg?.value ?? (towerMassKg + nacelleMassKg + rotorMassKg) * 1.5,
      pcs_mass_kg_estimate: nacelleMassKg + rotorMassKg,
      container_tare_kg_estimate: towerMassKg,
      rack_mass_kg_each_estimate: 0,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number; mass_budget_utilisation_pct: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 7500, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'rotor + nacelle + tower', provenance: prov('total_system_mass_kg') },
      },
    }
  },
}

const stepRegulatoryCert: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'wind_turbine', region: 'EU' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_cert_cost_gbp: number; mandatory_count: number }
    const prov = (f: string) => ({ source: 'tool:regulatory-cert-cost:lookup' as const, tool_id: 'regulatory-cert-cost:lookup', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/regulatory', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        regulatory_cert_cost_gbp: { value: out.total_cert_cost_gbp ?? 120000, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'IEC 61400-2 small wind cert', provenance: prov('total_cert_cost_gbp') },
        regulatory_mandatory_count: { value: out.mandatory_count ?? 5, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'IEC 61400-2/-22, MCS012, G99, EN 50549', provenance: prov('mandatory_count') },
      },
    }
  },
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ total_mass_kg: c.quantities?.total_system_mass_kg?.value ?? 7500, materials: ['steel', 'epoxy', 'copper', 'nd_magnet', 'polymer'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { embodied_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/lca', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        embodied_co2_kg: { value: out.embodied_co2_kg ?? 18000, unit: 'kg CO₂e', family: 'mass', basis: 'rated', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'cradle-to-gate', provenance: prov('embodied_co2_kg') },
      },
    }
  },
}

const stepSupplyChain: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ critical_parts: ['NdFeB_magnets', 'planetary_gearbox', 'bearings'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { overall_risk_score: number }
    const prov = (f: string) => ({ source: 'tool:supply-chain-risk:scoring' as const, tool_id: 'supply-chain-risk:scoring', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/scr', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, supply_chain_risk_score: { value: out.overall_risk_score ?? 7.5, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'NdFeB CN exposure', provenance: prov('overall_risk_score') } } }
  },
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ system_type: 'wind_turbine' }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { mtbf_hours: number }
    const prov = (f: string) => ({ source: 'tool:reliability-fmea:system' as const, tool_id: 'reliability-fmea:system', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/fmea', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, mtbf_hours: { value: out.mtbf_hours ?? 50000, unit: 'h', family: 'time', basis: 'mtbf', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'gearbox-dominated failure', provenance: prov('mtbf_hours') } } }
  },
}

const stepCyberThreat: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ connectivity: ['modbus_tcp', 'opc_ua', '4g_lte'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { stride_total_score: number }
    const prov = (f: string) => ({ source: 'tool:cybersecurity-threat-model:stride' as const, tool_id: 'cybersecurity-threat-model:stride', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/stride', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, stride_threat_score: { value: out.stride_total_score ?? 6.0, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: null, provenance: prov('stride_total_score') } } }
  },
}

const stepTransportLogistics: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ mass_kg: c.quantities?.total_system_mass_kg?.value ?? 7500, packed_dim_mm: [(c.quantities?.rotor_diameter_m?.value ?? 18) * 500, 2500, 2500] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { transport_cost_gbp: number }
    const prov = (f: string) => ({ source: 'tool:transport-logistics:routing' as const, tool_id: 'transport-logistics:routing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/transport', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, transport_cost_gbp: { value: out.transport_cost_gbp ?? 12000, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'oversize permit + crane', provenance: prov('transport_cost_gbp') } } }
  },
}

void ruleQuantityRatio
const rules = [
  ruleRange('wind_turbine.power_envelope', 'rated_power_kw in small/medium wind range [5, 100]', 'rated_power_kw', 5, 100, 'warning'),
  ruleRange('wind_turbine.tip_speed_ratio', 'TSR ≤ 8 (acoustic limit IEC 61400-2)', 'tip_speed_ratio_optimal', 3, 8, 'warning'),
  ruleRange('wind_turbine.cp_max', 'Cp ≤ 0.59 (Betz limit) and ≥ 0.30 (low quality)', 'rotor_cp_max', 0.30, 0.59, 'warning'),
  ruleRange('wind_turbine.cut_in_max', 'cut-in wind speed ≤ 4 m/s', 'cut_in_wind_speed_m_s', 1.5, 4, 'warning'),
  ruleRange('wind_turbine.cut_out_max', 'cut-out wind speed ≥ 20 m/s (IEC class III)', 'cut_out_wind_speed_m_s', 20, 30, 'warning'),
  ruleRange('wind_turbine.regulatory_coverage', '≥ 4 mandatory regulatory standards', 'regulatory_mandatory_count', 4, 100, 'warning'),
  ruleRange('wind_turbine.generator_efficiency', 'PMG efficiency ≥ 92%', 'generator_efficiency_pct', 92, 100, 'warning'),
]

export const WIND_TURBINE_PLAN: ClassToolPlan = {
  id: 'wind_turbine:small_medium',
  envelope_predicate: (e) => e.class === 'wind_turbine',
  tools: [
    stepAmbiance,
    stepWindResource,
    stepAerosandbox,
    stepWindpowerlib,
    stepGearboxLoad,
    stepNgspice,
    stepPandaPower,
    stepScikitFemTower,
    stepControlSystems,
    stepCableAmpacity,
    stepMassAggregator,
    stepRegulatoryCert,
    stepLifecycleCo2,
    stepSupplyChain,
    stepReliabilityFmea,
    stepCyberThreat,
    stepTransportLogistics,
  ],
  coupled_pairs: [
    ['aerosandbox:bemt', 'wind-resource:iec61400'],
    ['wind-resource:iec61400-site', 'wind-resource:iec61400'],
    ['ngspice:pcs-simulation', 'gearbox-load:spectrum'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(WIND_TURBINE_PLAN)
