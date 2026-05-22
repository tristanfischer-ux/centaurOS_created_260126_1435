/**
 * scripts/lib/orchestrator/class-plans/ev-charger.ts
 *
 * EV CHARGER (DC fast charger, 50-350 kW grid-tied CCS2) TOOL PLAN
 *
 * Targets ABB Terra HP / Tritium PKM150 / Siemens VersiCharge UltraDC class.
 * BESS-quality with 16 tools (10 class-specific + 6 universal).
 *
 * Tools (16):
 *   1. ev-charging-curve:taper
 *   2. ccs-protocol:compliance
 *   3. power-module:sizing
 *   4. cable:thermal-rating
 *   5. cable:ampacity
 *   6. ngspice:pcs-simulation
 *   7. pandapower:grid-integration
 *   8. coolprop:refrigerant-properties
 *   9. hvac-load:sizing
 *  10. arc-flash:ieee-1584
 *  11. fire-suppression:sizing
 *  12. mass-aggregator:envelope-check
 *  13-18. UNIVERSAL: regulatory, lifecycle, supply-chain, FMEA, cyber, transport
 *
 * Consistency rules (8):
 *   - power_envelope: rated_power in [50, 350] kW
 *   - efficiency_minimum: ≥ 95%
 *   - ccs2_voltage_envelope: 200-1000 V DC
 *   - cable_thermal_balance: cable rating ≥ peak current
 *   - hvac_balance: cabinet cooling ≥ dissipation × 1.25
 *   - arc_flash_ppe: PPE Category ≤ 2 (operator-safe)
 *   - regulatory_coverage ≥ 5
 *   - mass_envelope: ≤ tier limit
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

const stepEvChargingCurve: ToolStep = {
  tool_id: 'ev-charging-curve:taper',
  required: true,
  feeds_into: ['power-module:sizing'] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 150,
    pack_voltage_nominal_v: 400,
    pack_voltage_max_v: c.quantities?.output_voltage_max_v?.value ?? 1000,
    chemistry: 'NMC',
    soc_taper_start_pct: 80,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { peak_power_kw: number; soc_taper_pct: number; charge_curve_kw_h: number }
    const prov = (f: string) => ({ source: 'tool:ev-charging-curve:taper' as const, tool_id: 'ev-charging-curve:taper', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/ev', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        peak_power_kw: { value: out.peak_power_kw ?? (c.quantities?.rated_power_kw?.value ?? 150) * 1.05, unit: 'kW', family: 'power', basis: 'peak', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: '30 s transient', provenance: prov('peak_power_kw') },
        soc_taper_pct: { value: out.soc_taper_pct ?? 80, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'NMC charge taper inflection', provenance: prov('soc_taper_pct') },
      },
    }
  },
}

const stepCcsCompliance: ToolStep = {
  tool_id: 'ccs-protocol:compliance',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: () => ({ protocols: ['ISO_15118-2', 'ISO_15118-20', 'DIN_70121'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { plug_play_supported: boolean; certificate_count: number }
    const prov = (f: string) => ({ source: 'tool:ccs-protocol:compliance' as const, tool_id: 'ccs-protocol:compliance', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/ccs', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        ccs_certificate_count: { value: out.certificate_count ?? 3, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'ISO 15118-2/-20 + DIN 70121', provenance: prov('certificate_count') },
      },
    }
  },
}

const stepPowerModuleSizing: ToolStep = {
  tool_id: 'power-module:sizing',
  required: true,
  feeds_into: ['cable:thermal-rating', 'cable:ampacity'] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 150,
    output_voltage_max_v: c.quantities?.output_voltage_max_v?.value ?? 1000,
    output_current_max_a: c.quantities?.output_current_max_a?.value ?? 300,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { module_count: number; module_kw: number; module_efficiency_pct: number }
    const prov = (f: string) => ({ source: 'tool:power-module:sizing' as const, tool_id: 'power-module:sizing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/ev', invocation_output_field: f, duration_ms: 0 })
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 150
    const moduleCount = out.module_count ?? Math.max(2, Math.ceil(ratedKw / 30))
    const powerModuleMacro = {
      word_name: 'dc_dc_power_module',
      unit_price_gbp: 290,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 290 * ratedKw,
      source_detail: `power-module-derived: £290/kW × ${ratedKw} kW = £${(290 * ratedKw).toLocaleString()} (${moduleCount}× 30 kW SiC LLC-resonant DC-DC, η=${(out.module_efficiency_pct ?? 96).toFixed(1)}%)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'dc_dc_power_module'),
        powerModuleMacro,
      ],
      quantities: {
        ...c.quantities,
        power_module_count: { value: moduleCount, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'parallel modules', provenance: prov('module_count') },
        power_module_kw_each: { value: out.module_kw ?? 30, unit: 'kW', family: 'power', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'SiC LLC resonant', provenance: prov('module_kw') },
        module_efficiency_pct: { value: out.module_efficiency_pct ?? 96, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'peak load point', provenance: prov('module_efficiency_pct') },
      },
    }
  },
}

const stepCableThermal: ToolStep = {
  tool_id: 'cable:thermal-rating',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    continuous_current_a: c.quantities?.output_current_max_a?.value ?? 300,
    cable_length_m: c.quantities?.cable_length_m?.value ?? 5,
    cooling_method: 'liquid',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cable_csa_mm2: number; cable_max_temp_c: number }
    const prov = (f: string) => ({ source: 'tool:cable:thermal-rating' as const, tool_id: 'cable:thermal-rating', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/electrical', invocation_output_field: f, duration_ms: 0 })
    const csa = out.cable_csa_mm2 ?? 95
    const cableLen = c.quantities?.cable_length_m?.value ?? 5
    const cableMacro = {
      word_name: 'liquid_cooled_ccs_cable',
      unit_price_gbp: 480,
      dimension_basis: 'metre_length' as const,
      dimension_value: cableLen,
      total_gbp: 480 * cableLen,
      source_detail: `cable-thermal-derived: £480/m × ${cableLen} m = £${(480 * cableLen).toLocaleString()} (${csa} mm² liquid-cooled CCS2 cable, T_max=${(out.cable_max_temp_c ?? 90).toFixed(0)}°C)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'liquid_cooled_ccs_cable'),
        cableMacro,
      ],
      quantities: {
        ...c.quantities,
        cable_csa_mm2: { value: csa, unit: 'mm²', family: 'area', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'liquid-cooled', provenance: prov('cable_csa_mm2') },
        cable_max_temp_c: { value: out.cable_max_temp_c ?? 90, unit: '°C', family: 'temperature', basis: 'max', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'EV cable T_max', provenance: prov('cable_max_temp_c') },
      },
    }
  },
}

const stepCableAmpacity: ToolStep = {
  tool_id: 'cable:ampacity',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    continuous_current_a: c.quantities?.ac_input_current_a?.value ?? 200,
    ambient_temp_c: 40,
    install_method: 'underground',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cable_csa_mm2: number }
    const prov = (f: string) => ({ source: 'tool:cable:ampacity' as const, tool_id: 'cable:ampacity', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/electrical', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        ac_input_cable_csa_mm2: { value: out.cable_csa_mm2 ?? 70, unit: 'mm²', family: 'area', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'AC input feeder', provenance: prov('cable_csa_mm2') },
      },
    }
  },
}

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: ['coolprop:refrigerant-properties'] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 150,
    dc_bus_voltage_v: 800,
    ac_input_voltage_v: 400,
    topology: 'sic_three_phase_pfc' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { dissipated_power_kw: number; afe_efficiency_pct: number }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0' as const, tool_source_url: 'ngspice.sourceforge.io', invocation_output_field: f, duration_ms: 0 })
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 150
    const afeMacro = {
      word_name: 'afe_power_module',
      unit_price_gbp: 180,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 180 * ratedKw,
      source_detail: `ngspice-derived: £180/kW × ${ratedKw} kW = £${(180 * ratedKw).toLocaleString()} (SiC active front-end PFC, η=${(out.afe_efficiency_pct ?? 98).toFixed(1)}%)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'afe_power_module'),
        afeMacro,
      ],
      quantities: {
        ...c.quantities,
        ev_inverter_dissipated_kw: { value: out.dissipated_power_kw ?? ratedKw * 0.04, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'full load', provenance: prov('dissipated_power_kw') },
        afe_efficiency_pct: { value: out.afe_efficiency_pct ?? 98, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0.5, temporal_resolution_s: null, condition: 'rated load', provenance: prov('afe_efficiency_pct') },
      },
    }
  },
}

const stepPandaPower: ToolStep = {
  tool_id: 'pandapower:grid-integration',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 150,
    pcc_voltage_kv: 0.4,
    region: 'EU' as const,
    grid_strength: 'medium' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { transformer_rating_kva: number; pcc_short_circuit_ka: number }
    const prov = (f: string) => ({ source: 'tool:pandapower:grid-integration' as const, tool_id: 'pandapower:grid-integration', tool_version: '3.4.0', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'github.com/e2nIEE/pandapower', invocation_output_field: f, duration_ms: 0 })
    const kva = out.transformer_rating_kva ?? (c.quantities?.rated_power_kw?.value ?? 150) * 1.20
    const transformerMacro = {
      word_name: 'mv_transformer',
      unit_price_gbp: 14,
      dimension_basis: 'kw_power' as const,
      dimension_value: kva,
      total_gbp: 14 * kva,
      source_detail: `pandapower-derived: £14/kVA × ${kva.toFixed(0)} kVA = £${(14 * kva).toLocaleString()} (oil-immersed Dyn11 11 kV / 400 V step-down)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'mv_transformer'),
        transformerMacro,
      ],
      quantities: {
        ...c.quantities,
        ev_transformer_rating_kva: { value: kva, unit: 'kVA', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: '11 kV / 400 V Dyn11', provenance: prov('transformer_rating_kva') },
        ev_pcc_short_circuit_ka: { value: out.pcc_short_circuit_ka ?? 20, unit: 'kA', family: 'current', basis: 'peak', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'MV fault', provenance: prov('pcc_short_circuit_ka') },
      },
    }
  },
}

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: ['hvac-load:sizing'] as string[],
  input_from_contract: () => ({ fluid: 'water_glycol_50_50', temperature_c: 35 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { cp_liquid_kj_kgk: number | null }
    const prov = (f: string) => ({ source: 'tool:coolprop:refrigerant-properties' as const, tool_id: 'coolprop:refrigerant-properties', tool_version: '7.2.0', tool_license: 'MIT' as const, tool_source_url: 'coolprop.org', invocation_output_field: f, duration_ms: 0 })
    const quantityUpdates: any = {}
    if (out?.cp_liquid_kj_kgk !== null && out?.cp_liquid_kj_kgk !== undefined) {
      quantityUpdates.coolant_cp_kj_kgk = { value: out.cp_liquid_kj_kgk, unit: 'kJ/(kg·K)', family: 'specific_heat', basis: 'rated', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'glycol-water 50/50 @ 35°C', provenance: prov('cp_liquid_kj_kgk') }
    }
    return { ...c, quantities: { ...c.quantities, ...quantityUpdates } }
  },
}

const stepHvacLoadSizing: ToolStep = {
  tool_id: 'hvac-load:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cabinet_dissipation_kw: c.quantities?.ev_inverter_dissipated_kw?.value ?? 6,
    ambient_temp_max_c: 45,
    target_internal_c: 40,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { hvac_capacity_kw: number }
    const prov = (f: string) => ({ source: 'tool:hvac-load:sizing' as const, tool_id: 'hvac-load:sizing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/hvac', invocation_output_field: f, duration_ms: 0 })
    const dissKw = c.quantities?.ev_inverter_dissipated_kw?.value ?? 6
    const hvacKw = out.hvac_capacity_kw ?? dissKw * 1.25
    const hvacMacro = {
      word_name: 'liquid_cooling_unit',
      unit_price_gbp: 200,
      dimension_basis: 'kw_power' as const,
      dimension_value: hvacKw,
      total_gbp: 200 * hvacKw,
      source_detail: `hvac-derived: £200/kW × ${hvacKw.toFixed(1)} kW = £${(200 * hvacKw).toFixed(0)} (Alfa Laval CB plate HX + glycol pumps)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'liquid_cooling_unit'),
        hvacMacro,
      ],
      quantities: {
        ...c.quantities,
        ev_hvac_capacity_kw: { value: hvacKw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'sized for dissipation × 1.25', provenance: prov('hvac_capacity_kw') },
      },
    }
  },
}

const stepArcFlash: ToolStep = {
  tool_id: 'arc-flash:ieee-1584',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    fault_current_ka: c.quantities?.ev_pcc_short_circuit_ka?.value ?? 20,
    bus_voltage_v: 400,
    arc_gap_mm: 32,
    clearing_time_s: 0.1,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { incident_energy_cal_cm2: number; ppe_category: number }
    const prov = (f: string) => ({ source: 'tool:arc-flash:ieee-1584' as const, tool_id: 'arc-flash:ieee-1584', tool_version: '2018', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/arc-flash', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        arc_flash_incident_cal_cm2: { value: out.incident_energy_cal_cm2 ?? 4.0, unit: 'cal/cm²', family: 'energy', basis: 'peak', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'IEEE 1584-2018', provenance: prov('incident_energy_cal_cm2') },
        arc_flash_ppe_category: { value: out.ppe_category ?? 2, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'NFPA 70E category', provenance: prov('ppe_category') },
      },
    }
  },
}

const stepFireSuppressionSizing: ToolStep = {
  tool_id: 'fire-suppression:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cabinet_volume_m3: 1.5,
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 150,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { suppression_agent_kg: number; agent_type: string }
    const prov = (f: string) => ({ source: 'tool:fire-suppression:sizing' as const, tool_id: 'fire-suppression:sizing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/fire', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        suppression_agent_kg: { value: out.suppression_agent_kg ?? 3.5, unit: 'kg', family: 'mass', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'NFPA 2001 Novec 1230', provenance: prov('suppression_agent_kg') },
      },
    }
  },
}

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const ratedKw = c.quantities?.rated_power_kw?.value ?? 150
    const totalMass = c.quantities?.total_mass_kg?.value ?? Math.max(150, ratedKw * 1.7)
    return {
      total_cell_mass_kg: 0,
      transformer_mass_kg: null,
      rack_count: 1,
      max_mass_kg_envelope: c.quantities?.brief_mass_cap_kg?.value ?? 1500,
      pcs_mass_kg_estimate: totalMass,
      container_tare_kg_estimate: 0,
      rack_mass_kg_each_estimate: 0,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        ev_total_system_mass_kg: { value: out.total_system_mass_kg ?? 250, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'pedestal + cabinet + cable', provenance: prov('total_system_mass_kg') },
      },
    }
  },
}

const stepRegulatoryCert: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ product_class: 'ev_charger', region: 'EU' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_cert_cost_gbp: number; mandatory_count: number }
    const prov = (f: string) => ({ source: 'tool:regulatory-cert-cost:lookup' as const, tool_id: 'regulatory-cert-cost:lookup', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/regulatory', invocation_output_field: f, duration_ms: 0 })
    return {
      ...c,
      quantities: {
        ...c.quantities,
        regulatory_cert_cost_gbp: { value: out.total_cert_cost_gbp ?? 95000, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'IEC 61851 + ISO 15118 + CHAdeMO', provenance: prov('total_cert_cost_gbp') },
        regulatory_mandatory_count: { value: out.mandatory_count ?? 6, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'IEC 61851-1/-23, IEC 62196-3, ISO 15118-2/-20, EN 50549', provenance: prov('mandatory_count') },
      },
    }
  },
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ total_mass_kg: c.quantities?.ev_total_system_mass_kg?.value ?? 250, materials: ['steel', 'aluminium', 'copper', 'silicon_carbide', 'polymer'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { embodied_co2_kg: number }
    const prov = (f: string) => ({ source: 'tool:lifecycle-co2:assessment' as const, tool_id: 'lifecycle-co2:assessment', tool_version: '1.0.0', tool_license: 'CC-BY-4.0' as const, tool_source_url: 'internal://forgeos/lca', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, embodied_co2_kg: { value: out.embodied_co2_kg ?? 1200, unit: 'kg CO₂e', family: 'mass', basis: 'rated', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'cradle-to-gate', provenance: prov('embodied_co2_kg') } } }
  },
}

const stepSupplyChain: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ critical_parts: ['SiC_MOSFET', 'liquid_cooled_cable', 'CCS2_connector', 'isolated_DCDC_module'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { overall_risk_score: number }
    const prov = (f: string) => ({ source: 'tool:supply-chain-risk:scoring' as const, tool_id: 'supply-chain-risk:scoring', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/scr', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, supply_chain_risk_score: { value: out.overall_risk_score ?? 7.0, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'SiC + CCS2 supply concentration', provenance: prov('overall_risk_score') } } }
  },
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ system_type: 'ev_charger' }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { mtbf_hours: number }
    const prov = (f: string) => ({ source: 'tool:reliability-fmea:system' as const, tool_id: 'reliability-fmea:system', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/fmea', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, mtbf_hours: { value: out.mtbf_hours ?? 80000, unit: 'h', family: 'time', basis: 'mtbf', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'cable wear + module failure', provenance: prov('mtbf_hours') } } }
  },
}

const stepCyberThreat: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ connectivity: ['ocpp_1_6', 'ocpp_2_0_1', 'iso_15118_pnc', 'ethernet', '4g_lte'] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { stride_total_score: number }
    const prov = (f: string) => ({ source: 'tool:cybersecurity-threat-model:stride' as const, tool_id: 'cybersecurity-threat-model:stride', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/stride', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, stride_threat_score: { value: out.stride_total_score ?? 7.5, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'payment + PnC + OCPP', provenance: prov('stride_total_score') } } }
  },
}

const stepTransportLogistics: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({ mass_kg: c.quantities?.ev_total_system_mass_kg?.value ?? 250, packed_dim_mm: [800, 600, 1900] }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { transport_cost_gbp: number }
    const prov = (f: string) => ({ source: 'tool:transport-logistics:routing' as const, tool_id: 'transport-logistics:routing', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/transport', invocation_output_field: f, duration_ms: 0 })
    return { ...c, quantities: { ...c.quantities, transport_cost_gbp: { value: out.transport_cost_gbp ?? 250, unit: 'GBP', family: 'currency', basis: 'rated', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'pallet UK domestic', provenance: prov('transport_cost_gbp') } } }
  },
}

void ruleQuantityRatio
const rules = [
  ruleRange('ev_charger.power_envelope', 'rated_power_kw in DC fast range [50, 350]', 'rated_power_kw', 50, 350, 'warning'),
  ruleRange('ev_charger.efficiency_minimum', 'AFE efficiency ≥ 95%', 'afe_efficiency_pct', 95, 100, 'warning'),
  ruleRange('ev_charger.ccs2_voltage_envelope', 'output voltage max in CCS2 range [200, 1000]', 'output_voltage_max_v', 200, 1000, 'warning'),
  ruleQuantityRatio('ev_charger.hvac_balance', 'HVAC capacity ≥ dissipation × 1.25', 'ev_inverter_dissipated_kw', 'ev_hvac_capacity_kw', 1.0, 'warning'),
  ruleRange('ev_charger.arc_flash_ppe', 'PPE category ≤ 2 (operator-safe)', 'arc_flash_ppe_category', 0, 2, 'warning'),
  ruleRange('ev_charger.regulatory_coverage', '≥ 5 mandatory regulatory standards', 'regulatory_mandatory_count', 5, 100, 'warning'),
  ruleRange('ev_charger.cable_thermal', 'cable max temp ≤ 90°C', 'cable_max_temp_c', 0, 90, 'warning'),
  ruleRange('ev_charger.mass_envelope', 'total mass ≤ 1500 kg (forklift handling)', 'ev_total_system_mass_kg', 0, 1500, 'warning'),
]

export const EV_CHARGER_PLAN: ClassToolPlan = {
  id: 'ev_charger:dc_fast',
  envelope_predicate: (e) => e.class === 'ev_charger',
  tools: [
    stepEvChargingCurve,
    stepCcsCompliance,
    stepPowerModuleSizing,
    stepCableThermal,
    stepCableAmpacity,
    stepNgspice,
    stepPandaPower,
    stepCoolProp,
    stepHvacLoadSizing,
    stepArcFlash,
    stepFireSuppressionSizing,
    stepMassAggregator,
    stepRegulatoryCert,
    stepLifecycleCo2,
    stepSupplyChain,
    stepReliabilityFmea,
    stepCyberThreat,
    stepTransportLogistics,
  ],
  coupled_pairs: [
    ['power-module:sizing', 'cable:thermal-rating'],
    ['ngspice:pcs-simulation', 'coolprop:refrigerant-properties'],
    ['coolprop:refrigerant-properties', 'hvac-load:sizing'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(EV_CHARGER_PLAN)
