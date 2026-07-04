/**
 * @file lib/per-rack-quantity-audit.ts — Per-Rack-vs-Total Quantity Audit (exit code 26)
 *
 * ARCHITECTURAL INVARIANT (2026-05-27, L41-P gate 26 — universal class-killer):
 *
 *   When prose says "N <part> per <denominator>" the BoM must emit that
 *   part with quantity = N × <denominator count from the engineering contract>.
 *   The converse emitter bug is: prose says "14 cold plates per rack" but the
 *   BoM emits quantity x14 total (one per rack) when there are 14 racks —
 *   the design needs 196 cold plates, not 14.
 *
 * This gate:
 *   1. Regex-scans the narrative fields of every sub_module for patterns like
 *      "N <noun> per <denominator>" (rack / module / sub-module / cell / string).
 *   2. For each hit, fuzzy-matches the noun phrase against BoM word IDs in the
 *      same module tree.
 *   3. Computes expected_total = N * denominator_count (from contractQuantities).
 *   4. Fails HIGH if the matched BoM word's emitted quantity != expected_total
 *      within 5% tolerance.
 *
 * False-positive guards:
 *   - "1 per X" / "one per X" -> 1:1 mapping, skip.
 *   - "max N per X" / "up to N per X" / "no more than N per X" -> limiting language, skip.
 *   - "0 per X" -> skip (zero makes no sense as a multiplied quantity).
 *   - a digit GLUED to the tail of an alphanumeric token (no separator) -> never a
 *     standalone count. "aluminium 6061-T6 cold-plate manifolds per rack" must not
 *     match N=6 (from "T6"); same for "M6 bolts per bracket" (M6) and "DN50 valve
 *     per skid" (DN50). Enforced by a `(?<![A-Za-z0-9])` lookbehind on PER_RACK_RE.
 *
 * Examples caught:
 *   - "14 cold plates per rack" -> expected = 14 * 14 racks = 196; BoM x14 = HIGH
 *   - "60 L/min per cold plate" -> expected = 60 * cold_plate_count; BoM x60 = HIGH
 *   - "1 BMS slave per 18 cells" -> expected = ceil(cell_count/18); BoM mismatch = HIGH
 *
 * Pre-change mempalace search: "per-rack quantity prose vs BoM total multiplier"
 *   -> 0 matching drawers (new pattern class, not previously codified).
 *
 * EXIT CODE 26 registered in CLAUDE.md chain exit codes table.
 */

// ── Minimal type surface ──────────────────────────────────────────────────────

export interface PerRackQuantityAuditModifier {
  kind?: string
  value?: string
  unit?: string
}

export interface PerRackQuantityAuditWord {
  id?: string
  modifier_characters?: PerRackQuantityAuditModifier[]
}

export interface PerRackQuantityAuditSubModule {
  id?: string
  words?: PerRackQuantityAuditWord[]
  /** prose fields scanned for "N per X" patterns */
  english_sentence?: string
  sentence_en?: string
  paragraph_en?: string
  topology_clause?: string
}

export interface PerRackQuantityAuditModule {
  module?: string
  /** module-level overview prose */
  overview_paragraph_en?: string
  module_brief?: string
  sub_modules?: PerRackQuantityAuditSubModule[]
}

// ContractQuantities is an open Record — we read specific keys safely.
export type ContractQuantities = Record<string, unknown>

// ── Denominator definitions ───────────────────────────────────────────────────

/**
 * DENOMINATOR_KEYS maps prose denominator words to contract quantity keys.
 *
 * Each entry defines how to resolve the denominator count from
 * contractQuantities (the orchestratorContract.quantities record).
 *
 * prose_pattern  -- matches the denominator word in "N X per <D>"
 * quantity_keys  -- ordered list of contract quantity keys to try (first
 *                   non-null numeric wins).
 * label          -- human-readable name for error messages.
 */
interface DenominatorDef {
  id: string
  prose_pattern: RegExp
  quantity_keys: string[]
  label: string
}

export const DENOMINATOR_DEFS: DenominatorDef[] = [
  {
    id: 'rack',
    prose_pattern: /\b(rack|racks)\b/i,
    quantity_keys: ['rack_count', 'num_racks', 'total_racks', 'rackCount'],
    label: 'rack count',
  },
  {
    id: 'module',
    prose_pattern: /\b(battery\s+module|cell\s+module|energy\s+module)\b/i,
    quantity_keys: ['module_count', 'num_modules', 'total_modules', 'battery_module_count'],
    label: 'battery module count',
  },
  {
    id: 'sub_module',
    prose_pattern: /\b(sub[\s-]?module)\b/i,
    quantity_keys: ['sub_module_count', 'num_sub_modules'],
    label: 'sub-module count',
  },
  {
    id: 'cell',
    prose_pattern: /\b(cells?)\b/i,
    quantity_keys: ['cell_count', 'num_cells', 'total_cells', 'cellCount'],
    label: 'cell count',
  },
  {
    id: 'string',
    prose_pattern: /\b(strings?)\b/i,
    quantity_keys: ['string_count', 'num_strings', 'total_strings', 'parallel_strings', 'parallel_strings_per_rack'],
    label: 'string count',
  },
  {
    id: 'cold_plate',
    prose_pattern: /\b(cold[\s-]?plates?)\b/i,
    quantity_keys: ['cold_plate_count', 'num_cold_plates', 'total_cold_plates'],
    label: 'cold plate count',
  },
]

// ── Per-rack pattern regex ────────────────────────────────────────────────────

/**
 * Word-count words supported in the count position.
 */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20,
}

function parseCount(s: string): number | null {
  const n = parseFloat(s)
  if (!isNaN(n)) return n
  const key = s.toLowerCase().trim()
  return WORD_NUMBERS[key] ?? null
}

/**
 * Regex: "N <noun-phrase> per <denominator-phrase>"
 * Captures: [count-word, noun-phrase, denominator-word]
 */
// Noun-phrase between N and "per" is BOUNDED to ≤6 words (was an unbounded
// `[\w\s\-\/]+?` that spanned whole clauses). BESS exit-26 false positive #4
// (2026-06-01): "2013 LFP DFN simulation confirms 5000 cells equating to 20 racks
// with 250 series cells per rack" matched N=2013 (a CITATION YEAR) × 20 racks =
// 40260 instead of the real "250 series cells per rack". A real "N <noun> per X"
// count phrase is short (2-4 words); bounding to 6 stops the year-spanning match
// so the regex finds the true "250 series cells per rack" instead.
//
// ALLOY-GRADE / SIZE-DESIGNATOR digit-suffix guard (2026-07-04, BESS exit-26
// false positive #5 — out/bess-campaign-v2): a leading `(?<![A-Za-z0-9])`
// word-boundary lookbehind on the count group stops a digit that is GLUED to
// the tail of an alphanumeric token (no whitespace/punctuation separator) from
// ever being read as a standalone count. Without it, "aluminium 6061-T6
// cold-plate manifolds per rack" matched N=6 (the trailing digit of the alloy
// grade "T6") × 13 racks = 78, vs the BoM's correct qty=13 (one manifold per
// rack) — 3 phantom HIGHs (the emitter was RIGHT; the gate was wrong). Same
// class of bug: "M6 bolts per bracket" (6 from the metric-thread designator),
// "DN50 valve per skid" (50 from the nominal-diameter designator) must never
// mint a phantom count either. The lookbehind requires the character
// immediately before the count digits to be neither a letter nor a digit, so
// only a digit run that starts at a real token boundary (preceded by
// whitespace, punctuation, or start-of-string) can ever be a count — a
// genuine "14 cold plates per rack" (14 preceded by whitespace) is untouched,
// and the citation-year guard above still finds "250 series cells per rack"
// (250 preceded by whitespace) rather than the glued alloy/size digits.
const PER_RACK_RE =
  /(?<![A-Za-z0-9])((?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|eighteen|twenty))\s+([a-zA-Z\-\/]+(?:\s+[a-zA-Z\-\/]+){0,5}?)\s+per\s+(?:each\s+)?((?:\d+\s+)?[\w\s\-]+?)(?=[,;.!?]|$|\s{2,})/gi

/** Limiting-language guards — these indicate capacity limits, not multiplied totals. */
const LIMITING_LANGUAGE_RE = /\b(max|maximum|up\s+to|at\s+most|no\s+more\s+than|at\s+least|minimum)\b/i

/** Measurement-unit-CAPACITY guard (2026-05-30, BESS exit-26 false positive): a
 *  noun phrase that STARTS with a measurement unit followed by "of" or end-of-
 *  phrase is a per-denominator CAPACITY/RATING, not a count. "15 kW of cold-plate
 *  capacity per rack" = 15 kW per rack (a rating), NOT "15 cold-plates per rack" —
 *  it must not be multiplied by the rack count. The "(\s+of\b|\s*$)" constraint
 *  keeps real counts like "15 kWh modules per rack" (unit immediately followed by
 *  a noun, not "of") from being skipped. Universal across all classes. */
const MEASUREMENT_UNIT_CAPACITY_RE =
  /^(kwh?|mwh?|gwh?|wh|gw|kv|mv|kva|kvar|var|ah|ka|ma|hz|khz|mhz|ghz|mm|cm|km|kg|lpm|gpm|bar|kpa|mpa|pa|psi|nm|rpm|dba?|ppm|m2|m3|w|v|a|t|m|l)(\s+of\b|\s*$)/i

/** Compound SLASH-RATE units — "6.2 L/min per rack", "2 m/s per X", "5 kg/h per X",
 *  "320 W/m² per X" are per-denominator RATES, not counts. Matches a noun that
 *  STARTS with a <unit>/<unit> token. (Real counts are "N cells per rack" — no
 *  leading slash-unit.) BESS exit-26 false positive #2 (2026-05-30). */
const RATE_UNIT_RE = /^[a-zµ°]+\d*\s*\/\s*[a-z]/i

/** Power / voltage / current RATING-unit guard (2026-05-31, BESS exit-26 false
 *  positive #3): a count number IMMEDIATELY followed by a power/electrical RATING
 *  unit is the RATING of the noun that follows, not a count of it. "20 kW
 *  cold-plate manifolds per rack" = manifolds RATED 20 kW (one per rack), NOT 20
 *  manifolds per rack — it must not be multiplied by the rack count. Likewise
 *  "400 V busbars per rack", "200 A fuses per rack", "1500 W heaters per rack".
 *  Deliberately EXCLUDES energy-CAPACITY units (kWh/MWh/Wh/Ah), which the author
 *  intentionally treats as real counts ("15 kWh modules per rack") and which stay
 *  governed by MEASUREMENT_UNIT_CAPACITY_RE. The \b keeps it from matching nouns
 *  that merely START with the unit letter (valve, watt-meter, amp-clamp → no
 *  boundary after the leading letter). Universal across all classes. */
const POWER_RATING_UNIT_RE = /^(kw|mw|gw|w|kva|mva|kvar|var|kv|mv|v|ka|ma|a|hp)\b/i

// ── Fuzzy word matcher ────────────────────────────────────────────────────────

/**
 * Returns a word-overlap score between the extracted noun phrase
 * and a word_id string (word IDs are underscore-separated tokens).
 */
function nounPhraseScore(noun: string, wordId: string): number {
  const nounTokens = noun
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
  const idTokens = wordId.toLowerCase().split('_').filter((t) => t.length > 2)

  let hits = 0
  for (const nt of nounTokens) {
    for (const it of idTokens) {
      if (it.includes(nt) || nt.includes(it)) hits++
    }
  }
  return nounTokens.length > 0 ? hits / nounTokens.length : 0
}

// ── Quantity helpers ──────────────────────────────────────────────────────────

/** Parse BoM word quantity from modifier_characters. */
function getWordQuantity(word: PerRackQuantityAuditWord): number {
  const mods = Array.isArray(word.modifier_characters) ? word.modifier_characters : []
  const qMod = mods.find((mc) => {
    const k = String(mc?.kind ?? '').toLowerCase().replace(/[\s_-]/g, '')
    return k === 'quantity' || k === 'qty' || k === 'count'
  })
  if (!qMod) return 1
  const raw = String(qMod.value ?? '')
    .replace(/[xX×]/g, '')
    .replace(/[^0-9.]/g, '')
    .trim()
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** Read a numeric quantity from the contract quantities record. */
function resolveContractQty(quantities: ContractQuantities, keys: string[]): number | null {
  for (const key of keys) {
    const v = quantities[key]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    if (typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).value === 'number') {
      const n = Number((v as Record<string, unknown>).value)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

// ── Finding type ──────────────────────────────────────────────────────────────

export interface PerRackQuantityFinding {
  severity: 'HIGH'
  location: string          // "module_id::sub_module_id"
  prose_snippet: string     // the matched "N X per Y" phrase
  noun_phrase: string       // extracted noun (e.g. "cold plates")
  count_per_unit: number    // N from the prose
  denominator: string       // e.g. "rack"
  denominator_count: number // resolved from contract
  expected_total: number    // count_per_unit * denominator_count
  bom_word_id: string       // matched word in the BoM
  bom_quantity: number      // emitted quantity
  tolerance_pct: number     // 5%
  note: string
}

// ── Main audit function ───────────────────────────────────────────────────────

export interface PerRackQuantityAuditResult {
  passed: boolean
  findings: PerRackQuantityFinding[]
  high_count: number
  prose_hits_scanned: number
  error_message: string | null
  class_name: string
}

/**
 * runPerRackQuantityAudit
 *
 * Walks the narrative fields of every sub_module, regex-scans for
 * "N per <denominator>" patterns, fuzzy-matches to BoM words, and
 * asserts emitted quantity = N * denominator_count within 5%.
 *
 * @param modules            The design.modules array.
 * @param contractQuantities The orchestratorContract.quantities record.
 *                           Keys used: rack_count, cell_count, string_count, etc.
 * @param className          Product class string.
 */
export function runPerRackQuantityAudit(
  modules: PerRackQuantityAuditModule[],
  contractQuantities: ContractQuantities = {},
  className = 'unknown',
): PerRackQuantityAuditResult {
  const TOLERANCE = 0.05  // 5%
  const findings: PerRackQuantityFinding[] = []
  let proseHitsScanned = 0

  // Collect all (wordId, word, module, sub_module) tuples for fuzzy matching.
  const allWords: Array<{
    wordId: string
    word: PerRackQuantityAuditWord
    moduleId: string
    subModuleId: string
  }> = []

  const safeMods = Array.isArray(modules) ? modules : []

  for (const m of safeMods) {
    const moduleId = String(m?.module ?? 'unknown_module')
    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? 'unknown_sub_module')
      for (const w of (Array.isArray(sm?.words) ? sm.words : [])) {
        allWords.push({ wordId: String(w?.id ?? ''), word: w, moduleId, subModuleId })
      }
    }
  }

  // Walk every sub_module's prose fields.
  for (const m of safeMods) {
    const moduleId = String(m?.module ?? 'unknown_module')
    const moduleProse = [
      String(m?.overview_paragraph_en ?? ''),
      String(m?.module_brief ?? ''),
    ].join(' ')

    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []

    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? 'unknown_sub_module')
      const location = `${moduleId}::${subModuleId}`

      const proseFields = [
        moduleProse,
        String(sm?.english_sentence ?? ''),
        String(sm?.sentence_en ?? ''),
        String(sm?.paragraph_en ?? ''),
        String(sm?.topology_clause ?? ''),
      ].join(' ')

      // Scan prose for "N X per Y" patterns.
      const re = new RegExp(PER_RACK_RE.source, 'gi')
      let match: RegExpExecArray | null

      while ((match = re.exec(proseFields)) !== null) {
        const [fullMatch, countStr, nounRaw, denominatorRaw] = match
        const trimmedNoun = nounRaw.trim()
        const trimmedDenom = denominatorRaw.trim()

        // Guard: skip count <= 1 (1-per-X is a 1:1 mapping, not a multiplier bug)
        const countPerUnit = parseCount(countStr.trim())
        if (countPerUnit === null || countPerUnit <= 1) continue

        // Guard: skip a MEASUREMENT-UNIT capacity/RATE — "15 kW of cold-plate
        // capacity per rack" (rating) or "6.2 L/min per rack" (flow rate) are
        // per-rack measurements, NOT "N items per rack". Single units via
        // MEASUREMENT_UNIT_CAPACITY_RE; compound slash-rate units (L/min, m/s,
        // kg/h, kW/m²) via RATE_UNIT_RE. BESS exit-26 false positives 2026-05-30.
        if (MEASUREMENT_UNIT_CAPACITY_RE.test(trimmedNoun) || RATE_UNIT_RE.test(trimmedNoun) || POWER_RATING_UNIT_RE.test(trimmedNoun)) continue

        // Guard: skip limiting language in the preceding 40 characters.
        const preceding = proseFields.slice(Math.max(0, match.index - 40), match.index)
        if (LIMITING_LANGUAGE_RE.test(preceding)) continue

        // Guard: skip if the match itself starts with limiting language.
        if (LIMITING_LANGUAGE_RE.test(fullMatch)) continue

        // Find matching denominator definition.
        const denomDef = DENOMINATOR_DEFS.find((d) => d.prose_pattern.test(trimmedDenom))
        if (!denomDef) continue

        // Resolve denominator count from contract.
        const denominatorCount = resolveContractQty(contractQuantities, denomDef.quantity_keys)
        if (denominatorCount === null) continue  // can't compute expected without contract data

        const expectedTotal = countPerUnit * denominatorCount

        // Fuzzy-match noun phrase to the BoM word with best score.
        let bestScore = 0
        let bestMatch: (typeof allWords[0]) | null = null
        for (const entry of allWords) {
          const score = nounPhraseScore(trimmedNoun, entry.wordId)
          if (score > bestScore) {
            bestScore = score
            bestMatch = entry
          }
        }

        // Require at least a weak match (>0.25) to avoid spurious results.
        if (bestMatch === null || bestScore < 0.25) continue

        const bomQty = getWordQuantity(bestMatch.word)
        const diffPct = Math.abs(bomQty - expectedTotal) / expectedTotal

        proseHitsScanned++

        if (diffPct > TOLERANCE) {
          findings.push({
            severity: 'HIGH',
            location,
            prose_snippet: fullMatch.trim(),
            noun_phrase: trimmedNoun,
            count_per_unit: countPerUnit,
            denominator: denomDef.label,
            denominator_count: denominatorCount,
            expected_total: expectedTotal,
            bom_word_id: bestMatch.wordId,
            bom_quantity: bomQty,
            tolerance_pct: TOLERANCE * 100,
            note: [
              `Prose says "${countPerUnit} ${trimmedNoun} per ${denomDef.id}" `,
              `-> expected ${expectedTotal} total (${countPerUnit} x ${denominatorCount} ${denomDef.id}s)`,
              ` but BoM word "${bestMatch.wordId}" emits quantity=${bomQty}`,
              ` (${((bomQty - expectedTotal) / expectedTotal * 100).toFixed(1)}% off).`,
              ` Update emitter to emit quantity=${Math.round(expectedTotal)} for this word.`,
            ].join(''),
          })
        }
      }
    }
  }

  const passed = findings.length === 0

  let errorMessage: string | null = null
  if (!passed) {
    const lines = [
      `[Gate 26 / exit 26] Per-rack-vs-total quantity audit FAIL -- class: ${className}`,
      `${findings.length} HIGH finding(s) (prose says "N per X" but BoM quantity != N * X_count):`,
    ]
    for (const f of findings.slice(0, 10)) {
      lines.push(`  @ ${f.location}: ${f.note}`)
    }
    if (findings.length > 10) {
      lines.push(`  ... and ${findings.length - 10} more.`)
    }
    lines.push('')
    lines.push('Fix: update deterministic-emitter.ts to emit the multiplied total quantity,')
    lines.push('not the per-unit count. E.g. "14 cold plates per rack" with 14 racks = 196 total.')
    lines.push('Use ${p.rackCount * 14} or equivalent derived expression -- never hardcode.')
    errorMessage = lines.join('\n')
  }

  return {
    passed,
    findings,
    high_count: findings.length,
    prose_hits_scanned: proseHitsScanned,
    error_message: errorMessage,
    class_name: className,
  }
}
