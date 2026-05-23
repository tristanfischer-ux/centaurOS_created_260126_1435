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
 */

import type { ParsedConstraints } from './types'

// ---------------------------------------------------------------------------
// UNIT FAMILY — declares the canonical unit + aliases + non-canonical
// unit conversions for a dimensional family.
// ---------------------------------------------------------------------------

export interface UnitFamily {
  /** Canonical (lowercase) unit string. Detectors compare values in this unit. */
  canonical: string

  /** Lowercase alias strings that resolve to the canonical (1:1, no conversion). */
  aliases: ReadonlyArray<string>

  /** Lowercase non-canonical units → multiplier to convert to canonical.
   *  e.g. ml → 0.001 (1 ml = 0.001 L), m3 → 1000 (1 m³ = 1000 L). */
  conversions: Readonly<Record<string, number>>
}

/** Normalise raw unit string: lowercase + trim + collapse internal whitespace. */
function normUnit(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw).toLowerCase().trim().replace(/\s+/g, '')
}

/** Convert a (value, raw_unit) pair into the family's canonical unit.
 *  Returns null if the unit is not in the family. */
function convertToCanonical(value: number, rawUnit: string, family: UnitFamily): number | null {
  const u = normUnit(rawUnit)
  if (u === family.canonical) return value
  if (family.aliases.includes(u)) return value
  const multiplier = family.conversions[u]
  if (multiplier !== undefined) return value * multiplier
  return null
}

// ---------------------------------------------------------------------------
// SCALE RESULT — discriminated union. Distinguishes "metric not present"
// from "metric not applicable to this class".
// ---------------------------------------------------------------------------

export type MetricSource =
  | 'target_performance'
  | 'additional_constraints'
  | 'product_description'
  | 'max_mass_kg'
  | 'max_dimensions_mm'
  | 'voltage_class_v'
  | 'extra'

export type ScaleResult =
  | {
      found: true
      /** Numerical value in the family's canonical unit. */
      value: number
      /** Family canonical unit (informational; detector knows from family). */
      canonical_unit: string
      /** Which input field resolved the metric — for debugging. */
      source: MetricSource
      /** The raw (value, unit) that produced this result — for log + audit. */
      raw: { value: number; unit: string }
    }
  | {
      found: false
      reason: 'not_found' | 'not_applicable' | 'malformed'
      /** Optional diagnostic detail for the operator. */
      details?: string
    }

// ---------------------------------------------------------------------------
// VALUE EXTRACTION HELPERS — defensive parsing.
// ---------------------------------------------------------------------------

/** Strict positive-finite-number guard. Rejects NaN, null, undefined,
 *  Infinity, strings, zero, negatives. */
function isUsableValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

/** Defensive regex match → first capture group as a positive number.
 *  Returns null on no match, missing capture group, NaN, or non-positive. */
function captureNumber(re: RegExp, text: string): number | null {
  const m = text.match(re)
  if (!m) return null
  const raw = m[1] // intentional: regexes without a capture group are a programmer error
  if (typeof raw !== 'string') return null
  const stripped = raw.replace(/,/g, '')
  const v = parseFloat(stripped)
  return isUsableValue(v) ? v : null
}

/**
 * Try a sequence of regexes against text. Each regex must have capture
 * group 1 = numeric value. If capture group 2 is present, it is treated
 * as the unit string (so the regex can match across kW/MW/W with the
 * Normaliser converting to canonical). If capture group 2 is absent, the
 * captured value is assumed to be in the family's canonical unit.
 *
 * Returns the first match converted to canonical, or null.
 */
function tryDescRegexes(
  text: string,
  regexes: ReadonlyArray<RegExp>,
  family: UnitFamily,
): { raw: number; unit: string; canon: number } | null {
  for (const re of regexes) {
    const m = text.match(re)
    if (!m) continue
    const rawVal = m[1]
    if (typeof rawVal !== 'string') continue
    const v = parseFloat(rawVal.replace(/,/g, ''))
    if (!isUsableValue(v)) continue
    // Capture group 2 is unit (optional). If absent, assume canonical.
    const unitCapture = m[2]
    const unit = typeof unitCapture === 'string' && unitCapture.length > 0 ? unitCapture : family.canonical
    const canon = convertToCanonical(v, unit, family)
    if (canon !== null) return { raw: v, unit, canon }
  }
  return null
}

/** Safe iteration over a value the parser claims is an array. Some LLM
 *  outputs return {} or "none" — coerce to empty array silently rather
 *  than throwing. */
function asArray<T>(maybeArr: unknown): ReadonlyArray<T> {
  return Array.isArray(maybeArr) ? (maybeArr as T[]) : []
}

// ---------------------------------------------------------------------------
// MAIN ENTRY — findScaleMetric()
// ---------------------------------------------------------------------------

export interface FindScaleMetricOptions {
  /** Unit family to match (e.g. VOLUME_FAMILY, POWER_FAMILY). */
  family: UnitFamily

  /** Regex array applied to product_description as a fallback when the
   *  structured fields don't yield a match. Each regex MUST have capture
   *  group 1 as the numeric value. Comma-tolerant digit groups
   *  recommended: `(\d{1,3}(?:,\d{3})*|\d{1,5})`. */
  desc_regexes?: ReadonlyArray<RegExp>

  /** Additional structured field keys to inspect on the orchestrator's
   *  ParsedConstraints (e.g. ['nameplate_kwh'] for BESS). Each entry
   *  should be a top-level numeric field name. */
  extra_field_keys?: ReadonlyArray<string>

  /** If true, treat additional_constraints[].description as searchable
   *  text via desc_regexes. Default true. The brief parser writes
   *  free-form descriptions into this array. */
  scan_additional_constraints?: boolean
}

/**
 * Find a scale-determining metric across all available sources, returning
 * a value in the family's canonical unit.
 *
 * Search order:
 *   1. target_performance — if unit matches family
 *   2. additional_constraints[].description — regex extraction
 *   3. product_description — regex extraction
 *   4. extra_field_keys — numeric top-level fields
 *
 * Returns ScaleResult with `found: true` on first match.
 */
export function findScaleMetric(
  c: ParsedConstraints,
  opts: FindScaleMetricOptions,
): ScaleResult {
  const { family, desc_regexes = [], extra_field_keys = [], scan_additional_constraints = true } = opts

  // ── 1. target_performance ──
  const tp = c.target_performance
  if (tp && isUsableValue(tp.value) && tp.unit) {
    const canon = convertToCanonical(tp.value, tp.unit, family)
    if (canon !== null) {
      return {
        found: true,
        value: canon,
        canonical_unit: family.canonical,
        source: 'target_performance',
        raw: { value: tp.value, unit: tp.unit },
      }
    }
  }

  // ── 2. additional_constraints[].description ──
  if (scan_additional_constraints && desc_regexes.length > 0) {
    // The chain spreads the parser's `constraints` block to top level, so
    // additional_constraints can live on the flat object. Defensive cast.
    const items = asArray<{ description?: string }>((c as any).additional_constraints)
    for (const item of items) {
      const desc = typeof item?.description === 'string' ? item.description : ''
      if (!desc) continue
      const extracted = tryDescRegexes(desc, desc_regexes, family)
      if (extracted) {
        return {
          found: true,
          value: extracted.canon,
          canonical_unit: family.canonical,
          source: 'additional_constraints',
          raw: { value: extracted.raw, unit: extracted.unit },
        }
      }
    }
  }

  // ── 3. product_description regex ──
  const desc = typeof c.product_description === 'string' ? c.product_description : ''
  if (desc && desc_regexes.length > 0) {
    const extracted = tryDescRegexes(desc, desc_regexes, family)
    if (extracted) {
      return {
        found: true,
        value: extracted.canon,
        canonical_unit: family.canonical,
        source: 'product_description',
        raw: { value: extracted.raw, unit: extracted.unit },
      }
    }
  }

  // ── 4. extra_field_keys — top-level numeric fields ──
  for (const key of extra_field_keys) {
    const raw = (c as any)[key]
    let value: number | null = null
    let unit: string | null = null
    if (isUsableValue(raw)) {
      value = raw
      unit = family.canonical
    } else if (raw && typeof raw === 'object' && isUsableValue(raw.value)) {
      value = raw.value
      unit = typeof raw.unit === 'string' ? raw.unit : family.canonical
    }
    if (value !== null && unit !== null) {
      const canon = convertToCanonical(value, unit, family)
      if (canon !== null) {
        return {
          found: true,
          value: canon,
          canonical_unit: family.canonical,
          source: 'extra',
          raw: { value, unit },
        }
      }
    }
  }

  return { found: false, reason: 'not_found' }
}

// ---------------------------------------------------------------------------
// SHARED UNIT FAMILIES — declared once, used across detectors.
// ---------------------------------------------------------------------------

export const POWER_KW: UnitFamily = {
  canonical: 'kw',
  aliases: ['kw'],
  conversions: {
    'w': 0.001,
    'mw': 1000,
    'gw': 1_000_000,
    'kwe': 1, // electrical kW
    'kwt': 1, // thermal kW
    'mwe': 1000,
    'mwt': 1000,
  },
}

export const ENERGY_KWH: UnitFamily = {
  canonical: 'kwh',
  aliases: ['kwh'],
  conversions: {
    'wh': 0.001,
    'mwh': 1000,
    'gwh': 1_000_000,
  },
}

export const VOLUME_L: UnitFamily = {
  canonical: 'l',
  aliases: ['l', 'litre', 'litres', 'liter', 'liters', 'ltr'],
  conversions: {
    'ml': 0.001,
    'cl': 0.01,
    'dl': 0.1,
    'm3': 1000,
    'm³': 1000,
    'cubicmetre': 1000,
    'cubicmetres': 1000,
    'cubicmeter': 1000,
    'cubicmeters': 1000,
  },
}

export const MASS_KG: UnitFamily = {
  canonical: 'kg',
  aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'],
  conversions: {
    'g': 0.001,
    'mg': 0.000_001,
    't': 1000,
    'ton': 1000,
    'tons': 1000,
    'tonne': 1000,
    'tonnes': 1000,
    'mt': 1000,
    'lb': 0.453_592,
    'lbs': 0.453_592,
  },
}

export const LENGTH_M: UnitFamily = {
  canonical: 'm',
  aliases: ['m', 'metre', 'metres', 'meter', 'meters'],
  conversions: {
    'mm': 0.001,
    'cm': 0.01,
    'km': 1000,
    'ft': 0.3048,
    'feet': 0.3048,
    'inch': 0.0254,
    'inches': 0.0254,
    'in': 0.0254,
  },
}

export const AREA_M2: UnitFamily = {
  canonical: 'm2',
  aliases: ['m2', 'm²', 'sqm', 'squaremetre', 'squaremetres', 'squaremeter', 'squaremeters'],
  conversions: {
    'cm2': 0.0001,
    'cm²': 0.0001,
    'mm2': 0.000_001,
    'mm²': 0.000_001,
    'ft2': 0.092_903,
    'ft²': 0.092_903,
    'sqft': 0.092_903,
    'hectare': 10_000,
    'hectares': 10_000,
    'ha': 10_000,
  },
}

export const HYDROGEN_RATE: UnitFamily = {
  // Canonical: Nm³/hr (Normal cubic metres per hour — H2 industry standard)
  canonical: 'nm3hr',
  aliases: ['nm3hr', 'nm³hr', 'nm³/hr', 'nm3/hr', 'normalcubicmetreperhour'],
  conversions: {
    // 1 kg H2 ≈ 11.126 Nm³ H2 (at 0 °C, 1 atm)
    'kghr': 11.126,
    'kg/hr': 11.126,
    'kgperhour': 11.126,
    'tpdh2': 463.6, // tonnes per day → Nm³/hr (1000 * 11.126 / 24)
    'tonnesperday': 463.6,
  },
}

export const CO2_CAPTURE_TPY: UnitFamily = {
  canonical: 'tpy',
  aliases: ['tpy', 'tonnesperyear', 'tonsperyear', 'tonnes/year', 'tons/yr', 't/yr', 'ton_yr'],
  conversions: {
    'kgperyear': 0.001,
    'kg/yr': 0.001,
    'mt/yr': 1_000_000,
    'mtperyear': 1_000_000,
    'megatonneperyear': 1_000_000,
    'gtperyear': 1_000_000_000,
  },
}

// ---------------------------------------------------------------------------
// RE-EXPORTS for ergonomic detector imports.
// ---------------------------------------------------------------------------

export { isUsableValue, captureNumber, asArray, normUnit, convertToCanonical }
