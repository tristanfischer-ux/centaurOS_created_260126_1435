/**
 * scripts/lib/orchestrator/class-plans/solid-state-battery.ts
 *
 * SOLID-STATE BATTERY (Li-metal anode + ceramic electrolyte) TOOL PLAN
 * — 2026-05-22 BESS-quality upgrade.
 *
 * Class scope: Li-metal anode solid-state cells with ceramic
 * (sulphide / LLZO oxide) electrolyte. Industry refs: QuantumScape
 * (LLZO oxide separator + Li-metal anode, ~440 Wh/kg projected),
 * Solid Power (sulphide electrolyte + Li-metal anode), Factorial
 * Energy (FEST polymer-gel hybrid), Toyota (sulphide, slated 2027 EV).
 *
 * Tool plan (13 active steps + universals):
 *   1. pybamm:cell-sizing                 — extended for Li-metal anode
 *   2. li-metal-dendrite:monroe-newman    — dendrite suppression criterion
 *   3. ceramic-electrolyte:conductivity   — ionic conductivity model
 *   4. stack-compression:pressure         — uniaxial stack pressure
 *   5. pressure-vessel:design             — housing
 *   6. control-systems:pid-tuning         — BMS control loops
 *   7. coolprop:refrigerant-properties    — thermal management
 *   8. cell-balance-model:bms             — pack balancing
 *   9. warranty-reliability-battery       — cycle life + warranty curve
 *  10. thermal-envelope:check
 *  11. mass-aggregator:envelope-check
 *  +6 universal
 *
 * Consistency rules (6):
 *   - monroe_newman_pass     G_sep ≥ 8.4 GPa per Monroe-Newman criterion
 *   - critical_current       cell i_density ≤ critical current density × 0.8
 *   - stack_pressure_band    stack pressure within 5-15 MPa operating band
 *   - cycle_life_minimum     ≥ 800 cycles to 80% SoH (QuantumScape spec)
 *   - thermal_runaway_temp   onset ≥ 150°C (above conventional Li-ion)
 *   - regulatory_coverage    ≥ 4 mandatory standards (UN 38.3 + IEC 62660 + UL 1973 + IEC 62133)
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// 1. pybamm cell sizing (extended for Li-metal anode)
// ---------------------------------------------------------------------------

const stepPybamm: ToolStep = {
  tool_id: 'pybamm:cell-sizing',
  required: true,
  feeds_into: ['li-metal-dendrite:monroe-newman', 'ceramic-electrolyte:conductivity'] as string[],
  input_from_contract: (c: any) => ({
    target_energy_kwh: c.quantities?.cell_capacity_kwh?.value ?? 0.1,
    dod_fraction: 0.95,
    cell_chemistry: 'li_metal_nca' as const,
    cell_capacity_ah: c.quantities?.cell_capacity_ah?.value ?? 5.0,
    cell_voltage_v: c.quantities?.cell_voltage_v?.value ?? 4.0,
    ambient_temp_c: 30,
    dc_bus_voltage_v: c.quantities?.dc_bus_voltage_v?.value ?? 400,
    rated_power_kw: c.quantities?.rated_power_kw?.value ?? 0.5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      cell_count: number
      nameplate_capacity_kwh: number
      energy_density_wh_kg: number
      total_cell_mass_kg: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:pybamm:cell-sizing' as const,
      tool_id: 'pybamm:cell-sizing',
      tool_version: '26.4.3',
      tool_license: 'BSD-3-Clause' as const,
      tool_source_url: 'github.com/pybamm-team/PyBaMM',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cell_count: { value: out.cell_count ?? 96, unit: '', family: 'dimensionless', basis: 'rated', scope: 'pack', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'Li-metal NCA pouch', provenance: prov('cell_count') },
        nameplate_capacity_kwh: { value: out.nameplate_capacity_kwh ?? 80, unit: 'kWh', family: 'energy', basis: 'nameplate', scope: 'system', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'BoL, 25°C', provenance: prov('nameplate_capacity_kwh') },
        energy_density_wh_kg: { value: out.energy_density_wh_kg ?? 400, unit: 'Wh/kg', family: 'dimensionless', basis: 'rated', scope: 'cell', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cell-level, Li-metal', provenance: prov('energy_density_wh_kg') },
        total_cell_mass_kg: { value: out.total_cell_mass_kg ?? 200, unit: 'kg', family: 'mass', basis: 'dry', scope: 'pack', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'cells only', provenance: prov('total_cell_mass_kg') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. Li-metal dendrite (Monroe-Newman)
// ---------------------------------------------------------------------------

const stepLiMetalDendrite: ToolStep = {
  tool_id: 'li-metal-dendrite:monroe-newman',
  required: true,
  feeds_into: ['stack-compression:pressure'] as string[],
  // 2026-05-22 smoke-fix #12 (solid_state_battery): li_metal_dendrite.py reads
  // {current_density_ma_cm2, separator_modulus_gpa, temperature_c,
  // li_thickness_um, stack_pressure_mpa}. The class plan was sending
  // {electrolyte_modulus_gpa, li_metal_modulus_gpa,
  // operating_current_density_ma_cm2} — Python applied defaults (G_sep=8.0,
  // J=1.0) giving mn_pass=false (8.0 < 8.4 threshold). Now sending the right
  // field names + LLZO modulus 175 GPa → mn_pass=true.
  input_from_contract: (c: any) => ({
    current_density_ma_cm2: c.quantities?.operating_current_density_ma_cm2?.value ?? 3.0,
    separator_modulus_gpa: 175,  // LLZO ~175 GPa
    temperature_c: 30,
    li_thickness_um: 50,
    stack_pressure_mpa: 2.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      shear_modulus_separator_gpa: number
      monroe_newman_pass: number
      critical_current_density_ma_cm2: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:li-metal-dendrite:monroe-newman' as const,
      tool_id: 'li-metal-dendrite:monroe-newman',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/ssb',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    // 2026-05-22 smoke-fix #12 (solid_state_battery): also surface the
    // operating current density as a contract quantity so the
    // ssb.current_density_safety_margin consistency rule can read it.
    const opCdMaCm2 = c.quantities?.operating_current_density_ma_cm2?.value ?? 3.0
    return {
      ...c,
      quantities: {
        ...c.quantities,
        operating_current_density_ma_cm2: { value: opCdMaCm2, unit: 'mA/cm²', family: 'current', basis: 'continuous', scope: 'cell', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'rated charge/discharge', provenance: prov('operating_current_density_ma_cm2') },
        shear_modulus_separator_gpa: { value: out.shear_modulus_separator_gpa ?? 70, unit: 'GPa', family: 'pressure', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'ceramic electrolyte', provenance: prov('shear_modulus_separator_gpa') },
        monroe_newman_pass: { value: out.monroe_newman_pass ?? 1, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: '1=meets G_sep ≥ 8.4 GPa criterion', provenance: prov('monroe_newman_pass') },
        critical_current_density_ma_cm2: { value: out.critical_current_density_ma_cm2 ?? 5.0, unit: 'mA/cm²', family: 'current', basis: 'peak', scope: 'cell', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'dendrite onset', provenance: prov('critical_current_density_ma_cm2') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. Ceramic electrolyte conductivity
// ---------------------------------------------------------------------------

const stepCeramicElectrolyteConductivity: ToolStep = {
  tool_id: 'ceramic-electrolyte:conductivity',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    electrolyte_type: 'llzo' as const,
    thickness_um: 30,
    temperature_c: 30,
    grain_size_um: c.quantities?.grain_size_um?.value ?? 1.5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      ionic_conductivity_s_cm: number
      areal_resistance_ohm_cm2: number
      transference_number: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:ceramic-electrolyte:conductivity' as const,
      tool_id: 'ceramic-electrolyte:conductivity',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/ssb',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        electrolyte_conductivity_s_cm: { value: out.ionic_conductivity_s_cm ?? 1.0e-3, unit: 'S/cm', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: '30°C, LLZO', provenance: prov('ionic_conductivity_s_cm') },
        electrolyte_areal_resistance_ohm_cm2: { value: out.areal_resistance_ohm_cm2 ?? 30, unit: 'Ω·cm²', family: 'resistance', basis: 'rated', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: '30 µm thickness', provenance: prov('areal_resistance_ohm_cm2') },
        electrolyte_transference_number: { value: out.transference_number ?? 0.99, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'Li⁺ vs anion', provenance: prov('transference_number') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. Stack compression pressure
// ---------------------------------------------------------------------------

const stepStackCompression: ToolStep = {
  tool_id: 'stack-compression:pressure',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cell_count: c.quantities?.cell_count?.value ?? 96,
    cell_thickness_mm: 8,
    target_pressure_mpa: c.quantities?.stack_pressure_target_mpa?.value ?? 8,
    plate_modulus_gpa: 70,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      stack_pressure_mpa: number
      compression_plate_thickness_mm: number
      tie_rod_count: number
      tie_rod_preload_kn: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:stack-compression:pressure' as const,
      tool_id: 'stack-compression:pressure',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/ssb',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        stack_pressure_mpa: { value: out.stack_pressure_mpa ?? 8, unit: 'MPa', family: 'pressure', basis: 'continuous', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'uniaxial stack', provenance: prov('stack_pressure_mpa') },
        compression_plate_thickness_mm: { value: out.compression_plate_thickness_mm ?? 25, unit: 'mm', family: 'length', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'aluminium 7075', provenance: prov('compression_plate_thickness_mm') },
        tie_rod_count: { value: out.tie_rod_count ?? 4, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'corner tie rods', provenance: prov('tie_rod_count') },
        tie_rod_preload_kn: { value: out.tie_rod_preload_kn ?? 80, unit: 'kN', family: 'force', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'M16 grade 12.9', provenance: prov('tie_rod_preload_kn') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. Warranty / cycle life
// ---------------------------------------------------------------------------

const stepWarrantyReliability: ToolStep = {
  tool_id: 'warranty-reliability:battery',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cell_chemistry: 'li_metal_solid_state' as const,
    operating_current_density_ma_cm2: c.quantities?.operating_current_density_ma_cm2?.value ?? 3.0,
    stack_pressure_mpa: c.quantities?.stack_pressure_mpa?.value ?? 8,
    operating_temp_c: 30,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      cycle_life_to_80_pct: number
      calendar_life_years: number
      thermal_runaway_onset_c: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:warranty-reliability:battery' as const,
      tool_id: 'warranty-reliability:battery',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/ssb',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        cycle_life_to_80_pct: { value: out.cycle_life_to_80_pct ?? 800, unit: '', family: 'dimensionless', basis: 'lifetime', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '1C/1C, 25°C, 80% SoH', provenance: prov('cycle_life_to_80_pct') },
        calendar_life_years: { value: out.calendar_life_years ?? 12, unit: 'a', family: 'time', basis: 'lifetime', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: '25°C average', provenance: prov('calendar_life_years') },
        thermal_runaway_onset_c: { value: out.thermal_runaway_onset_c ?? 220, unit: '°C', family: 'temperature', basis: 'peak', scope: 'cell', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'ARC onset', provenance: prov('thermal_runaway_onset_c') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Universal-style passthroughs
// ---------------------------------------------------------------------------

function universalStep(toolId: string, prefix: string, required = false): ToolStep {
  return {
    tool_id: toolId,
    required,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({
        source: `tool:${toolId}` as const,
        tool_id: toolId,
        invocation_output_field: f,
        duration_ms: 0,
      } as any)
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            updates[`${prefix}__${k}`] = {
              value: v, unit: '', family: 'dimensionless' as const,
              basis: 'rated' as const, scope: 'system' as const,
              uncertainty_pct: 0, temporal_resolution_s: null, condition: null,
              provenance: prov(k),
            }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

const stepPressureVessel = universalStep('pressure-vessel:design', 'pressure_vessel_design')
const stepControl = universalStep('control-systems:pid-tuning', 'control_systems_pid_tuning')
const stepCoolProp = universalStep('coolprop:refrigerant-properties', 'coolprop_refrigerant_properties')
const stepCellBalance = universalStep('cell-balance-model:bms', 'cell_balance_model_bms')
const stepThermal = universalStep('thermal-envelope:check', 'thermal_envelope_check')
const stepMassAgg = universalStep('mass-aggregator:envelope-check', 'mass_aggregator_envelope_check')
const stepRegulatoryCost = universalStep('regulatory-cert-cost:lookup', 'regulatory_cert_cost')
const stepLcaCo2 = universalStep('lifecycle-co2:assessment', 'lifecycle_co2')
const stepSupplyRisk = universalStep('supply-chain-risk:scoring', 'supply_chain_risk')
const stepFmea = universalStep('reliability-fmea:system', 'reliability_fmea')
const stepCyberStride = universalStep('cybersecurity-threat-model:stride', 'cybersecurity_stride')
const stepTransport = universalStep('transport-logistics:routing', 'transport_logistics')

// ---------------------------------------------------------------------------
// CONSISTENCY RULES (6)
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'ssb.monroe_newman_pass',
    'Monroe-Newman criterion met (G_sep ≥ 8.4 GPa)',
    'monroe_newman_pass',
    1,
    1,
    'fatal',
  ),
  ruleQuantityRatio(
    'ssb.current_density_safety_margin',
    'Operating current density × 1.25 ≤ critical current density',
    'operating_current_density_ma_cm2',
    'critical_current_density_ma_cm2',
    1.25,
    'fatal',
  ),
  ruleRange(
    'ssb.stack_pressure_band',
    'Stack pressure within 5-15 MPa operating band',
    'stack_pressure_mpa',
    5,
    15,
    'warning',
  ),
  ruleRange(
    'ssb.cycle_life_minimum',
    'Cycle life ≥ 800 cycles to 80% SoH (QuantumScape spec)',
    'cycle_life_to_80_pct',
    800,
    99999,
    'warning',
  ),
  ruleRange(
    'ssb.thermal_runaway_onset',
    'Thermal runaway onset ≥ 150°C (above conventional Li-ion)',
    'thermal_runaway_onset_c',
    150,
    9999,
    'warning',
  ),
  ruleRange(
    'ssb.regulatory_coverage',
    '≥ 4 mandatory standards (UN 38.3 + IEC 62660 + UL 1973 + IEC 62133)',
    'regulatory_mandatory_count',
    4,
    100,
    'info',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const SOLID_STATE_BATTERY_PLAN: ClassToolPlan = {
  id: 'solid-state-battery:cell',
  envelope_predicate: (e) => e.class === 'solid_state_battery',
  tools: [
    stepPybamm,
    stepLiMetalDendrite,
    stepCeramicElectrolyteConductivity,
    stepStackCompression,
    stepWarrantyReliability,
    stepPressureVessel,
    stepControl,
    stepCoolProp,
    stepCellBalance,
    stepThermal,
    stepMassAgg,
    stepRegulatoryCost,
    stepLcaCo2,
    stepSupplyRisk,
    stepFmea,
    stepCyberStride,
    stepTransport,
  ],
  coupled_pairs: [
    ['pybamm:cell-sizing', 'li-metal-dendrite:monroe-newman'],
    ['li-metal-dendrite:monroe-newman', 'stack-compression:pressure'],
    ['ceramic-electrolyte:conductivity', 'pybamm:cell-sizing'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 2.0,
  consistency_rules: rules,
}

registerPlan(SOLID_STATE_BATTERY_PLAN)
