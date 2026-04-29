/**
 * @file brief-cost-ceiling-extractor.ts — Named-entity extraction of cost
 * ceilings from hardware brief prose.
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
 * Conservative extraction: returns the FIRST plausible hit (lowest-ambiguity
 * match first). If multiple patterns fire on the same text the first wins.
 * Never invents values -- returns null when no match.
 *
 * Loop 24 P1 Fix 3 (2026-04-29): shipped to address Hedgerow, Vertical Farm,
 * and HAPS "Not declared" ceiling in the cost waterfall.
 * Loop 25 P1 Fix 4 (2026-04-29): extended keyword list + million/billion
 * multiplier support to fix Desalination (350,000) and HAPS (2.5 million).
 */

// Types

/** Result of a successful ceiling extraction. */
export interface CostCeilingExtraction {
    /** Parsed GBP value (whole pounds, positive). */
    gbp: number
    /** The verbatim phrase that was matched, for logging. */
    source: string
}

// Numeric suffix helpers

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

// Public API

/**
 * Extract a GBP cost ceiling from free-form brief prose.
 *
 * Returns the first plausible hit, or null when no match is found.
 * Never throws -- designed to be called as a non-blocking fallback.
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
                return { gbp, source: match[0].trim() }
            }
        }
    }
    return null
}
