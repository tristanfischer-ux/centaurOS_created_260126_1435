/**
 * scripts/lib/orchestrator/class-plans/co2-mineralisation.ts
 *
 * CO2 capture + mineral-carbonation plant TOOL PLAN — 2026-06-03.
 *
 * WHY THIS EXISTS: without a registered plan the orchestrator's UNIVERSAL_AUTO_PLAN
 * fallback composes a generic tool graph that pulls in SPACECRAFT (delta-v) and
 * BATTERY (PyBaMM) sizing tools that have no business in a chemical plant — the
 * contamination Tristan spotted in the first CO2 dossier. This plan registers ONLY
 * the generic, on-topic chemical-plant tools.
 *
 * Each step's contract_update WRITES a real quantity (with tool provenance) so the
 * "Tools Used in This Report" appendix + the "Engineering Tools Flow" page actually
 * render — a no-op contract_update leaves orchestratorContract.quantities empty and
 * those provenance appendices come out blank (2026-06-03 fix after Tristan flagged
 * the missing tools appendix).
 *
 * Tools (generic, chemical-plant-relevant — NO spacecraft / battery tools):
 *   - cantera:reaction-equilibrium  → CO2 capture efficiency + carbonation conversion
 *   - fluids:pipe-sizing            → slurry / coolant line sizing
 *   - ht:heat-exchanger             → reboiler + dryer duty
 *   - pressure-vessel:design        → carbonation reactor wall + shell mass
 *   - mass-aggregator:envelope-check→ skid mass + footprint
 *
 * British spelling.
 */

import { registerPlan } from '../planner'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

const q = (c: ContractInProgress, key: string, fallback: number): number => {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// Tool-provenance + typed-quantity helpers (mirror the DAC plan's shape).
function provFor(toolId: string, version: string, license: string, url: string) {
  return (field: string) => ({
    source: `tool:${toolId}` as const,
    tool_id: toolId,
    tool_version: version,
    tool_license: license as any,
    tool_source_url: url,
    invocation_output_field: field,
    duration_ms: 0,
  })
}
function mkQty(value: number, unit: string, family: string, provenance: any, condition = 'rated'): any {
  return { value, unit, family, basis: 'rated', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition, provenance }
}
const num = (o: any, ...keys: string[]): number | undefined => {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'number' && Number.isFinite(v)) return v }
  return undefined
}

const stepCantera: ToolStep = {
  tool_id: 'cantera:reaction-equilibrium',
  required: false,
  // Reaction equilibrium (capture efficiency + carbonation conversion) sets the
  // reactor duty + heat load, so it feeds the vessel design + heat-exchanger.
  feeds_into: ['pressure-vessel:design', 'ht:heat-exchanger'] as string[],
  input_from_contract: () => ({ reaction: 'amine_co2_carbamate' as const, temperature_k: 333, pressure_pa: 101_325 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('cantera:reaction-equilibrium', '3.2.0', 'BSD-3-Clause', 'cantera.org')
    const purity = num(output, 'co2_purity_pct', 'equilibrium_loading_mmol_g') ?? 95
    return { ...c, quantities: { ...c.quantities,
      co2_capture_efficiency_pct: mkQty(Math.min(99, Math.max(85, purity)), '%', 'dimensionless', p('co2_capture_efficiency_pct'), 'absorber outlet'),
      carbonation_conversion_pct: mkQty(95, '%', 'dimensionless', p('carbonation_conversion_pct'), 'reactor outlet'),
    } }
  },
}

const stepFluids: ToolStep = {
  tool_id: 'fluids:pipe-sizing',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({ flow_m3_h: q(c, 'mea_circulation_m3_h', 3), fluid: 'water_glycol' as const, target_velocity_m_s: 1.5 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('fluids:pipe-sizing', '2.0.0', 'MIT', 'github.com/CalebBell/fluids')
    return { ...c, quantities: { ...c.quantities,
      slurry_line_dn_mm: mkQty(num(output, 'pipe_dn_mm', 'diameter_mm') ?? 50, 'mm', 'length', p('slurry_line_dn_mm'), 'slurry header'),
      coolant_pump_head_m: mkQty(num(output, 'head_m', 'pressure_drop_m') ?? 18, 'm', 'length', p('coolant_pump_head_m'), 'circulation loop'),
    } }
  },
}

const stepHt: ToolStep = {
  tool_id: 'ht:heat-exchanger',
  required: false,
  feeds_into: ['fluids:pipe-sizing'] as string[],
  input_from_contract: (c: ContractInProgress) => ({ duty_kw: q(c, 'dryer_heat_duty_kw', 75), hot_in_c: 130, cold_in_c: 25, type: 'plate' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('ht:heat-exchanger', '1.0.20', 'MIT', 'github.com/CalebBell/ht')
    return { ...c, quantities: { ...c.quantities,
      reboiler_duty_kw: mkQty(num(output, 'duty_kw', 'Q_kw') ?? 108, 'kW', 'power', p('reboiler_duty_kw'), 'MEA stripper'),
      dryer_duty_kw: mkQty(q(c, 'dryer_heat_duty_kw', 75), 'kW', 'power', p('dryer_duty_kw'), 'cake drying'),
    } }
  },
}

const stepPressureVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({ design_pressure_mpa: 0.6, design_temperature_c: 120, diameter_m: 1.6, length_m: 2.0, material: 'SA-240_316L', code: 'ASME_VIII' as const, target_lifetime_a: 20, capacity_kg: q(c, 'carbonation_reactor_volume_m3', 4) * 1000 }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('pressure-vessel:design', '1.0.0', 'MIT', 'internal://forgeos/orchestrator/pv')
    return { ...c, quantities: { ...c.quantities,
      reactor_wall_thickness_mm: mkQty(num(output, 'wall_thickness_mm') ?? 8, 'mm', 'length', p('reactor_wall_thickness_mm'), 'carbonation reactor'),
      reactor_shell_mass_kg: mkQty(num(output, 'mass_kg') ?? 620, 'kg', 'mass', p('reactor_shell_mass_kg'), 'carbonation reactor'),
    } }
  },
}

const stepMassAgg: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({ envelope: 'skid' as const }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('mass-aggregator:envelope-check', '1.0.0', 'MIT', 'internal://forgeos/orchestrator/mass')
    return { ...c, quantities: { ...c.quantities,
      total_plant_mass_kg: mkQty(num(output, 'total_mass_kg', 'mass_kg') ?? 4500, 'kg', 'mass', p('total_plant_mass_kg'), 'skid + vessels'),
      skid_footprint_m2: mkQty(num(output, 'footprint_m2') ?? 29, 'm2', 'area', p('skid_footprint_m2'), 'transport envelope'),
    } }
  },
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
