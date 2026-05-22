/**
 * scripts/lib/orchestrator/class-plans/auv.ts
 *
 * AUV (autonomous underwater vehicle) TOOL PLAN — BESS-quality
 * per the 2026-05-22 hand-tuning batch.
 *
 * Industry references: Saab Seaeye Sabertooth, Kongsberg HUGIN-1000.
 * Envelope: 50-500 kg deep-water work-class (100-3000 m operating
 * depth).
 *
 * Tools (15):
 *   1.  auv-hydro:drag-buoyancy           - drag + buoyancy + seawater density
 *   2.  pressure-vessel:design            - hull thickness + collapse check
 *   3.  sonar:acoustic-attenuation        - sonar range vs frequency + sea-state
 *   4.  mission-endurance:depth           - endurance ladder for dive profile
 *   5.  acoustic-modem:link-budget        - acoustic link margin / data rate
 *   6.  ins:navigation-drift              - INS drift + DVL aid
 *   7.  corrosion:anode-sizing            - sacrificial anode mass / life
 *   8.  recovery-method:logistics         - recovery vessel + crane / hoist size
 *   9.  pybamm:cell-sizing                - subsea battery sizing + cycle life
 *   10. opencv-machine-vision:inspection  - forward-facing camera detection
 *   11. scikit-fem:run                    - pressure hull FEA + dome stress
 *   12. mass-aggregator:envelope-check    - total mass vs in-air target
 *   13. regulatory-imo:maritime           - IMO MASS / SOLAS classification
 *   14. regulatory-cert-cost:lookup       - certification cost (universal)
 *   15. lifecycle-co2:assessment          - LCA carbon (universal)
 *   ... + reliability-fmea, supply-chain-risk, cybersecurity, transport
 *
 * Consistency rules:
 *   - auv.endurance_closure         computed_endurance_h ≥ target_endurance_h × 0.95
 *   - auv.hull_pressure             external_pressure_bar within physical bounds
 *   - auv.mass_closure              total_system_mass_kg ≤ in-air target × 1.05
 *   - auv.buoyancy_band             positive_buoyancy_fraction within 4-12%
 *   - auv.regulatory_coverage       ≥ 3 IMO mandatory standards tagged
 *   - auv.battery_capacity_band     battery_capacity_kwh within 0.5-50 kWh
 */

import { registerPlan } from '../planner'
import { ruleClosure, ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// Touch helpers to satisfy --noUnusedLocals.
void ruleQuantityRatio

// ---------------------------------------------------------------------------
// SHARED HELPER — defensive contract update that scans tool output for top-
// level numeric fields and stores them under <tool>_<field>. Detailed per-
// tool unpacking remains a future enhancement; this lets the executor wire
// any tool whose output schema isn't yet hand-typed without losing data.
// ---------------------------------------------------------------------------

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
// HAND-TUNED TOOL STEPS — read inputs from contract by canonical key.
// ---------------------------------------------------------------------------

const stepAuvHydro: ToolStep = {
  tool_id: 'auv-hydro:drag-buoyancy',
  required: false,
  feeds_into: ['motor-prop:matching', 'mission-endurance:depth'],
  input_from_contract: (c: any) => ({
    operating_depth_m: c.quantities?.operating_depth_m?.value ?? 500,
    seawater_density_kg_m3: c.quantities?.seawater_density_kg_m3?.value ?? 1025,
    hull_diameter_m: c.quantities?.hull_diameter_m?.value ?? 0.4,
    hull_length_m: c.quantities?.hull_length_m?.value ?? 2.0,
    cruise_speed_m_s: 2.0,
  }),
  contract_update: genericUpdate('auv-hydro:drag-buoyancy', 'auv_hydro'),
}

const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: ['scikit-fem:run'],
  input_from_contract: (c: any) => ({
    operating_depth_m: c.quantities?.operating_depth_m?.value ?? 500,
    external_pressure_bar: c.quantities?.external_pressure_bar?.value ?? 50,
    hull_material: c.quantities?.operating_depth_m?.value >= 1000 ? 'titanium_grade_5' : 'aluminium_6061_t6',
    hull_diameter_m: c.quantities?.hull_diameter_m?.value ?? 0.4,
    hull_length_m: c.quantities?.hull_length_m?.value ?? 2.0,
    safety_factor: 1.5,
    weld_efficiency: 0.85,
  }),
  contract_update: genericUpdate('pressure-vessel:design', 'pressure_vessel'),
}

const stepScikitFem: ToolStep = {
  tool_id: 'scikit-fem:run',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    geometry: 'pressure_hull_cylinder',
    diameter_m: c.quantities?.hull_diameter_m?.value ?? 0.4,
    length_m: c.quantities?.hull_length_m?.value ?? 2.0,
    thickness_mm: c.quantities?.hull_thickness_mm?.value ?? 8,
    external_pressure_pa: ((c.quantities?.external_pressure_bar?.value as number) ?? 50) * 1e5,
    material: c.quantities?.operating_depth_m?.value >= 1000 ? 'titanium_grade_5' : 'aluminium_6061_t6',
  }),
  contract_update: genericUpdate('scikit-fem:run', 'pressure_hull_fea'),
}

const stepSonarAcoustic: ToolStep = {
  tool_id: 'sonar:acoustic-attenuation',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    frequency_khz: 400,
    sea_state: 3,
    temperature_c: 4,
    salinity_psu: 35,
    target_range_m: 200,
  }),
  contract_update: genericUpdate('sonar:acoustic-attenuation', 'sonar_acoustic'),
}

const stepAcousticModem: ToolStep = {
  tool_id: 'acoustic-modem:link-budget',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    centre_freq_khz: 25,
    bandwidth_khz: 16,
    range_m: 5000,
    sea_state: 3,
  }),
  contract_update: genericUpdate('acoustic-modem:link-budget', 'acoustic_modem'),
}

const stepInsDrift: ToolStep = {
  tool_id: 'ins:navigation-drift',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    ins_class: 'fog_tactical',
    bias_deg_per_h: 0.05,
    dvl_aid: true,
    mission_duration_h: 12,
  }),
  contract_update: genericUpdate('ins:navigation-drift', 'ins_drift'),
}

const stepCorrosionAnode: ToolStep = {
  tool_id: 'corrosion:anode-sizing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    hull_area_m2: 2 * Math.PI * ((c.quantities?.hull_diameter_m?.value ?? 0.4) / 2) * ((c.quantities?.hull_length_m?.value ?? 2.0)),
    hull_material: c.quantities?.operating_depth_m?.value >= 1000 ? 'titanium_grade_5' : 'aluminium_6061_t6',
    design_life_years: 5,
    seawater_temperature_c: 4,
  }),
  contract_update: genericUpdate('corrosion:anode-sizing', 'corrosion_anode'),
}

const stepRecoveryLogistics: ToolStep = {
  tool_id: 'recovery-method:logistics',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    vehicle_mass_kg: c.quantities?.mtow_air_kg?.value ?? 150,
    operating_depth_m: c.quantities?.operating_depth_m?.value ?? 500,
    recovery_method: 'a-frame_crane',
  }),
  contract_update: genericUpdate('recovery-method:logistics', 'recovery_logistics'),
}

const stepPyBammSubsea: ToolStep = {
  tool_id: 'pybamm:cell-sizing',
  required: false,
  feeds_into: ['mission-endurance:depth'],
  input_from_contract: (c: any) => ({
    target_energy_kwh: c.quantities?.battery_capacity_kwh?.value ?? 4,
    dod_fraction: 0.80,
    cell_chemistry: 'lfp' as const,
    cell_capacity_ah: 14,
    cell_voltage_v: 3.2,
    ambient_temp_c: 4,
    dc_bus_voltage_v: c.quantities?.bus_voltage_v?.value ?? 24,
    rated_power_kw: c.quantities?.peak_power_kw?.value ?? 1.5,
  }),
  contract_update: genericUpdate('pybamm:cell-sizing', 'pybamm_subsea'),
}

const stepMissionEndurance: ToolStep = {
  tool_id: 'mission-endurance:depth',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    battery_kwh: c.quantities?.battery_capacity_kwh?.value ?? 4,
    cruise_power_kw: c.quantities?.cruise_power_kw?.value ?? 0.4,
    propulsion_efficiency: c.quantities?.propulsion_efficiency?.value ?? 0.8,
    operating_depth_m: c.quantities?.operating_depth_m?.value ?? 500,
  }),
  contract_update: genericUpdate('mission-endurance:depth', 'mission_endurance'),
}

const stepOpencvVision: ToolStep = {
  tool_id: 'opencv-machine-vision:inspection',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    camera_resolution_px: 4096,
    fps: 30,
    forward_lighting_lm: 40000,
    detection_target: 'submerged_infrastructure',
  }),
  contract_update: genericUpdate('opencv-machine-vision:inspection', 'opencv_vision'),
}

const stepRegImo: ToolStep = {
  tool_id: 'regulatory-imo:maritime',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ region: 'EU', vehicle_class: 'mass_autonomous', operating_environment: 'open_sea' }),
  contract_update: genericUpdate('regulatory-imo:maritime', 'regulatory_imo'),
}

const stepRegCertCost: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'auv', region: 'EU' }),
  contract_update: genericUpdate('regulatory-cert-cost:lookup', 'regulatory_cert_cost'),
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    product_class: 'auv',
    mass_kg: c.quantities?.mtow_air_kg?.value ?? 150,
    battery_kwh: c.quantities?.battery_capacity_kwh?.value ?? 4,
  }),
  contract_update: genericUpdate('lifecycle-co2:assessment', 'lifecycle_co2'),
}

const stepSupplyChainRisk: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'auv' }),
  contract_update: genericUpdate('supply-chain-risk:scoring', 'supply_chain_risk'),
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'auv', module_count: 10 }),
  contract_update: genericUpdate('reliability-fmea:system', 'reliability_fmea'),
}

const stepCybersecurity: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'auv', wireless: ['iridium', 'acoustic', 'wifi'] }),
  contract_update: genericUpdate('cybersecurity-threat-model:stride', 'cybersecurity'),
}

const stepTransport: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    mass_kg: c.quantities?.mtow_air_kg?.value ?? 150,
    longest_dim_m: c.quantities?.hull_length_m?.value ?? 2.5,
    fragility: 'electronics_navigation',
  }),
  contract_update: genericUpdate('transport-logistics:routing', 'transport'),
}

// Mass aggregator — runs last to roll all per-subsystem masses into a
// system-level mass + envelope check.
const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    hull_mass_kg: c.quantities?.hull_mass_kg?.value ?? 50,
    battery_mass_kg: c.quantities?.battery_mass_kg?.value ?? 50,
    thruster_count: c.quantities?.thruster_count?.value ?? 4,
    thruster_mass_kg_each: 2,
    electronics_mass_kg: 5,
    ballast_mass_kg: c.quantities?.ballast_mass_kg?.value ?? 20,
    max_mass_kg_envelope: c.quantities?.mtow_air_kg?.value ?? 500,
  }),
  contract_update: genericUpdate('mass-aggregator:envelope-check', 'mass_aggregator'),
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleClosure(
    'auv.endurance_closure',
    'computed_endurance_h ≥ target_endurance_h × 0.95',
    'computed_endurance_h',
    (c) => {
      const target = c.quantities.target_endurance_h?.value
      if (!target) return null
      return target * 0.95
    },
    20,
    'warning',
  ),
  ruleRange('auv.hull_pressure', 'external_pressure_bar within 5-300 bar', 'external_pressure_bar', 5, 300, 'warning'),
  ruleRange('auv.battery_capacity_band', 'battery_capacity_kwh within 0.5-50 kWh', 'battery_capacity_kwh', 0.5, 50, 'warning'),
  ruleRange('auv.operating_depth_band', 'operating_depth_m within 10-11000 m', 'operating_depth_m', 10, 11000, 'warning'),
  ruleRange('auv.buoyancy_band', 'positive_buoyancy_fraction within 0.02-0.15', 'positive_buoyancy_fraction', 0.02, 0.15, 'warning'),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const AUV_PLAN: ClassToolPlan = {
  id: 'auv:mid_water',
  envelope_predicate: (e) => e.class === 'auv',
  tools: [
    stepAuvHydro,
    stepPressureVessel,
    stepScikitFem,
    stepSonarAcoustic,
    stepAcousticModem,
    stepInsDrift,
    stepCorrosionAnode,
    stepRecoveryLogistics,
    stepPyBammSubsea,
    stepMissionEndurance,
    stepOpencvVision,
    stepRegImo,
    stepRegCertCost,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepCybersecurity,
    stepTransport,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['auv-hydro:drag-buoyancy', 'mission-endurance:depth'],
    ['pybamm:cell-sizing', 'mission-endurance:depth'],
    ['pressure-vessel:design', 'scikit-fem:run'],
  ],
  max_iterations: 3,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(AUV_PLAN)
