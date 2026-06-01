/**
 * scripts/lib/brief-value-literal-scanner.ts — Brief Value Literal Scanner (exit code 25)
 *
 * ARCHITECTURAL INVARIANT (2026-05-26, L38 class-killer C — universal fix):
 *
 *   No brief-derived numeric value may appear as a string literal inside the
 *   deterministic emitter source file. Every brief-derived quantity MUST be
 *   read from the EngineeringContract (via contract.quantities or
 *   contract.shared_quantities) and then formatted via a helper function
 *   (formatMassKg, fmtQty, etc.). Hardcoded literals become stale when the
 *   brief changes — they silently contradict the new brief value and produce
 *   designs that are internally inconsistent (L38 AUDIT-CONSISTENCY HIGH:
 *   "28,000 kg" on p.82 vs "35,000 kg" on 5 other pages).
 *
 * This gate scans the deterministic-emitter.ts source text for numeric
 * literals that match brief-derived constraint values. It is run at two
 * points:
 *
 *   1. POST-EMIT (chain time): against the brief's actual constraint numbers
 *      — catches any literal that slipped past review.
 *   2. BUILD TIME (optional): via a script import in the regression harness —
 *      catches new literals before they reach the chain.
 *
 * WHY EXIT CODE 25 (not a soft warning):
 *   A stale literal is indistinguishable from a deliberately chosen value in
 *   the rendered PDF. The Physics Critic cannot reliably distinguish "this was
 *   always 28 tonnes" from "this was supposed to be 35 tonnes". Gate 25 gives
 *   the chain a hard fail so the human author must explicitly confirm the value
 *   is either (a) contract-driven or (b) physically justified and documented.
 *
 * COVERAGE: universal — walks the emitter source text against ANY brief's
 *   constraint numerics. New briefs get full coverage without code changes.
 *
 * HISTORICAL VALUES EXTENSION (2026-05-27, L42 universal fix B):
 *   The gate also scans for HISTORICAL brief values — values that appeared in
 *   prior briefs for the same class but no longer match the current brief.
 *   Source: scripts/lib/historical-brief-values.json (per-class manifest).
 *   Severity: HIGH for historical-only matches (definitively stale);
 *             MED for values matching BOTH current AND historical (ambiguous).
 *   L41 context: L38 raised max_mass_kg 28000→35000. Gate 25 scanned for 35000
 *   (current) but NOT 28000 (stale historical). The stale "28,000 kg" slipped
 *   past gate 25 because it only checked current-brief values.
 *
 * SCOPE OF SCAN:
 *   Only literals inside string templates (backtick, single-quote, double-quote
 *   contexts) and mod() calls are flagged. TypeScript type annotations,
 *   comments, and regression-harness thresholds are excluded.
 *
 * EXIT CODE 25 registered in CLAUDE.md chain exit codes table.
 *
 * Pre-change mempalace search: "brief-value literal hardcoded emitter stale
 *   mass_cap 28000" → 2 drawers loaded.
 * Pre-change mempalace search (L42): "historical brief value scanner stale
 *   literal emitter" → 5 drawers loaded. Drawer confirmed stale-literal
 *   class is UNIVERSAL and the 28000→35000 example IS the canonical instance.
 */

import * as fs from 'fs'
import * as path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiteralHit {
  /** The numeric value that was found as a literal. */
  value: number
  /** The brief constraint key that this value came from. */
  brief_key: string
  /** Human label for this constraint (e.g. "max mass cap"). */
  brief_label: string
  /** Line number in the source file (1-indexed). */
  line_number: number
  /** The line text containing the literal. */
  line_text: string
  /** The raw matched string (e.g. "28000", "28,000"). */
  raw_match: string
  /** Source file path that contained this hit (relative or absolute). */
  source_file?: string
}

export interface BriefValueLiteralScanResult {
  passed: boolean
  /** Empty when passed = true. */
  hits: LiteralHit[]
  /** Total lines scanned. */
  lines_scanned: number
  /** Brief constraints checked as literal candidates. */
  constraints_checked: number
  /** Error message for process.exit(25) + console.error. */
  error_message: string | null
  class_name: string
}

// ── Constraint extraction ─────────────────────────────────────────────────────

/**
 * MinimalBriefConstraints — the subset of parsed brief fields that
 * could become hardcoded literals in the emitter.
 *
 * All numeric fields; strings are not scanned (too many false positives).
 * Extend this interface as new brief fields are added.
 */
export interface MinimalBriefConstraints {
  /** Maximum mass in kg (brief.constraints.max_mass_kg). */
  max_mass_kg?: number
  /** Nameplate capacity in MWh. */
  nameplate_capacity_mwh?: number
  /** Usable energy in MWh. */
  usable_energy_mwh?: number
  /** DC bus voltage in V. */
  dc_bus_voltage_v?: number
  /** AC grid voltage in V. */
  ac_grid_voltage_v?: number
  /** Design life in years. */
  design_life_years?: number
  /** Cycle life target. */
  cycle_life_cycles?: number
  /** Unit cost ceiling in £. */
  unit_cost_ceiling_gbp?: number
  /** Batch size (number of units). */
  batch_size?: number
  /** Container count (if explicitly constrained). */
  container_count?: number
  /** Any additional numeric constraints by key. */
  [key: string]: number | undefined
}

/** Human-readable labels for known brief keys. */
const BRIEF_KEY_LABELS: Record<string, string> = {
  max_mass_kg: 'max mass cap (kg)',
  nameplate_capacity_mwh: 'nameplate capacity (MWh)',
  usable_energy_mwh: 'usable energy (MWh)',
  dc_bus_voltage_v: 'DC bus voltage (V)',
  ac_grid_voltage_v: 'AC grid voltage (V)',
  design_life_years: 'design life (years)',
  cycle_life_cycles: 'cycle life target',
  unit_cost_ceiling_gbp: 'unit cost ceiling (GBP)',
  batch_size: 'batch size',
  container_count: 'container count',
}

// ── Unit-family discrimination (gate-25 false-positive fix, 2026-05-30) ───────
// A literal immediately followed by a unit from a DIFFERENT physical family than
// the brief constraint is a COINCIDENTAL collision, not a stale brief literal —
// e.g. "300 K" (radiator temperature) vs max_mass_kg=300, or "800 /h" (kLa rate)
// vs batch_size=800. buildLiteralPattern's lookahead only checks the immediate
// next char (a space), so it cannot tell "300 kg" from "300 K". When the trailing
// unit belongs to a recognised family that ISN'T the constraint's family, skip.
// Bare numbers and same-family units are kept (preserves the canonical
// "28000 kg" stale-literal catch). Universal across all classes.
const UNIT_FAMILY_TRAILING: Record<string, RegExp> = {
  mass:          /^(kg|kgs|kilograms?|tonnes?|t|lbs?)\b/i,
  energy:        /^(wh|kwh|mwh|gwh|kj|mj)\b/i,
  power:         /^(w|kw|mw|gw|tw)(t|e|p|th|el)?\b/i,
  voltage:       /^(v|kv|mv)\b/i,
  current:       /^(a|ka|ma)\b/i,
  temperature:   /^(K|°C|°F|degC|degF)\b/,   // case-sensitive: K = Kelvin, not kilo-
  length:        /^(mm|cm|µm|nm|km|m)\b/i,
  time:          /^(years?|yrs?|months?|days?|hrs?|hours?|seconds?)\b/i,
  rate:          /^(\/h|\/hr|\/s|\/yr|hz|khz|mhz|rpm)\b/i,
  datarate:      /^(kbit\/s|mbit\/s|gbit\/s|kbps|mbps|gbps|bit\/s|bps|baud)\b/i,
  money:         /^(£|\$|€|gbp|usd|eur)\b/i,
  flow:          /^(lpm|gpm|cmh|cms|l\/|m³\/|m3\/)\b/i,
  pressure:      /^(pa|kpa|mpa|bar|psi)\b/i,
  concentration: /^(ppm|ppb|µmol|mg\/)\b/i,
}
const CONSTRAINT_EXPECTED_FAMILY: Record<string, string> = {
  max_mass_kg: 'mass',
  nameplate_capacity_mwh: 'energy',
  usable_energy_mwh: 'energy',
  dc_bus_voltage_v: 'voltage',
  ac_grid_voltage_v: 'voltage',
  unit_cost_ceiling_gbp: 'money',
  design_life_years: 'time',
  batch_size: 'count',
  container_count: 'count',
  cycle_life_cycles: 'count',
}

/**
 * Infer the physical family of a literal from the mod()/q() KEY that wraps it.
 * The emitter wraps values as mod('list_price_gbp','300') / q(c,'dc_bus_voltage_v',800);
 * the key tells you the value IS a price / a voltage — so it cannot be a stale
 * mass/batch literal even though the bare number collides. Returns null when the
 * key is unrecognised (fall through to unit-trailing discrimination). 2026-05-30.
 */
function familyFromValueKey(k: string): string | null {
  const s = k.toLowerCase()
  if (/price|_gbp|_usd|_eur|cost/.test(s)) return 'money'
  if (/voltage|_kv\b|\bvolt|_v$/.test(s)) return 'voltage'
  if (/mass|_kg\b|weight/.test(s)) return 'mass'
  if (/current|_ka\b|_ma\b|\bamp|_a$/.test(s)) return 'current'
  if (/power|_kw|_mw|_gw|watt|_w$/.test(s)) return 'power'
  if (/energy|_kwh|_mwh|_gwh|_wh$/.test(s)) return 'energy'
  if (/dimension|length|width|height|diameter|_mm$|_cm$|_m$/.test(s)) return 'length'
  if (/temp|_degc|_degf/.test(s)) return 'temperature'
  if (/count|\bqty|quantity|batch|cycles|_num$/.test(s)) return 'count'
  if (/flow|_lpm|_cmh|_cms|_lph/.test(s)) return 'flow'
  if (/_days$|_years$|_hours$|design_life/.test(s)) return 'time'
  return null
}

// ── Line patterns to EXCLUDE from the scan ───────────────────────────────────

/**
 * Lines matching any of these patterns are skipped — they contain the numeric
 * but are NOT emitter string templates.
 *
 * Rationale:
 *   - TypeScript type annotations: `value: number = 28000` — the 28000 is a
 *     fallback default, not a template literal.
 *   - Comments (`//`, `*`): narrative explanation of why a value exists.
 *   - Regression-harness threshold lines: `threshold: 28000` — intentional.
 *   - Import/export lines.
 *   - Lines with `fallback` or `default` in them (getSharedQty fallback args).
 */
const EXCLUDED_LINE_PATTERNS: RegExp[] = [
  /^\s*\/\//,                    // single-line comment
  /^\s*\*/,                      // JSDoc / block comment
  /import\s+/,                   // import statement
  /export\s+/,                   // export statement
  /:\s*number\s*[=,)]/,          // TypeScript numeric annotation
  /fallback\s*[,)]/,             // getSharedQty / getSharedQuantity fallback arg
  /threshold\s*:/,               // regression threshold
  /\/\*.*\*\//,                  // inline block comment
  /const\s+[A-Z_]+\s*=/,         // named constant declaration (SCREAMING_SNAKE_CASE) — safe fallback values
]

// ── Core scan ─────────────────────────────────────────────────────────────────

/**
 * Build a list of RegExp patterns to look for in emitter source lines.
 * Each pattern matches the numeric value with or without thousands separators.
 */
function buildLiteralPattern(value: number): RegExp {
  // Accept integer or decimal, with optional thousands comma
  const intPart = Math.floor(value).toString()
  // Build both "28000" and "28,000" forms
  const noComma = intPart
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  // Match as a standalone number in a string context:
  // preceded by quote, backtick, comma, space, or start-of-string
  // followed by quote, backtick, comma, space, unit chars, or end-of-string
  const escaped = [noComma, withComma]
    .filter((v, i, a) => a.indexOf(v) === i)  // deduplicate
    .map((v) => v.replace(/,/g, ','))           // already literal commas
    .join('|')

  return new RegExp(`(?<=['"\`\\s,([{])(${escaped})(?=['"\`,\\s)\\]}kKmMgGlLwW%]|$)`)
}

/**
 * Scan the emitter source text for brief-derived numeric literals.
 *
 * @param emitterSource  Full text of the deterministic-emitter.ts file.
 * @param constraints    Brief constraint numerics extracted from parsedBrief.
 * @param className      Product class for the error message.
 * @param minValue       Skip scanning for values below this threshold
 *                       (avoids false positives on ubiquitous small numbers
 *                       like 1, 2, 4 that appear everywhere). Default: 100.
 */
export function scanEmitterForBriefLiterals(
  emitterSource: string,
  constraints: MinimalBriefConstraints,
  className: string,
  minValue = 100,
  /** STRICT mode (used for tool-narratives.ts): only flag a literal that is
   *  immediately followed by the constraint's OWN unit. Narrative prose is full
   *  of physics example numbers (300 MWt, 800 /h kLa, 2-4 m) that coincidentally
   *  equal brief values; strict mode flags only a genuine stale brief literal
   *  (e.g. "28,000 kg") and skips the rest. Lenient mode (emitter) keeps bare
   *  numbers and skips only clear cross-family unit conflicts. */
  requireConstraintUnit = false,
): BriefValueLiteralScanResult {
  const lines = emitterSource.split('\n')
  const hits: LiteralHit[] = []
  let constraintsChecked = 0

  for (const [key, rawValue] of Object.entries(constraints)) {
    if (rawValue === undefined || rawValue === null) continue
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value < minValue) continue

    constraintsChecked++
    const pattern = buildLiteralPattern(value)
    const label = BRIEF_KEY_LABELS[key] ?? key

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i]
      // Strip inline comments — a literal inside a `// ... £6,800` comment is not
      // a rendered emitter value (2026-05-30 gate-25 false-positive fix).
      const lineText = rawLine.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')

      // Skip excluded line types (test the RAW line so comment-only lines skip).
      if (EXCLUDED_LINE_PATTERNS.some((p) => p.test(rawLine))) continue

      // Only scan lines that are inside mod() calls or template literals —
      // look for string context indicators
      const isStringContext =
        lineText.includes("mod('") ||
        lineText.includes('mod("') ||
        lineText.includes('`') ||
        lineText.includes("'") ||
        lineText.includes('"')

      if (!isStringContext) continue

      // Product-identifier mod() kinds wrap PRODUCT CODES, never physical brief
      // values — a number inside one (Roxtec "S 150", "ABB 3.2") is a part code,
      // not e.g. batch_size=150. Skip the whole line regardless of numeric
      // coincidence. 2026-06-01 (solar-inverter "S 150" vs batch_size=150 false
      // positive: a BESS-only Roxtec seal part-number flagged against an unrelated
      // brief constraint that shared the value 150).
      if (/\bmod\(\s*['"](?:part_number|manufacturer|mpn|sku|form|name_human|character_id)['"]/i.test(lineText)) continue

      const match = lineText.match(pattern)
      if (!match) continue

      const expectedFamily = CONSTRAINT_EXPECTED_FAMILY[key]
      const mIdx = match.index ?? lineText.indexOf(match[1])

      // Value-key family (gate-25 false-positive fix, 2026-05-30): the mod()/q()
      // KEY wrapping the literal tells us what the value IS (a price, a voltage).
      // If that differs from the constraint's family it's a coincidental collision
      // — e.g. mod('list_price_gbp','300') vs max_mass_kg=300,
      // q(c,'dc_bus_voltage_v',800) vs batch_size=800.
      if (expectedFamily) {
        const keyMatch = lineText.slice(0, mIdx).match(/['"]([a-z_][a-z_0-9]{2,})['"]\s*,\s*['"]?\s*$/i)
        const valFamily = keyMatch ? familyFromValueKey(keyMatch[1]) : null
        if (valFamily && valFamily !== expectedFamily) continue
      }

      // Unit-family discrimination (trailing-unit check).
      const trailing = lineText.slice(mIdx + match[1].length).replace(/^[\s)\]}]+/, '')
      if (requireConstraintUnit) {
        // STRICT (narratives): require the constraint's OWN unit to follow the
        // literal. Coincidental physics numbers (300 MWt, 800 /h, bare 800) are
        // skipped; only a genuine stale brief literal ("28,000 kg") is flagged.
        const expectedRe = expectedFamily ? UNIT_FAMILY_TRAILING[expectedFamily] : undefined
        if (!expectedRe || !expectedRe.test(trailing)) continue
      } else if (expectedFamily) {
        // LENIENT (emitter): skip only a CLEAR cross-family unit conflict; keep
        // bare numbers + same-family units (preserves the bare-literal catch).
        // The literal may be the VALUE arg of mod(key,'500','kbit/s') /
        // q(c,key,'500','A') where the real UNIT is the NEXT quoted arg, not
        // adjacent to the number — read it so "500 kbit/s" (CAN data-rate) or
        // "500 A" (current) is not matched to a unitless brief count like
        // batch_size=500. 2026-05-31 (heatpump exit-25 false positive).
        const nextArgUnit = trailing.match(/^['"]?\s*,\s*['"]([^'"]+)['"]/)?.[1] ?? ''
        const unitStr = nextArgUnit || trailing
        let unitConflict = false
        for (const fam in UNIT_FAMILY_TRAILING) {
          if (fam !== expectedFamily && UNIT_FAMILY_TRAILING[fam].test(unitStr)) {
            unitConflict = true
            break
          }
        }
        if (unitConflict) continue
      }

      hits.push({
        value,
        brief_key: key,
        brief_label: label,
        line_number: i + 1,
        line_text: lineText.trim(),
        raw_match: match[1],
      })
    }
  }

  const passed = hits.length === 0

  let errorMessage: string | null = null
  if (!passed) {
    const lines2 = [
      `[Gate 25 / exit 25] Brief-value literal scanner FAIL — class: ${className}`,
      `${hits.length} hardcoded brief literal(s) found in deterministic-emitter.ts:`,
    ]
    for (const h of hits) {
      lines2.push(
        `  Line ${h.line_number}: literal "${h.raw_match}" matches brief.${h.brief_key} (${h.brief_label})`,
      )
      lines2.push(`    → ${h.line_text.substring(0, 120)}`)
    }
    lines2.push('')
    lines2.push('Fix: replace literal with a contract-driven expression.')
    lines2.push('  For mass: mod(\'capacity\', String(p.briefMassCapKg), \'kg\')')
    lines2.push('  For any quantity: read from contract.quantities[\'...\'] or contract.shared_quantities[\'...\']')
    lines2.push('  Use formatMassKg(n) / formatFlowLpm(n) helpers where the unit is embedded in the string.')
    errorMessage = lines2.join('\n')
  }

  return {
    passed,
    hits,
    lines_scanned: lines.length,
    constraints_checked: constraintsChecked,
    error_message: errorMessage,
    class_name: className,
  }
}

// ── File-backed entry point ───────────────────────────────────────────────────

/**
 * Convenience wrapper: reads the emitter source from disk and scans it.
 *
 * @param emitterPath   Absolute path to deterministic-emitter.ts.
 * @param constraints   Brief constraint numerics.
 * @param className     Product class.
 * @param minValue      Skip values below this (default 100).
 */
export function scanEmitterFileForBriefLiterals(
  emitterPath: string,
  constraints: MinimalBriefConstraints,
  className: string,
  minValue = 100,
): BriefValueLiteralScanResult {
  if (!fs.existsSync(emitterPath)) {
    return {
      passed: false,
      hits: [],
      lines_scanned: 0,
      constraints_checked: 0,
      error_message: `[Gate 25] Emitter file not found: ${emitterPath}`,
      class_name: className,
    }
  }

  const source = fs.readFileSync(emitterPath, 'utf-8')
  return scanEmitterForBriefLiterals(source, constraints, className, minValue)
}

// ── Multi-file scan (2026-05-27, L43 universal extension) ────────────────────

/**
 * scanMultipleFilesForBriefLiterals — extends gate 25 to scan ADDITIONAL source
 * files beyond deterministic-emitter.ts. The same brief-derived-literal problem
 * appears in any source file whose strings are rendered into the PDF — most
 * notably src/lib/pdf-engine-v2/tool-narratives.ts, which describes the
 * engineering tools used (Mass Aggregator, Lifecycle CO2, Psychrolib, etc.)
 * and renders on the PDF's Tools page.
 *
 * L43 finding: src/lib/pdf-engine-v2/tool-narratives.ts:230 had a frozen
 *   "e.g. 28,000 kg for a road-transportable 40-foot container" in the Mass
 *   Aggregator tool description. Brief was 35,000 kg, but the stale 28,000 kg
 *   rendered on PDF p.80, and gate 11 (cross-page numeric consistency) caught
 *   the contradiction. Gate 25 did NOT catch it because the L43 scan was
 *   scoped only to deterministic-emitter.ts.
 *
 * UNIVERSAL CLOSURE: any source file whose strings render into the PDF MUST
 * be in the gate 25 scan list. This function takes an array of source files
 * and aggregates hits across all of them. Each hit's `source_file` field
 * identifies which file the literal came from.
 *
 * @param sourcePaths    Array of absolute paths to scan.
 * @param constraints    Brief constraint numerics.
 * @param className      Product class for the error message.
 * @param minValue       Skip values below this (default 100).
 */
export function scanMultipleFilesForBriefLiterals(
  sourcePaths: string[],
  constraints: MinimalBriefConstraints,
  className: string,
  minValue = 100,
): BriefValueLiteralScanResult {
  const allHits: LiteralHit[] = []
  let totalLinesScanned = 0
  let constraintsCheckedSeen = 0

  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) continue
    const source = fs.readFileSync(sourcePath, 'utf-8')
    // Narratives scanned in STRICT mode (require the constraint's own unit) —
    // tool descriptions are dense with coincidental physics numbers; the emitter
    // is scanned leniently (bare-literal catch).
    const strictNarrative = /tool-narratives/.test(sourcePath)
    const result = scanEmitterForBriefLiterals(source, constraints, className, minValue, strictNarrative)
    constraintsCheckedSeen = Math.max(constraintsCheckedSeen, result.constraints_checked)
    totalLinesScanned += result.lines_scanned
    for (const hit of result.hits) {
      allHits.push({ ...hit, source_file: path.basename(sourcePath) })
    }
  }

  const passed = allHits.length === 0
  let errorMessage: string | null = null
  if (!passed) {
    const lines: string[] = [
      `[Gate 25 / exit 25] Brief-value literal scanner FAIL — class: ${className}`,
      `${allHits.length} hardcoded brief literal(s) found across ${sourcePaths.length} source file(s):`,
    ]
    for (const h of allHits) {
      const fileTag = h.source_file ? `[${h.source_file}]` : ''
      lines.push(
        `  ${fileTag} Line ${h.line_number}: literal "${h.raw_match}" matches brief.${h.brief_key} (${h.brief_label})`,
      )
      lines.push(`    → ${h.line_text.substring(0, 120)}`)
    }
    lines.push('')
    lines.push('Fix: replace literal with a contract-driven expression OR drop the example value.')
    lines.push('  For mass: mod(\'capacity\', String(p.briefMassCapKg), \'kg\')')
    lines.push('  For tool-narratives.ts: drop the "e.g. <number>" example — tool descriptions render into the PDF\'s Tools page and any frozen example value becomes a stale literal when the brief changes.')
    errorMessage = lines.join('\n')
  }

  return {
    passed,
    hits: allHits,
    lines_scanned: totalLinesScanned,
    constraints_checked: constraintsCheckedSeen,
    error_message: errorMessage,
    class_name: className,
  }
}

// ── Historical brief values extension (2026-05-27, L42 universal fix B) ──────

/**
 * HistoricalBriefValueHit — a literal match against a HISTORICAL brief value
 * (one that appeared in a prior brief version for this class).
 */
export interface HistoricalBriefValueHit extends LiteralHit {
  /** 'stale' = matches historical ONLY (not current brief) — HIGH severity.
   *  'ambiguous' = matches BOTH current and historical — MED severity. */
  historical_status: 'stale' | 'ambiguous'
  /** All historical values for this brief_key. */
  historical_values: number[]
  /** Whether this value also matches the current brief (true = 'ambiguous'). */
  also_matches_current: boolean
}

/**
 * Load historical brief values for a product class from the manifest JSON.
 *
 * @param manifestPath   Absolute path to historical-brief-values.json.
 * @param className      Product class slug (must match a top-level key in the manifest).
 * @returns              Map of constraint_key → array of all historical numeric values.
 */
export function loadHistoricalBriefValues(
  manifestPath: string,
  className: string,
): Map<string, number[]> {
  const result = new Map<string, number[]>()
  if (!fs.existsSync(manifestPath)) return result

  let manifest: Record<string, any>
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    return result
  }

  // Try className directly, then with underscores → dashes and vice-versa
  const classData =
    manifest[className] ??
    manifest[className.replace(/_/g, '-')] ??
    manifest[className.replace(/-/g, '_')] ??
    null

  if (!classData || typeof classData !== 'object') return result

  for (const [key, val] of Object.entries(classData)) {
    if (key.startsWith('_')) continue  // skip comment keys
    if (Array.isArray(val)) {
      const nums = val.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      if (nums.length > 0) result.set(key, nums)
    }
  }
  return result
}

/**
 * scanEmitterForHistoricalBriefLiterals — extends the base gate 25 scan to
 * check for HISTORICAL brief values (stale values from prior brief versions).
 *
 * This function runs AFTER scanEmitterForBriefLiterals. It scans for values
 * that appear in the historical manifest but NOT in the current brief — those
 * are definitively stale. It also flags values that appear in BOTH current
 * and historical manifests as MED (ambiguous).
 *
 * @param emitterSource      Full text of deterministic-emitter.ts.
 * @param currentConstraints Current brief constraint numerics.
 * @param historicalValues   Map from loadHistoricalBriefValues().
 * @param className          Product class.
 * @param minValue           Skip values below this threshold (default 100).
 */
export function scanEmitterForHistoricalBriefLiterals(
  emitterSource: string,
  currentConstraints: MinimalBriefConstraints,
  historicalValues: Map<string, number[]>,
  className: string,
  minValue = 100,
): HistoricalBriefValueHit[] {
  const lines = emitterSource.split('\n')
  const hits: HistoricalBriefValueHit[] = []

  // Build a set of current-brief values for O(1) lookup
  const currentValues = new Set<number>()
  for (const [, rawValue] of Object.entries(currentConstraints)) {
    if (rawValue !== undefined && rawValue !== null) {
      const v = Number(rawValue)
      if (Number.isFinite(v) && v >= minValue) currentValues.add(v)
    }
  }

  for (const [key, histNums] of historicalValues.entries()) {
    const label = BRIEF_KEY_LABELS[key] ?? key

    for (const histValue of histNums) {
      if (!Number.isFinite(histValue) || histValue < minValue) continue

      const alsoMatchesCurrent = currentValues.has(histValue)
      // If the historical value is ALSO the current value: ambiguous (MED)
      // If the historical value is NOT the current value: stale (HIGH)
      const historicalStatus: 'stale' | 'ambiguous' = alsoMatchesCurrent ? 'ambiguous' : 'stale'

      const pattern = buildLiteralPattern(histValue)

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i]

        // Skip excluded line types
        if (EXCLUDED_LINE_PATTERNS.some((p) => p.test(lineText))) continue

        // Only scan string-context lines
        const isStringContext =
          lineText.includes("mod('") ||
          lineText.includes('mod("') ||
          lineText.includes('`') ||
          lineText.includes("'") ||
          lineText.includes('"')

        if (!isStringContext) continue

        const match = lineText.match(pattern)
        if (!match) continue

        // Don't double-report: if this was already caught by the base scanner
        // (because histValue === currentValue) skip here — the base scanner
        // already reported it as a current-value hit. We only add the
        // historical status for STALE values not in the current constraints.
        if (historicalStatus === 'ambiguous') continue  // base scan already caught these

        hits.push({
          value: histValue,
          brief_key: key,
          brief_label: label,
          line_number: i + 1,
          line_text: lineText.trim(),
          raw_match: match[1],
          historical_status: historicalStatus,
          historical_values: histNums,
          also_matches_current: alsoMatchesCurrent,
        })
      }
    }
  }

  return hits
}

/**
 * scanEmitterFileForHistoricalBriefLiterals — file-backed wrapper.
 *
 * Combines the current-brief scan (gate 25 base) with the historical-values
 * scan. Returns both current hits (always HIGH) and historical-stale hits
 * (HIGH for stale, MED for ambiguous).
 *
 * @param emitterPath        Absolute path to deterministic-emitter.ts.
 * @param constraints        Current brief constraint numerics.
 * @param className          Product class slug.
 * @param historicalManifest Absolute path to historical-brief-values.json.
 * @param minValue           Skip values below this (default 100).
 */
export function scanEmitterFileWithHistoricalValues(
  emitterPath: string,
  constraints: MinimalBriefConstraints,
  className: string,
  historicalManifest: string,
  minValue = 100,
): {
  base_result: BriefValueLiteralScanResult
  historical_hits: HistoricalBriefValueHit[]
  combined_passed: boolean
  combined_high_count: number
} {
  const baseResult = scanEmitterFileForBriefLiterals(emitterPath, constraints, className, minValue)

  // Load historical values
  const historicalValues = loadHistoricalBriefValues(historicalManifest, className)

  let historicalHits: HistoricalBriefValueHit[] = []
  if (historicalValues.size > 0 && fs.existsSync(emitterPath)) {
    const source = fs.readFileSync(emitterPath, 'utf-8')
    historicalHits = scanEmitterForHistoricalBriefLiterals(
      source,
      constraints,
      historicalValues,
      className,
      minValue,
    )
  }

  // HIGH: base result hits (current-brief value literals) + historical-stale hits
  const highCount = baseResult.hits.length + historicalHits.filter((h) => h.historical_status === 'stale').length

  return {
    base_result: baseResult,
    historical_hits: historicalHits,
    combined_passed: highCount === 0,
    combined_high_count: highCount,
  }
}
