/**
 * @file class-module-priors.ts — hardcoded module catalogs for the 10 baseline
 * product classes, used as (a) a Stage 1.5 cross-check against LLM hallucination
 * and (b) a fallback module catalog when Stage 1.5 fails twice.
 *
 * Implements §6.1 (table row "stages/class-module-priors.ts") and §8.1
 * (mitigation for module-catalog hallucination risk) from
 * `radical/ITER3-ARCHITECTURE-DESIGN.md`. Coverage taxonomy is sourced from the
 * 4-seat council's coverage table in `COUNCIL-UNIVERSAL-TAXONOMY-2026-05-11.md`.
 *
 * USAGE:
 *   - On every Stage 1.5 LLM emission, cross-check the LLM's `modules[]`
 *     against `CLASS_MODULE_PRIORS[normalisedClass]`:
 *       * Any `required` module missing from the LLM output → prior_warning
 *         (NEEDS_MINOR — surface to council, do not block).
 *       * Any `forbidden` module listed by the LLM → schema_error (BLOCK,
 *         retry once).
 *       * `optional` modules trigger neither — the brief may legitimately
 *         exclude them.
 *   - On second-attempt Stage 1.5 failure, build the fallback catalog from
 *     `required ∪ optional`, tag every ModuleSpec with
 *     `applicability_confidence: 'low'`, and proceed with NEEDS_MINOR.
 *   - For UNSEEN classes (no entry in this map), the engine relies on the
 *     LLM-derived catalog + council validation alone. This is the universality
 *     path (§7).
 *
 * Coverage: all 10 baseline ProductClass keys defined.
 *
 * Design doc: ../radical/ITER3-ARCHITECTURE-DESIGN.md §8.1
 * Council: ../COUNCIL-UNIVERSAL-TAXONOMY-2026-05-11.md (coverage table)
 */

import type {
  ClassModulePriors,
  ModulePrior,
  UniversalModule,
} from '../types/module-decomposition.js'
import { UNIVERSAL_MODULES } from '../types/module-decomposition.js'

/**
 * The 12 modules every prior is checked against. Used by the consistency
 * test to guarantee `required ∪ optional ∪ forbidden` ⊆ `UNIVERSAL_MODULES`
 * and that no module is double-counted within a single class entry.
 */
export const ALL_UNIVERSAL_MODULES: readonly UniversalModule[] = UNIVERSAL_MODULES

/**
 * Per-class module priors. Coverage from
 * `COUNCIL-UNIVERSAL-TAXONOMY-2026-05-11.md` §"Coverage Table" — only
 * cells marked `Y` (clearly applies) become `required`. Cells marked `?`
 * (LLM ambiguity) become `optional` so the LLM's call is honoured but
 * absence is not a council-block. Cells marked `N` are listed as
 * `forbidden` to catch the LLM scattering bespoke characters into
 * inappropriate modules.
 *
 * Note: Tristan's design doc spec for BESS specifically lists
 * `maintenance_serviceability` as `optional` (the brief may be silent on
 * service access); this prior matches that nuance.
 */
export const CLASS_MODULE_PRIORS: ClassModulePriors = {
  bess: {
    required: [
      'energy_storage_source',
      'energy_conversion_transduction',
      'structure_containment',
      'sensing_instrumentation',
      'control_compute_communication',
      'safety_protection',
      'environmental_interface',
      'power_distribution',
    ],
    optional: ['maintenance_serviceability', 'hmi_ergonomics'],
    forbidden: ['actuation_kinematics', 'mass_fluid_transport_process'],
  },

  heat_pump: {
    required: [
      'energy_conversion_transduction',
      'structure_containment',
      'sensing_instrumentation',
      'control_compute_communication',
      'safety_protection',
      'environmental_interface',
      'mass_fluid_transport_process',
      'actuation_kinematics',
    ],
    optional: ['power_distribution', 'maintenance_serviceability', 'hmi_ergonomics'],
    forbidden: ['energy_storage_source'],
  },

  cgm: {
    required: [
      'energy_storage_source',
      'sensing_instrumentation',
      'control_compute_communication',
      'structure_containment',
      'hmi_ergonomics',
    ],
    optional: ['safety_protection', 'environmental_interface'],
    forbidden: [
      'energy_conversion_transduction',
      'power_distribution',
      'maintenance_serviceability',
      'actuation_kinematics',
      'mass_fluid_transport_process',
    ],
  },

  drone: {
    required: [
      'energy_storage_source',
      'energy_conversion_transduction',
      'structure_containment',
      'sensing_instrumentation',
      'control_compute_communication',
      'power_distribution',
      'actuation_kinematics',
    ],
    optional: ['safety_protection', 'environmental_interface', 'maintenance_serviceability'],
    // Mass/fluid transport — drone has no internal mass flow.
    // HMI/ergonomics — drone airframe has no operator-facing surfaces
    // (remote-pilot ground station is OUT OF SCOPE for the airframe brief).
    forbidden: ['mass_fluid_transport_process', 'hmi_ergonomics'],
  },

  ev_charger: {
    required: [
      'energy_conversion_transduction',
      'power_distribution',
      'control_compute_communication',
      'safety_protection',
      'structure_containment',
      'environmental_interface',
      'hmi_ergonomics',
    ],
    optional: ['sensing_instrumentation', 'maintenance_serviceability', 'mass_fluid_transport_process'],
    forbidden: ['energy_storage_source', 'actuation_kinematics'],
  },

  bioreactor: {
    required: [
      'structure_containment',
      'sensing_instrumentation',
      'control_compute_communication',
      'safety_protection',
      'environmental_interface',
      'mass_fluid_transport_process',
      'actuation_kinematics',
      'hmi_ergonomics',
    ],
    optional: ['power_distribution', 'maintenance_serviceability', 'energy_conversion_transduction'],
    forbidden: ['energy_storage_source'],
  },

  vfarm: {
    required: [
      'control_compute_communication',
      'sensing_instrumentation',
      'environmental_interface',
      'mass_fluid_transport_process',
      'structure_containment',
      'hmi_ergonomics',
    ],
    optional: [
      'energy_conversion_transduction',
      'power_distribution',
      'safety_protection',
      'maintenance_serviceability',
      'actuation_kinematics',
    ],
    forbidden: ['energy_storage_source'],
  },

  edge_ai: {
    required: [
      'energy_storage_source',
      'control_compute_communication',
      'structure_containment',
      'environmental_interface',
      'power_distribution',
    ],
    optional: ['sensing_instrumentation', 'safety_protection', 'maintenance_serviceability'],
    forbidden: [
      'actuation_kinematics',
      'mass_fluid_transport_process',
      'hmi_ergonomics',
      'energy_conversion_transduction',
    ],
  },

  auv: {
    required: [
      'energy_storage_source',
      'energy_conversion_transduction',
      'structure_containment',
      'sensing_instrumentation',
      'control_compute_communication',
      'safety_protection',
      'environmental_interface',
      'power_distribution',
      'actuation_kinematics',
      'mass_fluid_transport_process',
    ],
    optional: ['maintenance_serviceability'],
    forbidden: ['hmi_ergonomics'],
  },

  haps: {
    required: [
      'energy_storage_source',
      'energy_conversion_transduction',
      'structure_containment',
      'sensing_instrumentation',
      'control_compute_communication',
      'power_distribution',
      'environmental_interface',
      'actuation_kinematics',
    ],
    optional: ['safety_protection', 'maintenance_serviceability'],
    forbidden: ['mass_fluid_transport_process', 'hmi_ergonomics'],
  },
}

/**
 * Result of validating an LLM-emitted module catalog against this class's
 * priors. `missing_required` is NEEDS_MINOR (surface to council); `forbidden_present`
 * is a hard schema error (BLOCK + retry).
 */
export interface PriorValidationResult {
  /** True if no `forbidden_present` modules are listed (no hard errors). */
  ok: boolean
  /** Required modules the LLM omitted — surfaced as council warnings. */
  missing_required: UniversalModule[]
  /** Forbidden modules the LLM included — triggers retry. */
  forbidden_present: UniversalModule[]
  /** Optional modules the LLM included (informational only). */
  optional_present: UniversalModule[]
}

/**
 * Cross-check an LLM-emitted set of UniversalModule keys against the
 * canonical priors for the given class. Returns warnings + errors;
 * the caller decides whether to block, retry, or surface to council.
 *
 * If the class has no entry in CLASS_MODULE_PRIORS (unseen-class
 * universality probe), returns `{ ok: true, missing_required: [],
 * forbidden_present: [], optional_present: [] }` — the engine relies on
 * the LLM + council alone for unknown classes.
 */
export function validateAgainstPriors(
  llmEmittedModules: UniversalModule[],
  prior: ModulePrior | undefined,
): PriorValidationResult {
  if (!prior) {
    return { ok: true, missing_required: [], forbidden_present: [], optional_present: [] }
  }
  const llmSet = new Set<UniversalModule>(llmEmittedModules)
  const missing_required = prior.required.filter(m => !llmSet.has(m))
  const forbidden_present = prior.forbidden.filter(m => llmSet.has(m))
  const optional_present = prior.optional.filter(m => llmSet.has(m))
  return {
    ok: forbidden_present.length === 0,
    missing_required,
    forbidden_present,
    optional_present,
  }
}

/**
 * Build a fallback module catalog from a class prior. Used when Stage 1.5
 * fails twice. Returned modules carry NO module_brief and NO derived_parameters
 * — those must be filled in by the caller (typically with empty defaults so
 * the per-module Stage 2 call falls back to its broad sentence/character set).
 *
 * Returns `null` for unknown classes so the caller can hard-fail Stage 1.5
 * rather than silently fabricating a catalog.
 */
export function buildFallbackModuleList(
  prior: ModulePrior | undefined,
): UniversalModule[] | null {
  if (!prior) return null
  return [...prior.required, ...prior.optional].sort((a, b) =>
    UNIVERSAL_MODULES.indexOf(a) - UNIVERSAL_MODULES.indexOf(b)
  )
}
