/**
 * scripts/lib/orchestrator/class-plans/ups-inverter.ts
 *
 * UPS INVERTER (online, 1-20 kW battery-backed standby) TOOL PLAN
 *
 * Targets APC Smart-UPS RT / Eaton 9PX class units. BESS-quality with 12 tools.
 *
 * Tools (12):
 *   1. pybamm:cell-sizing
 *   2. runtime:calc
 *   3. ngspice:pcs-simulation
 *   4. coolprop:refrigerant-properties
 *   5. pandapower:grid-integration
 *   6. cell-balance:model
 *   7. warranty-reliability:battery
 *   8. mass-aggregator:envelope-check
 *   9-14. UNIVERSAL: regulatory, lifecycle, supply-chain, FMEA, cyber, transport
 *
 * Consistency rules (7):
 *   - power_envelope: rated_power in [1, 20] kW
 *   - efficiency_minimum: ≥ 94% double-conversion online
 *   - runtime_minimum: ≥ 5 minutes
 *   - thd_output ≤ 5%
 *   - regulatory_coverage ≥ 3
 *   - mass_envelope ≤ 60 kg (single-person)
 *   - eol_capacity 70-85%
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

const stepPybamm: ToolStep = {
  tool_id: 'pybamm:cell-sizing',
  required: true,
  feeds_into: ['runtime:peukert-discharge', 'cell-balance:model'] as string[],
  input_from_contract: (c: any) => ({
    target_energy_kwh: c.quantities?.battery_kwh?.value ?? 5,
    dod_fraction: 0.80,
    cell_chemistry: 'lfp' as const,
    cell_capacity_ah: 20,
    cell_voltage_v: 3.2,
    ambient_temp_c: 25,
    dc_bus_voltage_v: 48,
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cell_count: number; nameplate_capacity_kwh: number; total_cell_mass_kg: number }
    const prov = (f: string) => ({ source: 'tool:pybamm:cell-sizing' as const, tool_id: 'pybamm:cell-sizing', tool_version: '26.4.3', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/pybamm-team/PyBaMM', invocation_output_field: f, duration_ms: 0 })
    const cellCount = out.cell_count ?? Math.max(15, Math.round((c.quantities?.battery_kwh?.value ?? 5) * 1000 / (20 * 3.2)))
    const cellMacro = {
      word_name: 'lfp_cylindrical_cell',
      unit_price_gbp: 12,
      dimension_basis: 'each' as const,
      dimension_value: cellCount,
      total_gbp: 12 * cellCount,
      source_detail: `pybamm-derived: £12/cell × ${cellCount} cells = £${(12 * cellCount).toLocaleString()} (CALB CA20Ah-A LFP 26650 class)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'lfp_cylindrical_cell'),
        cellMacro,
      ],
      quantities: {
        ...c.quantities,
        cell_count: { value: cellCount, unit: '', family: 'dimensionless', basis: 'rated', scope: 'pack', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('cell_count') },
        nameplate_capacity_kwh: { value: out.nameplate_capacity_kwh ?? (cellCount * 20 * 3.2 / 1000), unit: 'kWh', family: 'energy', basis: 'nameplate', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'BoL 25°C', provenance: prov('nameplate_capacity_kwh') },
        total_cell_mass_kg: { value: out.total_cell_mass_kg ?? cellCount * 0.55, unit: 'kg', family: 'mass', basis: 'continuous', scope: 'pack', uncertainty_pct: 3, temporal_resolution_s: null, condition: null, provenance: prov('total_cell_mass_kg') },
      },
    }
  },
}

const stepRuntimeCalc: ToolStep = {
  tool_id: 'runtime:peukert-discharge',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 5,
    battery_kwh: c.quantities?.nameplate_capacity_kwh?.value ?? c.quantities?.battery_kwh?.value ?? 5,
    inverter_efficiency_pct: c.quantities?.efficiency_pct?.value ?? 96,
    load_factor: 1.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { runtime_min_full_load: number; runtime_min_half_load: number }
    const prov = (f: string) => ({ source: 'tool:runtime:peukert-discharge' as const, tool_id: 'runtime:peukert-discharge', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/ups', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        runtime_min_full_load: { value: out.runtime_min_full_load ?? 15, unit: 'min', family: 'time', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '100% load BoL', provenance: prov('runtime_min_full_load') },
        runtime_min_half_load: { value: out.runtime_min_half_load ?? 35, unit: 'min', family: 'time', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '50% load BoL', provenance: prov('runtime_min_half_load') },
      },
    }
  },
}

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: ['coolprop:refrigerant-properties'] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 5,
    dc_bus_voltage_v: 48,
    ac_output_voltage_v: 230,
    topology: 'online_double_conversion' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { inverter_efficiency_pct: number; rectifier_efficiency_pct: number; thd_output_pct: number }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0' as const, tool_source_url: 'ngspice.sourceforge.io', invocation_output_field: f, duration_ms: 0 })
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 5
    const upsMacro = {
      word_name: 'ups_inverter_module',
      unit_price_gbp: 280,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 280 * ratedKw,
      source_detail: `ngspice-derived: £280/kW × ${ratedKw} kW = £${(280 * ratedKw).toLocaleString()} (APC Smart-UPS RT class IGBT online, η=${(out.inverter_efficiency_pct ?? 96).toFixed(1)}%)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'ups_inverter_module'),
        upsMacro,
      ],
      quantities: {
        ...c.quantities,
        inverter_efficiency_pct: { value: out.inverter_efficiency_pct ?? 96, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0.5, temporal_resolution_s: null, condition: 'rated load', provenance: prov('inverter_efficiency_pct') },
        rectifier_efficiency_pct: { value: out.rectifier_efficiency_pct ?? 97, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0.5, temporal_resolution_s: null, condition: 'AC input PFC', provenance: prov('rectifier_efficiency_pct') },
        thd_output_pct: { value: out.thd_output_pct ?? 2.5, unit: '%', family: 'dimensionless', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'linear load', provenance: prov('thd_output_pct') },
      },
    }
  },
}

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ fluid: 'air', temperature_c: 35 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cp_liquid_kj_kgk: number | null }
    const prov = (f: string) => ({ source: 'tool:coolprop:refrigerant-properties' as const, tool_id: 'coolprop:refrigerant-properties', tool_version: '7.2.0', tool_license: 'MIT' as const, tool_source_url: 'coolprop.org', invocation_output_field: f, duration_ms: 0 })
    const quantityUpdates: any = {}
    if (out?.cp_liquid_kj_kgk !== null && out?.cp_liquid_kj_kgk !== undefined) {
      quantityUpdates.coolant_cp_kj_kgk = { value: out.cp_liquid_kj_kgk, unit: 'kJ/(kg·K)', family: 'specific_heat', basis: 'rated', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'air 35°C', provenance: prov('cp_liquid_kj_kgk') }
    }
    return { ...c, quantities: { ...c.quantities, ...quantityUpdates } }
  },
}

const stepPandaPower: ToolStep = {
  tool_id: 'pandapower:grid-integration',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 5,
    pcc_voltage_kv: 0.4,
    region: 'EU' as const,
    grid_strength: 'medium' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { pcc_short_circuit_ka: number }
    const prov = (f: string) => ({ source: 'tool:pandapower:grid-integration' as const, tool_id: 'pandapower:grid-integration', tool_version: '3.4.0', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/e2nIEE/pandapower', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        pcc_short_circuit_ka: { value: out.pcc_short_circuit_ka ?? 6, unit: 'kA', family: 'current', basis: 'peak', scope: 'site', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'fault', provenance: prov('pcc_short_circuit_ka') },
      },
    }
  },
}

const stepCellBalance: ToolStep = {
  tool_id: 'cell-balance:model',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cell_count: c.quantities?.cell_count?.value ?? 16,
    cell_capacity_ah: 20,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { balance_current_ma: number }
    const prov = (f: string) => ({ source: 'tool:cell-balance:model' as const, tool_id: 'cell-balance:model', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/bms', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        balance_current_ma: { value: out.balance_current_ma ?? 200, unit: 'mA', family: 'current', basis: 'continuous', scope: 'cell', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'passive resistor balancing', provenance: prov('balance_current_ma') },
      },
    }
  },
}

const stepWarrantyReliability: ToolStep = {
  tool_id: 'warranty-reliability:battery',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ cell_chemistry: 'lfp', cycles_per_year: 30, design_life_years: 10, dod_fraction: 0.80 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { warranty_years: number; eol_capacity_pct: number }
    const prov = (f: string) => ({ source: 'tool:warranty-reliability:battery' as const, tool_id: 'warranty-reliability:battery', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/reliability', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        battery_warranty_years: { value: out.warranty_years ?? 5, unit: 'yr', family: 'time', basis: 'lifetime', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'OEM warranty', provenance: prov('warranty_years') },
        eol_capacity_pct: { value: out.eol_capacity_pct ?? 80, unit: '%', family: 'dimensionless', basis: 'lifetime', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'BoL → EoL definition', provenance: prov('eol_capacity_pct') },
      },
    }
  },
}

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 5
    const cellMass = c.quantities?.total_cell_mass_kg?.value ?? 10
    return {
      total_cell_mass_kg: cellMass,
      transformer_mass_kg: null,
      rack_count: 1,
      max_mass_kg_envelope: c.quantities?.brief_mass_cap_kg?.value ?? 60,
      pcs_mass_kg_estimate: ratedKw * 4,
      container_tare_kg_estimate: 0,
      rack_mass_kg_each_estimate: 5,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 35, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'inverter + battery + cabinet', provenance: prov('total_system_mass_kg') },
      },
    }
  },
}

const stepRegulatoryCert: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'ups_inverter', region: 'EU' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_cert_cost_gbp: number; mandatory_count: number }
    const prov = (f: string) => ({ source: 'tool:regulatory-cert-cost:lookup' as const, tool_id: 'regulatory-cert-cost:lookup', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/regulatory', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        regulatory_cert_cost_gbp: { value: out.total_cert_cost_gbp ?? 18000, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'IEC 62040-1/-2', provenance: prov('total_cert_cost_gbp') },
        regulatory_mandatory_count: { value: out.mandatory_count ?? 4, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'IEC 62040-1/-2/-3, EN 62619', provenance: prov('mandatory_count') },
      },
    }
  },
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ total_mass_kg: c.quantities?.total_system_mass_kg?.value ?? 35, materials: ['steel', 'copper', 'lfp', 'polymer'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { embodied_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/lca', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, embodied_co2_kg: { value: out.embodied_co2_kg ?? 180, unit: 'kg CO₂e', family: 'mass', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'cradle-to-gate', provenance: prov('embodied_co2_kg') } } }
  },
}

const stepSupplyChain: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ critical_parts: ['LFP_cell', 'IGBT', 'film_cap'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { overall_risk_score: number }
    const prov = (f: string) => ({ source: 'tool:supply-chain-risk:scoring' as const, tool_id: 'supply-chain-risk:scoring', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/scr', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, supply_chain_risk_score: { value: out.overall_risk_score ?? 5.5, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: null, provenance: prov('overall_risk_score') } } }
  },
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ system_type: 'ups_inverter' }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { mtbf_hours: number }
    const prov = (f: string) => ({ source: 'tool:reliability-fmea:system' as const, tool_id: 'reliability-fmea:system', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/fmea', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, mtbf_hours: { value: out.mtbf_hours ?? 200000, unit: 'h', family: 'time', basis: 'mtbf', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'IEC 62380', provenance: prov('mtbf_hours') } } }
  },
}

const stepCyberThreat: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ connectivity: ['snmp', 'ethernet', 'rs232'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { stride_total_score: number }
    const prov = (f: string) => ({ source: 'tool:cybersecurity-threat-model:stride' as const, tool_id: 'cybersecurity-threat-model:stride', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/stride', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, stride_threat_score: { value: out.stride_total_score ?? 4.5, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: null, provenance: prov('stride_total_score') } } }
  },
}

const stepTransportLogistics: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ mass_kg: c.quantities?.total_system_mass_kg?.value ?? 35, packed_dim_mm: [600, 250, 300] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { transport_cost_gbp: number }
    const prov = (f: string) => ({ source: 'tool:transport-logistics:routing' as const, tool_id: 'transport-logistics:routing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/transport', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, transport_cost_gbp: { value: out.transport_cost_gbp ?? 25, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'courier UK domestic', provenance: prov('transport_cost_gbp') } } }
  },
}

void ruleQuantityRatio
const rules = [
  ruleRange('ups_inverter.power_envelope', 'rated_power_kw in [1, 20]', 'rated_power_kw', 1, 20, 'warning'),
  ruleRange('ups_inverter.efficiency_minimum', 'inverter η ≥ 94% double-conversion', 'inverter_efficiency_pct', 94, 100, 'warning'),
  ruleRange('ups_inverter.runtime_minimum', 'runtime ≥ 5 min @ full load', 'runtime_min_full_load', 5, 600, 'warning'),
  ruleRange('ups_inverter.thd_output', 'output THD ≤ 5% (linear load)', 'thd_output_pct', 0, 5, 'warning'),
  ruleRange('ups_inverter.regulatory_coverage', '≥ 3 mandatory standards', 'regulatory_mandatory_count', 3, 100, 'warning'),
  ruleRange('ups_inverter.mass_envelope', 'total mass ≤ 60 kg (single-person handling)', 'total_system_mass_kg', 0, 60, 'warning'),
  ruleRange('ups_inverter.eol_capacity', 'EoL definition 70-85% BoL', 'eol_capacity_pct', 70, 85, 'warning'),
]

export const UPS_INVERTER_PLAN: ClassToolPlan = {
  id: 'ups_inverter:online',
  envelope_predicate: (e) => e.class === 'ups_inverter',
  tools: [
    stepPybamm,
    stepRuntimeCalc,
    stepNgspice,
    stepCoolProp,
    stepPandaPower,
    stepCellBalance,
    stepWarrantyReliability,
    stepMassAggregator,
    stepRegulatoryCert,
    stepLifecycleCo2,
    stepSupplyChain,
    stepReliabilityFmea,
    stepCyberThreat,
    stepTransportLogistics,
  ],
  coupled_pairs: [
    ['pybamm:cell-sizing', 'runtime:peukert-discharge'],
    ['ngspice:pcs-simulation', 'coolprop:refrigerant-properties'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 2.0,
  consistency_rules: rules,
}

registerPlan(UPS_INVERTER_PLAN)
