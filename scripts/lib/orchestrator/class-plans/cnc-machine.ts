/**
 * scripts/lib/orchestrator/class-plans/cnc-machine.ts
 *
 * CNC machining centre TOOL PLAN — BESS-quality per the 2026-05-22
 * hand-tuning batch.
 *
 * Industry references: DMG Mori NHX 5000, Mazak VTC-800/30 SR,
 * Haas VF-2SS, Doosan DNM 4500. Default envelope: 15 kW BT40
 * 3-axis VMC; 5-axis extension via HSK-A63 head.
 *
 * Tools (12):
 *   1.  spindle:thermal                     - spindle heat + chiller sizing
 *   2.  mrr-chip-load:milling               - material removal rate + torque
 *   3.  scikit-fem:run                      - frame stiffness / chatter FRF
 *   4.  ngspice:pcs-simulation              - servo drive simulation
 *   5.  coolprop:refrigerant-properties     - coolant thermophysics
 *   6.  control-systems:run                 - CNC servo + spindle PID
 *   7.  fluids:run                          - coolant + chip flow
 *   8.  hvac:load-sizing                    - electrical cabinet cooling
 *   9.  mass-aggregator:envelope-check      - total machine mass
 *   10. regulatory-cert-cost:lookup         - CE + EN 13849 cost
 *   11. lifecycle-co2:assessment            - LCA carbon (universal)
 *   12. supply-chain-risk:scoring           - critical spindle/servo supply
 *   ... + reliability-fmea, cybersecurity, transport
 *
 * Consistency rules:
 *   - cnc.spindle_power_band                rated_spindle_power_kw within 1-200 kW
 *   - cnc.max_rpm_band                      max_spindle_rpm within 1000-60 000
 *   - cnc.axes_band                         axes_count within 3-9
 *   - cnc.bed_travel_band_x                 bed_travel_x_mm within 200-3000 mm
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

const stepSpindleThermal: ToolStep = {
  tool_id: 'spindle:thermal',
  required: false,
  feeds_into: ['coolprop:refrigerant-properties', 'fluids:run'],
  input_from_contract: (c: any) => ({
    rated_spindle_power_kw: c.quantities?.rated_spindle_power_kw?.value ?? 15,
    max_rpm: c.quantities?.max_spindle_rpm?.value ?? 18000,
    bearing_type: 'ceramic_hybrid',
    duty_cycle: 0.8,
    oil_chiller_setpoint_c: 20,
  }),
  contract_update: genericUpdate('spindle:thermal', 'spindle_thermal'),
}

const stepMrrChipLoad: ToolStep = {
  tool_id: 'mrr-chip-load:milling',
  required: false,
  feeds_into: ['ngspice:pcs-simulation'],
  input_from_contract: (c: any) => ({
    rated_spindle_power_kw: c.quantities?.rated_spindle_power_kw?.value ?? 15,
    tool_diameter_mm: 10,
    flute_count: 4,
    cutting_speed_m_min: 200,
    target_workpiece: 'aluminium_alloy_6061',
  }),
  contract_update: genericUpdate('mrr-chip-load:milling', 'mrr_chip_load'),
}

const stepScikitFem: ToolStep = {
  tool_id: 'scikit-fem:run',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    geometry: 'cast_iron_bed_column',
    material: 'meehanite_cast_iron',
    bed_travel_x_mm: c.quantities?.bed_travel_x_mm?.value ?? 600,
    bed_travel_y_mm: c.quantities?.bed_travel_y_mm?.value ?? 500,
    bed_travel_z_mm: c.quantities?.bed_travel_z_mm?.value ?? 550,
    target_first_mode_hz: 80,
  }),
  contract_update: genericUpdate('scikit-fem:run', 'scikit_fem'),
}

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: ['control-systems:run'],
  input_from_contract: (c: any) => ({
    topology: 'ac_servo_three_phase',
    rated_power_kw: (c.quantities?.rated_spindle_power_kw?.value ?? 15) / 3,
    dc_bus_voltage_v: 540,
    switching_freq_khz: 16,
    ac_output_voltage_v: 400,
  }),
  contract_update: genericUpdate('ngspice:pcs-simulation', 'ngspice'),
}

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: ['fluids:run', 'hvac:load-sizing'],
  input_from_contract: () => ({
    fluid: 'water_glycol_30pct',
    temperature_c: 25,
    pressure_pa: 700000,
  }),
  contract_update: genericUpdate('coolprop:refrigerant-properties', 'coolprop'),
}

const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:run',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    loop_kind: 'cnc_servo_pid',
    position_loop_bw_hz: 200,
    velocity_loop_bw_hz: 1000,
    current_loop_bw_hz: 4000,
    target_following_error_um: 5,
  }),
  contract_update: genericUpdate('control-systems:run', 'control_systems'),
}

const stepFluids: ToolStep = {
  tool_id: 'fluids:run',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    geometry: 'flood_coolant_supply',
    flow_l_min: 120,
    pressure_bar: 7,
    pipe_d_mm: 32,
    through_spindle_pressure_bar: 70,
    coolant_tank_l: c.quantities?.coolant_tank_l?.value ?? 320,
  }),
  contract_update: genericUpdate('fluids:run', 'fluids_run'),
}

const stepHvacLoadSizing: ToolStep = {
  tool_id: 'hvac:load-sizing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    sensible_load_kw: 1.0 + 0.05 * (c.quantities?.rated_spindle_power_kw?.value ?? 15),
    target_temp_c: 35,
    ambient_temp_c: 25,
    application: 'cnc_electrical_cabinet',
  }),
  contract_update: genericUpdate('hvac:load-sizing', 'hvac_load_sizing'),
}

const stepRegCertCost: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'cnc_machine', region: 'EU' }),
  contract_update: genericUpdate('regulatory-cert-cost:lookup', 'regulatory_cert_cost'),
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    product_class: 'cnc_machine',
    mass_kg: (c.quantities?.rated_spindle_power_kw?.value ?? 15) * 250,
    rated_power_kw: c.quantities?.rated_spindle_power_kw?.value ?? 15,
  }),
  contract_update: genericUpdate('lifecycle-co2:assessment', 'lifecycle_co2'),
}

const stepSupplyChainRisk: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'cnc_machine', critical_parts: ['motorised_spindle', 'yaskawa_servo', 'heidenhain_tnc'] }),
  contract_update: genericUpdate('supply-chain-risk:scoring', 'supply_chain_risk'),
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'cnc_machine', module_count: 10 }),
  contract_update: genericUpdate('reliability-fmea:system', 'reliability_fmea'),
}

const stepCybersecurity: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'cnc_machine', wireless: ['ethernet_modbus'] }),
  contract_update: genericUpdate('cybersecurity-threat-model:stride', 'cybersecurity'),
}

const stepTransport: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    mass_kg: (c.quantities?.rated_spindle_power_kw?.value ?? 15) * 250,
    longest_dim_m: ((c.quantities?.bed_travel_x_mm?.value ?? 600) + 1000) / 1000,
    fragility: 'precision_machine_tool',
  }),
  contract_update: genericUpdate('transport-logistics:routing', 'transport'),
}

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    bed_frame_mass_kg: (c.quantities?.rated_spindle_power_kw?.value ?? 15) * 150,
    spindle_assembly_mass_kg: 200,
    servo_axes_mass_kg: 4 * 25,
    enclosure_mass_kg: 600,
    cabinet_mass_kg: 250,
    max_mass_kg_envelope: (c.quantities?.rated_spindle_power_kw?.value ?? 15) * 250 + 1500,
  }),
  contract_update: genericUpdate('mass-aggregator:envelope-check', 'mass_aggregator'),
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange('cnc.spindle_power_band', 'rated_spindle_power_kw within 1-200 kW', 'rated_spindle_power_kw', 1, 200, 'warning'),
  ruleRange('cnc.max_rpm_band', 'max_spindle_rpm within 1000-60000 rpm', 'max_spindle_rpm', 1000, 60000, 'warning'),
  ruleRange('cnc.axes_band', 'axes_count within 3-9', 'axes_count', 3, 9, 'warning'),
  ruleRange('cnc.traverse_band', 'rapid_traverse_mm_per_min within 5000-120000', 'rapid_traverse_mm_per_min', 5000, 120000, 'warning'),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const CNC_MACHINE_PLAN: ClassToolPlan = {
  id: 'cnc_machine:milling_3axis',
  envelope_predicate: (e) => e.class === 'cnc_machine',
  tools: [
    stepSpindleThermal,
    stepMrrChipLoad,
    stepScikitFem,
    stepNgspice,
    stepCoolProp,
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
    ['spindle:thermal', 'mrr-chip-load:milling'],
    ['ngspice:pcs-simulation', 'control-systems:run'],
    ['coolprop:refrigerant-properties', 'fluids:run'],
  ],
  max_iterations: 3,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(CNC_MACHINE_PLAN)
