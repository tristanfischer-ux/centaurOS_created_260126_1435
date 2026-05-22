/**
 * scripts/lib/orchestrator/class-plans/cryostat.ts
 *
 * CRYOSTAT (DILUTION REFRIGERATOR) TOOL PLAN — BESS-quality 2026-05-22.
 *
 * Models a Bluefors LD400 / Oxford Instruments Triton 500-class
 * commercial wet/dry dilution fridge. Reference architectures:
 *   - Bluefors LD400 (400 µW @ 100 mK, 20 mK base, 6× line ports)
 *   - Oxford Instruments Triton 500 (500 µW @ 100 mK, 8 mK base)
 *   - JT Cryostat NanoQT (700 µW @ 100 mK, 10 mK base)
 *
 * Tools wired (12):
 *   1. dilution-fridge:cooling-power    — cooling power vs. circulation rate
 *   2. cryocooler:sizing                — PT-pulse-tube pre-cooler 1.5 W @ 4K
 *   3. helium-circulation:dilution       — 3He flow, 4He recovery loop
 *   4. magnetic-shielding:mu-metal       — earth-field nulling for spin systems
 *   5. heat-pipe:sizing                  — 50K → 4K stage conduction
 *   6. mli:multi-layer-insulation        — radiation budget at 50K + 4K
 *   7. thermal-strap:conduction          — Cu/Al braid to MXC
 *   8. pcm:thermal-storage               — short-term thermal ballast
 *   9. pressure-vessel:design            — IVC + OVC vacuum chambers
 *  10. control-systems:pid-tuning        — temperature stabilisation
 *  11. mass-aggregator:envelope-check
 *  12-17. 6 universal tools
 *
 * Consistency rules (8):
 *   - cryostat.base_temp_mk             ≤ 30 mK (utility threshold)
 *   - cryostat.cooling_power_100mk_uw   ≥ 200 µW (operational baseline)
 *   - cryostat.cooldown_time_hr         ≤ 48 hr (commercial expectation)
 *   - cryostat.4k_load_margin           heat load ≤ cooler 4K capacity × 0.80
 *   - cryostat.50k_load_margin          heat load ≤ cooler 50K capacity × 0.80
 *   - cryostat.he3_flow_umol_s          in [200, 1500] (typical range)
 *   - cryostat.vacuum_leak_rate_mbar_l_s ≤ 1e-9 (IVC integrity)
 *   - cryostat.magnetic_shielding_db    ≥ 40 dB (DC + 50 Hz attenuation)
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleRange, ruleClosure } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure

// ---------------------------------------------------------------------------
// TOOL STEPS
// ---------------------------------------------------------------------------

// 1. dilution-fridge:cooling-power — main cooling power calc.
const stepDilutionFridge: ToolStep = {
  tool_id: 'dilution-fridge:cooling-power',
  required: false,
  feeds_into: ['helium-circulation:dilution'] as string[],
  input_from_contract: (c: any) => ({
    target_base_temp_mk: c.quantities?.base_temp_mk?.value ?? 20,
    target_cooling_power_uw_at_100mK: c.quantities?.cooling_power_uw_at_100mK?.value ?? 400,
    sample_space_mm: c.quantities?.sample_space_mm?.value ?? 100,
    he3_flow_umol_s: c.quantities?.he3_flow_umol_s?.value ?? 600,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    // 2026-05-22 smoke-fix #10 (cryostat): dilution_fridge_cooling_power.py
    // emits `achievable_base_temp_mk_at_zero_load`, NOT `actual_base_temp_mk`.
    // The contract_update was reading the wrong key, so quantity never landed
    // and consistency rule "missing quantity: actual_base_temp_mk" failed.
    const out = output as {
      achievable_base_temp_mk_at_zero_load?: number
      actual_base_temp_mk?: number
      cooling_power_uw_at_100mK?: number
      cooling_power_uw_at_20mK?: number
      condensing_line_power_w?: number
    }
    const prov = (f: string) => ({ source: 'tool:dilution-fridge:cooling-power' as const, tool_id: 'dilution-fridge:cooling-power', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/dilution-fridge', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    const baseTempMk = out?.actual_base_temp_mk ?? out?.achievable_base_temp_mk_at_zero_load
    if (typeof baseTempMk === 'number') {
      updates.actual_base_temp_mk = { value: baseTempMk, unit: 'mK', family: 'temperature', basis: 'min', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'no load, equilibrium', provenance: prov('achievable_base_temp_mk_at_zero_load') }
    }
    if (typeof out?.cooling_power_uw_at_100mK === 'number') {
      updates.cooling_power_uw_at_100mK = { value: out.cooling_power_uw_at_100mK, unit: 'µW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'at 100 mK still', provenance: prov('cooling_power_uw_at_100mK') }
    }
    if (typeof out?.cooling_power_uw_at_20mK === 'number') {
      updates.cooling_power_uw_at_20mK = { value: out.cooling_power_uw_at_20mK, unit: 'µW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'at MXC plate 20 mK', provenance: prov('cooling_power_uw_at_20mK') }
    }
    // BoM macro: complete dilution unit (gold-plated copper still + heat
    // exchanger sintered silver + MXC plate). Industry-typical £180k for a
    // 400 µW @ 100 mK unit from Bluefors / Oxford Instruments.
    const cap = out?.cooling_power_uw_at_100mK ?? 400
    const dilUnitMacro = {
      word_name: 'dilution_unit_assembly',
      unit_price_gbp: 100000,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 100000 + (cap / 100) * 30000,
      source_detail: `dilution-fridge-derived: £100k base + £30k/100µW (${cap} µW @ 100 mK) = £${(100000 + (cap / 100) * 30000).toLocaleString()} (Au-plated Cu still + sintered Ag heat exchanger + OFHC MXC plate)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'dilution_unit_assembly'),
        dilUnitMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// 2. cryocooler:sizing — PT-pulse-tube 1.5 W @ 4K pre-cooler.
const stepCryocoolerSizing: ToolStep = {
  tool_id: 'cryocooler:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    heat_load_4k_w: c.quantities?.heat_load_4k_w?.value ?? 1.0,
    heat_load_50k_w: c.quantities?.heat_load_50k_w?.value ?? 30,
    cooler_type: 'pt420' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      capacity_at_4k_w?: number
      capacity_at_50k_w?: number
      compressor_power_kw?: number
      cooler_mass_kg?: number
    }
    const prov = (f: string) => ({ source: 'tool:cryocooler:sizing' as const, tool_id: 'cryocooler:sizing', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/cryocooler', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.capacity_at_4k_w === 'number') {
      updates.capacity_at_4k_w = { value: out.capacity_at_4k_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '4 K stage @ 50 Hz', provenance: prov('capacity_at_4k_w') }
    }
    if (typeof out?.capacity_at_50k_w === 'number') {
      updates.capacity_at_50k_w = { value: out.capacity_at_50k_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '50 K stage', provenance: prov('capacity_at_50k_w') }
    }
    if (typeof out?.compressor_power_kw === 'number') {
      updates.compressor_power_kw = { value: out.compressor_power_kw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'CPA1110 compressor input', provenance: prov('compressor_power_kw') }
    }
    if (typeof out?.cooler_mass_kg === 'number') {
      updates.cryocooler_mass_kg = { value: out.cooler_mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cold head + flex lines', provenance: prov('cooler_mass_kg') }
    }
    // BoM macro: pulse-tube cryocooler.
    const cap4k = out?.capacity_at_4k_w ?? 1.5
    const ptMacro = {
      word_name: 'pulse_tube_pre_cooler',
      unit_price_gbp: 65000,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 65000 + cap4k * 20000,
      source_detail: `cryocooler-derived: £65k base + £20k/W cooling (${cap4k.toFixed(1)} W @ 4K) = £${(65000 + cap4k * 20000).toLocaleString()} (Cryomech PT415-RM-class)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'pulse_tube_pre_cooler'),
        ptMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// 3. helium-circulation:dilution — 3He/4He flow + mixture purification.
const stepHeliumCirculation: ToolStep = {
  tool_id: 'helium-circulation:dilution',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    he3_flow_umol_s: c.quantities?.he3_flow_umol_s?.value ?? 600,
    cold_trap_temp_k: 4,
    n2_trap_temp_k: 77,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      he3_inventory_litres_stp?: number
      pump_capacity_l_s?: number
      condensing_pressure_mbar?: number
      circulation_compressor_power_kw?: number
    }
    const prov = (f: string) => ({ source: 'tool:helium-circulation:dilution' as const, tool_id: 'helium-circulation:dilution', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/helium-circulation', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.he3_inventory_litres_stp === 'number') {
      updates.he3_inventory_litres_stp = { value: out.he3_inventory_litres_stp, unit: 'L STP', family: 'volume', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: '99.95% purity, sealed circuit', provenance: prov('he3_inventory_litres_stp') }
    }
    if (typeof out?.pump_capacity_l_s === 'number') {
      updates.he3_pump_capacity_l_s = { value: out.pump_capacity_l_s, unit: 'L/s', family: 'flow_rate', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'turbomolecular @ 10⁻⁴ mbar', provenance: prov('pump_capacity_l_s') }
    }
    // £150k macro for 3He inventory (3He is £3000/L STP).
    const he3 = out?.he3_inventory_litres_stp ?? 25
    const he3Macro = {
      word_name: 'helium_3_inventory',
      unit_price_gbp: 3000,
      dimension_basis: 'litre_volume' as const,
      dimension_value: he3,
      total_gbp: 3000 * he3,
      source_detail: `helium-circulation-derived: £3000/L STP × ${he3} L = £${(3000 * he3).toLocaleString()} (US DOE-grade 99.95% ³He)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'helium_3_inventory'),
        he3Macro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// 4. magnetic-shielding:mu-metal — DC + 50 Hz attenuation budget.
const stepMagneticShielding: ToolStep = {
  tool_id: 'magnetic-shielding:mu-metal',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    target_attenuation_db: c.quantities?.target_magnetic_attenuation_db?.value ?? 40,
    sample_space_mm: c.quantities?.sample_space_mm?.value ?? 100,
    permeability_relative: 50000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { attenuation_db?: number; layer_count?: number; mass_kg?: number }
    const prov = (f: string) => ({ source: 'tool:magnetic-shielding:mu-metal' as const, tool_id: 'magnetic-shielding:mu-metal', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/magnetic-shielding', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.attenuation_db === 'number') {
      updates.magnetic_shielding_db = { value: out.attenuation_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'DC + 50 Hz, sample-space averaged', provenance: prov('attenuation_db') }
    }
    if (typeof out?.mass_kg === 'number') {
      updates.magnetic_shielding_mass_kg = { value: out.mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'multi-layer Mumetal', provenance: prov('mass_kg') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 5. heat-pipe:sizing — 50K-4K thermal anchoring.
const stepHeatPipe: ToolStep = {
  tool_id: 'heat-pipe:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    transport_w: 5,
    length_mm: 400,
    working_fluid: 'nitrogen' as const,
    temperature_k: 77,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { capacity_w?: number; thermal_resistance_k_w?: number }
    const prov = (f: string) => ({ source: 'tool:heat-pipe:sizing' as const, tool_id: 'heat-pipe:sizing', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/heat-pipe', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.capacity_w === 'number') {
      updates.heat_pipe_capacity_w = { value: out.capacity_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'nitrogen working fluid 50K-77K', provenance: prov('capacity_w') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 6. mli — radiation budget at 50K and 4K.
const stepMli: ToolStep = {
  tool_id: 'mli:multi-layer-insulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    stage_hot_k: 300,
    stage_cold_k: 50,
    surface_area_m2: 3.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { radiation_load_w?: number; layer_count?: number; mli_mass_kg?: number }
    const prov = (f: string) => ({ source: 'tool:mli:multi-layer-insulation' as const, tool_id: 'mli:multi-layer-insulation', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/mli', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.radiation_load_w === 'number') {
      updates.heat_load_50k_w = { value: out.radiation_load_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '30-layer aluminised Mylar, 300K → 50K', provenance: prov('radiation_load_w') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 7. thermal-strap:conduction — Cu/Al braid for stage cooling.
const stepThermalStrap: ToolStep = {
  tool_id: 'thermal-strap:conduction',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    temperature_hot_k: 4,
    temperature_cold_k: 0.05,
    target_conductance_w_k: 0.1,
    material: 'ofhc_copper' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { conductance_w_per_k?: number; mass_kg?: number; length_mm?: number }
    const prov = (f: string) => ({ source: 'tool:thermal-strap:conduction' as const, tool_id: 'thermal-strap:conduction', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/thermal-strap', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.conductance_w_per_k === 'number') {
      updates.thermal_strap_conductance_w_k = { value: out.conductance_w_per_k, unit: 'W/K', family: 'thermal_conductivity', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'OFHC Cu braid at 4 K', provenance: prov('conductance_w_per_k') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 8. pcm:thermal-storage — short-term thermal ballast.
const stepPcm: ToolStep = {
  tool_id: 'pcm:thermal-storage',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    temperature_k: 4,
    capacity_j_target: 5000,
    material: 'lead' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { mass_kg?: number; capacity_j?: number; transition_temp_k?: number }
    const prov = (f: string) => ({ source: 'tool:pcm:thermal-storage' as const, tool_id: 'pcm:thermal-storage', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/pcm', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.capacity_j === 'number') {
      updates.pcm_storage_capacity_j = { value: out.capacity_j, unit: 'J', family: 'energy', basis: 'usable', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'Pb specific heat at 4 K', provenance: prov('capacity_j') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 9. pressure-vessel:design — IVC + OVC vacuum chambers.
const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    internal_pressure_mpa: 0.001,  // hard vacuum < 1e-6 mbar
    external_pressure_mpa: 0.101,
    diameter_mm: 500,
    material: 'aluminium_6061' as const,
    code: 'asme_viii' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { wall_thickness_mm?: number; mass_kg?: number; leak_rate_mbar_l_s?: number }
    const prov = (f: string) => ({ source: 'tool:pressure-vessel:design' as const, tool_id: 'pressure-vessel:design', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/pressure-vessel', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.wall_thickness_mm === 'number') {
      updates.vacuum_chamber_wall_mm = { value: out.wall_thickness_mm, unit: 'mm', family: 'length', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Al 6061 sealed external 1 atm', provenance: prov('wall_thickness_mm') }
    }
    if (typeof out?.mass_kg === 'number') {
      updates.vacuum_chamber_mass_kg = { value: out.mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'IVC + OVC + flanges', provenance: prov('mass_kg') }
    }
    if (typeof out?.leak_rate_mbar_l_s === 'number') {
      updates.vacuum_leak_rate_mbar_l_s = { value: out.leak_rate_mbar_l_s, unit: 'mbar·L/s', family: 'flow_rate', basis: 'max', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'He leak test, indium-sealed joints', provenance: prov('leak_rate_mbar_l_s') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 10. control-systems — PID for MXC temperature.
const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_time_constant_s: 60,
    target_setpoint_mk: 20,
    target_ripple_mk: 0.2,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { settling_time_s?: number; ripple_mk?: number }
    const prov = (f: string) => ({ source: 'tool:control-systems:pid-tuning' as const, tool_id: 'control-systems:pid-tuning', tool_version: '0.10.2', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'python-control.org', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.settling_time_s === 'number') {
      updates.mxc_temperature_settling_s = { value: out.settling_time_s, unit: 's', family: 'time', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'PID-controlled heater', provenance: prov('settling_time_s') }
    }
    if (typeof out?.ripple_mk === 'number') {
      updates.mxc_temperature_ripple_mk = { value: out.ripple_mk, unit: 'mK', family: 'temperature', basis: 'peak_to_peak', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'long-term stability', provenance: prov('ripple_mk') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 11. mass-aggregator.
const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cryocooler_mass_kg: c.quantities?.cryocooler_mass_kg?.value ?? 80,
    vacuum_chamber_mass_kg: c.quantities?.vacuum_chamber_mass_kg?.value ?? 220,
    magnetic_shielding_mass_kg: c.quantities?.magnetic_shielding_mass_kg?.value ?? 90,
    dilution_unit_mass_kg: 65,
    pump_compressor_mass_kg: 110,
    frame_mass_kg: 95,
    max_mass_kg_envelope: c.envelope?.max_mass_kg?.value ?? 900,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg?: number; mass_budget_breach_kg?: number; mass_budget_utilisation_pct?: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.total_system_mass_kg === 'number') {
      updates.total_system_mass_kg = { value: out.total_system_mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'all-up including frame', provenance: prov('total_system_mass_kg') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// universal helpers
function mkUniversalStep(tool_id: string): ToolStep {
  return {
    tool_id,
    required: false,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({ source: `tool:${tool_id}` as any, tool_id, invocation_output_field: f, duration_ms: 0 })
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            const key = `${tool_id.replace(/[:\-]/g, '_')}__${k}`
            updates[key] = {
              value: v,
              unit: '',
              family: 'dimensionless' as const,
              basis: 'rated' as const,
              scope: 'system' as const,
              uncertainty_pct: 0,
              temporal_resolution_s: null,
              condition: null,
              provenance: prov(k),
            }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES (8)
// ---------------------------------------------------------------------------

const rules = [
  ruleRange('cryostat.base_temp_mk', 'Base temperature ≤ 30 mK (utility threshold)', 'actual_base_temp_mk', 0, 30, 'fatal'),
  ruleRange('cryostat.cooling_power_100mk_uw', 'Cooling power at 100 mK ≥ 200 µW (operational baseline)', 'cooling_power_uw_at_100mK', 200, 1000000, 'warning'),
  ruleRange('cryostat.he3_flow_range', '³He flow rate in [200, 1500] µmol/s', 'he3_flow_umol_s', 200, 1500, 'info'),
  ruleRange('cryostat.magnetic_shielding_db', 'DC + 50 Hz magnetic shielding ≥ 40 dB', 'magnetic_shielding_db', 40, 200, 'warning'),
  ruleRange('cryostat.vacuum_leak_rate', 'IVC leak rate ≤ 1e-9 mbar·L/s', 'vacuum_leak_rate_mbar_l_s', 0, 1e-9, 'warning'),
  ruleQuantityRatio('cryostat.4k_cooling_margin', 'Heat load at 4K ≤ cryocooler 4K capacity × 0.80', 'heat_load_4k_w', 'capacity_at_4k_w', 1.25, 'warning'),
  ruleQuantityRatio('cryostat.50k_cooling_margin', 'Heat load at 50K ≤ cryocooler 50K capacity × 0.80', 'heat_load_50k_w', 'capacity_at_50k_w', 1.25, 'warning'),
  ruleRange('cryostat.mxc_ripple_mk', 'MXC temperature ripple ≤ 1 mK (stability)', 'mxc_temperature_ripple_mk', 0, 1.0, 'info'),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const CRYOSTAT_PLAN: ClassToolPlan = {
  id: 'cryostat:dilution-fridge',
  envelope_predicate: (e) => e.class === 'cryostat',
  tools: [
    stepDilutionFridge,
    stepCryocoolerSizing,
    stepHeliumCirculation,
    stepMagneticShielding,
    stepHeatPipe,
    stepMli,
    stepThermalStrap,
    stepPcm,
    stepPressureVessel,
    stepControlSystems,
    stepMassAggregator,
    mkUniversalStep('regulatory-cert-cost:lookup'),
    mkUniversalStep('lifecycle-co2:assessment'),
    mkUniversalStep('supply-chain-risk:scoring'),
    mkUniversalStep('reliability-fmea:system'),
    mkUniversalStep('cybersecurity-threat-model:stride'),
    mkUniversalStep('transport-logistics:routing'),
  ],
  coupled_pairs: [
    ['dilution-fridge:cooling-power', 'helium-circulation:dilution'],
    ['cryocooler:sizing', 'mli:multi-layer-insulation'],
  ] as Array<[string, string]>,
  max_iterations: 3,
  convergence_tolerance_pct: 2.0,
  consistency_rules: rules,
}

registerPlan(CRYOSTAT_PLAN)
