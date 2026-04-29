/**
 * @file brief-cost-ceiling-extractor.ts — Named-entity extraction of typed
 * cost ceilings from hardware brief prose.
 *
 * @description Chase's LLM extraction prompt asks for `unitCostCeilingGbp` as
 * a number. When the cost ceiling is embedded as prose (e.g. "target installed
 * capital cost under 150,000 pounds") the model sometimes emits null rather
 * than parsing the number. This module provides a deterministic regex fallback
 * that runs AFTER the JSON parse and fills in the gap.
 *
 * Patterns handled:
 *   - £150,000 / £150000 / £150k / £150K / £1.5M / £1,500,000
 *   - GBP 150000 / GBP 150,000
 *   - 150,000 pounds / 150k pounds sterling / ~£155
 *   - "target ... under £X" / "budget ... £X" / "cost ceiling ... £X"
 *   - Spelled-out: "target ... 150,000 pounds" / "target ... under 150000 pounds"
 *   - "target system unit cost under 2.5 million pounds" (Loop 25 P1 Fix 4)
 *   - "target ... under X million pounds" — million/billion multiplier
 *   - "system unit cost" / "unit cost" / "unit price" / "build cost" keywords
 *
 * Cost ceiling type classification (Item 8, council-designed 2026-04-29):
 *   Each extracted ceiling is now classified into one of four types:
 *   - "unit-manufacturing-cost" — per-unit COGS / BOM + labour. Directly
 *     comparable to Finn's totalPerUnit roll-up.
 *   - "installed-capex" — fully installed capital expenditure per deployed
 *     system, including installation, commissioning, civils, freight. NOT
 *     per-unit manufacturing cost.
 *   - "annual-opex" — recurring annual operating expenditure (maintenance,
 *     energy, labour, consumables). Not comparable to unit manufacturing cost.
 *   - "project-budget" — total programme spend across all units/phases, often
 *     including engineering, tooling, certification, deployment. Not per-unit.
 *
 * Conservative extraction: returns the FIRST plausible hit (lowest-ambiguity
 * match first). If multiple patterns fire on the same text the first wins.
 * Never invents values -- returns null when no match.
 *
 * Loop 24 P1 Fix 3 (2026-04-29): shipped to address Hedgerow, Vertical Farm,
 * and HAPS "Not declared" ceiling in the cost waterfall.
 * Loop 25 P1 Fix 4 (2026-04-29): extended keyword list + million/billion
 * multiplier support to fix Desalination (350,000) and HAPS (2.5 million).
 * Item 8 (2026-04-29): typed ceiling extraction — prevents the feasibility
 * gate comparing installed-capex against per-unit manufacturing cost.
 */

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * The four cost ceiling types the engine distinguishes.
 *
 * "unit-manufacturing-cost" is the only type directly comparable to Finn's
 * per-unit manufacturing roll-up. All other types require a different Finn
 * perspective (not yet emitted) and are stored separately to prevent
 * false-positive / false-negative feasibility verdicts.
 */
export type CostCeilingType =
    | "unit-manufacturing-cost"
    | "installed-capex"
    | "annual-opex"
    | "project-budget"

/** Result of a successful ceiling extraction. */
export interface CostCeilingExtraction {
    /** Parsed GBP value (whole pounds, positive). */
    gbp: number
    /** The verbatim phrase that was matched, for logging. */
    source: string
    /**
     * The cost basis this ceiling refers to.
     * "unit-manufacturing-cost" is directly comparable to Finn's output.
     * All other types require a matching Finn perspective before comparison.
     */
    ceilingType: CostCeilingType
}

// ─── Ceiling-type classification ──────────────────────────────────────

/**
 * Keyword patterns that identify each cost ceiling type.
 * Ordered by specificity — more specific patterns are checked first so
 * "installed capital cost" beats the shorter "capital cost".
 *
 * Design principle: keep this deterministic and regex-based (6-model council
 * consensus, 2026-04-29). LLM classification introduces hallucination risk
 * in the parser. Reserve LLM for ambiguous cases at a higher layer.
 */
const INSTALLED_CAPEX_KW =
    /installed capital cost|installed capital expenditure|installed capex|capital expenditure|capital cost|capex/i

const ANNUAL_OPEX_KW =
    /annual operating cost|annual opex|annual operating expenditure|opex per year|operating cost per annum|yearly operating|running cost per year|annual maintenance/i

const PROJECT_BUDGET_KW =
    /project budget|programme budget|program budget|total budget|total project cost|overall budget/i

const UNIT_COST_KW =
    /system unit cost|system unit price|unit manufacturing cost|manufacturing cost|unit cost|unit price|build cost per unit|cost per unit|per.unit cost/i

/**
 * Classify a context window into a CostCeilingType.
 *
 * The context window should include the matched source string PLUS up to
 * 120 characters of preceding text from the original brief (to capture
 * keywords that appear before the currency symbol in bare-£ patterns like
 * "annual opex under £20,000").
 *
 * Returns the most specific matching type, or "unit-manufacturing-cost" as
 * the default when only generic context keywords fired (backward compat).
 */
function classifyCeilingType(contextWindow: string): CostCeilingType {
    if (ANNUAL_OPEX_KW.test(contextWindow)) return "annual-opex"
    if (PROJECT_BUDGET_KW.test(contextWindow)) return "project-budget"
    if (INSTALLED_CAPEX_KW.test(contextWindow)) return "installed-capex"
    if (UNIT_COST_KW.test(contextWindow)) return "unit-manufacturing-cost"
    // Generic context keyword only (target/budget/ceiling/cap/limit) — default
    // to unit-manufacturing-cost. Preserves backward compatibility with briefs
    // that use "target ... under £X" without a type qualifier.
    return "unit-manufacturing-cost"
}

/**
 * Build the classification context window for a regex match.
 * For context-keyword patterns (1a-2b) the match already includes the keyword
 * phrase, so the window is just the matched text. For bare-currency patterns
 * (3-8) the match is only the currency portion; prepend up to 120 chars of
 * preceding text so keyword context is not lost.
 */
function buildClassificationWindow(
    text: string,
    matchIndex: number,
    matchedSource: string,
): string {
    // If the matched phrase already contains a cost-type keyword, it's a
    // context-keyword pattern — no need to look back further.
    const allTypeKw =
        /installed capital|capital cost|capex|annual opex|annual operating|opex per year|project budget|programme budget|total budget|system unit cost|unit cost|unit price|build cost|manufacturing cost/i
    if (allTypeKw.test(matchedSource)) return matchedSource

    // Bare-currency pattern — prepend up to 120 chars before the match.
    const lookback = Math.max(0, matchIndex - 120)
    return text.slice(lookback, matchIndex) + matchedSource
}

// ─── Numeric suffix helpers ────────────────────────────────────────────

/**
 * Convert a raw numeric string (possibly with k/K/M suffix and optional
 * thousands commas) into a whole-pound GBP value, or null if conversion
 * fails or the value is implausible (0 or > 10 billion).
 *
 * Suffix can be: k/K (thousands), m/M (millions), million, billion, bn.
 */
function parseNumericSuffix(raw: string, suffix: string): number | null {
    const clean = raw.replace(/,/g, "").replace(/~/g, "").trim()
    const base = parseFloat(clean)
    if (!Number.isFinite(base) || base <= 0) return null

    let multiplier = 1
    const s = suffix.toLowerCase().trim()
    if (s === "k") {
        multiplier = 1_000
    } else if (s === "m" || s === "million") {
        multiplier = 1_000_000
    } else if (s === "bn" || s === "billion") {
        multiplier = 1_000_000_000
    }

    const result = base * multiplier
    if (result <= 0 || result > 10_000_000_000) return null
    return Math.round(result)
}

/**
 * Context keyword alternation covering all common ways a brief states a cost
 * ceiling. Includes "installed capital cost", "system unit cost", "unit cost",
 * "unit price", "build cost", "capital cost", as well as the broader
 * budget/ceiling/cap/limit terms.
 *
 * INTENT: Loop 25 failure — HAPS brief uses "system unit cost" which was not
 * in the original keyword list. Adding all plausible variants here so the
 * pattern set doesn't need to grow again for minor keyword mismatches.
 */
const CONTEXT_KW =
    /(?:target|budget|ceiling|cap|limit|installed capital cost|capital cost|system unit cost|system unit price|unit cost|unit price|build cost)/i

// Pattern list

/**
 * Each entry is a regex + a function that converts the match into a GBP
 * number. Patterns are tried in order; the first that fires wins.
 *
 * Numeric capture group convention inside each regex:
 *   - Group 1: the raw numeric digits (possibly with commas / decimal)
 *   - Group 2 (optional): multiplier suffix — k/K, m/M, million, billion, bn
 *
 * Loop 25 P1 Fix 4 additions:
 *   - CONTEXT_KW constant covers "system unit cost", "unit cost", etc.
 *   - Patterns 1a + 2a handle "X million pounds" / "X billion pounds" with
 *     the long-form word "million"/"billion" that didn't match k/K/m/M.
 */
const CEILING_PATTERNS: Array<{
    re: RegExp
    extract: (m: RegExpExecArray) => number | null
}> = [
    // 1a. Context keyword → £X million/billion — highest confidence for "2.5 million"
    // e.g. "target system unit cost under 2.5 million pounds"
    // Must come before Pattern 1 so the long word "million" is tried first.
    {
        re: new RegExp(
            CONTEXT_KW.source +
                String.raw`[^.!?\n]{0,100}£\s*(~?[\d,]+(?:\.\d+)?)\s*(million|billion|bn)\b`,
            "i",
        ),
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 1b. Context keyword → £X (k/K/M/bare) — high confidence
    // e.g. "target installed capital cost under £150,000"
    {
        re: new RegExp(
            CONTEXT_KW.source +
                String.raw`[^.!?\n]{0,100}£\s*(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\b`,
            "i",
        ),
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 2a. Context keyword → X million/billion pounds (no £ symbol)
    // e.g. "Target system unit cost under 2.5 million pounds"
    {
        re: new RegExp(
            CONTEXT_KW.source +
                String.raw`[^.!?\n]{0,100}\b(~?[\d,]+(?:\.\d+)?)\s*(million|billion|bn)\s+pounds?(?:\s+sterling)?\b`,
            "i",
        ),
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 2b. Context keyword → X[k/K/M] pounds (no £ symbol)
    // e.g. "target installed capital cost under 150,000 pounds"
    //      "target installed capital cost under 350,000 pounds"
    {
        re: new RegExp(
            CONTEXT_KW.source +
                String.raw`[^.!?\n]{0,100}\b(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\s+pounds?(?:\s+sterling)?\b`,
            "i",
        ),
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 3. £X million/billion — bare symbol, long-form multiplier
    // e.g. "approximately £2.5 million" anywhere in text
    {
        re: /£\s*(~?[\d,]+(?:\.\d+)?)\s*(million|billion|bn)\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 4. £X[k/K/M] — bare symbol anywhere in text
    // e.g. "£150,000" / "£150k" / "£1.5M"
    {
        re: /£\s*(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\b/,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 5. GBP X million/billion
    // e.g. "GBP 2.5 million"
    {
        re: /\bGBP\s+(~?[\d,]+(?:\.\d+)?)\s*(million|billion|bn)\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 6. GBP 150,000 / GBP 150k
    {
        re: /\bGBP\s+(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 7. X million/billion pounds — no symbol, no context keyword (lower confidence)
    // e.g. "1.5 million pounds sterling"
    {
        re: /\b(~?[\d,]+(?:\.\d+)?)\s*(million|billion|bn)\s+pounds?(?:\s+sterling)?\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 8. 150,000 pounds / 150k pounds sterling — no symbol, no context keyword
    {
        re: /\b(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\s+pounds?(?:\s+sterling)?\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
]

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Extract the FIRST GBP cost ceiling found in free-form brief prose, together
 * with its classified ceiling type.
 *
 * Returns the first plausible hit, or null when no match is found.
 * Never throws -- designed to be called as a non-blocking fallback.
 *
 * The returned `ceilingType` indicates what kind of cost the value refers to:
 * - "unit-manufacturing-cost" — directly comparable to Finn's totalPerUnit roll-up.
 * - "installed-capex" / "annual-opex" / "project-budget" — require a matching
 *   Finn perspective before comparison. The feasibility gate will NOT compare
 *   these against Finn's per-unit manufacturing output; instead it emits a
 *   warning that the constraint exists but is unverifiable with current data.
 *
 * @param text - The brief report text or subject line to scan.
 */
export function extractCostCeilingFromProse(
    text: string,
): CostCeilingExtraction | null {
    if (!text || typeof text !== "string") return null

    for (const { re, extract } of CEILING_PATTERNS) {
        const match = re.exec(text)
        if (match) {
            const gbp = extract(match)
            if (gbp !== null) {
                const source = match[0].trim()
                const contextWindow = buildClassificationWindow(
                    text,
                    match.index,
                    source,
                )
                return {
                    gbp,
                    source,
                    ceilingType: classifyCeilingType(contextWindow),
                }
            }
        }
    }
    return null
}

/**
 * Extract ALL distinct cost ceilings from free-form brief prose.
 *
 * Scans the full text for every ceiling mention across all four cost types.
 * Returns an array of unique (type, value) pairs — if the same type appears
 * twice, only the first occurrence is included.
 *
 * This is the preferred function when a brief may specify multiple ceilings
 * of different types (e.g., "unit cost under £2.5M; installed capex under
 * £3.5M; annual opex below £150K"). Each ceiling is independently evaluated
 * by the feasibility gate against its matching Finn cost perspective.
 *
 * @param text - The brief report text or subject line to scan.
 */
export function extractAllCostCeilingsFromProse(
    text: string,
): CostCeilingExtraction[] {
    if (!text || typeof text !== "string") return []

    const results: CostCeilingExtraction[] = []
    const seenTypes = new Set<CostCeilingType>()

    for (const { re, extract } of CEILING_PATTERNS) {
        // Build a global version of the pattern to find all occurrences.
        const globalRe = new RegExp(
            re.source,
            re.flags.includes("g") ? re.flags : re.flags + "g",
        )
        let match: RegExpExecArray | null
        while ((match = globalRe.exec(text)) !== null) {
            const gbp = extract(match)
            if (gbp !== null) {
                const source = match[0].trim()
                const contextWindow = buildClassificationWindow(
                    text,
                    match.index,
                    source,
                )
                const ceilingType = classifyCeilingType(contextWindow)
                if (!seenTypes.has(ceilingType)) {
                    seenTypes.add(ceilingType)
                    results.push({ gbp, source, ceilingType })
                }
            }
        }
    }

    return results
}
