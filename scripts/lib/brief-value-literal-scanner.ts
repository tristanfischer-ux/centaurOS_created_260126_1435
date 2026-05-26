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
 * SCOPE OF SCAN:
 *   Only literals inside string templates (backtick, single-quote, double-quote
 *   contexts) and mod() calls are flagged. TypeScript type annotations,
 *   comments, and regression-harness thresholds are excluded.
 *
 * EXIT CODE 25 registered in CLAUDE.md chain exit codes table.
 *
 * Pre-change mempalace search: "brief-value literal hardcoded emitter stale
 *   mass_cap 28000" → 2 drawers loaded.
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
  /** Line number in the emitter source (1-indexed). */
  line_number: number
  /** The line text containing the literal. */
  line_text: string
  /** The raw matched string (e.g. "28000", "28,000"). */
  raw_match: string
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
      const lineText = lines[i]

      // Skip excluded line types
      if (EXCLUDED_LINE_PATTERNS.some((p) => p.test(lineText))) continue

      // Only scan lines that are inside mod() calls or template literals —
      // look for string context indicators
      const isStringContext =
        lineText.includes("mod('") ||
        lineText.includes('mod("') ||
        lineText.includes('`') ||
        lineText.includes("'") ||
        lineText.includes('"')

      if (!isStringContext) continue

      const match = lineText.match(pattern)
      if (!match) continue

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
