/**
 * scripts/lib/blender-digest-dims.ts
 *
 * PHASE 5 — the geometry-from-calculation link between Part 1 and Blender.
 *
 * The per-project Blender generator (`generate-blender-scene.tsx::buildDigest`)
 * feeds the LLM a digest of each component's REAL dimensions so the emitted scene
 * geometry matches the engineering (Tristan's approved architecture: per-project
 * hand-coded geometry driven by state.json, NOT a universal cube-grid renderer).
 *
 * The component dimension is carried in `modifier_characters`, but under TWO
 * kinds with a SEMANTIC split (verified on real state.json):
 *   • `'dimensions'` (plural)  → true multi-axis geometry: "2000×600×2200",
 *     "1.50 m x 1.00 m per wing", "1.60 m deployed length".  ALWAYS geometry.
 *   • `'dimension'`  (singular) → OVERLOADED: sometimes geometry ("40×80 mm",
 *     and EVERY Phase-3 sizing dim "Ø450 × 1350 mm"), but often a scalar spec
 *     mis-filed here ("3.2 V", "22 AWG", "50 µH", "1000 V").
 *
 * buildDigest previously read ONLY `'dimensions'` (plural) — so it missed every
 * Phase-3 geometry-from-calc dimension (all singular) and the singular geometry
 * in mixed classes, and the Blender LLM invented sizes. This module reads BOTH
 * kinds and FILTERS the singular ones to genuine geometry, so a sized tank/pipe/
 * reflector/heatsink reaches the scene at the dimensions the physics produced.
 *
 * Pure + unit-tested. British spelling throughout.
 */

/** Units that mark a singular `'dimension'` as a SCALAR SPEC, not 3-D geometry
 *  (voltage, current, gauge, inductance, resistance, force, power, …). */
const SPEC_UNIT_RE = /^(k?v|m?v|k?a|m?a|awg|mm²|mm2|[µu]h|m?h|nh|k?ω|k?ohm|ohm|kn|kva|k?w|k?wh|wh|ah|k?hz|[mg]hz|°c|bar|m?pa|n·?m|nm|rpm|%|db|lux|s|ms)$/i

/** Does this modifier carry real 3-D GEOMETRY (vs a scalar spec)? Plural
 *  `'dimensions'` is always geometry; singular `'dimension'` only when it shows a
 *  geometric signature (Ø, DN bore, a multi-axis N×M, or a length unit) AND is
 *  not a known electrical/spec unit. Pure; exported for tests. */
export function isGeometryDimension(kind: string, value: string, unit: string): boolean {
  if (kind === 'dimensions') return true
  if (kind !== 'dimension') return false
  const u = String(unit ?? '').trim().toLowerCase()
  if (SPEC_UNIT_RE.test(u)) return false // a scalar spec mis-filed under 'dimension'
  const s = `${value ?? ''} ${unit ?? ''}`.toLowerCase()
  // geometric signatures: Ø-diameter, DN nominal bore, an N×M axis pair, an
  // explicit mm/cm/km length, or a "<n> m <geometry-noun>" phrase.
  return /ø|\bdn\s?\d|\d\s*[×x]\s*\d|\bmm\b|\bcm\b|\bkm\b|(^|\s)\d+(\.\d+)?\s*m\b|\bm\s+(aperture|deployed|stowed|diameter|length|wide|long|tall|span|height)/i.test(s)
}

interface ModifierLike { kind?: unknown; value?: unknown; unit?: unknown }

/**
 * Pick the best geometry dimension string for a component word: prefer a true
 * multi-axis `'dimensions'` (plural), else a geometric singular `'dimension'`
 * (the Phase-3 sizing output). Returns the display string (value + unit, unit
 * appended only when not already embedded) or null when the word carries no
 * geometry. Pure; exported for tests + buildDigest.
 */
export function pickGeometryDim(mods: ModifierLike[] | undefined | null): string | null {
  if (!Array.isArray(mods)) return null
  let plural: string | null = null
  let singular: string | null = null
  for (const m of mods) {
    const kind = String(m?.kind ?? '')
    const value = String(m?.value ?? '')
    const unit = String(m?.unit ?? '')
    if (!isGeometryDimension(kind, value, unit)) continue
    const full = unit && !value.toLowerCase().includes(unit.toLowerCase()) ? `${value} ${unit}`.trim() : value
    if (kind === 'dimensions') { if (!plural) plural = full }
    else if (!singular) singular = full
  }
  return plural ?? singular
}
