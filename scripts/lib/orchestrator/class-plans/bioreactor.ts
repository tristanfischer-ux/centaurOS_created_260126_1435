/**
 * scripts/lib/orchestrator/class-plans/bioreactor.ts
 *
 * BIOREACTOR (stirred-tank) TOOL PLAN — BESS-quality per the
 * 2026-05-22 hand-tuning batch.
 *
 * Industry references: Sartorius BIOSTAT D-DCU 100-2000 L,
 * Eppendorf BioFlo 320/510/730, Pall Allegro STR, Thermo HyPerforma.
 *
 * Tools (14):
 *   1.  biosteam:fermentation-stoich        - reactor stoichiometry + yield
 *   2.  kla-oxygen:transfer                 - kLa + OTR (Van 't Riet)
 *   3.  agitation:power                     - Rushton/Maxblend power draw
 *   4.  monod:growth-kinetics               - cell growth kinetics
 *   5.  ph-titration:sizing                 - pH dosing pump sizing
 *   6.  dissolved-oxygen:control            - DO cascade control
 *   7.  clean-in-place:cip                  - CIP cycle time + chemistry
 *   8.  downstream-chromatography:sizing    - chromatography column size
 *   9.  pressure-vessel:design              - vessel pressure rating
 *   10. coolprop:refrigerant-properties     - cooling jacket fluid
 *   11. fluids:run                          - piping + sparger nozzles
 *   12. mass-aggregator:envelope-check      - vessel + skid mass
 *   13. regulatory-fda:cgmp                 - FDA / EMA cGMP standards
 *   14. regulatory-cert-cost:lookup         - cGMP cost (universal)
 *   ... + lifecycle-co2, supply-chain-risk, reliability-fmea, cybersecurity,
 *       transport
 *
 * Consistency rules:
 *   - bioreactor.working_volume_band        100 L - 50 000 L
 *   - bioreactor.kla_band                   100-800 1/h
 *   - bioreactor.agitator_power_per_l       0.5-20 W/L
 *   - bioreactor.temp_band                  4-150 °C
 *   - bioreactor.heat_removal_closure       heat_removal ≥ agitator+microbial
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio, ruleClosure } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleQuantityRatio

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

const stepBiosteam: ToolStep = {
  tool_id: 'biosteam:fermentation-stoich',
  required: false,
  feeds_into: ['monod:growth-kinetics'],
  input_from_contract: (c: any) => ({
    working_volume_l: c.quantities?.working_volume_l?.value ?? 1000,
    substrate: 'glucose',
    product: 'ethanol',
    target_titer_g_l: 100,
    batch_time_h: 48,
  }),
  contract_update: genericUpdate('biosteam:fermentation-stoich', 'biosteam_fermentation'),
}

const stepKlaOxygen: ToolStep = {
  tool_id: 'kla-oxygen:transfer',
  required: false,
  feeds_into: ['agitation:power', 'dissolved-oxygen:control'],
  input_from_contract: (c: any) => ({
    working_volume_l: c.quantities?.working_volume_l?.value ?? 1000,
    agitator_power_per_l_w: c.quantities?.agitation_power_per_l_w?.value ?? 5,
    superficial_gas_velocity_m_s: 0.05,
    impeller_type: 'rushton_d3',
    fluid: 'water',
    target_otr_mmol_l_h: c.quantities?.otr_mmol_l_h?.value ?? 40,
  }),
  contract_update: genericUpdate('kla-oxygen:transfer', 'kla_oxygen'),
}

const stepAgitationPower: ToolStep = {
  tool_id: 'agitation:power',
  required: false,
  feeds_into: ['kla-oxygen:transfer'],
  input_from_contract: (c: any) => ({
    impeller_d_m: (c.quantities?.vessel_diameter_m?.value ?? 1.0) / 3,
    impeller_n_rpm: 200,
    fluid_density_kg_m3: 1000,
    fluid_viscosity_cp: 1,
    impeller_type: 'rushton',
    baffles: true,
  }),
  contract_update: genericUpdate('agitation:power', 'agitation_power'),
}

const stepMonodKinetics: ToolStep = {
  tool_id: 'monod:growth-kinetics',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({
    mu_max_per_h: 0.5,
    ks_g_l: 0.1,
    yxs: 0.5,
    initial_substrate_g_l: 20,
  }),
  contract_update: genericUpdate('monod:growth-kinetics', 'monod_kinetics'),
}

const stepPhTitration: ToolStep = {
  tool_id: 'ph-titration:sizing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    working_volume_l: c.quantities?.working_volume_l?.value ?? 1000,
    setpoint_ph: 7.0,
    base_titer_m: 5,
    acid_titer_m: 2,
    expected_acid_production_mol_l_h: 0.01,
  }),
  contract_update: genericUpdate('ph-titration:sizing', 'ph_titration'),
}

const stepDoControl: ToolStep = {
  tool_id: 'dissolved-oxygen:control',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    working_volume_l: c.quantities?.working_volume_l?.value ?? 1000,
    target_do_pct_sat: 30,
    kla_per_h: c.quantities?.kla_per_h?.value ?? 270,
  }),
  contract_update: genericUpdate('dissolved-oxygen:control', 'do_control'),
}

const stepCip: ToolStep = {
  tool_id: 'clean-in-place:cip',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    vessel_volume_l: c.quantities?.total_volume_l?.value ?? 1250,
    cycle_steps: ['rinse', 'caustic_naoh_2pct', 'rinse', 'acid_hno3_1pct', 'rinse'],
    target_residue_ppm: 1,
  }),
  contract_update: genericUpdate('clean-in-place:cip', 'cip'),
}

const stepDownstreamChromatography: ToolStep = {
  tool_id: 'downstream-chromatography:sizing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    feed_volume_l: c.quantities?.working_volume_l?.value ?? 1000,
    target_purity_pct: 99.5,
    resin_kind: 'protein_a_affinity',
    flow_velocity_cm_h: 300,
  }),
  contract_update: genericUpdate('downstream-chromatography:sizing', 'downstream_chromatography'),
}

const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    internal_pressure_bar: 4,
    vessel_diameter_m: c.quantities?.vessel_diameter_m?.value ?? 1.0,
    vessel_length_m: c.quantities?.vessel_height_m?.value ?? 2.0,
    material: 'stainless_steel_316l',
    safety_factor: 1.5,
    weld_efficiency: 0.85,
  }),
  contract_update: genericUpdate('pressure-vessel:design', 'pressure_vessel'),
}

const stepCoolProp: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: ['fluids:run'],
  input_from_contract: () => ({
    fluid: 'water_glycol_30pct',
    temperature_c: 5,
    pressure_pa: 200000,
  }),
  contract_update: genericUpdate('coolprop:refrigerant-properties', 'coolprop'),
}

const stepFluids: ToolStep = {
  tool_id: 'fluids:run',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    geometry: 'sparger_ring_and_jacket',
    sparger_flow_l_min: c.quantities?.sparger_flow_l_min?.value ?? 750,
    pipe_d_mm: 25,
    inlet_pressure_bar: 2,
  }),
  contract_update: genericUpdate('fluids:run', 'fluids_run'),
}

const stepRegFdaCgmp: ToolStep = {
  tool_id: 'regulatory-fda:cgmp',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ region: 'US+EU', application: 'bioreactor_drug_product' }),
  contract_update: genericUpdate('regulatory-fda:cgmp', 'regulatory_fda_cgmp'),
}

const stepRegCertCost: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'bioreactor', region: 'EU' }),
  contract_update: genericUpdate('regulatory-cert-cost:lookup', 'regulatory_cert_cost'),
}

const stepLifecycleCo2: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    product_class: 'bioreactor',
    mass_kg: c.quantities?.vessel_mass_kg?.value ?? 4000,
    working_volume_l: c.quantities?.working_volume_l?.value ?? 1000,
  }),
  contract_update: genericUpdate('lifecycle-co2:assessment', 'lifecycle_co2'),
}

const stepSupplyChainRisk: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'bioreactor', critical_parts: ['316l_vessel', 'mettler_probes', 'watson_marlow_pumps'] }),
  contract_update: genericUpdate('supply-chain-risk:scoring', 'supply_chain_risk'),
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'bioreactor', module_count: 12 }),
  contract_update: genericUpdate('reliability-fmea:system', 'reliability_fmea'),
}

const stepCybersecurity: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [],
  input_from_contract: () => ({ class: 'bioreactor', wireless: ['profibus', 'opc_ua'] }),
  contract_update: genericUpdate('cybersecurity-threat-model:stride', 'cybersecurity'),
}

const stepTransport: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    mass_kg: c.quantities?.vessel_mass_kg?.value ?? 4000,
    longest_dim_m: c.quantities?.vessel_height_m?.value ?? 2.0,
    fragility: 'sanitary_316l_vessel',
  }),
  contract_update: genericUpdate('transport-logistics:routing', 'transport'),
}

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [],
  input_from_contract: (c: any) => ({
    vessel_mass_kg: c.quantities?.vessel_mass_kg?.value ?? 4000,
    agitator_mass_kg: 200,
    skid_mass_kg: 800,
    tcu_mass_kg: 300,
    control_panel_mass_kg: 150,
    max_mass_kg_envelope: (c.quantities?.vessel_mass_kg?.value ?? 4000) * 1.5,
  }),
  contract_update: genericUpdate('mass-aggregator:envelope-check', 'mass_aggregator'),
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange('bioreactor.working_volume_band', 'working_volume_l within 100-50000 L', 'working_volume_l', 100, 50000, 'warning'),
  ruleRange('bioreactor.kla_band', 'kla_per_h within 50-1200 1/h', 'kla_per_h', 50, 1200, 'warning'),
  ruleRange('bioreactor.agitator_power_per_l_band', 'agitation_power_per_l_w within 0.5-20 W/L', 'agitation_power_per_l_w', 0.5, 20, 'warning'),
  ruleRange('bioreactor.temp_min_band', 'temp_control_min_c within 4-100 °C', 'temp_control_min_c', 4, 100, 'warning'),
  ruleRange('bioreactor.temp_max_band', 'temp_control_max_c within 30-150 °C (SIP capability)', 'temp_control_max_c', 30, 150, 'warning'),
  ruleClosure(
    'bioreactor.heat_removal_closure',
    'heat_removal_kw ≥ agitator_heat + microbial_heat',
    'heat_removal_kw',
    (c) => {
      const agitator = c.quantities.agitator_heat_kw?.value
      const microbial = c.quantities.microbial_heat_kw?.value
      if (typeof agitator !== 'number' || typeof microbial !== 'number') return null
      return agitator + microbial
    },
    10,
    'warning',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const BIOREACTOR_PLAN: ClassToolPlan = {
  id: 'bioreactor:pilot',
  envelope_predicate: (e) => e.class === 'bioreactor',
  tools: [
    stepBiosteam,
    stepKlaOxygen,
    stepAgitationPower,
    stepMonodKinetics,
    stepPhTitration,
    stepDoControl,
    stepCip,
    stepDownstreamChromatography,
    stepPressureVessel,
    stepCoolProp,
    stepFluids,
    stepRegFdaCgmp,
    stepRegCertCost,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepCybersecurity,
    stepTransport,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['kla-oxygen:transfer', 'agitation:power'],
    ['monod:growth-kinetics', 'biosteam:fermentation-stoich'],
    ['coolprop:refrigerant-properties', 'fluids:run'],
  ],
  max_iterations: 5,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(BIOREACTOR_PLAN)
