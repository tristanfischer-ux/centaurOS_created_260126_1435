/**
 * scripts/lib/orchestrator/generic/sizing.ts
 *
 * PER-CLASS-FAMILY SIZING LAYER (wall-3 Phase-2 — the lone wall from the Phase-1
 * verdict, drawer forgeos_decisions_7e83125db20634da).
 *
 * The Phase-1 generic emitter produces correct STRUCTURE but the Physics Critic
 * caps engineering_plausibility at 3/10 on UNDER-PROVISIONING (CMUs / modules /
 * sensors emitted ×1) and scale (a component word with no engineering rating).
 * The fix is NOT new physics: the engineering CONTRACT already carries the fully
 * computed coupled-physics quantities (cell_count, bms_slave_count, module_count,
 * bus_continuous_current_a, continuous_power_kw, transformer_rating_kva, …). This
 * layer simply ATTACHES that already-computed engineering to the generic component
 * words, keyed by component TYPE, per class FAMILY.
 *
 * Universal pattern (drawer about the thermal-derating contract): the contract
 * EMITS the parameter, this layer CONSUMES it onto the BoM word, a gate VERIFIES
 * it. Reusable across a family: the BATTERY rules below work for BESS / residential
 * / marine / second-life ESS unchanged — only the contract VALUES differ.
 *
 * NOTHING is invented: a rule only sets a modifier when the contract supplies the
 * source quantity (helpers return [] on a missing param). Quantities come solely
 * from real contract counts. Physics-bounded discipline (drawer about scaling
 * formulas): ratings are continuous unless the contract names a peak/transient.
 *
 * E2 STATUS (2026-06-10, ANVIL increment E2): this file is now the LEGACY
 * REFERENCE implementation. The production call path is the sizing-family
 * plug-in registry (`../sizing-families/`): `generic-emitter.ts` calls
 * `applySizingFamilies` (registry) instead of `applyFamilySizing` (here).
 * The BATTERY rule table below is the single source of truth — the battery
 * plugin imports it — and `applyFamilySizing` is RETAINED UNCHANGED as the
 * old-vs-new byte-identity oracle for the E2 regression test
 * (`scripts/test-sizing-families.tsx` section A + harness invariant
 * `UNIVERSAL.sizing_family_battery_port_byte_identical`). Do not delete until
 * the registry path has soaked a full chain run.
 *
 * British spelling throughout.
 */

import type { ContractInProgress } from '../types'
import { mod, type ModifierCharacter } from './emitter-primitives'

// Minimal structural shapes (avoid importing DesignModule's heavy type here).
// Exported for the sizing-family rule engine (E2) — shapes must stay in lockstep.
export interface WordLike {
  id?: string
  name_human?: string
  content_character?: { character_id?: string; name_human?: string }
  modifier_characters?: ModifierCharacter[]
}
export interface SubModuleLike { words?: WordLike[] }
export interface ModuleLike { sub_modules?: SubModuleLike[] }

export interface SizingParams {
  [k: string]: number | string
}

export type SizeFn = (p: SizingParams) => ModifierCharacter[]
export interface SizingRule {
  id: string
  match: RegExp
  size: SizeFn
}

// ── helpers (return [] when the contract lacks the source quantity — never invent)
// Exported for the sizing-family plugins (E2) — same never-invent discipline.
export function num(p: SizingParams, k: string): number | undefined {
  const v = p[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
export function qty(v: number | undefined): ModifierCharacter[] {
  return v !== undefined && v >= 1 ? [mod('quantity', `×${Math.round(v)}`)] : []
}
export function spec(kind: string, v: number | undefined, unit: string): ModifierCharacter[] {
  if (v === undefined) return []
  const rounded = Math.round(v * 100) / 100
  return [mod(kind, String(rounded), unit)]
}

// ── BATTERY family — every value sourced from the engineering contract's COMPUTED
//    quantities. Ordered MOST-SPECIFIC first (first match wins); rack before module
//    so "battery_module_racks" sizes as racks, not modules.
export const BATTERY: SizingRule[] = [
  { id: 'cell_monitoring', match: /monitor|\bcmu\b|bms[_\s-]?slave|cell[_\s-]?balanc/i,
    size: (p) => qty(num(p, 'bms_slave_count')) },
  { id: 'controller', match: /bms[_\s-]?master|\bems\b|scada|energy[_\s-]?management|controller|gateway/i,
    size: () => qty(1) },
  { id: 'rack', match: /\brack(s)?\b|seismic[_\s-]?frame/i,
    size: (p) => qty(num(p, 'rack_count')) },
  { id: 'battery_module', match: /battery[_\s-]?module|cell[_\s-]?module|\bmodules?\b/i,
    size: (p) => [...qty(num(p, 'module_count')), ...spec('capacity', num(p, 'cells_per_module'), 'cells')] },
  { id: 'cell', match: /prismatic|\blfp\b|\bcells?\b|electrode|jelly[_\s-]?roll/i,
    size: (p) => [...qty(num(p, 'cell_count')), ...spec('capacity', num(p, 'cell_capacity_ah'), 'Ah'), ...spec('dimension', num(p, 'cell_voltage_v'), 'V nominal')] },
  { id: 'pcs_inverter', match: /inverter|\bpcs\b|power[_\s-]?conversion|bidirectional|grid[_\s-]?form/i,
    size: (p) => [...qty(1), ...spec('rating_primary', num(p, 'continuous_power_kw'), 'kW continuous'), ...spec('performance', num(p, 'inverter_efficiency_pct'), '% efficiency')] },
  { id: 'dcdc', match: /dc[_\s-]?dc|\bconverter\b/i,
    size: (p) => spec('rating_primary', num(p, 'continuous_power_kw'), 'kW') },
  { id: 'filter_inductor', match: /filter|inductor|\blcl\b|choke|reactor/i,
    size: (p) => spec('rating_primary', num(p, 'lcl_filter_rating_a'), 'A continuous') },
  { id: 'busbar', match: /bus[_\s-]?bar|busbar|laminated[_\s-]?bus/i,
    size: (p) => spec('rating_primary', num(p, 'bus_continuous_current_a'), 'A continuous') },
  { id: 'breaker', match: /breaker|\bmccb\b|\bmcb\b|disconnect|isolator/i,
    size: (p) => spec('rating_primary', num(p, 'dc_breaker_rating_a'), 'A') },
  { id: 'contactor', match: /contactor|relay/i,
    size: (p) => spec('rating_primary', num(p, 'dc_contactor_rating_a'), 'A') },
  { id: 'switchgear', match: /switchgear|ac[_\s-]?distribution|main[_\s-]?ac|ac[_\s-]?panel/i,
    size: (p) => [...spec('rating_primary', num(p, 'ac_continuous_current_a'), 'A'), ...spec('dimension', num(p, 'ac_output_voltage_v'), 'V AC')] },
  { id: 'transformer', match: /transformer/i,
    size: (p) => [...qty(1), ...spec('rating_primary', num(p, 'transformer_rating_kva'), 'kVA')] },
  { id: 'chiller', match: /chiller|cooling[_\s-]?unit|\bhvac\b|heat[_\s-]?exchanger|refrigerat/i,
    size: (p) => spec('rating_primary', num(p, 'thermal_rejection_capacity_kw'), 'kW cooling') },
  { id: 'cold_plate', match: /cold[_\s-]?plate|liquid[_\s-]?plate/i,
    size: (p) => [...qty(num(p, 'rack_count')), ...spec('rating_primary', num(p, 'cold_plate_per_rack_min_capacity_kw'), 'kW each')] },
  { id: 'pump', match: /\bpump\b|circulation/i, size: () => qty(1) },
  { id: 'current_sensor', match: /current[_\s-]?(sensor|transducer)|\bhall\b/i,
    size: (p) => [...qty(num(p, 'rack_count')), ...spec('rating_primary', num(p, 'bus_continuous_current_a'), 'A nominal')] },
  { id: 'temp_sensor', match: /temperature|thermistor|\bntc\b|thermal[_\s-]?probe/i,
    size: (p) => qty(num(p, 'module_count')) },
  { id: 'voltage_sensor', match: /voltage[_\s-]?(sensor|transducer|monitor)|insulation[_\s-]?monitor/i,
    size: (p) => [...qty(1), ...spec('dimension', num(p, 'dc_bus_voltage_v'), 'V range')] },
]

const FAMILIES: Record<string, SizingRule[]> = { battery: BATTERY }

// Class → sizing family (coarse; same intent as build-links FAMILY_KEY). Extend as
// new families gain a ruleset; an unmapped class is left un-sized (Phase-1 baseline).
export const FAMILY_OF: Record<string, string> = {
  energy_storage: 'battery',
  bess: 'battery',
  'bess-utility-scale': 'battery',
  ess: 'battery',
  battery: 'battery',
  residential_ess: 'battery',
  marine_ess: 'battery',
  second_life_battery_pack: 'battery',
  vehicle_battery_pack: 'battery',
}

export function flattenParams(contract: ContractInProgress): SizingParams {
  const out: SizingParams = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' || typeof val === 'string') out[k] = val
  }
  return out
}

/** Replace existing modifiers of the same kind, then append the sized ones.
 *  Exported: the sizing-family delta-merge uses EXACTLY this function so the
 *  BATTERY port stays byte-identical (E2 regression test). */
export function mergeMods(word: WordLike, add: ModifierCharacter[]): void {
  if (add.length === 0) return
  const kinds = new Set(add.map((m) => m.kind))
  const kept = (word.modifier_characters ?? []).filter((m) => !kinds.has(m.kind))
  word.modifier_characters = [...kept, ...add]
}

/**
 * LEGACY (E2, 2026-06-10): retained as the old-vs-new byte-identity ORACLE for
 * the sizing-family registry port — no longer called by generic-emitter.ts.
 *
 * Attach the contract's computed engineering (real quantities + ratings) to the
 * generic component words for the class's FAMILY. Mutates `modules` in place.
 *
 * @returns the resolved family (or null if the class has no ruleset) + how many
 *          words were sized — for logging / the emitter rationale.
 */
export function applyFamilySizing(
  modules: ModuleLike[],
  contract: ContractInProgress,
  className: string,
): { family: string | null; sized: number } {
  const family = FAMILY_OF[String(className ?? '').trim().toLowerCase()] ?? null
  const rules = family ? FAMILIES[family] : undefined
  if (!rules) return { family: null, sized: 0 }

  const p = flattenParams(contract)
  let sized = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const hay = `${w.id ?? ''} ${w.name_human ?? ''} ${w.content_character?.character_id ?? ''} ${w.content_character?.name_human ?? ''}`.toLowerCase()
        const rule = rules.find((r) => r.match.test(hay))
        if (!rule) continue
        const add = rule.size(p)
        if (add.length) {
          mergeMods(w, add)
          sized += 1
        }
      }
    }
  }
  return { family, sized }
}
