/**
 * scripts/lib/orchestrator/class-plans/dialysis-machine.ts
 *
 * DIALYSIS MACHINE (HEMODIALYSIS) TOOL PLAN — hand-tuned 2026-05-22
 * (Build #20b).
 *
 * Pattern: BESS reference (bess.ts). Each tool step reads specific
 * named fields from the EngineeringContract and emits canonical
 * quantity names. Macro assembly prices are appended where the tool's
 * output naturally derives a BoM line (dialyser, blood pump, RO module,
 * etc.).
 *
 * Tool sequence (13 steps):
 *
 *   Class-specific:
 *     1. osmosis-membrane:dialyser           — polysulfone hollow-fibre sizing
 *     2. blood-pump:sizing                   — peristaltic pump head + servo
 *     3. coolprop:refrigerant-properties     — dialysate water properties (37°C)
 *     4. fluids:pipe-sizing                  — blood + dialysate tubing dP
 *     5. control-systems:pid-tuning          — DO/pH/conductivity control loops
 *     6. psychrolib:humid-air                — humidified gas (if HD-HF online)
 *     7. ht:ntu-heat-exchanger               — dialysate heater coil
 *     8. biocompatibility:iso-10993          — blood-contact materials check
 *     9. water-treatment-ro:sizing           — RO permeate sizing
 *
 *   Universal (6):
 *    10. regulatory-fda:cgmp                 — FDA 510(k) cgmp registration
 *    11. regulatory-cert-cost:lookup         — CE Class IIb + FDA cost
 *    12. lifecycle-co2:assessment            — full LCA
 *    13. supply-chain-risk:scoring           — single-source dialyser risk
 *    14. reliability-fmea:system             — patient safety FMEA
 *    15. cybersecurity-threat-model:stride   — networked HIS connectivity
 *    16. transport-logistics:routing         — hospital procurement
 *
 *   Mass aggregator (1):
 *    17. mass-aggregator:envelope-check
 *
 * Coupled pairs (fixed-point solver):
 *   - osmosis-membrane ↔ blood-pump (flow / pressure interaction)
 *   - fluids ↔ blood-pump (line pressure feeds back to pump duty)
 */

import { registerPlan } from '../planner'
import { ruleClosure, ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure
void ruleQuantityRatio

// ---------------------------------------------------------------------------
// 1. osmosis-membrane:dialyser — polysulfone hollow-fibre sizing
// ---------------------------------------------------------------------------

const stepOsmosis: ToolStep = {
  tool_id: 'osmosis-membrane:dialyser',
  required: true,
  feeds_into: ['blood-pump:sizing'] as string[],
  input_from_contract: (c: any) => ({
    blood_flow_ml_min: c.quantities?.blood_flow_rate_ml_per_min?.value ?? 350,
    dialysate_flow_ml_min: c.quantities?.dialysate_flow_rate_ml_per_min?.value ?? 500,
    membrane_area_m2: c.quantities?.membrane_area_m2?.value ?? 1.8,
    ultrafiltration_rate_ml_h: c.quantities?.ultrafiltration_rate_ml_per_h?.value ?? 1000,
    transmembrane_pressure_mmhg: c.quantities?.transmembrane_pressure_mmhg?.value ?? 200,
    membrane_material: 'polysulfone',
    session_hours: c.quantities?.session_duration_hours?.value ?? 4,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:osmosis-membrane:dialyser' as const,
      tool_id: 'osmosis-membrane:dialyser',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { urea_clearance_ml_min?: number; creatinine_clearance_ml_min?: number; kt_v?: number; total_uf_volume_l?: number }
    const membraneAreaM2 = (c.quantities?.membrane_area_m2?.value as number) ?? 1.8
    // Dialyser macro: £12 per unit (single-use)
    const dialyserMacro = {
      word_name: 'dialyser_hollow_fibre',
      unit_price_gbp: 12,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 12,
      source_detail: `osmosis-derived: £12 polysulfone hollow-fibre dialyser, ${membraneAreaM2.toFixed(1)} m² (Fresenius F-series / Baxter Polyflux)`,
    }
    const updates: Record<string, any> = {}
    if (out.urea_clearance_ml_min !== undefined && Number.isFinite(out.urea_clearance_ml_min)) {
      updates.urea_clearance_ml_min = {
        value: out.urea_clearance_ml_min, unit: 'mL/min', family: 'flow_rate' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'in vitro per dialyser datasheet',
        provenance: prov('urea_clearance_ml_min'),
      }
    }
    if (out.kt_v !== undefined && Number.isFinite(out.kt_v)) {
      updates.kt_v_per_session = {
        value: out.kt_v, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'single-pool',
        provenance: prov('kt_v'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'dialyser_hollow_fibre'),
        dialyserMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. blood-pump:sizing — peristaltic pump head
// ---------------------------------------------------------------------------

const stepBloodPump: ToolStep = {
  tool_id: 'blood-pump:sizing',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    target_flow_ml_min: c.quantities?.blood_flow_rate_ml_per_min?.value ?? 350,
    arterial_pressure_cmh2o: c.quantities?.arterial_pressure_cmh2o?.value ?? -150,
    venous_pressure_cmh2o: c.quantities?.venous_pressure_cmh2o?.value ?? 200,
    tubing_id_mm: 4.0,
    pump_type: 'peristaltic',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:blood-pump:sizing' as const,
      tool_id: 'blood-pump:sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { motor_torque_nm?: number; motor_power_w?: number; rpm_rated?: number }
    // Pump macro: £650 (Watson-Marlow 620 + servo)
    const pumpMacro = {
      word_name: 'peristaltic_blood_pump',
      unit_price_gbp: 650,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 650,
      source_detail: `blood-pump-derived: £650 Watson-Marlow 620 head + servo motor`,
    }
    const updates: Record<string, any> = {}
    if (out.motor_power_w !== undefined && Number.isFinite(out.motor_power_w)) {
      updates.blood_pump_motor_w = {
        value: out.motor_power_w, unit: 'W', family: 'power' as const,
        basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'rated flow',
        provenance: prov('motor_power_w'),
      }
    }
    if (out.rpm_rated !== undefined && Number.isFinite(out.rpm_rated)) {
      updates.blood_pump_rpm = {
        value: out.rpm_rated, unit: 'rpm', family: 'frequency' as const,
        basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'closed-loop control',
        provenance: prov('rpm_rated'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'peristaltic_blood_pump'),
        pumpMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. coolprop:refrigerant-properties — water at 37°C dialysate temperature
// ---------------------------------------------------------------------------

const stepCoolprop: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    fluid: 'water',
    temperature_c: c.quantities?.dialysate_temp_c?.value ?? 37.0,
    pressure_bar: 1.5,
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
    const out = output as { density_liquid_kg_m3?: number; viscosity_pa_s?: number; cp_liquid_kj_kgk?: number }
    const updates: Record<string, any> = {}
    if (out.density_liquid_kg_m3 !== undefined && Number.isFinite(out.density_liquid_kg_m3)) {
      updates.dialysate_density_kg_m3 = {
        value: out.density_liquid_kg_m3, unit: 'kg/m³', family: 'density' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 1,
        temporal_resolution_s: null, condition: 'water @ 37°C',
        provenance: prov('density_liquid_kg_m3'),
      }
    }
    if (out.cp_liquid_kj_kgk !== undefined && Number.isFinite(out.cp_liquid_kj_kgk)) {
      updates.dialysate_cp_kj_kgk = {
        value: out.cp_liquid_kj_kgk, unit: 'kJ/(kg·K)', family: 'energy' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 1,
        temporal_resolution_s: null, condition: 'water @ 37°C',
        provenance: prov('cp_liquid_kj_kgk'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 4. fluids:pipe-sizing — tubing pressure drop
// ---------------------------------------------------------------------------

const stepFluids: ToolStep = {
  tool_id: 'fluids:pipe-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    flow_rate_l_min: ((c.quantities?.dialysate_flow_rate_ml_per_min?.value as number) ?? 500) / 1000,
    pipe_id_mm: 6.0,
    pipe_length_m: 2.0,
    fluid_density_kg_m3: c.quantities?.dialysate_density_kg_m3?.value ?? 993,
    fluid_viscosity_pa_s: 0.000693,
    roughness_mm: 0.0015,
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
    const updates: Record<string, any> = {}
    if (out.pressure_drop_kpa !== undefined && Number.isFinite(out.pressure_drop_kpa)) {
      updates.dialysate_tubing_dp_kpa = {
        value: out.pressure_drop_kpa, unit: 'kPa', family: 'pressure' as const,
        basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'rated dialysate flow',
        provenance: prov('pressure_drop_kpa'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 5. control-systems:pid-tuning — DO/pH/conductivity control loops
// ---------------------------------------------------------------------------

const stepControl: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_type: 'first_order_plus_dead_time',
    process_gain: 0.8,
    time_constant_s: 12,
    dead_time_s: 3,
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
    const out = output as { kp?: number; ki?: number; kd?: number; phase_margin_deg?: number }
    const updates: Record<string, any> = {}
    if (out.phase_margin_deg !== undefined && Number.isFinite(out.phase_margin_deg)) {
      updates.control_loop_phase_margin_deg = {
        value: out.phase_margin_deg, unit: '°', family: 'angle' as const,
        basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'IMC-tuned PID',
        provenance: prov('phase_margin_deg'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 6. psychrolib:humid-air — for online HD-HF humidification (rare)
// ---------------------------------------------------------------------------

const stepPsychrolib: ToolStep = {
  tool_id: 'psychrolib:humid-air',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    dry_bulb_c: 37.0,
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
    const updates: Record<string, any> = {}
    if (out.enthalpy_kj_kg !== undefined && Number.isFinite(out.enthalpy_kj_kg)) {
      updates.body_temp_saturated_enthalpy_kj_kg = {
        value: out.enthalpy_kj_kg, unit: 'kJ/kg', family: 'energy' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: '37°C 100% RH',
        provenance: prov('enthalpy_kj_kg'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 7. ht:ntu-heat-exchanger — dialysate heater coil
// ---------------------------------------------------------------------------

const stepHt: ToolStep = {
  tool_id: 'ht:ntu-heat-exchanger',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    duty_kw: 1.5,  // heater duty to bring RO water from 15°C to 37°C @ 500 mL/min
    hot_fluid_in_c: 80,  // resistive heater coil surface
    hot_fluid_out_c: 60,
    cold_fluid_in_c: 15,  // incoming RO water
    cold_fluid_out_c: c.quantities?.dialysate_temp_c?.value ?? 37,
    hot_fluid: 'water',
    cold_fluid: 'water',
    arrangement: 'counter_flow',
    overall_u_w_m2k: 2500,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:ht:ntu-heat-exchanger' as const,
      tool_id: 'ht:ntu-heat-exchanger',
      tool_version: '1.2.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'github.com/CalebBell/ht',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { effectiveness?: number; area_m2?: number }
    const updates: Record<string, any> = {}
    if (out.area_m2 !== undefined && Number.isFinite(out.area_m2)) {
      updates.dialysate_heater_area_m2 = {
        value: out.area_m2, unit: 'm²', family: 'area' as const,
        basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'NTU-ε method, dialysate heater coil',
        provenance: prov('area_m2'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 8. biocompatibility:iso-10993 — blood-contact materials check
// ---------------------------------------------------------------------------

const stepBiocompat: ToolStep = {
  tool_id: 'biocompatibility:iso-10993',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    materials_in_contact: [
      'polysulfone_membrane',
      'pvc_blood_tubing',
      'polyurethane_potting',
      'silicone_pump_segment',
      'titanium_blood_connector',
    ],
    contact_duration_h: 4,
    contact_type: 'blood_circulating_long_term',
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
    const out = output as { cytotoxicity_pass?: boolean; total_tests_pass?: number; total_tests_required?: number }
    const updates: Record<string, any> = {}
    if (out.total_tests_pass !== undefined && Number.isFinite(out.total_tests_pass)) {
      updates.biocompat_tests_passed = {
        value: out.total_tests_pass, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0,
        temporal_resolution_s: null, condition: 'ISO 10993-4 hemocompatibility + 10993-5/10',
        provenance: prov('total_tests_pass'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 9. water-treatment-ro:sizing — RO permeate sizing
// ---------------------------------------------------------------------------

const stepRo: ToolStep = {
  tool_id: 'water-treatment-ro:sizing',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    permeate_l_h: ((c.quantities?.dialysate_flow_rate_ml_per_min?.value as number) ?? 500) * 60 / 1000,
    target_conductivity_us_cm: 1.0,
    recovery_pct: c.quantities?.water_recovery_pct?.value ?? 70,
    feed_water_conductivity_us_cm: 500,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:water-treatment-ro:sizing' as const,
      tool_id: 'water-treatment-ro:sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { membrane_count?: number; pump_power_w?: number; permeate_quality_us_cm?: number }
    // RO module macro: £1800 single-pass + UV + carbon
    const roMacro = {
      word_name: 'reverse_osmosis_water_module',
      unit_price_gbp: 1800,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 1800,
      source_detail: `ro-derived: £1800 single-pass + UV + carbon prefilter (Mar Cor Purelab / Better Water 6000)`,
    }
    const updates: Record<string, any> = {}
    if (out.pump_power_w !== undefined && Number.isFinite(out.pump_power_w)) {
      updates.ro_pump_power_w = {
        value: out.pump_power_w, unit: 'W', family: 'power' as const,
        basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'RO feed pump @ rated flow',
        provenance: prov('pump_power_w'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'reverse_osmosis_water_module'),
        roMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// Universal step factory (concise)
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
    const totalEstimatedMassKg = c.quantities?.total_estimated_mass_kg?.value ?? 90
    const maxMassKgEnvelope = c.quantities?.max_mass_kg?.value ?? 120
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
    'dialysis.blood_flow_range',
    'Blood flow rate within hemodialysis bounds (200-500 mL/min)',
    'blood_flow_rate_ml_per_min',
    200, 500,
    'warning',
  ),
  ruleRange(
    'dialysis.dialysate_flow_range',
    'Dialysate flow rate within typical bounds (300-800 mL/min)',
    'dialysate_flow_rate_ml_per_min',
    300, 800,
    'warning',
  ),
  ruleRange(
    'dialysis.membrane_area_range',
    'Membrane area within polysulfone hollow-fibre dialyser bounds (1.0-2.5 m²)',
    'membrane_area_m2',
    1.0, 2.5,
    'warning',
  ),
  ruleRange(
    'dialysis.session_duration_range',
    'Session duration within standard hemodialysis bounds (3-8 hours)',
    'session_duration_hours',
    3.0, 8.0,
    'warning',
  ),
  ruleRange(
    'dialysis.dialysate_temp_range',
    'Dialysate temperature must be near body temperature (35-39°C)',
    'dialysate_temp_c',
    35, 39,
    'warning',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const DIALYSIS_MACHINE_PLAN: ClassToolPlan = {
  id: 'dialysis_machine:hospital',
  envelope_predicate: (e) => e.class === 'dialysis_machine',
  tools: [
    stepOsmosis,
    stepBloodPump,
    stepCoolprop,
    stepFluids,
    stepControl,
    stepPsychrolib,
    stepHt,
    stepBiocompat,
    stepRo,
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
    ['osmosis-membrane:dialyser', 'blood-pump:sizing'],
    ['blood-pump:sizing', 'fluids:pipe-sizing'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(DIALYSIS_MACHINE_PLAN)
