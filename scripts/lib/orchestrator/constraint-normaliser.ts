/**
 * scripts/lib/orchestrator/constraint-normaliser.ts
 *
 * CONSTRAINT NORMALISER — Layer between the LLM brief parser and the
 * rules-only envelope detectors.
 *
 * PURPOSE
 * The brief parser emits a single best-guess `target_performance` field.
 * When the parser picks the wrong metric (e.g. kLa ≥ 8 hr⁻¹ instead of
 * 200 L working volume), the detector cannot recover and the orchestrator
 * silently falls back to the LLM Generator path. The Normaliser walks
 * EVERY available source (target_performance, additional_constraints,
 * product_description, max_mass_kg, etc.), normalises units to canonical
 * SI, and emits a discriminated-union ScaleResult that the detector reads.
 *
 * Per 5-seat council verdict 2026-05-23 (synthesised):
 *   - Detectors should be PURE tier-mappers, not parsers
 *   - Parsing heuristics (regex, unit aliases) belong in this layer
 *   - Discriminated-union return makes "not_found" vs "not_applicable" distinct
 *   - Whitespace-tolerant unit comparison (GLM seat 4 concern)
 *   - Defensive optional chaining on regex matches (GLM seat 4 concern)
 *   - Source tagging for debugging which path resolved a metric (DeepSeek seat 3)
 *
 * IMPORTANT: this file does NOT change the StructuredBriefJSON schema.
 * Phase 2 will extend StructuredBriefAdditionalConstraint to carry typed
 * (value, unit, category) fields and update the Stage 0 prompt to populate
 * them. Phase 1 (this file) does the work the parser should be doing,
 * keeping the parser unchanged.
 *
 * MODULE LAYOUT (2026-06-10, tracker #19 cycle break): the unit-family
 * constants (POWER_KW, ENERGY_KWH, …), the pure parsing helpers, and
 * findScaleMetric() now LIVE in `./unit-families` (a leaf module with no
 * orchestrator imports) and are RE-EXPORTED here under their original
 * names. This file keeps only the field-erected mass-constraint
 * normalisation, which genuinely needs `./envelope` (isFieldErected).
 * Rationale: 8df6d96a1's envelope-vector.ts reads ENERGY_KWH at module
 * level; with the constants declared here, the cycle
 * constraint-normaliser → envelope → envelope-vector → constraint-normaliser
 * crashed at import time whenever constraint-normaliser loaded first.
 * Import the families from `./unit-families` in new code; the re-exports
 * exist so no existing consumer changes.
 */

import type { BriefEnvelope, ParsedConstraints } from './types'
import { isFieldErected } from './envelope'

// ---------------------------------------------------------------------------
// RE-EXPORTS — unit families + scale-metric finder moved to the leaf module
// `./unit-families` (2026-06-10). Original names + signatures preserved.
// ---------------------------------------------------------------------------

export type {
  UnitFamily,
  MetricSource,
  ScaleResult,
  FindScaleMetricOptions,
} from './unit-families'

export {
  findScaleMetric,
  POWER_KW,
  ENERGY_KWH,
  VOLUME_L,
  MASS_KG,
  LENGTH_M,
  AREA_M2,
  HYDROGEN_RATE,
  CO2_CAPTURE_TPY,
  QUBIT_COUNT,
  TEMPERATURE_MK,
  CUBESAT_U,
  ELEMENT_COUNT,
  isUsableValue,
  captureNumber,
  asArray,
  normUnit,
  convertToCanonical,
} from './unit-families'

// ---------------------------------------------------------------------------
// FIELD-ERECTED MASS-CONSTRAINT NORMALISATION (2026-06-05, e_fuel_synthesis).
//
// PROBLEM: a Power-to-Liquid Fischer-Tropsch SAF plant is FIELD-ERECTED — a
// fixed installation, not a containerised product. There is no single plant-
// wide gross-mass cap; equipment ships as modular skids + field-erected columns,
// each within standard road-transport limits. But the brief augmenter (or the
// LLM parser) frequently INFERS a max_mass_kg (e.g. 40,000 kg) from a generic
// "skid" reading, and the renderer then applies it as a CONTAINERISED cap —
// producing a bogus "Max gross mass 40,000 kg" compliance row and a "mass budget
// utilisation 108% → recommended container count 2" finding for a plant that was
// never going to ship in one box.
//
// COUNCIL VERDICT (do NOT silently drop): an inferred plant-wide cap must be
// removed from the active constraints (so downstream containerised math never
// fires) BUT recorded in an audit field with the reason, so we never hide a real
// "won't fit on a truck" problem — per-skid road-transport limits still apply
// (the mass-aggregator's per-skid road check covers that). A max_mass_kg the
// brief stated EXPLICITLY (source !== 'inferred') is NEVER dropped — a real
// stated cap is a real requirement.
// ---------------------------------------------------------------------------

/** One dropped-constraint audit record. Surfaced so a reviewer / the renderer
 *  can show WHAT was dropped and WHY, instead of a silent disappearance. */
export interface DroppedConstraintRecord {
  /** The constraint field that was dropped (e.g. 'max_mass_kg'). */
  field: string
  /** The value that was dropped (informational; the cap that no longer applies). */
  value: number | null
  /** The source the dropped value carried ('inferred' for this normaliser). */
  source: string
  /** Human-readable reason — why the abstraction did not apply. */
  reason: string
}

/** The runtime shape of `max_mass_kg` carries a `source` field (set by the brief
 *  parser / augmenter: 'user' | 'inferred' | 'missing'), even though the
 *  orchestrator's ParsedConstraints type only declares `{ value }`. Read it
 *  defensively. */
interface MassConstraintRuntime {
  value: number | null
  source?: string
}

export interface NormaliseFieldErectedResult {
  /** True when an inferred plant-wide gross-mass cap was dropped this call. */
  dropped: boolean
  /** The audit record for the drop, or null when nothing was dropped. */
  record: DroppedConstraintRecord | null
}

/**
 * Drop an INFERRED plant-wide `max_mass_kg` cap when the product is field-erected,
 * recording the drop in `constraints._dropped_inferred[]`. MUTATES `constraints`
 * in place (deletes `max_mass_kg`, appends the audit record) and also returns a
 * summary. Idempotent: a second call after the drop is a no-op.
 *
 * Guards (a drop happens ONLY when ALL hold):
 *   1. the envelope is field-erected (isFieldErected),
 *   2. max_mass_kg is present with a finite positive value,
 *   3. its source is 'inferred' (an explicit brief cap, source 'user', is kept).
 *
 * Containerised / mobile classes (BESS, EV charger, drone, AUV, HAPS, vehicle)
 * are not field-erected, so their real caps + container / MTOW math are never
 * touched.
 */
export function normaliseFieldErectedMassConstraint(
  constraints: ParsedConstraints,
  envelope: Pick<BriefEnvelope, 'form_factor'> | null | undefined,
): NormaliseFieldErectedResult {
  const noop: NormaliseFieldErectedResult = { dropped: false, record: null }
  if (!constraints) return noop
  if (!isFieldErected(envelope)) return noop

  const mass = (constraints as any).max_mass_kg as MassConstraintRuntime | undefined
  if (!mass || typeof mass !== 'object') return noop

  const value = mass.value
  if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) return noop

  // An explicitly STATED cap (source 'user', or any non-inferred source) is a
  // real requirement — keep it. Only an INFERRED plant-wide cap is the bug.
  const source = String(mass.source ?? '').toLowerCase()
  if (source !== 'inferred') return noop

  const record: DroppedConstraintRecord = {
    field: 'max_mass_kg',
    value,
    source: 'inferred',
    reason:
      'field-erected: plant-wide gross-mass cap not applicable; per-skid road-transport limits apply',
  }

  // Append to the audit array (create defensively).
  const c = constraints as any
  if (!Array.isArray(c._dropped_inferred)) c._dropped_inferred = []
  c._dropped_inferred.push(record)

  // Remove the inferred plant-wide cap so downstream containerised math never
  // fires against it. Per-skid road limits are enforced by the mass-aggregator.
  delete c.max_mass_kg

  return { dropped: true, record }
}
