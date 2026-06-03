/**
 * scripts/lib/orchestrator/class-plans/co2-mineralisation.ts
 *
 * CO2 capture + mineral-carbonation plant TOOL PLAN — 2026-06-03.
 *
 * WHY THIS EXISTS: without a registered plan the orchestrator's UNIVERSAL_AUTO_PLAN
 * fallback composes a generic tool graph that pulls in SPACECRAFT (delta-v) and
 * BATTERY (PyBaMM) sizing tools that have no business in a chemical plant — the
 * contamination Tristan spotted in the first CO2 dossier. Registering a plan with
 * ONLY the generic chemical-plant tools stops the fallback and keeps the methodology
 * / appendix sections on-topic.
 *
 * Tools (generic, chemical-plant-relevant — NO spacecraft / battery tools):
 *   - cantera:reaction-equilibrium  → CO2/amine carbamate + carbonation equilibrium
 *   - fluids:pipe-sizing            → slurry + coolant + amine line sizing
 *   - ht:heat-exchanger             → reboiler + dryer + cooling duty
 *   - pressure-vessel:design        → carbonation reactor + columns
 *   - mass-aggregator:envelope-check→ skid mass envelope
 *
 * The emitter (emitters/co2-mineralisation.ts) sizes from contract quantities with
 * 1 t/day fallbacks, so these tool steps are deliberately light (non-fatal,
 * contract-preserving) — their job is to seat a real, on-topic plan, not to drive
 * bespoke sizing. A later pass can wire their outputs into the contract.
 *
 * British spelling.
 */

import { registerPlan } from '../planner'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

const q = (c: ContractInProgress, key: string, fallback: number): number => {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

const stepCantera: ToolStep = {
  tool_id: 'cantera:reaction-equilibrium',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    reaction: 'amine_co2_carbamate' as const,
    temperature_k: 333, // ~60 °C carbonation
    pressure_pa: 101_325,
  }),
  contract_update: (c: ContractInProgress) => c, // light: emitter uses fallbacks
}

const stepFluids: ToolStep = {
  tool_id: 'fluids:pipe-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    flow_m3_h: q(c, 'mea_circulation_m3_h', 3),
    fluid: 'water_glycol' as const,
    target_velocity_m_s: 1.5,
  }),
  contract_update: (c: ContractInProgress) => c,
}

const stepHt: ToolStep = {
  tool_id: 'ht:heat-exchanger',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    duty_kw: q(c, 'dryer_heat_duty_kw', 75),
    hot_in_c: 130,
    cold_in_c: 25,
    type: 'plate' as const,
  }),
  contract_update: (c: ContractInProgress) => c,
}

const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    design_pressure_mpa: 0.6, // atmospheric/low-pressure stirred reactor
    design_temperature_c: 120,
    diameter_m: 1.6,
    length_m: 2.0,
    material: 'SA-240_316L',
    code: 'PED' as const,
    target_lifetime_a: 20,
    capacity_kg: q(c, 'carbonation_reactor_volume_m3', 4) * 1000,
  }),
  contract_update: (c: ContractInProgress) => c,
}

const stepMassAgg: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ envelope: 'skid' as const }),
  contract_update: (c: ContractInProgress) => c,
}

export const CO2_MINERALISATION_PLAN: ClassToolPlan = {
  id: 'co2_mineralisation:plant',
  envelope_predicate: (e) => e.class === 'co2_mineralisation',
  tools: [stepCantera, stepFluids, stepHt, stepPressureVessel, stepMassAgg],
  coupled_pairs: [] as Array<[string, string]>,
  max_iterations: 2,
  convergence_tolerance_pct: 5.0,
  consistency_rules: [],
}

registerPlan(CO2_MINERALISATION_PLAN)
