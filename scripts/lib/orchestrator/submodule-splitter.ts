/**
 * scripts/lib/orchestrator/submodule-splitter.ts
 *
 * UNIVERSAL SUB-MODULE DENSITY SPLITTER — post-emitter pass.
 *
 * PROBLEM (audited 2026-05-23):
 * 30 of 36 per-class emitters bundle 4-6 words into a SINGLE sub-module
 * per top-level module. Compare:
 *   - vertical_farm.ts (2016 lines): mean 2.5 sub-modules per module ✓
 *   - haps.ts (1361 lines): mean 2.5 sub-modules per module ✓
 *   - bioreactor.ts (1140 lines): mean 1.0 sub-modules per module ✗
 *   - h2_electrolyser, solar_inverter, wind_turbine, ev_charger, ssb, smr,
 *     pemfc, dac, cnc, ups_inverter, propulsion_thruster, ground_station,
 *     humanoid, etc. — all mean 1.0
 *
 * Symptom for the operator: PDFs from thin emitters have ~50% fewer
 * sub-module sections than PDFs from VF/HAPS or from the OLD LLM-only
 * Generator path. The chain's G3 review-completeness gate flags
 * "14 sub-modules across 12 modules — expected ≥24".
 *
 * UNIVERSAL FIX (this file):
 * For every sub-module with ≥3 words spanning ≥2 distinct
 * function_radical_primary values, split into N sub-modules grouped by
 * radical. The split is content-preserving — every word stays in the
 * design, just organised into smaller functional groupings. Sub-module
 * NAMES are derived from the radical via RADICAL_TO_SUFFIX. Existing
 * already-rich sub-modules (≤2 words, OR all words same radical) pass
 * through unchanged.
 *
 * This file is called by assembler.ts after every emitter returns its
 * DesignJSON. Applies universally — one code change, all 30 thin
 * emitters benefit; the 6 already-rich emitters are no-op-pass-through.
 *
 * Reproducibility contract: pure function. Same input → same output.
 * No I/O. No randomness. Word order preserved within each split.
 */

import type { DesignJSON, DesignModule } from './assembler'

// Per-class minimum sub-modules-per-module floor below which the splitter
// will aggressively split. Above this floor it is more conservative.
const TARGET_DENSITY_DEFAULT = 2.0

// ---------------------------------------------------------------------------
// LOCAL TYPES — mirror the per-class emitter shape (structural — they don't
// export their internal types).
// ---------------------------------------------------------------------------

interface ContentCharacterLike {
  character_id?: string
  function_radical_primary?: string | null
  function_radical_secondary?: string | null
  material_radical_primary?: string | null
  [k: string]: unknown
}

interface ModifierCharacterLike {
  kind?: string
  value?: string
  unit?: string
  [k: string]: unknown
}

interface WordLike {
  id?: string
  name_human?: string
  content_character?: ContentCharacterLike | null
  modifier_characters?: ModifierCharacterLike[] | null
  [k: string]: unknown
}

interface SubModuleLike {
  id?: string
  name_human?: string
  english_sentence?: string
  rad_syntax?: string
  role_verb?: string
  topology_clause?: string
  words?: WordLike[] | null
  [k: string]: unknown
}

// ---------------------------------------------------------------------------
// RADICAL → SHORT SUFFIX MAP — used to derive split sub-module names.
// Falls back to the radical itself (with `_function` stripped) when not
// in the map. The map covers the common engineering radicals used by the
// per-class emitters today; extend as new radicals appear.
// ---------------------------------------------------------------------------

const RADICAL_TO_SUFFIX: Record<string, string> = {
  // Mechanical
  pressure_vessel_function: 'pressure_envelope',
  mechanical_actuation_function: 'mechanical_actuation',
  mechanical_structure_function: 'structural',
  rotation_function: 'rotation',
  vibration_damping_function: 'vibration_damping',
  // Fluid / thermal
  fluid_flow_state: 'fluid_flow',
  thermal_transfer_function: 'thermal_transfer',
  evaporation_condensation_function: 'phase_change',
  combustion_function: 'combustion',
  // Electrical / electronic
  electric_motor_function: 'drive_motor',
  power_conversion_function: 'power_conversion',
  power_distribution_function: 'power_distribution',
  electrical_isolation_function: 'electrical_isolation',
  energy_storage_function: 'energy_storage',
  battery_function: 'battery_cell',
  // Filtration / separation
  filtration_separation_function: 'filtration',
  membrane_function: 'membrane',
  // Sensing
  optical_sensing_function: 'optical_sensing',
  pressure_sensing_function: 'pressure_sensing',
  temperature_sensing_function: 'temperature_sensing',
  flow_sensing_function: 'flow_sensing',
  chemical_sensing_function: 'chemical_sensing',
  position_sensing_function: 'position_sensing',
  // Control / data
  control_function: 'control',
  data_processing_function: 'compute',
  communication_function: 'communication',
  safety_interlock_function: 'safety_interlock',
  // Reactor / process
  reaction_function: 'reaction',
  catalysis_function: 'catalysis',
  enzymatic_function: 'enzymatic',
  // Material / containment
  containment_function: 'containment',
  insulation_function: 'insulation',
  shielding_function: 'shielding',
  // Mounting / fixing
  fastener_function: 'fasteners',
  mounting_function: 'mounting',
}

function shortenRadical(radical: string | null | undefined): string {
  if (!radical) return 'misc'
  const mapped = RADICAL_TO_SUFFIX[radical]
  if (mapped) return mapped
  // Fallback: strip _function / _state suffix
  return radical.replace(/_function$/, '').replace(/_state$/, '')
}

// ---------------------------------------------------------------------------
// CORE SPLITTER — universal, content-preserving, idempotent.
// ---------------------------------------------------------------------------

export interface SplitOptions {
  /** Minimum words in a sub-module before splitting is considered.
   *  Sub-modules below this threshold pass through unchanged. */
  min_words_to_split?: number

  /** Minimum distinct function_radical_primary values required before
   *  splitting fires. If all words share one radical, splitting would
   *  be arbitrary — pass through instead. */
  min_distinct_radicals?: number

  /** If true, also split sub-modules whose name_human is `?` or empty
   *  (the bioreactor.ts pattern of un-named sub-modules). Default true. */
  rename_unnamed?: boolean

  /** Skip classes whose mean sub-module-density already exceeds this
   *  floor — they don't need splitting. Default 2.0. */
  density_floor?: number
}

/**
 * Universal post-emitter pass — splits dense single-sub-module modules
 * into multiple sub-modules grouped by function_radical_primary.
 *
 * Content-preserving: every word, modifier, and content_character is
 * carried into one of the output sub-modules. Word order is preserved
 * within each radical group.
 *
 * Returns a new DesignJSON; does not mutate the input.
 */
export function splitDenseSubModulesByRadical(
  design: DesignJSON,
  opts: SplitOptions = {},
): DesignJSON {
  const min_words = opts.min_words_to_split ?? 3
  const min_radicals = opts.min_distinct_radicals ?? 2
  const rename_unnamed = opts.rename_unnamed ?? true
  const density_floor = opts.density_floor ?? TARGET_DENSITY_DEFAULT

  // First pass: compute current mean density. If already above floor,
  // pass through unchanged (e.g. VF, HAPS, quantum_computer).
  let total_subs = 0
  let total_mods = 0
  for (const m of (design.modules ?? []) as DesignModule[]) {
    const subs = ((m as any).sub_modules ?? []) as unknown[]
    total_mods++
    total_subs += subs.length
  }
  const current_density = total_mods > 0 ? total_subs / total_mods : 0
  if (current_density >= density_floor) {
    return design
  }

  // Second pass: split dense sub-modules in each module.
  const newModules: DesignModule[] = []
  for (const m of (design.modules ?? []) as DesignModule[]) {
    const newSubs: unknown[] = []
    const existingSubs = ((m as any).sub_modules ?? []) as SubModuleLike[]
    for (const sub of existingSubs) {
      const result = trySplitOne(sub, m.module, { min_words, min_radicals, rename_unnamed })
      newSubs.push(...result)
    }
    newModules.push({ ...m, sub_modules: newSubs as unknown[] })
  }
  return { ...design, modules: newModules }
}

/**
 * Try to split one sub-module by function radical. Returns 1 sub-module
 * (unchanged) if splitting doesn't apply, OR N sub-modules grouped by
 * radical.
 */
function trySplitOne(
  sub: SubModuleLike,
  moduleName: string,
  opts: { min_words: number; min_radicals: number; rename_unnamed: boolean },
): SubModuleLike[] {
  const words = Array.isArray(sub.words) ? sub.words : []
  if (words.length < opts.min_words) return [sub]

  // Group by function_radical_primary
  const groups = new Map<string, WordLike[]>()
  const groupOrder: string[] = []
  for (const w of words) {
    const radical = w?.content_character?.function_radical_primary ?? 'misc'
    if (!groups.has(radical)) {
      groups.set(radical, [])
      groupOrder.push(radical)
    }
    groups.get(radical)!.push(w)
  }

  // If fewer than min_radicals distinct radicals, splitting would be
  // arbitrary — pass through unchanged.
  if (groups.size < opts.min_radicals) {
    // Rename unnamed sub-module if requested.
    if (opts.rename_unnamed && (!sub.name_human || sub.name_human === '?')) {
      return [{ ...sub, name_human: deriveSubName(moduleName, groupOrder[0], 0) }]
    }
    return [sub]
  }

  // Split into N sub-modules — preserve word order within each radical group.
  const out: SubModuleLike[] = []
  let i = 0
  for (const radical of groupOrder) {
    const groupWords = groups.get(radical)!
    const subName = deriveSubName(moduleName, radical, i)
    const baseId = typeof sub.id === 'string' ? sub.id : `${moduleName}_sub`
    out.push({
      ...sub,
      id: `${baseId}_${shortenRadical(radical)}`,
      name_human: subName,
      // Recompute rad_syntax for this subset of words; if the original
      // had a non-empty rad_syntax, we leave english_sentence/role_verb/
      // topology_clause untouched (caller may rewrite later).
      rad_syntax: synthRadFromWords(groupWords),
      words: groupWords,
    })
    i++
  }
  return out
}

/** Build a deterministic sub-module name from (module name, radical, index). */
function deriveSubName(moduleName: string, radical: string, idx: number): string {
  const suffix = shortenRadical(radical)
  // For the first group, drop the index suffix for cleanliness.
  return idx === 0 ? `${moduleName}_${suffix}` : `${moduleName}_${suffix}`
}

/** Reconstruct rad_syntax from a word subset — mirror the per-class emitters'
 *  synthRad() format so the PDF renderer's parsing remains consistent. */
function synthRadFromWords(words: WordLike[]): string {
  return words
    .map((w) => {
      const charId = w?.content_character?.character_id ?? 'unknown'
      const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters! : []
      const sorted = [...mods].sort((a, b) =>
        a?.kind === 'quantity' ? -1 : b?.kind === 'quantity' ? 1 : 0,
      )
      const tokens = sorted
        .filter((x) => typeof x?.value === 'string')
        .map((x) => (x.unit ? `${x.value}${x.unit}` : x.value))
      return tokens.length === 0 ? charId : `${charId} (${tokens.join(', ')})`
    })
    .join(' ⊙ ')
}
