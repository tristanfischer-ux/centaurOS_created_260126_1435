/**
 * scripts/lib/orchestrator/sizing-families/types.ts
 *
 * SIZING-FAMILY PLUG-IN LAYER — type vocabulary (ANVIL plan increment E2, the
 * wall-3 pivot: universal STRUCTURE is solved; the lone wall is engineering-
 * plausibility SIZING → per-class-FAMILY sizing plug-ins; Exp-A verdict
 * 049f43a03 + drawer wall-3-verdict).
 *
 * Design contract (E2 spec + governance G4/G6):
 *   - A plugin is PURE + deterministic. `size()` NEVER mutates its inputs;
 *     it returns a SizingDelta (a list of quantity / word-modifier /
 *     derived-parameter writes, each carrying provenance
 *     `family-plugin:<id>@<version>`). The CALLER merges.
 *   - LOUD failure: a missing / unit-mismatched / out-of-range required
 *     quantity raises a structured SizingFamilyError — never a silent
 *     default (the London-lat/lon bug class).
 *   - Unit-typed boundary (G6): every requiredQuantity is declared with a
 *     unit + UnitFamily and converted via the constraint-normaliser's
 *     `convertToCanonical` (the orchestrator-side member of the
 *     `targetPerformanceValueAs` helper family) before any rule sees it.
 *   - COMPOSITION: all plugins scoring ≥ SIZING_FAMILY_APPLY_THRESHOLD run in
 *     declared dependency order (`runs_after`) over a SHARED quantity
 *     namespace; a later writer touching an earlier writer's key must declare
 *     the override or the run fails with a structured conflict error.
 *
 * British spelling throughout.
 */

import type { ContractInProgress, TypedQuantity } from '../types'
import type { ModifierCharacter } from '../generic/emitter-primitives'
// Local unit families (cycle-free — see ./units head comment). The UnitFamily
// shape is structurally identical to constraint-normaliser's; unify post-merge.
import type { UnitFamily } from './units'

// ---------------------------------------------------------------------------
// ENVELOPE VECTOR — minimal STRUCTURAL interface.
//
// NOTE (E1/E2 seam, 2026-06-10): increment E1 is concurrently authoring the
// canonical `scripts/lib/orchestrator/envelope-vector.ts`. To avoid touching
// that file mid-flight, E2 declares only the structural subset it consumes.
// TypeScript structural typing makes E1's richer type assignable here.
// POST-MERGE TODO: replace this local interface with
// `import type { EnvelopeVector } from '../envelope-vector'`.
// ---------------------------------------------------------------------------

export interface EnvelopeVectorLike {
  /** Product class slug when known (matches the classifier output). */
  class?: string
  scale_tier?: string
  form_factor?: string
  application?: string
  /** Optional engineering-domain signals (e.g. 'process', 'aero', 'battery'). */
  domains?: ReadonlyArray<string>
  /** E1 may carry more dimensions — structurally ignored here. */
  [k: string]: unknown
}

// ---------------------------------------------------------------------------
// TYPED QUANTITY REFERENCE — a plugin's declared hard input (G6 boundary).
// ---------------------------------------------------------------------------

export interface TypedQuantityRef {
  /** Canonical contract-quantity key the plugin reads (e.g. 'feed_throughput_t_day'). */
  name: string
  /** Alternate contract keys accepted for the same physical quantity
   *  (first present key wins; all must share the unit family). */
  aliases?: ReadonlyArray<string>
  /** The unit the plugin's rules consume the value in (the family canonical). */
  unit: string
  /** Unit family used to convert the contract's declared unit to `unit`
   *  (constraint-normaliser UnitFamily — the G6 conversion table). */
  family: UnitFamily
  /** [min, max] inclusive plausibility range in `unit`. Out-of-range raises
   *  a structured OUT_OF_RANGE error (loud, never clamped silently). */
  valid_range: [number, number]
}

// ---------------------------------------------------------------------------
// SIZING DELTA — the only thing size() may produce. The caller merges.
// ---------------------------------------------------------------------------

/** Word address inside the modules tree (stable for a given input — plugins
 *  must derive it from a deterministic scan, never from object identity). */
export interface WordPath {
  module: number
  sub_module: number
  word: number
}

/** Merge-modifiers write: replace same-kind modifiers on the addressed word,
 *  then append (identical semantics to the legacy mergeMods in generic/sizing.ts). */
export interface ModifierWrite {
  path: WordPath
  /** word.id when present — audit/debug aid; the path is authoritative. */
  word_id?: string
  /** The plugin rule that produced this write (e.g. 'gas_engine'). */
  rule_id: string
  /** One-line engineering basis for the write (correlation / standard /
   *  first-principles formula) — surfaced in audits. */
  basis: string
  modifiers: ModifierCharacter[]
  /** `family-plugin:<family>@<version>` */
  provenance: string
}

/** Contract-quantity write (lands in contract.quantities under `key`). */
export interface QuantityWrite {
  key: string
  quantity: TypedQuantity
  rule_id: string
  basis: string
  /** `family-plugin:<family>@<version>` */
  provenance: string
}

/** derived_parameters write on a module (by index into the modules array). */
export interface DerivedParameterWrite {
  module: number
  key: string
  value: number | string
  rule_id: string
  basis: string
  provenance: string
}

export interface SizingDelta {
  family: string
  version: string
  /** `family-plugin:<family>@<version>` — duplicated on every write. */
  provenance: string
  modifier_writes: ModifierWrite[]
  quantity_writes: QuantityWrite[]
  derived_parameter_writes: DerivedParameterWrite[]
  /** Free-form engineering notes (rendered into the emitter rationale). */
  notes: string[]
}

// ---------------------------------------------------------------------------
// SIZING ↔ GROUNDING SEAM (E2 item 5 — hook only; the iterative
// size → ground → verify → resize loop (≤2 rounds) is wired in a LATER
// increment. Nothing in this increment calls resize()).
// ---------------------------------------------------------------------------

export interface NoFitFinding {
  /** Address of the word whose grounded part did not fit, when known. */
  path?: WordPath
  word_id?: string
  /** The grounded part that failed verification (manufacturer + MPN). */
  part?: { manufacturer?: string; mpn?: string }
  reason: 'dimension_no_fit' | 'rating_no_fit' | 'mass_no_fit' | 'thermal_no_fit' | 'not_found'
  /** What the design REQUIRED (kind/value/unit) vs what the catalogue part offers. */
  required?: { kind: string; value: number; unit: string }
  available?: { kind: string; value: number; unit: string }
  detail?: string
}

// ---------------------------------------------------------------------------
// THE PLUGIN INTERFACE
// ---------------------------------------------------------------------------

/**
 * Applicability threshold (documented per E2 spec): a plugin runs iff
 * `appliesTo(...) >= SIZING_FAMILY_APPLY_THRESHOLD`.
 *
 * Score conventions (keep plugins consistent):
 *   1.0  — exact class-slug membership (the class is a known member of the family)
 *   0.75 — envelope-vector domain signal (e.g. domains includes 'process')
 *   0.6  — keyword heuristic on the class slug (e.g. /digest|chp/)
 *   0.0  — not applicable
 */
export const SIZING_FAMILY_APPLY_THRESHOLD = 0.5

/** Structural module shape the plugins scan (mirrors generic/sizing.ts —
 *  intentionally minimal; the real DesignModule is assignable). */
export interface SizableWord {
  id?: string
  name_human?: string
  content_character?: { character_id?: string; name_human?: string }
  modifier_characters?: ModifierCharacter[]
}
export interface SizableSubModule { id?: string; words?: SizableWord[] }
export interface SizableModule {
  module?: string
  sub_modules?: SizableSubModule[]
  derived_parameters?: Record<string, unknown>
}

export interface SizingFamilyPlugin {
  /** Registry-unique family id, e.g. 'battery', 'process-plant', 'aero-platforms'. */
  family: string
  /** Semver-ish version — stamped into every write's provenance. */
  version: string
  /** Family ids that must run BEFORE this plugin (their quantity writes are
   *  visible in this plugin's contract view — the shared namespace). */
  runs_after?: ReadonlyArray<string>
  /** Conflict declarations: namespace keys (see registry) or 'family:<id>'
   *  entries this plugin INTENTIONALLY overwrites. A write into another
   *  plugin's key without a matching declaration is a structured error. */
  overrides?: ReadonlyArray<string>
  /** 0-1 applicability score (see SIZING_FAMILY_APPLY_THRESHOLD docs). PURE. */
  appliesTo(envelopeVector: EnvelopeVectorLike | null | undefined, classSlug: string): number
  /** Hard inputs validated at the boundary BEFORE size() runs (G6).
   *  Missing / unit-mismatch / out-of-range → structured SizingFamilyError. */
  requiredQuantities: ReadonlyArray<TypedQuantityRef>
  /** PURE + deterministic. Reads (never mutates) modules + the shared-view
   *  contract + brief; returns the delta. */
  size(
    modules: ReadonlyArray<SizableModule>,
    contract: ContractInProgress,
    brief: unknown,
  ): SizingDelta
  /** Sizing↔grounding seam (E2 item 5). OPTIONAL. Pure: given no-fit findings
   *  from the grounder, return a corrective delta (e.g. upsize a rating,
   *  split a quantity). NOT WIRED this increment. */
  resize?(
    noFitFindings: ReadonlyArray<NoFitFinding>,
    modules: ReadonlyArray<SizableModule>,
    contract: ContractInProgress,
    brief: unknown,
  ): SizingDelta
}

// ---------------------------------------------------------------------------
// STRUCTURED (LOUD) FAILURE
// ---------------------------------------------------------------------------

export type SizingFamilyErrorCode =
  | 'MISSING_REQUIRED_QUANTITY'
  | 'UNIT_MISMATCH'
  | 'OUT_OF_RANGE'
  | 'WRITE_CONFLICT'
  | 'DEPENDENCY_CYCLE'
  | 'DUPLICATE_FAMILY'

export class SizingFamilyError extends Error {
  readonly code: SizingFamilyErrorCode
  readonly family: string
  readonly quantity?: string
  readonly expected_unit?: string
  readonly actual_unit?: string
  readonly valid_range?: [number, number]
  readonly value?: number
  readonly conflict_key?: string
  readonly prior_writer?: string

  constructor(
    code: SizingFamilyErrorCode,
    family: string,
    message: string,
    detail?: {
      quantity?: string
      expected_unit?: string
      actual_unit?: string
      valid_range?: [number, number]
      value?: number
      conflict_key?: string
      prior_writer?: string
    },
  ) {
    super(`[sizing-family:${family}] ${code}: ${message}`)
    this.name = 'SizingFamilyError'
    this.code = code
    this.family = family
    this.quantity = detail?.quantity
    this.expected_unit = detail?.expected_unit
    this.actual_unit = detail?.actual_unit
    this.valid_range = detail?.valid_range
    this.value = detail?.value
    this.conflict_key = detail?.conflict_key
    this.prior_writer = detail?.prior_writer
  }
}

// ---------------------------------------------------------------------------
// EXTRA UNIT FAMILIES — re-exported from ./units (the cycle-free home).
// ---------------------------------------------------------------------------

export { MASS_FLOW_T_DAY, VELOCITY_M_S, DENSITY_KG_M3 } from './units'
