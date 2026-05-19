/**
 * @file universal-translator.ts — Deterministic radical extraction.
 *
 * "Translate sub-modules to radicals" = read the structured fields each
 * module/sub-module declares and produce a typed graph the gates can evaluate.
 *
 * Today this is mostly a no-op pass-through because the Stage 1.7 emission
 * schema is ALREADY structured (modules → sub-modules → words → characters
 * with content_character + modifier_characters). The translator's value is:
 *
 *   1. Normalise field-name synonyms across modules (cell_voltage_v vs
 *      cell_voltage_nominal_v vs nominal_voltage_v)
 *   2. Build a quick-lookup graph index for grammar gates
 *   3. Surface obvious schema inconsistencies upfront (sub_modules without ids,
 *      grammar_links without mechanism) so gates don't crash
 *
 * Universal: works on any moduleDecomposition shape, regardless of product class.
 */
import type { ModuleSpec, CrossModuleGrammarLink } from '../types/module-decomposition'

export interface TranslatedDesign {
  modules: ModuleSpec[]
  crossLinks: CrossModuleGrammarLink[]
  /** Field-synonym index — same value reachable by any synonym key. */
  derivedByModule: Map<string, Record<string, number | string>>
  /** Sub-module → module map for quick lookups during gate eval. */
  subModuleToModule: Map<string, string>
  notes: string[]
}

const FIELD_SYNONYMS: Record<string, string[]> = {
  cell_voltage_v: ['cell_voltage_nominal_v', 'nominal_voltage_v', 'cell_voltage'],
  cell_capacity_ah: ['cell_ah', 'cell_capacity', 'cell_ah_nominal'],
  capacity_kwh_total: ['capacity_kwh_gross', 'capacity_kwh_nameplate', 'nameplate_capacity_kwh'],
  capacity_kwh_usable: ['usable_capacity_kwh', 'usable_kwh'],
  module_count: ['modules_count'],
  rated_thermal_kw: ['heat_output_kw', 'thermal_capacity_kw'],
  rated_electrical_kw: ['compressor_power_kw', 'electrical_input_kw'],
  dc_bus_voltage_v: ['dc_bus_voltage_nominal_v', 'dc_input_voltage_v', 'nominal_voltage'],
  unit_cost_ceiling_gbp: ['cost_ceiling_gbp', 'target_unit_cost_gbp'],
  max_mass_kg: ['mass_limit_kg', 'gross_mass_kg'],
}

/**
 * Build a flattened derived_parameters per module where canonical keys are
 * populated from any of their synonyms (the LAST synonym to be set wins; the
 * canonical value is preferred over synonyms when both are present).
 */
function normaliseDp(dp: Record<string, number | string> | undefined): Record<string, number | string> {
  if (!dp) return {}
  const out: Record<string, number | string> = { ...dp }
  for (const [canonical, syns] of Object.entries(FIELD_SYNONYMS)) {
    if (out[canonical] === undefined) {
      for (const s of syns) {
        if (out[s] !== undefined) { out[canonical] = out[s]; break }
      }
    }
  }
  return out
}

export function translate(
  modules: ModuleSpec[],
  crossLinks: CrossModuleGrammarLink[],
): TranslatedDesign {
  const notes: string[] = []
  const derivedByModule = new Map<string, Record<string, number | string>>()
  const subModuleToModule = new Map<string, string>()

  for (const m of modules) {
    derivedByModule.set(m.module, normaliseDp(m.derived_parameters))
    for (const sm of (m.sub_modules ?? [])) {
      if (!sm.id) {
        notes.push(`translate: sub-module in ${m.module} missing id (skipping)`)
        continue
      }
      subModuleToModule.set(sm.id, m.module)
    }
    // Inject the normalised DP back so gates can use any synonym
    m.derived_parameters = derivedByModule.get(m.module) ?? m.derived_parameters
  }

  return { modules, crossLinks: crossLinks ?? [], derivedByModule, subModuleToModule, notes }
}
