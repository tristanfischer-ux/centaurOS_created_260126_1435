/**
 * scripts/lib/orchestrator/prose-validator.ts
 *
 * PROSE-NUMBER VALIDATOR — extracts every number from LLM-generated
 * prose and cross-checks it against the structurally-defined values
 * in the DesignJSON. Any mismatch -> reject + ask LLM to re-narrate.
 *
 * Council requirement (drawer drawer_forgeos_decisions_b6ca90761c861622):
 * "Prose-number validator (extract numbers from prose via regex,
 * cross-check vs DesignJSON, reject on mismatch) — DETERMINISTIC SANDWICH."
 *
 * This is the deterministic guard around the LLM narrator. Without it,
 * the narrator can fabricate numbers in prose that contradict the BoM
 * structure (Loop 13 BESS issue #12: "transformer outputs 24V DC" is
 * physically impossible — narrator wrote it anyway).
 */

export interface ProseNumber {
  /** The numeric value as a JS number. */
  value: number
  /** The captured unit token ('kWh', 'MW', '°C', '%', etc.) — empty
   *  string if no unit was captured next to the number. */
  unit: string
  /** Character offset in the prose where the match started. */
  offset: number
  /** A short context snippet around the number, for diagnostic output. */
  context: string
}

export interface ProseValidationResult {
  passed: boolean
  /** Numbers found in prose that don't appear in DesignJSON. */
  orphan_numbers: ProseNumber[]
  /** Numbers in prose that match a DesignJSON field within tolerance. */
  matched_numbers: Array<{
    prose: ProseNumber
    design_path: string
    design_value: number
    design_unit: string
  }>
  /** Numbers in prose that conflict with a DesignJSON field. */
  mismatches: Array<{
    prose: ProseNumber
    design_path: string
    design_value: number
    design_unit: string
    relative_diff_pct: number
  }>
  /** Diagnostic detail (always populated). */
  detail: string
}

// ---------------------------------------------------------------------------
// REGEX: capture numeric values with optional units in surrounding prose.
// ---------------------------------------------------------------------------

const NUMBER_PATTERN = /([−\-]?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|[−\-]?\d+\.\d+|[−\-]?\d+)\s*(°[CF]|%|µ[A-Za-z]+|m[A-Za-z²³]*|k[A-Za-z]+|M[A-Za-z]+|G[A-Za-z]+|[A-Za-z]+|)\b/g

const UNIT_BLACKLIST = new Set([
  '', 'and', 'or', 'the', 'a', 'in', 'of', 'to', 'on', 'for',
  'th', 'rd', 'st', 'nd',  // ordinals
])

/**
 * Extract every number + unit token from the given prose using
 * matchAll (stateless, no shared state between calls).
 */
export function extractNumbersFromProse(prose: string): ProseNumber[] {
  const out: ProseNumber[] = []
  if (!prose) return out
  const matches = Array.from(prose.matchAll(NUMBER_PATTERN))
  for (const m of matches) {
    const raw = m[1] ?? ''
    const unit = m[2] ?? ''
    const value = parseFloat(raw.replace(/[,\s]/g, '').replace(/^−/, '-'))
    if (!Number.isFinite(value)) continue
    const offset = m.index ?? 0
    if (UNIT_BLACKLIST.has(unit.toLowerCase())) {
      out.push({ value, unit: '', offset, context: snippet(prose, offset, 60) })
      continue
    }
    out.push({ value, unit, offset, context: snippet(prose, offset, 60) })
  }
  return out
}

/**
 * Walk the DesignJSON recursively, collecting all numeric leaf values
 * with their unit hints (from the field name).
 */
export function extractNumbersFromDesign(design: unknown): Map<string, { value: number; unit: string }> {
  const out = new Map<string, { value: number; unit: string }>()
  walkValues(design, '', out)
  return out
}

function walkValues(node: unknown, path: string, out: Map<string, { value: number; unit: string }>): void {
  if (node === null || node === undefined) return
  if (typeof node === 'number' && Number.isFinite(node)) {
    out.set(path, { value: node, unit: inferUnitFromPath(path) })
    return
  }
  if (typeof node === 'object') {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walkValues(node[i], `${path}[${i}]`, out)
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walkValues(v, path ? `${path}.${k}` : k, out)
    }
  }
}

function inferUnitFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('_kwh') || lower.endsWith('_kw_h')) return 'kWh'
  if (lower.endsWith('_kw')) return 'kW'
  if (lower.endsWith('_mw')) return 'MW'
  if (lower.endsWith('_mwh')) return 'MWh'
  if (lower.endsWith('_kg')) return 'kg'
  if (lower.endsWith('_g')) return 'g'
  if (lower.endsWith('_mm')) return 'mm'
  if (lower.endsWith('_m')) return 'm'
  if (lower.endsWith('_m2') || lower.endsWith('_m_2')) return 'm²'
  if (lower.endsWith('_m3') || lower.endsWith('_m_3')) return 'm³'
  if (lower.endsWith('_v')) return 'V'
  if (lower.endsWith('_a')) return 'A'
  if (lower.endsWith('_c') || lower.endsWith('_celsius')) return '°C'
  if (lower.endsWith('_pct') || lower.endsWith('_percent')) return '%'
  if (lower.endsWith('_count')) return 'count'
  if (lower.endsWith('_l')) return 'L'
  if (lower.endsWith('_lpm')) return 'L/min'
  if (lower.endsWith('_dba')) return 'dB(A)'
  if (lower.endsWith('_bar')) return 'bar'
  if (lower.endsWith('_pa')) return 'Pa'
  if (lower.endsWith('_hz')) return 'Hz'
  return ''
}

// ---------------------------------------------------------------------------
// VALIDATION ENTRY POINT
// ---------------------------------------------------------------------------

export interface ProseValidationOptions {
  /** Numbers that differ by ≤ this fraction are considered matches. */
  tolerance_pct?: number
  /** Maximum number of orphan numbers to allow before declaring fail. */
  orphan_threshold?: number
}

/**
 * Validate generated prose against the design JSON.
 */
export function validateProseNumbers(
  prose: string,
  design: unknown,
  opts: ProseValidationOptions = {},
): ProseValidationResult {
  const tolerancePct = opts.tolerance_pct ?? 1.0
  const orphanThreshold = opts.orphan_threshold ?? 5
  const proseNumbers = extractNumbersFromProse(prose)
  const designNumbers = extractNumbersFromDesign(design)
  const matched: ProseValidationResult['matched_numbers'] = []
  const mismatches: ProseValidationResult['mismatches'] = []
  const orphans: ProseNumber[] = []

  for (const pn of proseNumbers) {
    let bestMatch: { path: string; value: number; unit: string; relDiff: number } | null = null
    for (const [path, dn] of designNumbers) {
      if (pn.unit && dn.unit && !unitsCompatible(pn.unit, dn.unit)) continue
      const denom = Math.max(Math.abs(pn.value), Math.abs(dn.value), 1e-9)
      const relDiff = Math.abs(pn.value - dn.value) / denom * 100
      if (relDiff < (bestMatch?.relDiff ?? Infinity)) {
        bestMatch = { path, value: dn.value, unit: dn.unit, relDiff }
      }
    }
    if (!bestMatch) {
      orphans.push(pn)
      continue
    }
    if (bestMatch.relDiff <= tolerancePct) {
      matched.push({ prose: pn, design_path: bestMatch.path, design_value: bestMatch.value, design_unit: bestMatch.unit })
    } else if (bestMatch.relDiff <= 50) {
      mismatches.push({
        prose: pn,
        design_path: bestMatch.path,
        design_value: bestMatch.value,
        design_unit: bestMatch.unit,
        relative_diff_pct: bestMatch.relDiff,
      })
    } else {
      orphans.push(pn)
    }
  }

  const passed = mismatches.length === 0 && orphans.length <= orphanThreshold
  const detail = passed
    ? `${matched.length} matched, ${orphans.length} orphan (≤ ${orphanThreshold} threshold), 0 mismatches`
    : `${matched.length} matched, ${orphans.length} orphan (threshold ${orphanThreshold}), ${mismatches.length} mismatches`

  return { passed, matched_numbers: matched, mismatches, orphan_numbers: orphans, detail }
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function snippet(text: string, offset: number, radius: number): string {
  const start = Math.max(0, offset - radius)
  const end = Math.min(text.length, offset + radius)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

const UNIT_FAMILIES: Record<string, string[]> = {
  energy: ['wh', 'kwh', 'mwh', 'gwh', 'j', 'kj', 'mj'],
  power: ['w', 'kw', 'mw', 'gw'],
  mass: ['g', 'kg', 't', 'tonne', 'tonnes', 'lb', 'lbs'],
  length: ['mm', 'cm', 'm', 'km', 'in', 'ft'],
  area: ['m²', 'm2', 'cm²', 'cm2', 'mm²', 'mm2', 'ft²'],
  volume: ['ml', 'l', 'm³', 'm3'],
  voltage: ['v', 'kv', 'mv'],
  current: ['a', 'ka', 'ma'],
  temperature: ['°c', 'c', '°f', 'f', 'k'],
  pressure: ['pa', 'kpa', 'mpa', 'bar', 'psi'],
  frequency: ['hz', 'khz', 'mhz', 'ghz'],
  percent: ['%', 'pct'],
  count: ['', 'count', 'cells', 'modules', 'racks'],
  flow_rate: ['l/min', 'lpm', 'l/h', 'lph', 'm³/h'],
}

function unitsCompatible(a: string, b: string): boolean {
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  if (al === bl) return true
  for (const units of Object.values(UNIT_FAMILIES)) {
    if (units.includes(al) && units.includes(bl)) return true
  }
  return false
}
