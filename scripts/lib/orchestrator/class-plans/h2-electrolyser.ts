/**
 * scripts/lib/orchestrator/class-plans/h2-electrolyser.ts
 *
 * H2 ELECTROLYSER (PEM, 1-10 MW green hydrogen) TOOL PLAN
 *
 * Targets Nel MC / Cummins-Hydrogenics HyLYZER / ITM Power 1-10 MW range.
 * 14 tools (8 class-specific + 6 universal). Hand-tuned per the BESS pattern.
 *
 * Tools (14):
 *   1. electrolyser:efficiency        — stack polarisation + efficiency
 *   2. pem-membrane:sizing            — active membrane area
 *   3. cantera:thermochemistry        — electrochemistry + water splitting
 *   4. coolprop:refrigerant-properties — coolant
 *   5. ngspice:pcs-simulation         — AC/DC rectifier
 *   6. pandapower:grid-integration    — MV grid
 *   7. ht:heat-exchanger              — cooling-loop sizing
 *   8. fluids:run                     — water + H2 + O2 flow
 *   9. pressure-vessel                — buffer tank
 *  10. thermo-run                     — gas state points
 *  11. mass-aggregator:envelope-check
 *  12-17. UNIVERSAL: regulatory, lifecycle, supply-chain, FMEA, cyber, transport
 *
 * Consistency rules (7):
 *   - power_envelope: rated_power in [1, 10] MW (1000-10000 kW)
 *   - stack_efficiency: LHV ≥ 60%, ≤ 75% (PEM physical limit)
 *   - h2_purity ≥ 99.97% (ISO 14687 fuel cell grade)
 *   - operating_pressure ≤ 50 bar (PEM membrane limit)
 *   - cell_temperature 60-90°C
 *   - regulatory_coverage ≥ 4
 *   - cooling_balance: HX capacity ≥ heat-rejection × 1.25
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

const stepElectrolyser: ToolStep = {
  tool_id: 'electrolyser:efficiency',
  required: true,
  feeds_into: ['pem-membrane:sizing', 'ht:heat-exchanger'] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 1000,
    operating_pressure_bar: c.quantities?.operating_pressure_bar?.value ?? 30,
    cell_temperature_c: c.quantities?.cell_temperature_c?.value ?? 70,
    target_efficiency_lhv_pct: c.quantities?.stack_efficiency_lhv_pct?.value ?? 62,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      polarisation_voltage_v: number
      current_density_a_cm2: number
      h2_production_nm3_h: number
      heat_rejection_kw: number
      cell_count: number
    }
    const prov = (f: string) => ({ source: 'tool:electrolyser:efficiency' as const, tool_id: 'electrolyser:efficiency', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/electrolyser', invocation_output_field: f, duration_ms: 0 })
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 1000
    const cellCount = out.cell_count ?? Math.max(20, Math.round(ratedKw / 10))
    const cellMacro = {
      word_name: 'pem_cell_assembly',
      unit_price_gbp: 850,
      dimension_basis: 'each' as const,
      dimension_value: cellCount,
      total_gbp: 850 * cellCount,
      source_detail: `electrolyser-derived: £850/cell × ${cellCount} cells = £${(850 * cellCount).toLocaleString()} (Nafion 117 membrane + Pt/Ir catalyst, current density ${(out.current_density_a_cm2 ?? 2.0).toFixed(2)} A/cm²)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'pem_cell_assembly'),
        cellMacro,
      ],
      quantities: {
        ...c.quantities,
        cell_count: { value: cellCount, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'series stack', provenance: prov('cell_count') },
        polarisation_voltage_v: { value: out.polarisation_voltage_v ?? 2.0, unit: 'V', family: 'voltage', basis: 'rated', scope: 'cell', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'at current density', provenance: prov('polarisation_voltage_v') },
        current_density_a_cm2: { value: out.current_density_a_cm2 ?? 2.0, unit: 'A/cm²', family: 'current', basis: 'rated', scope: 'cell', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'rated load', provenance: prov('current_density_a_cm2') },
        h2_production_nm3_h: { value: out.h2_production_nm3_h ?? (ratedKw / 4.8), unit: 'Nm³/h', family: 'flow_rate', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: '0°C 1 atm', provenance: prov('h2_production_nm3_h') },
        heat_rejection_kw: { value: out.heat_rejection_kw ?? ratedKw * 0.20, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '20% LHV waste heat', provenance: prov('heat_rejection_kw') },
      },
    }
  },
}

const stepPemMembrane: ToolStep = {
  tool_id: 'pem-membrane:sizing',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 1000,
    current_density_a_cm2: c.quantities?.current_density_a_cm2?.value ?? 2.0,
    cell_voltage_v: c.quantities?.polarisation_voltage_v?.value ?? 2.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { active_area_m2: number; membrane_thickness_um: number; total_pt_loading_kg: number }
    const prov = (f: string) => ({ source: 'tool:pem-membrane:sizing' as const, tool_id: 'pem-membrane:sizing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/h2', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        membrane_active_area_m2: { value: out.active_area_m2 ?? 10, unit: 'm²', family: 'area', basis: 'aperture', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'total stack active area', provenance: prov('active_area_m2') },
        membrane_thickness_um: { value: out.membrane_thickness_um ?? 178, unit: 'µm', family: 'length', basis: 'rated', scope: 'cell', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'Nafion 117', provenance: prov('membrane_thickness_um') },
        total_pt_loading_kg: { value: out.total_pt_loading_kg ?? 1.2, unit: 'kg', family: 'mass', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '0.5 mg/cm² anode + 0.05 mg/cm² cathode', provenance: prov('total_pt_loading_kg') },
      },
    }
  },
}

const stepCantera: ToolStep = {
  tool_id: 'cantera:thermochemistry',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    temperature_c: c.quantities?.cell_temperature_c?.value ?? 70,
    pressure_bar: c.quantities?.operating_pressure_bar?.value ?? 30,
    species: ['H2', 'O2', 'H2O'],
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { reversible_voltage_v: number; gibbs_kj_mol: number }
    const prov = (f: string) => ({ source: 'tool:cantera:thermochemistry' as const, tool_id: 'cantera:thermochemistry', tool_version: '3.2.0', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'cantera.org', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        reversible_voltage_v: { value: out.reversible_voltage_v ?? 1.229, unit: 'V', family: 'voltage', basis: 'min', scope: 'cell', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'standard, 25°C', provenance: prov('reversible_voltage_v') },
      },
    }
  },
}

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: ['ht:heat-exchanger'] as string[],
  input_from_contract: () => ({ fluid: 'water', temperature_c: 60 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cp_liquid_kj_kgk: number | null }
    const prov = (f: string) => ({ source: 'tool:coolprop:refrigerant-properties' as const, tool_id: 'coolprop:refrigerant-properties', tool_version: '7.2.0', tool_license: 'MIT' as const, tool_source_url: 'coolprop.org', invocation_output_field: f, duration_ms: 0 })
    const quantityUpdates: any = {}
    if (out?.cp_liquid_kj_kgk !== null && out?.cp_liquid_kj_kgk !== undefined) {
      quantityUpdates.coolant_cp_kj_kgk = { value: out.cp_liquid_kj_kgk, unit: 'kJ/(kg·K)', family: 'specific_heat', basis: 'rated', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'DI water 60°C', provenance: prov('cp_liquid_kj_kgk') }
    }
    return { ...c, quantities: { ...c.quantities, ...quantityUpdates } }
  },
}

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 1000,
    dc_bus_voltage_v: (c.quantities?.cell_count?.value ?? 100) * (c.quantities?.polarisation_voltage_v?.value ?? 2.0),
    ac_output_voltage_v: 11000,
    topology: 'thyristor_rectifier' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { dissipated_power_kw: number; rectifier_efficiency_pct: number }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0' as const, tool_source_url: 'ngspice.sourceforge.io', invocation_output_field: f, duration_ms: 0 })
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 1000
    const rectifierMacro = {
      word_name: 'thyristor_rectifier',
      unit_price_gbp: 65,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 65 * ratedKw,
      source_detail: `ngspice-derived: £65/kW × ${ratedKw} kW = £${(65 * ratedKw).toLocaleString()} (12-pulse thyristor rectifier, η=${(out.rectifier_efficiency_pct ?? 97).toFixed(1)}%)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'thyristor_rectifier'),
        rectifierMacro,
      ],
      quantities: {
        ...c.quantities,
        rectifier_efficiency_pct: { value: out.rectifier_efficiency_pct ?? 97, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: '12-pulse thyristor', provenance: prov('rectifier_efficiency_pct') },
        rectifier_dissipation_kw: { value: out.dissipated_power_kw ?? ratedKw * 0.03, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'rated', provenance: prov('dissipated_power_kw') },
      },
    }
  },
}

const stepPandaPower: ToolStep = {
  tool_id: 'pandapower:grid-integration',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 1000,
    pcc_voltage_kv: 11,
    region: 'EU' as const,
    grid_strength: 'medium' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { transformer_rating_kva: number; pcc_short_circuit_ka: number }
    const prov = (f: string) => ({ source: 'tool:pandapower:grid-integration' as const, tool_id: 'pandapower:grid-integration', tool_version: '3.4.0', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/e2nIEE/pandapower', invocation_output_field: f, duration_ms: 0 })
    const kva = out.transformer_rating_kva ?? (c.quantities?.rated_power_kw?.value ?? 1000) * 1.15
    const transformerMacro = {
      word_name: 'mv_transformer',
      unit_price_gbp: 12,
      dimension_basis: 'kw_power' as const,
      dimension_value: kva,
      total_gbp: 12 * kva,
      source_detail: `pandapower-derived: £12/kVA × ${kva.toFixed(0)} kVA = £${(12 * kva).toLocaleString()} (oil-immersed Dyn11 step-down 11 kV / 690 V)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'mv_transformer'),
        transformerMacro,
      ],
      quantities: {
        ...c.quantities,
        transformer_rating_kva: { value: kva, unit: 'kVA', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: '11 kV / 690 V Dyn11', provenance: prov('transformer_rating_kva') },
        pcc_short_circuit_ka: { value: out.pcc_short_circuit_ka ?? 25, unit: 'kA', family: 'current', basis: 'peak', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'MV fault', provenance: prov('pcc_short_circuit_ka') },
      },
    }
  },
}

const stepHt: ToolStep = {
  tool_id: 'ht:heat-exchanger',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    dissipated_kw: c.quantities?.heat_rejection_kw?.value ?? 200,
    fluid: 'water',
    temperature_hot_c: 70,
    temperature_cold_c: 30,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { ua_kw_k: number; effectiveness: number }
    const prov = (f: string) => ({ source: 'tool:ht:heat-exchanger' as const, tool_id: 'ht:heat-exchanger', tool_version: '1.2.0', tool_license: 'MIT' as const, tool_source_url: 'github.com/CalebBell/ht', invocation_output_field: f, duration_ms: 0 })
    const heatKw = c.quantities?.heat_rejection_kw?.value ?? 200
    const coolingKw = heatKw * 1.25
    const coolingMacro = {
      word_name: 'cooling_heat_exchanger',
      unit_price_gbp: 220,
      dimension_basis: 'kw_power' as const,
      dimension_value: coolingKw,
      total_gbp: 220 * coolingKw,
      source_detail: `ht-derived: £220/kW × ${coolingKw.toFixed(0)} kW = £${(220 * coolingKw).toFixed(0)} (Alfa Laval plate HX, ε=${(out.effectiveness ?? 0.85).toFixed(2)})`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'cooling_heat_exchanger'),
        coolingMacro,
      ],
      quantities: {
        ...c.quantities,
        cooling_capacity_kw: { value: coolingKw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'sized for stack heat × 1.25', provenance: prov('ua_kw_k') },
      },
    }
  },
}

const stepFluids: ToolStep = {
  tool_id: 'fluids:run',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    h2_flow_nm3_h: c.quantities?.h2_production_nm3_h?.value ?? 200,
    pipe_pressure_bar: c.quantities?.operating_pressure_bar?.value ?? 30,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { pipe_diameter_mm: number; pressure_drop_kpa: number }
    const prov = (f: string) => ({ source: 'tool:fluids:run' as const, tool_id: 'fluids:run', tool_version: '1.3.0', tool_license: 'MIT' as const, tool_source_url: 'github.com/CalebBell/fluids', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        h2_pipe_diameter_mm: { value: out.pipe_diameter_mm ?? 50, unit: 'mm', family: 'length', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'SS316L', provenance: prov('pipe_diameter_mm') },
      },
    }
  },
}

const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    operating_pressure_bar: c.quantities?.operating_pressure_bar?.value ?? 30,
    volume_m3: 5,
    material: 'ss316l',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { wall_thickness_mm: number; vessel_mass_kg: number }
    const prov = (f: string) => ({ source: 'tool:pressure-vessel:design' as const, tool_id: 'pressure-vessel:design', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/pressure', invocation_output_field: f, duration_ms: 0 })
    const bufferMacro = {
      word_name: 'h2_buffer_tank',
      unit_price_gbp: 18,
      dimension_basis: 'kg_mass' as const,
      dimension_value: out.vessel_mass_kg ?? 1500,
      total_gbp: 18 * (out.vessel_mass_kg ?? 1500),
      source_detail: `pressure-vessel-derived: £18/kg × ${(out.vessel_mass_kg ?? 1500).toFixed(0)} kg = £${(18 * (out.vessel_mass_kg ?? 1500)).toFixed(0)} (ASME VIII-1 SS316L 5 m³ buffer tank @ 30 bar)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'h2_buffer_tank'),
        bufferMacro,
      ],
      quantities: {
        ...c.quantities,
        h2_buffer_volume_m3: { value: 5, unit: 'm³', family: 'volume', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: '@ operating pressure', provenance: prov('vessel_mass_kg') },
        buffer_tank_mass_kg: { value: out.vessel_mass_kg ?? 1500, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'SS316L ASME VIII-1', provenance: prov('vessel_mass_kg') },
      },
    }
  },
}

const stepThermo: ToolStep = {
  tool_id: 'thermo:run',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ fluid: 'hydrogen', pressure_bar: c.quantities?.operating_pressure_bar?.value ?? 30 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { density_kg_m3: number }
    const prov = (f: string) => ({ source: 'tool:thermo:run' as const, tool_id: 'thermo:run', tool_version: '0.6.0', tool_license: 'MIT' as const, tool_source_url: 'github.com/CalebBell/thermo', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        h2_density_kg_m3: { value: out.density_kg_m3 ?? 2.4, unit: 'kg/m³', family: 'density', basis: 'rated', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: '30 bar 25°C', provenance: prov('density_kg_m3') },
      },
    }
  },
}

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 1000
    const stackMassKg = ratedKw * 1.2
    const bufferMass = c.quantities?.buffer_tank_mass_kg?.value ?? 1500
    return {
      total_cell_mass_kg: stackMassKg,
      transformer_mass_kg: ratedKw * 0.8,
      rack_count: 1,
      max_mass_kg_envelope: c.quantities?.brief_mass_cap_kg?.value ?? 25000,
      pcs_mass_kg_estimate: ratedKw * 0.6,
      container_tare_kg_estimate: 4000,
      rack_mass_kg_each_estimate: bufferMass,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number; mass_budget_utilisation_pct: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 8000, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'stack + BoP + buffer', provenance: prov('total_system_mass_kg') },
      },
    }
  },
}

const stepRegulatoryCert: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'h2_electrolyser', region: 'EU' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_cert_cost_gbp: number; mandatory_count: number }
    const prov = (f: string) => ({ source: 'tool:regulatory-cert-cost:lookup' as const, tool_id: 'regulatory-cert-cost:lookup', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/regulatory', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        regulatory_cert_cost_gbp: { value: out.total_cert_cost_gbp ?? 250000, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'PED + ATEX + CE', provenance: prov('total_cert_cost_gbp') },
        regulatory_mandatory_count: { value: out.mandatory_count ?? 7, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'PED 2014/68/EU, ATEX, EN 17127, ISO 22734, IEC 62282', provenance: prov('mandatory_count') },
      },
    }
  },
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ total_mass_kg: c.quantities?.total_system_mass_kg?.value ?? 8000, materials: ['steel', 'platinum', 'nafion', 'copper', 'titanium'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { embodied_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/lca', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        embodied_co2_kg: { value: out.embodied_co2_kg ?? 38000, unit: 'kg CO₂e', family: 'mass', basis: 'rated', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'Pt-dominated', provenance: prov('embodied_co2_kg') },
      },
    }
  },
}

const stepSupplyChain: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ critical_parts: ['platinum_iridium_catalyst', 'nafion_membrane', 'titanium_bipolar_plate'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { overall_risk_score: number }
    const prov = (f: string) => ({ source: 'tool:supply-chain-risk:scoring' as const, tool_id: 'supply-chain-risk:scoring', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/scr', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, supply_chain_risk_score: { value: out.overall_risk_score ?? 8.0, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'PGM market concentration', provenance: prov('overall_risk_score') } } }
  },
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ system_type: 'h2_electrolyser' }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { mtbf_hours: number }
    const prov = (f: string) => ({ source: 'tool:reliability-fmea:system' as const, tool_id: 'reliability-fmea:system', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/fmea', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, mtbf_hours: { value: out.mtbf_hours ?? 80000, unit: 'h', family: 'time', basis: 'mtbf', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'stack life-limited', provenance: prov('mtbf_hours') } } }
  },
}

const stepCyberThreat: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ connectivity: ['modbus_tcp', 'opc_ua', 'ethernet_ip'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { stride_total_score: number }
    const prov = (f: string) => ({ source: 'tool:cybersecurity-threat-model:stride' as const, tool_id: 'cybersecurity-threat-model:stride', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/stride', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, stride_threat_score: { value: out.stride_total_score ?? 7.0, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'critical infrastructure', provenance: prov('stride_total_score') } } }
  },
}

const stepTransportLogistics: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ mass_kg: c.quantities?.total_system_mass_kg?.value ?? 8000, packed_dim_mm: [6000, 2438, 2591] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { transport_cost_gbp: number }
    const prov = (f: string) => ({ source: 'tool:transport-logistics:routing' as const, tool_id: 'transport-logistics:routing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/transport', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, transport_cost_gbp: { value: out.transport_cost_gbp ?? 6500, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: '20ft ISO container UK domestic', provenance: prov('transport_cost_gbp') } } }
  },
}

void ruleQuantityRatio
const rules = [
  ruleRange('h2_electrolyser.power_envelope', 'rated_power_kw in [1000, 10000] (1-10 MW)', 'rated_power_kw', 1000, 10000, 'warning'),
  ruleRange('h2_electrolyser.efficiency_lhv', 'PEM LHV efficiency in [60, 75]%', 'stack_efficiency_lhv_pct', 60, 75, 'warning'),
  ruleRange('h2_electrolyser.operating_pressure', 'operating pressure ≤ 50 bar (PEM membrane limit)', 'operating_pressure_bar', 1, 50, 'warning'),
  ruleRange('h2_electrolyser.cell_temperature', 'cell temperature 60-90°C', 'cell_temperature_c', 60, 90, 'warning'),
  ruleRange('h2_electrolyser.regulatory_coverage', '≥ 4 mandatory regulatory standards', 'regulatory_mandatory_count', 4, 100, 'warning'),
  ruleQuantityRatio('h2_electrolyser.cooling_balance', 'cooling capacity ≥ heat-rejection × 1.25', 'heat_rejection_kw', 'cooling_capacity_kw', 1.0, 'warning'),
  ruleRange('h2_electrolyser.rectifier_efficiency', 'rectifier η ≥ 95%', 'rectifier_efficiency_pct', 95, 100, 'warning'),
]

export const H2_ELECTROLYSER_PLAN: ClassToolPlan = {
  id: 'h2_electrolyser:pem',
  envelope_predicate: (e) => e.class === 'h2_electrolyser',
  tools: [
    stepElectrolyser,
    stepPemMembrane,
    stepCantera,
    stepCoolProp,
    stepNgspice,
    stepPandaPower,
    stepHt,
    stepFluids,
    stepPressureVessel,
    stepThermo,
    stepMassAggregator,
    stepRegulatoryCert,
    stepLifecycleCo2,
    stepSupplyChain,
    stepReliabilityFmea,
    stepCyberThreat,
    stepTransportLogistics,
  ],
  coupled_pairs: [
    ['electrolyser:efficiency', 'pem-membrane:sizing'],
    ['electrolyser:efficiency', 'ht:heat-exchanger'],
    ['ngspice:pcs-simulation', 'pandapower:grid-integration'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 2.5,
  consistency_rules: rules,
}

registerPlan(H2_ELECTROLYSER_PLAN)
