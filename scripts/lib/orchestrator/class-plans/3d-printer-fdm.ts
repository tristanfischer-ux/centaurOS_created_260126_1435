/**
 * scripts/lib/orchestrator/class-plans/3d-printer-fdm.ts
 *
 * 3D PRINTER (fused-deposition) TOOL PLAN — BESS-quality per
 * the 2026-05-22 hand-tuning batch.
 *
 * Industry references: Prusa MK4S, Bambu Lab X1-Carbon, Ultimaker S7,
 * Stratasys F900 (industrial), Markforged FX20 (industrial).
 *
 * Tools (12):
 *   1.  extruder:thermal                     - hotend energy + melt zone
 *   2.  motion-kinematics:steps-per-mm       - GT2 + lead-screw kinematics
 *   3.  coolprop:refrigerant-properties      - chamber heating air properties
 *   4.  scikit-fem:run                       - frame stiffness FEA
 *   5.  ngspice:pcs-simulation               - stepper / servo motor drivers
 *   6.  control-systems:run                  - PID temp + motion controller
 *   7.  fluids:run                           - filament cooling air flow
 *   8.  hvac:load-sizing                     - chamber HVAC for industrial tier
 *   9.  mass-aggregator:envelope-check       - total mass + shipping envelope
 *   10. regulatory-cert-cost:lookup          - CE / UL / FCC cost
 *   11. lifecycle-co2:assessment             - LCA carbon (universal)
 *   12. supply-chain-risk:scoring            - hotend / control-board supply
 *   ... + reliability-fmea, cybersecurity, transport
 *
 * Consistency rules:
 *   - fdm.nozzle_temp_range              150-500 °C
 *   - fdm.bed_temp_range                 0-180 °C
 *   - fdm.chamber_temp_range             0-200 °C
 *   - fdm.print_speed_band               10-1000 mm/s
 *   - fdm.build_volume_band              0.1-1000 L
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio, ruleClosure } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleQuantityRatio
void ruleClosure

function genericUpdate(toolId: string, scopeKey: string): ToolStep['contract_update'] {
  return (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: `tool:${toolId}` as const,
      tool_id: toolId,
      invocation_output_field: f,
      duration_ms: 0,
    })
    const updates: Record<string, any> = {}
    if (output && typeof output === 'object') {
      for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
          updates[`${scopeKey}__${k}`] = {
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
  }
}

// ---------------------------------------------------------------------------
// HAND-TUNED TOOL STEPS
// ---------------------------------------------------------------------------

const stepExtruderThermal: ToolStep = {
  tool_id: 'extruder:thermal',
  required: false,
  feeds_into: ['control-systems:run', 'fluids:run'],
  input_from_contract: (c: any) => ({
    nozzle_temp_c: c.quantities?.nozzle_temp_c?.value ?? 260,
    bed_temp_c: c.quantities?.bed_temp_c?.value ?? 100,
    filament_diameter_mm: c.quantities?.filament_diameter_mm?.value ?? 1.75,
    target_flow_mm3_s: 24,
    heater_w: 50,
    nozzle_material: 'cht_high_flow',
  }),
  contract_update: genericUpdate('extruder:thermal', 'extruder_thermal'),
}

const stepMotionKinematics: ToolStep = {
  tool_id: 'motion-kinematics:steps-per-mm',
  required: false,
  feeds_into: ['ngspice:pcs-simulation', 'control-systems:run'],
  input_from_contract: (c: any) => ({
    max_print_speed_mm_s: c.quantities?.max_print_speed_mm_s?.value ?? 200,
    belt_pitch_mm: 2,
    pulley_teeth: 20,
    microstepping: 16,
    motor_full_steps_per_rev: 200,
    build_x_mm: c.quantities?.build_x_mm?.value ?? 220,
    build_y_mm: c.quantities?.build_y_mm?.value ?? 220,
    build_z_mm: c.quantities?.build_z_mm?.value ?? 250,
  }),
  contract_update: genericUpdate('motion-kinematics:steps-per-mm', 'motion_kinematics'),
}

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: ['hvac:load-sizing'],
  input_from_contract: (c: any) => ({
    fluid: 'air',
    temperature_c: c.quantities?.chamber_temp_c?.value ?? 50,
    pressure_pa: 101325,
  }),
  contract_update: genericUpdate('coolprop:refrigerant-properties', 'coolprop'),
}

const stepScikitFem: ToolStep = {
  tool_id: 'scikit-fem:run',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    geometry: 'frame_extrusion_2020',
    material: 'aluminium_6063_t5',
    extrusion_count: 16,
    cross_section_mm: 20,
    target_first_mode_hz: 60,
  }),
  contract_update: genericUpdate('scikit-fem:run', 'scikit_fem'),
}

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: ['control-systems:run'],
  input_from_contract: () => ({
    topology: 'stepper_driver_tmc2209',
    rated_current_a: 2.0,
    dc_bus_voltage_v: 24,
    chopper_freq_khz: 40,
  }),
  contract_update: genericUpdate('ngspice:pcs-simulation', 'ngspice'),
}

const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:run',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    loop_kind: 'pid_temperature_and_motion',
    temp_loop_tau_s: 25,
    motion_loop_bw_hz: 200,
    target_overshoot_pct: 2,
  }),
  contract_update: genericUpdate('control-systems:run', 'control_systems'),
}

const stepFluids: ToolStep = {
  tool_id: 'fluids:run',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    geometry: 'fdm_part_cooling_duct',
    air_flow_cfm: 12,
    duct_d_mm: 35,
    target_velocity_m_s: 25,
  }),
  contract_update: genericUpdate('fluids:run', 'fluids_run'),
}

const stepHvacLoadSizing: ToolStep = {
  tool_id: 'hvac:load-sizing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    sensible_load_kw: 2.0,
    target_temp_c: c.quantities?.chamber_temp_c?.value ?? 50,
    ambient_temp_c: 25,
    application: 'industrial_fdm_chamber',
  }),
  contract_update: genericUpdate('hvac:load-sizing', 'hvac_load_sizing'),
}

const stepRegCertCost: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: '3d_printer_fdm', region: 'EU' }),
  contract_update: genericUpdate('regulatory-cert-cost:lookup', 'regulatory_cert_cost'),
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    product_class: '3d_printer_fdm',
    mass_kg: 20,
    build_volume_l: c.quantities?.build_volume_l?.value ?? 12,
  }),
  contract_update: genericUpdate('lifecycle-co2:assessment', 'lifecycle_co2'),
}

const stepSupplyChainRisk: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: '3d_printer_fdm', critical_parts: ['e3d_v6', 'tmc2209', 'stm32f407'] }),
  contract_update: genericUpdate('supply-chain-risk:scoring', 'supply_chain_risk'),
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: '3d_printer_fdm', module_count: 8 }),
  contract_update: genericUpdate('reliability-fmea:system', 'reliability_fmea'),
}

const stepCybersecurity: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: '3d_printer_fdm', wireless: ['wifi', 'octoprint'] }),
  contract_update: genericUpdate('cybersecurity-threat-model:stride', 'cybersecurity'),
}

const stepTransport: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    mass_kg: 20,
    longest_dim_m: ((c.quantities?.build_z_mm?.value ?? 250) + 200) / 1000,
    fragility: 'precision_motion',
  }),
  contract_update: genericUpdate('transport-logistics:routing', 'transport'),
}

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    frame_mass_kg: 8,
    motion_mass_kg: 5,
    hotend_mass_kg: 1,
    controller_mass_kg: 2,
    psu_mass_kg: 2,
    enclosure_mass_kg: 5,
    max_mass_kg_envelope: c.envelope?.max_mass_kg?.value ?? 35,
  }),
  contract_update: genericUpdate('mass-aggregator:envelope-check', 'mass_aggregator'),
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange('fdm.nozzle_temp_range', 'nozzle_temp_c within 150-500 °C', 'nozzle_temp_c', 150, 500, 'warning'),
  ruleRange('fdm.bed_temp_range', 'bed_temp_c within 0-180 °C', 'bed_temp_c', 0, 180, 'warning'),
  ruleRange('fdm.print_speed_band', 'max_print_speed_mm_s within 10-1000 mm/s', 'max_print_speed_mm_s', 10, 1000, 'warning'),
  ruleRange('fdm.build_volume_band', 'build_volume_l within 0.1-1000 L', 'build_volume_l', 0.1, 1000, 'warning'),
  ruleRange('fdm.filament_diameter_band', 'filament_diameter_mm within 1.0-3.0 mm', 'filament_diameter_mm', 1.0, 3.0, 'warning'),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const PRINTER_FDM_3D_PLAN: ClassToolPlan = {
  id: '3d_printer_fdm:desktop',
  envelope_predicate: (e) => e.class === '3d_printer_fdm',
  tools: [
    stepExtruderThermal,
    stepMotionKinematics,
    stepCoolProp,
    stepScikitFem,
    stepNgspice,
    stepControlSystems,
    stepFluids,
    stepHvacLoadSizing,
    stepRegCertCost,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepCybersecurity,
    stepTransport,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['extruder:thermal', 'control-systems:run'],
    ['motion-kinematics:steps-per-mm', 'ngspice:pcs-simulation'],
    ['coolprop:refrigerant-properties', 'hvac:load-sizing'],
  ],
  max_iterations: 3,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(PRINTER_FDM_3D_PLAN)
