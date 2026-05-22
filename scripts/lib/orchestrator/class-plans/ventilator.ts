/**
 * scripts/lib/orchestrator/class-plans/ventilator.ts
 *
 * MECHANICAL VENTILATOR TOOL PLAN — hand-tuned 2026-05-22 (Build #20b).
 *
 * Pattern: BESS reference (bess.ts). Each tool step reads specific
 * named fields from the EngineeringContract and emits canonical
 * quantity names. Macro assembly prices are appended where the tool's
 * output naturally derives a BoM line (turbine blower, valves, sensors,
 * humidifier etc.).
 *
 * Tool sequence (13 steps):
 *
 *   Class-specific:
 *     1. flow-compliance:respiratory       — Vt vs PIP closure for compliance/resistance
 *     2. peep-valve:sizing                 — voice-coil PEEP valve actuator + flow
 *     3. coolprop:refrigerant-properties   — humidified medical gas mixture properties
 *     4. psychrolib:humid-air              — BTPS conditioning enthalpy + humidity
 *     5. ngspice:pcs-simulation            — proportional solenoid drive simulation
 *     6. control-systems:pid-tuning        — PEEP/PIP servo loop tuning
 *     7. pressure-vessel:design            — O2 cylinder (transport class)
 *     8. fluids:pipe-sizing                — patient circuit + Y-piece dP
 *     9. biocompatibility:iso-10993        — patient-circuit material check
 *
 *   Universal (6):
 *    10. regulatory-fda:cgmp               — FDA 510(k) cgmp + IEC 60601-2-12
 *    11. regulatory-cert-cost:lookup       — CE Class IIb + FDA cost
 *    12. lifecycle-co2:assessment          — full LCA
 *    13. supply-chain-risk:scoring         — single-source blower risk
 *    14. reliability-fmea:system           — patient safety FMEA, IEC 60601-1
 *    15. cybersecurity-threat-model:stride — networked HIS / wireless
 *    16. transport-logistics:routing       — hospital + transport channels
 *
 *   Mass aggregator (1):
 *    17. mass-aggregator:envelope-check
 */

import { registerPlan } from '../planner'
import { ruleClosure, ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure
void ruleQuantityRatio

// ---------------------------------------------------------------------------
// 1. flow-compliance:respiratory — Vt vs PIP closure
// ---------------------------------------------------------------------------

const stepFlowCompliance: ToolStep = {
  tool_id: 'flow-compliance:respiratory',
  required: true,
  feeds_into: ['peep-valve:sizing'] as string[],
  input_from_contract: (c: any) => ({
    tidal_volume_ml: c.quantities?.tidal_volume_ml?.value ?? 500,
    peep_cmh2o: c.quantities?.peep_cmh2o?.value ?? 5,
    peak_inspiratory_pressure_cmh2o: c.quantities?.peak_inspiratory_pressure_cmh2o?.value ?? 40,
    compliance_ml_per_cmh2o: c.quantities?.compliance_ml_per_cmh2o?.value ?? 30,
    resistance_cmh2o_per_lpm: c.quantities?.resistance_cmh2o_per_lpm?.value ?? 5,
    inspiratory_time_s: 1.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:flow-compliance:respiratory' as const,
      tool_id: 'flow-compliance:respiratory',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { peak_flow_lpm?: number; plateau_pressure_cmh2o?: number; work_of_breathing_j_l?: number }
    const updates: Record<string, any> = {}
    if (out.peak_flow_lpm !== undefined && Number.isFinite(out.peak_flow_lpm)) {
      updates.computed_peak_flow_lpm = {
        value: out.peak_flow_lpm, unit: 'L/min', family: 'flow_rate' as const,
        basis: 'peak' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'flow at PIP delivery',
        provenance: prov('peak_flow_lpm'),
      }
    }
    if (out.plateau_pressure_cmh2o !== undefined && Number.isFinite(out.plateau_pressure_cmh2o)) {
      updates.plateau_pressure_cmh2o = {
        value: out.plateau_pressure_cmh2o, unit: 'cmH2O', family: 'pressure' as const,
        basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'inspiratory hold',
        provenance: prov('plateau_pressure_cmh2o'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 2. peep-valve:sizing — voice-coil PEEP valve actuator + flow
// ---------------------------------------------------------------------------

const stepPeep: ToolStep = {
  tool_id: 'peep-valve:sizing',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    peep_cmh2o: c.quantities?.peep_cmh2o?.value ?? 5,
    peak_exhalation_flow_lpm: c.quantities?.peak_inspiratory_flow_lpm?.value ?? 120,
    response_time_ms: 50,
    valve_type: 'voice_coil',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:peep-valve:sizing' as const,
      tool_id: 'peep-valve:sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { coil_force_n?: number; coil_power_w?: number; valve_orifice_mm?: number }
    // Exhalation valve macro: £380 voice-coil PEEP valve
    const peepMacro = {
      word_name: 'exhalation_valve_peep_module',
      unit_price_gbp: 380,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 380,
      source_detail: `peep-valve-derived: £380 voice-coil exhalation/PEEP valve actuator (50 ms response)`,
    }
    const updates: Record<string, any> = {}
    if (out.coil_power_w !== undefined && Number.isFinite(out.coil_power_w)) {
      updates.peep_valve_coil_power_w = {
        value: out.coil_power_w, unit: 'W', family: 'power' as const,
        basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'rated PEEP hold',
        provenance: prov('coil_power_w'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'exhalation_valve_peep_module'),
        peepMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. coolprop:refrigerant-properties — humidified medical gas mixture
// ---------------------------------------------------------------------------

const stepCoolprop: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    fluid: 'air',  // O2-air mixture; treat as air for density / cp approx
    temperature_c: c.quantities?.target_gas_temp_c?.value ?? 37,
    pressure_bar: 1.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:coolprop:refrigerant-properties' as const,
      tool_id: 'coolprop:refrigerant-properties',
      tool_version: '7.2.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'coolprop.org',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { density_kg_m3?: number; viscosity_pa_s?: number }
    const updates: Record<string, any> = {}
    if (out.density_kg_m3 !== undefined && Number.isFinite(out.density_kg_m3)) {
      updates.gas_density_at_btps_kg_m3 = {
        value: out.density_kg_m3, unit: 'kg/m³', family: 'density' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: 'humidified gas @ BTPS',
        provenance: prov('density_kg_m3'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 4. psychrolib:humid-air — BTPS conditioning energy
// ---------------------------------------------------------------------------

const stepPsychrolib: ToolStep = {
  tool_id: 'psychrolib:humid-air',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    dry_bulb_c: c.quantities?.target_gas_temp_c?.value ?? 37,
    relative_humidity_pct: 100,
    pressure_pa: 101325,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:psychrolib:humid-air' as const,
      tool_id: 'psychrolib:humid-air',
      tool_version: '2.5.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'github.com/psychrometrics/psychrolib',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { humidity_ratio_kg_kg?: number; enthalpy_kj_kg?: number }
    // Humidifier macro: £240 active heated humidifier
    const humidifierMacro = {
      word_name: 'humidifier_heater_assembly',
      unit_price_gbp: 240,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 240,
      source_detail: `psychrolib-derived: £240 Fisher & Paykel MR850-class heated humidifier (33 mg/L BTPS @ 37°C)`,
    }
    const updates: Record<string, any> = {}
    if (out.enthalpy_kj_kg !== undefined && Number.isFinite(out.enthalpy_kj_kg)) {
      updates.btps_enthalpy_kj_kg = {
        value: out.enthalpy_kj_kg, unit: 'kJ/kg', family: 'energy' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: '37°C 100% RH (BTPS)',
        provenance: prov('enthalpy_kj_kg'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'humidifier_heater_assembly'),
        humidifierMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. ngspice:pcs-simulation — proportional solenoid drive
// ---------------------------------------------------------------------------

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    rated_power_kw: 0.025,  // 25 W per proportional solenoid
    dc_bus_voltage_v: 24,    // typical medical 24 V drive bus
    ac_output_voltage_v: 24,
    topology: 'h_bridge_pwm' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:ngspice:pcs-simulation' as const,
      tool_id: 'ngspice:pcs-simulation',
      tool_version: '46',
      tool_license: 'GPL-3.0' as const,
      tool_source_url: 'ngspice.sourceforge.io',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { inverter_efficiency_pct?: number; dc_continuous_current_a?: number }
    // Proportional valve macro: £280 × 2 (O2 + air)
    const valveMacro = {
      word_name: 'proportional_solenoid_valve',
      unit_price_gbp: 280,
      dimension_basis: 'each' as const,
      dimension_value: 2,
      total_gbp: 560,
      source_detail: `ngspice-derived: £280 × 2 — Asco / IMI proportional solenoid valves (O2 + air, medical-rated)`,
    }
    const updates: Record<string, any> = {}
    if (out.dc_continuous_current_a !== undefined && Number.isFinite(out.dc_continuous_current_a)) {
      updates.valve_drive_current_a = {
        value: out.dc_continuous_current_a, unit: 'A', family: 'current' as const,
        basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: 'PWM drive @ 24 V',
        provenance: prov('dc_continuous_current_a'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'proportional_solenoid_valve'),
        valveMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 6. control-systems:pid-tuning — PEEP/PIP servo loop tuning
// ---------------------------------------------------------------------------

const stepControl: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_type: 'second_order',
    process_gain: 1.2,
    natural_frequency_hz: 5,
    damping_ratio: 0.6,
    target_overshoot_pct: 5,
    method: 'imc',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:control-systems:pid-tuning' as const,
      tool_id: 'control-systems:pid-tuning',
      tool_version: '0.10.2',
      tool_license: 'BSD-3-Clause' as const,
      tool_source_url: 'github.com/python-control/python-control',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { kp?: number; ki?: number; phase_margin_deg?: number; bandwidth_hz?: number }
    const updates: Record<string, any> = {}
    if (out.phase_margin_deg !== undefined && Number.isFinite(out.phase_margin_deg)) {
      updates.peep_loop_phase_margin_deg = {
        value: out.phase_margin_deg, unit: '°', family: 'angle' as const,
        basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'IMC-tuned PEEP/PIP loop',
        provenance: prov('phase_margin_deg'),
      }
    }
    if (out.bandwidth_hz !== undefined && Number.isFinite(out.bandwidth_hz)) {
      updates.peep_loop_bandwidth_hz = {
        value: out.bandwidth_hz, unit: 'Hz', family: 'frequency' as const,
        basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'closed loop',
        provenance: prov('bandwidth_hz'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 7. pressure-vessel:design — O2 cylinder (transport class)
// ---------------------------------------------------------------------------

const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    fluid: 'oxygen',
    design_pressure_bar: c.quantities?.o2_cylinder_pressure_bar?.value ?? 200,
    volume_l: c.quantities?.o2_cylinder_volume_l?.value ?? 3.0,
    material: 'aluminium_alloy',
    standard: 'iso_7866',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:pressure-vessel:design' as const,
      tool_id: 'pressure-vessel:design',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { wall_thickness_mm?: number; cylinder_mass_kg?: number; burst_factor?: number }
    const updates: Record<string, any> = {}
    if (out.cylinder_mass_kg !== undefined && Number.isFinite(out.cylinder_mass_kg)) {
      updates.o2_cylinder_mass_kg = {
        value: out.cylinder_mass_kg, unit: 'kg', family: 'mass' as const,
        basis: 'empty' as const, scope: 'subassembly' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'aluminium ISO 7866',
        provenance: prov('cylinder_mass_kg'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 8. fluids:pipe-sizing — patient circuit + Y-piece dP
// ---------------------------------------------------------------------------

const stepFluids: ToolStep = {
  tool_id: 'fluids:pipe-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    flow_rate_l_min: c.quantities?.peak_inspiratory_flow_lpm?.value ?? 120,
    pipe_id_mm: 22,  // ISO 5356 standard breathing-circuit ID
    pipe_length_m: 1.6,
    fluid_density_kg_m3: c.quantities?.gas_density_at_btps_kg_m3?.value ?? 1.13,
    fluid_viscosity_pa_s: 0.0000186,
    roughness_mm: 0.005,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:fluids:pipe-sizing' as const,
      tool_id: 'fluids:pipe-sizing',
      tool_version: '1.3.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'github.com/CalebBell/fluids',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { reynolds?: number; pressure_drop_kpa?: number; velocity_m_s?: number }
    // Patient circuit macro: £18
    const circuitMacro = {
      word_name: 'patient_circuit_disposable',
      unit_price_gbp: 18,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 18,
      source_detail: `fluids-derived: £18 single-use patient circuit (22 mm ID limb tubing + Y + heated wire)`,
    }
    const updates: Record<string, any> = {}
    if (out.pressure_drop_kpa !== undefined && Number.isFinite(out.pressure_drop_kpa)) {
      updates.patient_circuit_dp_cmh2o = {
        value: out.pressure_drop_kpa * 10.197, unit: 'cmH2O', family: 'pressure' as const,
        basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'peak inspiratory flow',
        provenance: prov('pressure_drop_kpa'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'patient_circuit_disposable'),
        circuitMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 9. biocompatibility:iso-10993 — patient-circuit material check
// ---------------------------------------------------------------------------

const stepBiocompat: ToolStep = {
  tool_id: 'biocompatibility:iso-10993',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    materials_in_contact: [
      'polyethylene_breathing_tubing',
      'silicone_y_piece',
      'polycarbonate_water_trap',
      'silicone_face_mask_seal',
    ],
    contact_duration_h: 24,
    contact_type: 'breathing_gas_long_term',
    region: 'EU',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:biocompatibility:iso-10993' as const,
      tool_id: 'biocompatibility:iso-10993',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { total_tests_pass?: number }
    const updates: Record<string, any> = {}
    if (out.total_tests_pass !== undefined && Number.isFinite(out.total_tests_pass)) {
      updates.biocompat_tests_passed = {
        value: out.total_tests_pass, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0,
        temporal_resolution_s: null, condition: 'ISO 10993-5/10/18 breathing-gas long-term',
        provenance: prov('total_tests_pass'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// Universal step factory
// ---------------------------------------------------------------------------

function universalStep(toolId: string, sourceUrl: string, license: any = 'MIT'): ToolStep {
  const tag = toolId.replace(/[:-]/g, '_')
  return {
    tool_id: toolId,
    required: false,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({
        source: `tool:${toolId}` as const,
        tool_id: toolId,
        tool_version: '1.0.0',
        tool_license: license,
        tool_source_url: sourceUrl,
        invocation_output_field: f,
        duration_ms: 0,
      })
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            updates[`${tag}__${k}`] = {
              value: v, unit: '', family: 'dimensionless' as const,
              basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0,
              temporal_resolution_s: null, condition: null, provenance: prov(k),
            }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

const stepFda = universalStep('regulatory-fda:cgmp', 'internal://forgeos/orchestrator')
const stepRegCert = universalStep('regulatory-cert-cost:lookup', 'internal://forgeos/orchestrator')
const stepLifecycleCo2 = universalStep('lifecycle-co2:assessment', 'internal://forgeos/orchestrator')
const stepSupplyChainRisk = universalStep('supply-chain-risk:scoring', 'internal://forgeos/orchestrator')
const stepReliabilityFmea = universalStep('reliability-fmea:system', 'internal://forgeos/orchestrator')
const stepCyber = universalStep('cybersecurity-threat-model:stride', 'internal://forgeos/orchestrator')
const stepTransport = universalStep('transport-logistics:routing', 'internal://forgeos/orchestrator')

// ---------------------------------------------------------------------------
// Mass aggregator
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const totalEstimatedMassKg = c.quantities?.total_estimated_mass_kg?.value ?? 25
    const maxMassKgEnvelope = c.quantities?.max_mass_kg?.value ?? 35
    return {
      total_cell_mass_kg: 0,
      transformer_mass_kg: null,
      rack_count: 1,
      max_mass_kg_envelope: maxMassKgEnvelope,
      pcs_mass_kg_estimate: 0,
      container_tare_kg_estimate: 0,
      rack_mass_kg_each_estimate: 0,
      additional_mass_kg: totalEstimatedMassKg,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:mass-aggregator:envelope-check' as const,
      tool_id: 'mass-aggregator:envelope-check',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { total_system_mass_kg?: number; mass_budget_utilisation_pct?: number }
    const updates: Record<string, any> = {}
    if (out.total_system_mass_kg !== undefined && Number.isFinite(out.total_system_mass_kg)) {
      updates.total_system_mass_kg = {
        value: out.total_system_mass_kg, unit: 'kg', family: 'mass' as const,
        basis: 'empty' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'all-up dry',
        provenance: prov('total_system_mass_kg'),
      }
    }
    if (out.mass_budget_utilisation_pct !== undefined && Number.isFinite(out.mass_budget_utilisation_pct)) {
      updates.mass_budget_utilisation_pct = {
        value: out.mass_budget_utilisation_pct, unit: '%', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: null,
        provenance: prov('mass_budget_utilisation_pct'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'ventilator.tidal_volume_range',
    'Tidal volume within adult ICU/transport bounds (200-2000 mL)',
    'tidal_volume_ml',
    200, 2000,
    'warning',
  ),
  ruleRange(
    'ventilator.peep_range',
    'PEEP within typical mechanical-ventilation bounds (0-25 cmH2O)',
    'peep_cmh2o',
    0, 25,
    'warning',
  ),
  ruleRange(
    'ventilator.pip_range',
    'Peak inspiratory pressure within safe bounds (10-60 cmH2O)',
    'peak_inspiratory_pressure_cmh2o',
    10, 60,
    'warning',
  ),
  ruleRange(
    'ventilator.respiratory_rate_range',
    'Respiratory rate within adult bounds (4-40 bpm)',
    'respiratory_rate_per_min',
    4, 40,
    'warning',
  ),
  ruleRange(
    'ventilator.fio2_range',
    'FiO2 within physiological bounds (21-100%)',
    'fio2_pct',
    21, 100,
    'warning',
  ),
  ruleRange(
    'ventilator.peak_flow_range',
    'Peak inspiratory flow within safe ICU/transport bounds (30-200 L/min)',
    'peak_inspiratory_flow_lpm',
    30, 200,
    'warning',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const VENTILATOR_PLAN: ClassToolPlan = {
  id: 'ventilator:icu_transport',
  envelope_predicate: (e) => e.class === 'ventilator',
  tools: [
    stepFlowCompliance,
    stepPeep,
    stepCoolprop,
    stepPsychrolib,
    stepNgspice,
    stepControl,
    stepPressureVessel,
    stepFluids,
    stepBiocompat,
    stepFda,
    stepRegCert,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepCyber,
    stepTransport,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['flow-compliance:respiratory', 'peep-valve:sizing'],
    ['ngspice:pcs-simulation', 'control-systems:pid-tuning'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(VENTILATOR_PLAN)
