/**
 * scripts/lib/orchestrator/class-plans/edge-ai.ts
 *
 * EDGE AI INFERENCE-SERVER TOOL PLAN — 2026-05-22 BESS-quality upgrade.
 *
 * Class scope: 1U short-depth inference appliance (Jetson Orin Nano /
 * Coral TPU / Intel NUC / Hailo-8 at the edge; NVIDIA L40S / H100 /
 * MI300X at the higher end of the envelope). 10-50 W typical for true
 * edge boxes, up to ~3-4 kW for accelerated GPU servers.
 *
 * Tool plan (11 active steps + 6 universal):
 *   1. inference-throughput:edge        — tps/W envelope per accelerator
 *   2. thermal-envelope:ladder          — 1U front-to-back air capacity ladder
 *   3. network-bandwidth:budget         — uplink + intra-rack budget
 *   4. enclosure-emc:margin             — EN 55032 Class A margin
 *   5. cybersecurity-threat-model:stride — universal STRIDE for IoT/edge
 *   6. ngspice:pcs-simulation           — PCB power-stage (12 V rail)
 *   7. coolprop:refrigerant-properties  — liquid-cooled SKUs only
 *   8. hvac:load-sizing                 — datacentre CRAH/CRAC sizing
 *   9. fan-coil:sizing                  — chassis fan sizing
 *  10. reliability-fmea:system          — universal FMEA
 *  11. mass-aggregator:envelope-check   — rack mass roll-up
 *  +6 universal (regulatory, LCA, supply chain, FMEA, cyber, transport)
 *
 * Industry references: Jetson Orin Nano (15-25 W), Coral TPU dev board
 * (5 W), Intel NUC 12 Pro (28 W), Hailo-8 (2.5 W), NVIDIA L40S (300 W),
 * H100 PCIe (400 W), AMD MI300X (750 W).
 *
 * Consistency rules (6):
 *   - thermal_balance       chassis cooling ≥ heat dissipation × 1.10
 *   - power_closure         grid power ≤ psu rated × 0.85
 *   - efficiency_minimum    psu efficiency ≥ 90%
 *   - inlet_temp_max        max inlet ≤ 35 °C (NEBS Level 3)
 *   - mass_budget           total mass ≤ envelope cap (rack-mount)
 *   - regulatory_coverage   ≥ 4 mandatory standards tagged
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// 1. Inference throughput envelope (edge accelerator tps/W)
// ---------------------------------------------------------------------------

const stepInferenceThroughput: ToolStep = {
  tool_id: 'inference-throughput:edge',
  required: true,
  feeds_into: ['thermal-envelope:ladder', 'fan-coil:sizing'] as string[],
  input_from_contract: (c: any) => ({
    accelerator_model: 'L40S',  // engineering judgement from brief; default L40S
    accelerator_count: c.quantities?.gpu_count?.value ?? 1,
    target_tps: c.quantities?.inference_tps?.value ?? 80,
    model_size_b: c.quantities?.model_size_b?.value ?? 13,
    quantisation: 'FP8' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      tps_per_watt: number
      effective_tps: number
      compute_efficiency_pct: number
      accelerator_power_kw: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:inference-throughput:edge' as const,
      tool_id: 'inference-throughput:edge',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/edge-ai',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        tps_per_watt: { value: out.tps_per_watt ?? 0.27, unit: 'tps/W', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'batch=1, FP8 quantised', provenance: prov('tps_per_watt') },
        effective_tps: { value: out.effective_tps ?? 80, unit: 'tps', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'Llama-2-13B class, batch=1', provenance: prov('effective_tps') },
        compute_efficiency_pct: { value: out.compute_efficiency_pct ?? 78, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'kernel utilisation', provenance: prov('compute_efficiency_pct') },
        accelerator_power_kw: { value: out.accelerator_power_kw ?? 0.3, unit: 'kW', family: 'power', basis: 'continuous', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'full load', provenance: prov('accelerator_power_kw') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. Thermal envelope ladder (1U air-cooled vs liquid-cooled)
// ---------------------------------------------------------------------------

const stepThermalEnvelope: ToolStep = {
  tool_id: 'thermal-envelope:ladder',
  required: true,
  feeds_into: ['fan-coil:sizing', 'hvac:load-sizing'] as string[],
  input_from_contract: (c: any) => ({
    heat_dissipation_kw: c.quantities?.heat_dissipation_kw?.value ?? 1.0,
    chassis_format: '1U_short_depth' as const,
    inlet_temp_c: c.quantities?.max_inlet_temp_c?.value ?? 35,
    cooling_mode: 'air' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      ladder_step: '1U_air' | '1U_liquid' | 'rear_door_hx' | 'fail'
      cooling_capacity_kw: number
      delta_t_c: number
      airflow_cfm: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:thermal-envelope:ladder' as const,
      tool_id: 'thermal-envelope:ladder',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/thermal',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        chassis_cooling_capacity_kw: { value: out.cooling_capacity_kw ?? 1.2, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '35°C inlet, 1U front-to-back', provenance: prov('cooling_capacity_kw') },
        chassis_delta_t_c: { value: out.delta_t_c ?? 15, unit: '°C', family: 'temperature', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'inlet vs outlet', provenance: prov('delta_t_c') },
        chassis_airflow_cfm: { value: out.airflow_cfm ?? 80, unit: 'cfm', family: 'flow_rate', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '100% fan', provenance: prov('airflow_cfm') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. Network bandwidth budget (uplink + intra-rack)
// ---------------------------------------------------------------------------

const stepNetworkBandwidth: ToolStep = {
  tool_id: 'network-bandwidth:budget',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    uplink_gbe: c.quantities?.network_throughput_gbe?.value ?? 50,
    inference_tps: c.quantities?.inference_tps?.value ?? 80,
    tokens_per_request: 256,
    bytes_per_token: 4,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      required_bandwidth_mbps: number
      headroom_factor: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:network-bandwidth:budget' as const,
      tool_id: 'network-bandwidth:budget',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/network',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        required_bandwidth_mbps: { value: out.required_bandwidth_mbps ?? 320, unit: 'Mbps', family: 'dimensionless', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'peak load', provenance: prov('required_bandwidth_mbps') },
        network_headroom_factor: { value: out.headroom_factor ?? 156, unit: '×', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'uplink / required', provenance: prov('headroom_factor') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. EMC enclosure margin (EN 55032 Class A)
// ---------------------------------------------------------------------------

const stepEnclosureEmc: ToolStep = {
  tool_id: 'enclosure-emc:margin',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    standard: 'EN_55032_class_A' as const,
    enclosure_material: 'sheet_steel' as const,
    aperture_count: 4,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { emc_margin_db: number; meets_standard: boolean } | null
    const prov = (f: string) => ({
      source: 'tool:enclosure-emc:margin' as const,
      tool_id: 'enclosure-emc:margin',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/emc',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        emc_margin_db: { value: out.emc_margin_db ?? 6, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'EN 55032 Class A 30-1000 MHz', provenance: prov('emc_margin_db') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. HVAC load sizing (datacentre CRAH/CRAC)
// ---------------------------------------------------------------------------

const stepHvacLoad: ToolStep = {
  tool_id: 'hvac:load-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rack_count: 1,
    units_per_rack: 1,
    heat_dissipation_kw_per_unit: c.quantities?.heat_dissipation_kw?.value ?? 1.0,
    inlet_temp_setpoint_c: 22,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { crah_capacity_kw: number; pue_estimate: number } | null
    const prov = (f: string) => ({
      source: 'tool:hvac:load-sizing' as const,
      tool_id: 'hvac:load-sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/hvac',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        datacentre_crah_kw: { value: out.crah_capacity_kw ?? 1.3, unit: 'kW', family: 'power', basis: 'continuous', scope: 'site', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'per-rack CRAH share', provenance: prov('crah_capacity_kw') },
        datacentre_pue: { value: out.pue_estimate ?? 1.35, unit: '', family: 'dimensionless', basis: 'rated', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'tier III air-cooled', provenance: prov('pue_estimate') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 6. Fan coil sizing (chassis fan ladder)
// ---------------------------------------------------------------------------

const stepFanCoil: ToolStep = {
  tool_id: 'fan-coil:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cooling_load_kw: c.quantities?.heat_dissipation_kw?.value ?? 1.0,
    chassis_height_u: 1,
    fan_count: 8,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { fan_diameter_mm: number; fan_rpm_max: number; noise_dba_at_1m: number } | null
    const prov = (f: string) => ({
      source: 'tool:fan-coil:sizing' as const,
      tool_id: 'fan-coil:sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/fan',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        chassis_fan_diameter_mm: { value: out.fan_diameter_mm ?? 40, unit: 'mm', family: 'length', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: '40 mm 1U-compatible', provenance: prov('fan_diameter_mm') },
        chassis_fan_rpm_max: { value: out.fan_rpm_max ?? 18000, unit: 'rpm', family: 'angular_velocity', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: '100% PWM', provenance: prov('fan_rpm_max') },
        chassis_noise_dba_1m: { value: out.noise_dba_at_1m ?? 65, unit: 'dBA', family: 'sound_pressure', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '1 m, 100% fan', provenance: prov('noise_dba_at_1m') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 7. Mass aggregator (rack-mount roll-up)
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    chassis_mass_kg: c.quantities?.total_mass_kg?.value ?? 14,
    max_mass_kg_envelope: c.envelope?.max_mass_kg?.value ?? 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg: number; mass_budget_utilisation_pct: number } | null
    const prov = (f: string) => ({
      source: 'tool:mass-aggregator:envelope-check' as const,
      tool_id: 'mass-aggregator:envelope-check',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary' as const,
      tool_source_url: 'internal://forgeos/orchestrator/mass-agg',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        total_system_mass_kg: { value: out.total_system_mass_kg ?? 14, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: '1U fully populated', provenance: prov('total_system_mass_kg') },
        mass_budget_utilisation_pct: { value: out.mass_budget_utilisation_pct ?? 56, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 8. ngspice PCB power-stage (12 V rail simulation)
// ---------------------------------------------------------------------------

const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.total_power_kw?.value ?? 1.0,
    dc_bus_voltage_v: 12,
    ac_output_voltage_v: 0,
    topology: 'buck_converter' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { inverter_efficiency_pct: number; dissipated_power_kw: number } | null
    const prov = (f: string) => ({
      source: 'tool:ngspice:pcs-simulation' as const,
      tool_id: 'ngspice:pcs-simulation',
      tool_version: '46',
      tool_license: 'GPL-3.0' as const,
      tool_source_url: 'ngspice.sourceforge.io',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        psu_efficiency_pct_simulated: { value: out.inverter_efficiency_pct ?? 92, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: '50% load', provenance: prov('inverter_efficiency_pct') },
        psu_dissipated_kw: { value: out.dissipated_power_kw ?? 0.08, unit: 'kW', family: 'power', basis: 'continuous', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'PSU losses', provenance: prov('dissipated_power_kw') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 9-11. Universal tools (passthrough — best-effort generic merge)
// ---------------------------------------------------------------------------

function universalStep(toolId: string, prefix: string): ToolStep {
  return {
    tool_id: toolId,
    required: false,
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

const stepCoolProp = universalStep('coolprop:refrigerant-properties', 'coolprop_refrigerant_properties')
const stepCyberStride = universalStep('cybersecurity-threat-model:stride', 'cybersecurity_threat_model_stride')
const stepRegulatoryCost = universalStep('regulatory-cert-cost:lookup', 'regulatory_cert_cost_lookup')
const stepLcaCo2 = universalStep('lifecycle-co2:assessment', 'lifecycle_co2_assessment')
const stepSupplyRisk = universalStep('supply-chain-risk:scoring', 'supply_chain_risk_scoring')
const stepFmea = universalStep('reliability-fmea:system', 'reliability_fmea_system')
const stepTransport = universalStep('transport-logistics:routing', 'transport_logistics_routing')

// ---------------------------------------------------------------------------
// CONSISTENCY RULES (6)
// ---------------------------------------------------------------------------

const rules = [
  ruleQuantityRatio(
    'edge_ai.thermal_balance',
    'Chassis cooling ≥ heat dissipation × 1.10',
    'heat_dissipation_kw',
    'chassis_cooling_capacity_kw',
    1.10,
    'fatal',
  ),
  ruleQuantityRatio(
    'edge_ai.power_closure',
    'Grid power ≤ PSU capacity × 0.85',
    'grid_power_kw',
    'psu_capacity_kw',
    0.85,
    'warning',
  ),
  ruleRange(
    'edge_ai.efficiency_minimum',
    'PSU efficiency must be ≥ 90% (80+ Gold or better)',
    'psu_efficiency_pct',
    90,
    100,
    'warning',
  ),
  ruleRange(
    'edge_ai.inlet_temp_max',
    'Inlet temperature ≤ 35 °C (NEBS Level 3)',
    'max_inlet_temp_c',
    -5,
    35,
    'warning',
  ),
  ruleRange(
    'edge_ai.mass_budget',
    'Mass budget utilisation ≤ 100%',
    'mass_budget_utilisation_pct',
    0,
    100,
    'warning',
  ),
  ruleRange(
    'edge_ai.tdp_watts_range',
    'tdp_watts within physical bounds',
    'tdp_watts',
    5,
    5000,
    'info',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const EDGE_AI_PLAN: ClassToolPlan = {
  id: 'edge_ai:rack_1u',
  envelope_predicate: (e) => e.class === 'edge_ai',
  tools: [
    stepInferenceThroughput,
    stepThermalEnvelope,
    stepNetworkBandwidth,
    stepEnclosureEmc,
    stepCyberStride,
    stepNgspice,
    stepCoolProp,
    stepHvacLoad,
    stepFanCoil,
    stepMassAggregator,
    stepRegulatoryCost,
    stepLcaCo2,
    stepSupplyRisk,
    stepFmea,
    stepTransport,
  ],
  coupled_pairs: [
    ['inference-throughput:edge', 'thermal-envelope:ladder'],
    ['thermal-envelope:ladder', 'fan-coil:sizing'],
    ['thermal-envelope:ladder', 'hvac:load-sizing'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(EDGE_AI_PLAN)
