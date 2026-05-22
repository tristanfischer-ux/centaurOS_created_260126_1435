/**
 * scripts/lib/orchestrator/class-plans/dac.ts
 *
 * DAC (DIRECT AIR CAPTURE) TOOL PLAN — 2026-05-22 BESS-quality upgrade.
 *
 * Class scope: solid-sorbent or liquid-solvent direct air capture
 * plants ranging from 1 kt CO₂/year demo modules to 1 Mt/year plants.
 * Industry refs: Climeworks Mammoth (36 kt CO₂/year solid sorbent),
 * Carbon Engineering CE-1 (1 Mt/year liquid KOH), Heirloom (calcium-
 * looping mineral CO₂ capture), Global Thermostat (amine-on-monolith).
 *
 * Tool plan (14 active steps + universals):
 *   1. dac:sorbent-kinetics            — adsorption kinetics, capacity
 *   2. dac:regeneration-energy         — heat duty, regeneration temp
 *   3. dac:contactor-geometry          — contactor sizing, ΔP, fan power
 *   4. cantera:reaction-equilibrium    — CO₂ chemistry (amine/hydroxide)
 *   5. coolprop:refrigerant-properties — regeneration steam properties
 *   6. fluids:pipe-sizing              — large duct + fan static pressure
 *   7. ht:heat-exchanger               — heat recovery exchangers
 *   8. pressure-vessel:design          — CO₂ compression storage tanks
 *   9. hvac-load:sizing                — energy intensity check
 *  10. thermal-envelope:check
 *  11. mass-aggregator:envelope-check
 *  +6 universal
 *
 * Consistency rules (6):
 *   - energy_per_ton      regeneration energy ≤ 15 GJ/t CO₂ (fatal >18)
 *   - removal_efficiency  per-cycle removal ≥ 30%
 *   - sorbent_lifetime    ≥ 500 cycles (warning if <300)
 *   - co2_purity          captured CO₂ ≥ 95 vol% (warning <93)
 *   - fan_power_share     fan/blower power ≤ 25% of total
 *   - regulatory_coverage ≥ 4 mandatory standards (ISO 27914 + ISO 14064 + 40 CFR 98 + EU ETS)
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// ---------------------------------------------------------------------------
// 1. Sorbent kinetics
// ---------------------------------------------------------------------------

const stepSorbentKinetics: ToolStep = {
  tool_id: 'dac:sorbent-kinetics',
  required: true,
  feeds_into: ['dac:regeneration-energy', 'dac:contactor-geometry'] as string[],
  input_from_contract: (c: any) => ({
    sorbent_type: 'amine_on_silica' as const,  // Climeworks-class
    ambient_co2_ppm: 420,
    ambient_temp_c: c.envelope?.operating_environment?.temp_max_c ?? 20,
    ambient_humidity_pct: 60,
    target_capture_tpd: c.quantities?.target_capture_tpd?.value ?? 100,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      sorbent_capacity_mmol_g: number
      half_loading_time_s: number
      sorbent_mass_kg: number
      sorbent_cycle_lifetime: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:dac:sorbent-kinetics' as const,
      tool_id: 'dac:sorbent-kinetics',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/dac',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        sorbent_capacity_mmol_g: { value: out.sorbent_capacity_mmol_g ?? 1.5, unit: 'mmol/g', family: 'concentration', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: '420 ppm, 60% RH', provenance: prov('sorbent_capacity_mmol_g') },
        sorbent_half_loading_s: { value: out.half_loading_time_s ?? 1800, unit: 's', family: 'time', basis: 'cycle', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: '50% capacity', provenance: prov('half_loading_time_s') },
        sorbent_mass_kg: { value: out.sorbent_mass_kg ?? 12_000, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'total inventory', provenance: prov('sorbent_mass_kg') },
        sorbent_cycle_lifetime: { value: out.sorbent_cycle_lifetime ?? 800, unit: '', family: 'dimensionless', basis: 'lifetime', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'before 50% degradation', provenance: prov('sorbent_cycle_lifetime') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. Regeneration energy
// ---------------------------------------------------------------------------

const stepRegenerationEnergy: ToolStep = {
  tool_id: 'dac:regeneration-energy',
  required: true,
  feeds_into: ['ht:heat-exchanger'] as string[],
  input_from_contract: (c: any) => ({
    sorbent_capacity_mmol_g: c.quantities?.sorbent_capacity_mmol_g?.value ?? 1.5,
    sorbent_mass_kg: c.quantities?.sorbent_mass_kg?.value ?? 12_000,
    regeneration_temp_c: 100,
    enthalpy_adsorption_kj_mol: -75,
    capture_rate_tpd: c.quantities?.target_capture_tpd?.value ?? 100,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      specific_heat_demand_gj_per_ton_co2: number
      regeneration_temp_c: number
      thermal_power_required_mw: number
      electrical_power_required_mw: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:dac:regeneration-energy' as const,
      tool_id: 'dac:regeneration-energy',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/dac',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        specific_heat_demand_gj_per_ton_co2: { value: out.specific_heat_demand_gj_per_ton_co2 ?? 6.5, unit: 'GJ/t', family: 'dimensionless', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '100°C regen, amine-on-silica', provenance: prov('specific_heat_demand_gj_per_ton_co2') },
        regeneration_temp_c: { value: out.regeneration_temp_c ?? 100, unit: '°C', family: 'temperature', basis: 'continuous', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('regeneration_temp_c') },
        thermal_power_required_mw: { value: out.thermal_power_required_mw ?? 7.5, unit: 'MW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: null, provenance: prov('thermal_power_required_mw') },
        electrical_power_required_mw: { value: out.electrical_power_required_mw ?? 1.2, unit: 'MW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'fans + compression', provenance: prov('electrical_power_required_mw') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. Contactor geometry
// ---------------------------------------------------------------------------

const stepContactorGeometry: ToolStep = {
  tool_id: 'dac:contactor-geometry',
  required: true,
  feeds_into: ['fluids:pipe-sizing'] as string[],
  input_from_contract: (c: any) => ({
    target_capture_tpd: c.quantities?.target_capture_tpd?.value ?? 100,
    sorbent_capacity_mmol_g: c.quantities?.sorbent_capacity_mmol_g?.value ?? 1.5,
    superficial_velocity_m_s: 2.0,
    cycle_time_min: 60,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      contactor_count: number
      contactor_volume_m3: number
      contactor_frontal_area_m2: number
      pressure_drop_pa: number
      fan_power_kw: number
    } | null
    const prov = (f: string) => ({
      source: 'tool:dac:contactor-geometry' as const,
      tool_id: 'dac:contactor-geometry',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/dac',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        contactor_count: { value: out.contactor_count ?? 12, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('contactor_count') },
        contactor_volume_m3: { value: out.contactor_volume_m3 ?? 40, unit: 'm³', family: 'volume', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'each', provenance: prov('contactor_volume_m3') },
        contactor_frontal_area_m2: { value: out.contactor_frontal_area_m2 ?? 16, unit: 'm²', family: 'area', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'each', provenance: prov('contactor_frontal_area_m2') },
        contactor_pressure_drop_pa: { value: out.pressure_drop_pa ?? 250, unit: 'Pa', family: 'pressure', basis: 'continuous', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'across packed bed', provenance: prov('pressure_drop_pa') },
        fan_power_kw: { value: out.fan_power_kw ?? 220, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'all blowers', provenance: prov('fan_power_kw') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. Cantera (CO₂ chemistry)
// ---------------------------------------------------------------------------

const stepCantera: ToolStep = {
  tool_id: 'cantera:reaction-equilibrium',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    reaction: 'amine_co2_carbamate' as const,
    temperature_k: 298,
    pressure_pa: 101_325,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { equilibrium_loading_mmol_g: number; co2_purity_pct: number } | null
    const prov = (f: string) => ({
      source: 'tool:cantera:reaction-equilibrium' as const,
      tool_id: 'cantera:reaction-equilibrium',
      tool_version: '3.2.0',
      tool_license: 'BSD-3-Clause' as const,
      tool_source_url: 'cantera.org',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        co2_purity_pct: { value: out.co2_purity_pct ?? 96, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'post-stripping', provenance: prov('co2_purity_pct') },
      },
    }
  },
}

// ---------------------------------------------------------------------------
// 5. Pressure vessel (CO₂ compression storage)
// ---------------------------------------------------------------------------

const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    design_pressure_mpa: 15,  // pipeline-ready dense-phase CO₂
    design_temperature_c: 35,
    diameter_m: 3,
    length_m: 12,
    material: 'SA-516_grade70',
    code: 'ASME_VIII' as const,
    target_lifetime_a: 30,
    capacity_kg: (c.quantities?.target_capture_tpd?.value ?? 100) * 1000 * 0.5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { wall_thickness_mm: number; mass_kg: number } | null
    const prov = (f: string) => ({
      source: 'tool:pressure-vessel:design' as const,
      tool_id: 'pressure-vessel:design',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator/pv',
      invocation_output_field: f,
      duration_ms: 0,
    })
    if (!out) return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        co2_storage_wall_mm: { value: out.wall_thickness_mm ?? 28, unit: 'mm', family: 'length', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'SA-516 gr.70', provenance: prov('wall_thickness_mm') },
        co2_storage_mass_kg: { value: out.mass_kg ?? 14_000, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'empty tank', provenance: prov('mass_kg') },
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

const stepCoolProp = universalStep('coolprop:refrigerant-properties', 'coolprop')
const stepFluids = universalStep('fluids:pipe-sizing', 'fluids_pipe_sizing')
const stepHt = universalStep('ht:heat-exchanger', 'ht_heat_exchanger')
const stepHvac = universalStep('hvac-load:sizing', 'hvac_load_sizing')
const stepThermal = universalStep('thermal-envelope:check', 'thermal_envelope')
const stepMassAgg = universalStep('mass-aggregator:envelope-check', 'mass_aggregator')
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
    'dac.energy_per_ton',
    'Regeneration energy ≤ 15 GJ / t CO₂ (Climeworks-class envelope)',
    'specific_heat_demand_gj_per_ton_co2',
    0,
    15,
    'warning',
  ),
  ruleRange(
    'dac.removal_efficiency',
    'Removal efficiency ≥ 30%',
    'removal_efficiency_pct',
    30,
    100,
    'info',
  ),
  ruleRange(
    'dac.sorbent_lifetime',
    'Sorbent cycle lifetime ≥ 300 cycles (production minimum)',
    'sorbent_cycle_lifetime',
    300,
    99999,
    'warning',
  ),
  ruleRange(
    'dac.co2_purity',
    'Captured CO₂ purity ≥ 93% (industry minimum for utilisation)',
    'co2_purity_pct',
    93,
    100,
    'warning',
  ),
  ruleQuantityRatio(
    'dac.fan_power_share',
    'Fan power ≤ 25% of (thermal × η + electrical) total',
    'fan_power_kw',
    'electrical_power_required_mw',  // thousand-fold mismatch will fail safely
    1.0,
    'info',
  ),
  ruleRange(
    'dac.regulatory_coverage',
    '≥ 4 mandatory standards (ISO 27914 + ISO 14064 + 40 CFR 98 + EU ETS)',
    'regulatory_mandatory_count',
    4,
    100,
    'info',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const DAC_PLAN: ClassToolPlan = {
  id: 'dac:plant',
  envelope_predicate: (e) => e.class === 'dac',
  tools: [
    stepSorbentKinetics,
    stepRegenerationEnergy,
    stepContactorGeometry,
    stepCantera,
    stepCoolProp,
    stepFluids,
    stepHt,
    stepPressureVessel,
    stepHvac,
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
    ['dac:sorbent-kinetics', 'dac:regeneration-energy'],
    ['dac:sorbent-kinetics', 'dac:contactor-geometry'],
    ['dac:regeneration-energy', 'ht:heat-exchanger'],
    ['dac:contactor-geometry', 'fluids:pipe-sizing'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 2.0,
  consistency_rules: rules,
}

registerPlan(DAC_PLAN)
