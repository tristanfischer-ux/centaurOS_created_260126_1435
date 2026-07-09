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
      // `regulatory` added 2026-07-09 (Powerwall exit-25 false positive): a standards
      // citation ("NFPA 70E Article 130, IEEE 1584") is ALL numbers — article and
      // standard designators, never physical brief values (Article 130 collided with
      // max_mass_kg=130). Same product-code rationale as part_number.
      if (/\bmod\(\s*['"](?:part_number|manufacturer|mpn|sku|form|name_human|character_id|regulatory)['"]/i.test(lineText)) continue

      const match = lineText.match(pattern)
      if (!match) continue

      const expectedFamily = CONSTRAINT_EXPECTED_FAMILY[key]
      const mIdx = match.index ?? lineText.indexOf(match[1])

      // Arithmetic-constant skip (2026-06-01): a number immediately preceded by a
      // multiply/divide operator is a SCALING / ROUNDING constant in a computation
      // (×100 to make a percentage, /100)*100 to round to the nearest 100), NOT a
      // hardcoded brief value. The farm batch_size=100 false-matched `* 100`
      // (DoD→%), `/ 100) * 100` (round-to-nearest-100 A), and `(1 - 0.98) * 100`
      // (loss→%) in BESS emitter arithmetic. A genuine stale brief literal is a
      // mod()/q() value or an assignment, never a ×/÷ operand.
      const beforeNum = lineText.slice(0, mIdx).replace(/\s+$/, '')
      if (/[*/]$/.test(beforeNum)) continue

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

      // Catalogue-price literal vs a COST constraint (2026-07-09, Powerwall exit-25
      // false positive): mod('list_price_gbp','8500') is the Pfannenberg chiller's UK
      // trade price — a PART-level catalogue fact — colliding by coincidence with the
      // brief's £8,500 SYSTEM cost ceiling. A per-part price literal is never a stale
      // brief mirror of a system-level cost constraint: a WRONG part price is gate 21's
      // live-distributor check, and ceiling compliance is gate 10 B-7 / gate 32. Same
      // family, different LEVEL — skip.
      if (/\bmod\(\s*['"](?:list_price_gbp|price_estimate_gbp|unit_price_gbp)['"]/i.test(lineText)
          && /cost|price|budget|ceiling/i.test(key)) continue

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

// ── Contract-strict scan (2026-06-25, gate-25 file-coverage extension) ───────
//
// THE BLIND SPOT: gate 25 only ever scanned deterministic-emitter.ts (+ later
// tool-narratives.ts). It NEVER scanned scripts/lib/engineering-contract.ts —
// yet that is exactly where a brief-MIRROR hardcode hides: a brief stated
// "DC bus voltage 1,500 V nominal" while engineering-contract.ts carried a
// bare `const dcBusVoltage = 800`, the contract emitted 800 V, and every
// downstream physics/cost cascade silently used the wrong rail. Gate 25 was
// STRUCTURALLY blind to the file.
//
// WHY A LOOSE SCAN WON'T DO: engineering-contract.ts is FULL of legitimate
// literals — physics constants (cellVoltageV 3.2, 280 Ah cells, 1.25 safety
// factors), standard-catalogue ladders ([500,630,800,1000,…] kVA transformer
// sizes), £/kW rates (hvacPerKwGbp = 800), per-line prices (unit_price_gbp:
// 1500), sizing bands (klaPerH <= 800), and SILENT-BRIEF fallback defaults
// (the dc_bus reader's own `return 800` when the brief is silent). The
// canonical emitter scan would drown in false positives here.
//
// CONTRACT-STRICT MODE flags ONLY a brief-mirror hardcode and skips the
// legitimate patterns above. A literal is flagged iff ALL hold:
//   (1) value >= minValue (skips small physics constants like 3.2, 1.25);
//   (2) the line is NOT a comment / import / export / type annotation /
//       ladder-array element / arithmetic-scaling operand / silent-brief
//       fallback (`?? N`, `return N` inside the reader IIFE, `: number = N`);
//   (3) AND the literal carries an UNAMBIGUOUS family signal that MATCHES the
//       brief constraint's family, via EITHER
//         (a) the constraint's own UNIT trailing the literal ("1500 V",
//             "35,000 kg"), OR
//         (b) the literal being ASSIGNED-TO / KEYED-BY a NAME whose family
//             (familyFromValueKey) equals the constraint's family
//             (`dcBusVoltage = 800` → voltage; `unit_price_gbp: 1500` → money,
//             which does NOT match a voltage constraint and is skipped).
// A bare number with neither an in-family name nor the constraint unit is a
// coincidental collision (a price, a rate, a sizing band) and is left alone —
// this is what keeps the scan quiet on the physics-constant / ladder file
// while still catching the bare `= 800` voltage mirror (it is assigned to a
// voltage-named const, so signal (b) fires).

/**
 * Lines that are SILENT-BRIEF fallback defaults — a literal used ONLY as the
 * default when the brief is silent (the legitimate dc_bus pattern: the reader
 * IIFE ends `return 800` / a value is `?? 800` / `: number = 800`). These are
 * the CORRECT shape (read the brief, fall back to a class default) and must
 * never be flagged. Distinct from EXCLUDED_LINE_PATTERNS (which the emitter
 * scan also uses) so the contract scan can add its own conservative skips
 * without changing emitter behaviour.
 */
const CONTRACT_FALLBACK_LINE_PATTERNS: RegExp[] = [
  /\?\?\s*[\d,]/,                 // `x ?? 800` nullish fallback default
  /\|\|\s*[\d,]/,                 // `x || 800` OR fallback default
  /^\s*return\s+[\d,]+\b/,        // `return 800` — class-default branch of a reader IIFE
  /:\s*number\s*=\s*[\d,]/,       // `param: number = 800` typed default
]

/**
 * Provenance / prose lines — `source_detail:`, `reason:`, `condition:`, `note:`,
 * `english_sentence:`, `paragraph_en:` etc. carry DESCRIPTIVE strings that quote
 * example values ("default 800 V only when the brief is silent", "400 V or 800 V
 * EV-class typical", "CCS2 800 V architecture"). The literal there is NOT the
 * emitted value — the emitted value is a VARIABLE elsewhere on the line (e.g.
 * `q(dcBusVoltage, 'V', …, { source_detail: '… 800 V …' })`). Skip the whole
 * line so a coincidental brief==example collision (a dc=800 brief vs the "800 V"
 * example prose) never false-positives. Universal: this is prose, not a value.
 */
const CONTRACT_PROSE_KEY_RE = /\b(source_detail|reason|condition|note|notes|description|english_sentence|paragraph_en|sentence_en|topology_clause|label|comment|rationale|basis_detail)\s*:/

/**
 * Detect a standard-catalogue LADDER array element, e.g.
 *   const STANDARD_TRANSFORMER_KVA = [500, 630, 800, 1000, 1250, …]
 * A literal that sits inside a `[ … ]` with sibling comma-separated numbers is
 * a ladder rung, not a brief mirror. Heuristic: the line contains a `[` before
 * the literal and at least one OTHER bare number separated by a comma.
 */
function isLadderArrayLine(lineText: string): boolean {
  // an array literal with >=3 numeric elements
  const arr = lineText.match(/\[[^\]]*\]/)
  if (!arr) return false
  const nums = arr[0].match(/\b\d[\d,]*\b/g) ?? []
  return nums.length >= 3
}

/**
 * Infer the family of the NAME a literal is assigned to / keyed by on this line,
 * looking immediately to the LEFT of the literal for:
 *   - `someName = <lit>`            (assignment / object-shorthand key)
 *   - `some_key: <lit>`             (object property)
 *   - `'some_key', <lit>`           (mod()/q() positional key arg)
 * Returns the familyFromValueKey() of that name, or null when no name is found.
 */
function familyFromAssignedName(beforeNum: string): string | null {
  // `name = ` or `name: ` or `'name', `
  const m =
    beforeNum.match(/([A-Za-z_][A-Za-z0-9_]{2,})\s*[:=]\s*$/) ||
    beforeNum.match(/['"]([a-z_][a-z0-9_]{2,})['"]\s*,\s*$/i)
  if (!m) return null
  return familyFromValueKey(m[1])
}

/** Unit / family tokens that carry NO distinguishing meaning for a slot name. */
const NON_DISTINGUISHING_TOKENS = new Set([
  // unit suffixes
  'v', 'kv', 'mv', 'kg', 'kgs', 't', 'kw', 'mw', 'gw', 'w', 'wh', 'kwh', 'mwh', 'gwh',
  'a', 'ka', 'ma', 'gbp', 'usd', 'eur', 'mm', 'cm', 'm', 'km', 'years', 'yr', 'yrs',
  // family / generic words (the family is matched separately; these don't distinguish
  // ONE voltage/mass quantity from another)
  'voltage', 'volt', 'mass', 'weight', 'power', 'energy', 'current', 'price', 'cost',
  'count', 'qty', 'quantity', 'size', 'value', 'nominal', 'rated', 'target', 'design',
])

/**
 * The DISTINGUISHING tokens of a brief constraint key — the tokens that pin it
 * to ONE specific quantity, after dropping unit suffixes + the bare family word.
 *   dc_bus_voltage_v → {dc, bus}        (NOT every voltage — the DC-BUS voltage)
 *   ac_grid_voltage_v → {ac, grid}
 *   max_mass_kg      → {max}            (the mass CAP, not a per-rack mass)
 *   unit_cost_ceiling_gbp → {unit, ceiling}
 * A slot name must contain ALL of these (token-substring) to be the same slot.
 * Returns an empty array when the key is only a family+unit (then PASS B is
 * suppressed — too generic to pin a unique slot safely).
 */
function distinguishingTokens(briefKey: string): string[] {
  return briefKey
    .toLowerCase()
    .split(/[_\s]+/)
    .filter((tok) => tok.length >= 2 && !NON_DISTINGUISHING_TOKENS.has(tok))
}

/**
 * Token synonyms — a brief key's distinguishing token is satisfied by any of its
 * synonyms appearing in the slot name. Universal (semantic equivalence, not a
 * class table): `max_mass_kg`'s distinguishing token `max` is met by a slot
 * named `…Cap…` / `…Ceiling…` (the canonical "mass cap" naming).
 */
const TOKEN_SYNONYMS: Record<string, string[]> = {
  max: ['max', 'maximum', 'cap', 'ceiling', 'limit', 'upper'],
  min: ['min', 'minimum', 'floor', 'lower'],
  ceiling: ['ceiling', 'cap', 'max', 'maximum', 'limit'],
  bus: ['bus', 'busbar'],
  grid: ['grid', 'mains', 'utility'],
}

/** Split a camelCase / snake_case identifier into lowercase tokens. */
function splitIdentifierTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
}

/**
 * Does a slot NAME denote the SAME quantity as the brief constraint key?
 * Requires the slot's tokens to contain EVERY distinguishing token of the key,
 * AND the slot's family to equal the constraint family. So `dcBusVoltage`
 * matches `dc_bus_voltage_v` (dc+bus+voltage-family) but `lineVoltageV`,
 * `acInputVoltageV`, `outputVoltageMaxV` do NOT (missing dc / bus).
 */
function slotNameMatchesConstraint(slotName: string, briefKey: string, family: string): boolean {
  if (familyFromValueKey(slotName) !== family) return false
  const distinguish = distinguishingTokens(briefKey)
  if (distinguish.length === 0) return false  // too generic to pin a unique slot
  const slotTokens = splitIdentifierTokens(slotName)
  const slotJoined = slotTokens.join(' ')
  return distinguish.every((d) => {
    const accepted = TOKEN_SYNONYMS[d] ?? [d]
    return accepted.some((syn) => slotTokens.includes(syn) || slotJoined.includes(syn))
  })
}

/** Shared per-line skips for the contract-strict scan (both passes). */
function contractLineIsSkippable(rawLine: string, lineText: string): boolean {
  // Comments / imports / exports / type annotations.
  if (EXCLUDED_LINE_PATTERNS.some((p) => p.test(rawLine))) return true
  // Silent-brief fallback defaults (`?? 800`, `return 800`, `: number = 800`).
  // The CORRECT read-brief-then-default shape — never a mirror.
  if (CONTRACT_FALLBACK_LINE_PATTERNS.some((p) => p.test(lineText))) return true
  // Provenance / prose lines (source_detail:, reason:, …) — the literal is an
  // EXAMPLE inside a description string, not the emitted value.
  if (CONTRACT_PROSE_KEY_RE.test(lineText)) return true
  // Standard-catalogue ladder arrays ([500, 630, 800, …]).
  if (isLadderArrayLine(lineText)) return true
  return false
}

/** Is the position immediately before `beforeTrim`'s end a VALUE position? */
function isValuePosition(beforeTrim: string): boolean {
  return (
    /[:=]\s*$/.test(beforeTrim) ||                       // name = N / name: N
    /['"][A-Za-z_][\w]*['"]\s*,\s*$/.test(beforeTrim) || // 'key', N  (mod/q positional)
    /\b(?:q|mod)\(\s*$/.test(beforeTrim) ||              // q( N  / mod( N
    /[([,]\s*$/.test(beforeTrim)                         // ( N  / , N  / [ N
  )
}

/**
 * scanContractForBriefLiterals — CONTRACT-STRICT scan of engineering-contract.ts
 * (or any file dense with legitimate computed literals). See the block comment
 * above for the rule. Returns the SAME shape as scanEmitterForBriefLiterals so
 * the multi-file aggregator can fold it in.
 *
 * TWO complementary passes per constraint:
 *
 *   PASS A — STALE-LITERAL (the classic gate-25 signal): the BRIEF VALUE appears
 *   as a value-position literal with the constraint's unit or an in-family name.
 *   Catches "35,000 kg" frozen in the contract.
 *
 *   PASS B — NAMED-SLOT HARDCODE (the dc_bus=800 signal, 2026-06-25): an
 *   in-constraint-family-NAMED variable (`dcBusVoltage`, `*_voltage_v`,
 *   `massCapKg`, …) is assigned a BARE LITERAL that does NOT equal the brief
 *   value. This is a frozen brief-MIRROR slot that CONTRADICTS the brief — the
 *   literal is the WRONG value (800 while the brief says 1500), so PASS A
 *   (which searches for the brief value 1500) can never see it. PASS B keys off
 *   the SLOT NAME, not the value, so it catches a hardcode regardless of which
 *   wrong number it froze. Skips the silent-brief `?? N` / `return N` fallback
 *   (that IS the correct default shape) via contractLineIsSkippable.
 */
export function scanContractForBriefLiterals(
  contractSource: string,
  constraints: MinimalBriefConstraints,
  className: string,
  minValue = 100,
): BriefValueLiteralScanResult {
  const lines = contractSource.split('\n')
  const hits: LiteralHit[] = []
  const seen = new Set<string>()  // dedupe (line × key) across the two passes
  let constraintsChecked = 0

  for (const [key, rawValue] of Object.entries(constraints)) {
    if (rawValue === undefined || rawValue === null) continue
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value < minValue) continue

    constraintsChecked++
    const pattern = buildLiteralPattern(value)
    const label = BRIEF_KEY_LABELS[key] ?? key
    const expectedFamily = CONSTRAINT_EXPECTED_FAMILY[key]

    // ── PASS B: NAMED-SLOT HARDCODE — the dc_bus=800 case ────────────────────
    // Find `<inFamilyName> = <bareLiteral>` / `<inFamilyName>: <bareLiteral>`
    // where the slot name maps to THIS constraint's family and the literal value
    // ≠ the brief value (a frozen mirror that contradicts the brief). Requires a
    // known family (so an unmapped constraint can't fire this name-only pass).
    if (expectedFamily) {
      // name = N  |  name: N   (N = a bare integer literal, optional thousands comma)
      const slotRe = /([A-Za-z_][A-Za-z0-9_]{2,})\s*[:=]\s*(\d{1,3}(?:,\d{3})+|\d{2,7})\b/g
      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i]
        const lineText = rawLine.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')
        if (contractLineIsSkippable(rawLine, lineText)) continue
        slotRe.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = slotRe.exec(lineText)) !== null) {
          const slotName = m[1]
          // The slot must denote the SAME quantity as the brief key — same family
          // AND every distinguishing token (dc+bus for dc_bus_voltage_v). This is
          // what separates the dc-bus slot from lineVoltageV / acInputVoltageV /
          // rackMassKgEach / totalMassKg (same family, DIFFERENT quantity).
          if (!slotNameMatchesConstraint(slotName, key, expectedFamily)) continue
          const litValue = Number(m[2].replace(/,/g, ''))
          if (!Number.isFinite(litValue) || litValue < minValue) continue
          // Skip a literal that is preceded by an arithmetic operator (scaling).
          const idxLit = m.index + m[0].length - m[2].length
          const before = lineText.slice(0, idxLit).replace(/\s+$/, '')
          if (/[*/+\-]$/.test(before)) continue
          // The CONTRADICTION: a brief-family-named slot hardcoded to a value that
          // is NOT the brief's value. (If it EQUALS the brief, PASS A reports it
          // as a stale literal; we don't double-flag — dedup below.)
          if (litValue === value) continue
          const dk = `${i}|${key}`
          if (seen.has(dk)) continue
          seen.add(dk)
          hits.push({
            value: litValue,
            brief_key: key,
            brief_label: label,
            line_number: i + 1,
            line_text: lineText.trim(),
            raw_match: m[2],
          })
        }
      }
    }

    // ── PASS A: STALE-LITERAL — the brief value frozen in the contract ───────
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i]
      const lineText = rawLine.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')

      if (contractLineIsSkippable(rawLine, lineText)) continue

      const match = lineText.match(pattern)
      if (!match) continue
      const mIdx = match.index ?? lineText.indexOf(match[1])

      // Arithmetic-scaling operand (× / ÷ / + / -) — a rounding/percentage/offset
      // constant in a computation, never a brief mirror.
      const beforeNum = lineText.slice(0, mIdx).replace(/\s+$/, '')
      if (/[*/+\-]$/.test(beforeNum)) continue

      // ── VALUE-POSITION requirement ───────────────────────────────────────
      const beforeTrim = lineText.slice(0, mIdx)
      if (!isValuePosition(beforeTrim)) continue

      // ── The strict family gate ───────────────────────────────────────────
      // Signal (a): the constraint's OWN unit trails the literal.
      const trailing = lineText.slice(mIdx + match[1].length).replace(/^[\s)\]}]+/, '')
      const expectedRe = expectedFamily ? UNIT_FAMILY_TRAILING[expectedFamily] : undefined
      const unitMatches = !!(expectedRe && expectedRe.test(trailing))

      // Signal (b): the literal is assigned-to / keyed-by a SLOT NAME that denotes
      // the SAME QUANTITY as the brief key (same family AND distinguishing tokens —
      // `dcBusVoltage = 1500` → the dc-bus voltage). A mere family match is NOT
      // enough: `acInputVoltageV = 400`, `totalMassKg = 720`, `unit_price_gbp: 800`
      // share the family but are DIFFERENT quantities — they must NOT flag just
      // because a contrived brief value collides with their literal.
      const assignedName =
        beforeTrim.match(/([A-Za-z_][A-Za-z0-9_]{2,})\s*[:=]\s*$/)?.[1] ??
        beforeTrim.match(/['"]([a-z_][a-z0-9_]{2,})['"]\s*,\s*$/i)?.[1] ??
        null
      const nameFamily = assignedName ? familyFromValueKey(assignedName) : null
      const nameMatches = !!(
        expectedFamily &&
        assignedName &&
        slotNameMatchesConstraint(assignedName, key, expectedFamily)
      )

      // A value-position literal whose name maps to a DIFFERENT family than the
      // constraint (e.g. `unit_price_gbp: 1500` → money vs a voltage constraint)
      // is a coincidental collision — skip it even though the unit might trail.
      if (expectedFamily && nameFamily && nameFamily !== expectedFamily) continue

      // No expectedFamily → require a SOME-name signal (conservative).
      const flagged = expectedFamily
        ? (unitMatches || nameMatches)
        : nameFamily !== null

      if (!flagged) continue

      const dk = `${i}|${key}`
      if (seen.has(dk)) continue
      seen.add(dk)

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
    const out = [
      `[Gate 25 / exit 25] Brief-value literal scanner FAIL (contract-strict) — class: ${className}`,
      `${hits.length} brief-mirror literal(s) found in engineering-contract.ts:`,
    ]
    for (const h of hits) {
      out.push(`  Line ${h.line_number}: literal "${h.raw_match}" matches brief.${h.brief_key} (${h.brief_label})`)
      out.push(`    → ${h.line_text.substring(0, 120)}`)
    }
    out.push('')
    out.push('Fix: READ the value from the brief (target_performance.metrics / description), with the')
    out.push('  class default ONLY in a `?? N` / `return N` silent-brief fallback — never a bare assignment.')
    out.push('  This is the dc_bus_voltage_v class: a brief stating 1500 V must yield 1500 V, not a frozen 800.')
    errorMessage = out.join('\n')
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

/**
 * scanContractFileForBriefLiterals — file-backed wrapper for the contract-strict
 * scan.
 */
export function scanContractFileForBriefLiterals(
  contractPath: string,
  constraints: MinimalBriefConstraints,
  className: string,
  minValue = 100,
): BriefValueLiteralScanResult {
  if (!fs.existsSync(contractPath)) {
    return {
      passed: false,
      hits: [],
      lines_scanned: 0,
      constraints_checked: 0,
      error_message: `[Gate 25] Contract file not found: ${contractPath}`,
      class_name: className,
    }
  }
  const source = fs.readFileSync(contractPath, 'utf-8')
  return scanContractForBriefLiterals(source, constraints, className, minValue)
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
    // engineering-contract.ts scanned in CONTRACT-STRICT mode — it is dense with
    // legitimate computed literals (physics constants, £/kW rates, price lines,
    // standard-catalogue ladders, silent-brief fallback defaults); contract-strict
    // flags ONLY a brief-MIRROR hardcode (the dc_bus=800 class: a value with the
    // constraint's own unit OR assigned to an in-family-named const), so the loose
    // emitter scan's bare-literal catch would NOT drown the file in false positives.
    const isContract = /engineering-contract/.test(sourcePath)
    if (isContract) {
      const cResult = scanContractForBriefLiterals(source, constraints, className, minValue)
      constraintsCheckedSeen = Math.max(constraintsCheckedSeen, cResult.constraints_checked)
      totalLinesScanned += cResult.lines_scanned
      for (const hit of cResult.hits) {
        allHits.push({ ...hit, source_file: path.basename(sourcePath) })
      }
      continue
    }
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

// ── Selftest (proveCatch for the contract-strict extension, 2026-06-25) ──────
//
//   npx tsx scripts/lib/brief-value-literal-scanner.ts --selftest
//
// Proves the gate-25 CONTRACT-STRICT extension (1) CATCHES a contract-level
// brief-MIRROR hardcode (the dc_bus=800-vs-brief-1500 class) and (2) does NOT
// false-positive on the legitimate computed literals / physics constants /
// standard-catalogue ladders / silent-brief fallback defaults that fill
// engineering-contract.ts. Exit non-zero if any case regresses — wired into
// the gate registry so the coverage cannot silently disappear.
export function selftestContractStrict(): { passed: boolean; failures: string[] } {
  const failures: string[] = []
  const expect = (name: string, cond: boolean) => { if (!cond) failures.push(name) }

  // (1) CATCHES the named-slot hardcode that contradicts the brief.
  const bug = scanContractForBriefLiterals(
    'const dcBusVoltage = 800',
    { dc_bus_voltage_v: 1500 },
    'bess',
  )
  expect('catches dcBusVoltage=800 vs brief 1500',
    bug.hits.some((h) => h.brief_key === 'dc_bus_voltage_v' && h.value === 800))

  // (2) SKIPS the silent-brief fallback default (the CORRECT read-then-default).
  const ok = scanContractForBriefLiterals(
    'const v = (() => {\n  const x = readBrief()\n  if (x) return x\n  return 800\n})()',
    { dc_bus_voltage_v: 1500 },
    'bess',
  )
  expect('skips `return 800` silent-brief fallback', ok.passed)

  // (3) SKIPS family-but-different-quantity slots, ladders, prices, constants.
  const noise = scanContractForBriefLiterals(
    [
      'const lineVoltageV = 230',                                  // mains, not dc bus
      'const acInputVoltageV = 400',                              // diff rail
      'const STANDARD_TRANSFORMER_KVA = [500, 630, 800, 1000]',   // ladder
      'const hvacPerKwGbp = 800',                                 // £/kW rate (money)
      'const cellAh = 280',                                       // physics constant
      'const totalMassKg = 720',                                  // a total, not the cap
      "  unit_price_gbp: 1500,",                                  // per-line price
    ].join('\n'),
    { dc_bus_voltage_v: 800, ac_grid_voltage_v: 1500, max_mass_kg: 720, unit_cost_ceiling_gbp: 1500 },
    'bess',
  )
  expect('skips lineVoltage/acInput/ladder/rate/constant/total/price (no false positives)', noise.passed)

  // (4) CATCHES the canonical mass-cap slot named with a synonym (cap≈max).
  const massCap = scanContractForBriefLiterals(
    'const briefMassCapKg = 28000',
    { max_mass_kg: 35000 },
    'bess',
  )
  expect('catches briefMassCapKg=28000 vs brief max 35000 (cap≈max synonym)',
    massCap.hits.some((h) => h.brief_key === 'max_mass_kg'))

  // (5) The REAL engineering-contract.ts (dc now brief-read) must NOT flag dc_bus.
  const contractPath = path.resolve(__dirname, 'engineering-contract.ts')
  if (fs.existsSync(contractPath)) {
    const real = scanContractFileForBriefLiterals(contractPath, { dc_bus_voltage_v: 1500, max_mass_kg: 35000 }, 'bess')
    expect('real contract file: zero false positives (brief dc=1500, mass=35000)', real.passed)
  }

  // (6) EMITTER scan skips (2026-07-09, Powerwall exit-25 false positives):
  //     a standards-citation number (NFPA 70E Article 130) is never a mass cap;
  //     a per-part catalogue price (Pfannenberg £8,500) is never a stale mirror of
  //     the SYSTEM cost ceiling. A genuine bare capacity literal still CATCHES.
  const emitterSkips = scanEmitterForBriefLiterals(
    [
      "  mod('regulatory', 'IEC 60695-11-10 V-0, NFPA 70E Article 130, IEEE 1584'),",
      "  mod('list_price_gbp', '8500'),",
    ].join('\n'),
    { max_mass_kg: 130, unit_cost_ceiling_gbp: 8500 },
    'energy_storage',
  )
  expect('emitter: regulatory-citation 130 + catalogue-price 8500 both skip', emitterSkips.passed)
  const emitterCatch = scanEmitterForBriefLiterals(
    "  mod('capacity', '130', 'kg'),",
    { max_mass_kg: 130 },
    'energy_storage',
  )
  expect('emitter: a genuine bare mass literal 130 kg still catches',
    emitterCatch.hits.some((h) => h.brief_key === 'max_mass_kg'))

  return { passed: failures.length === 0, failures }
}

if (require.main === module && process.argv.includes('--selftest')) {
  const { passed, failures } = selftestContractStrict()
  if (passed) {
    console.log('[brief-value-literal-scanner] contract-strict selftest: PASS (5 cases)')
    process.exit(0)
  } else {
    console.error('[brief-value-literal-scanner] contract-strict selftest: FAIL')
    for (const f of failures) console.error('  ✗ ' + f)
    process.exit(1)
  }
}
