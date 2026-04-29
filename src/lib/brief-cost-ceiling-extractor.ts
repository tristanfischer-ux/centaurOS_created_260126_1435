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
 *
 * Conservative extraction: returns the FIRST plausible hit (lowest-ambiguity
 * match first). If multiple patterns fire on the same text the first wins.
 * Never invents values -- returns null when no match.
 *
 * Loop 24 P1 Fix 3 (2026-04-29): shipped to address Hedgerow, Vertical Farm,
 * and HAPS "Not declared" ceiling in the cost waterfall.
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
 */
function parseNumericSuffix(raw: string, suffix: string): number | null {
    const clean = raw.replace(/,/g, "").replace(/~/g, "").trim()
    const base = parseFloat(clean)
    if (!Number.isFinite(base) || base <= 0) return null

    let multiplier = 1
    if (suffix === "k" || suffix === "K") {
        multiplier = 1_000
    } else if (suffix === "m" || suffix === "M") {
        multiplier = 1_000_000
    }

    const result = base * multiplier
    if (result <= 0 || result > 10_000_000_000) return null
    return Math.round(result)
}

// Pattern list

/**
 * Each entry is a regex + a function that converts the match into a GBP
 * number. Patterns are tried in order; the first that fires wins.
 *
 * Numeric capture group convention inside each regex:
 *   - Group 1: the raw numeric digits (possibly with commas)
 *   - Group 2 (optional): k/K/M multiplier suffix
 */
const CEILING_PATTERNS: Array<{
    re: RegExp
    extract: (m: RegExpExecArray) => number | null
}> = [
    // Context keyword before a pound-symbol amount — highest confidence
    // e.g. "target installed capital cost under £150,000"
    {
        re: /(?:target|budget|ceiling|cap|limit)[^.!?\n]{0,80}£\s*(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // Context keyword before a spelled-out pounds amount
    // e.g. "target landed bill of materials ~£155" already caught above;
    // this catches "target installed capital cost under 150,000 pounds"
    {
        re: /(?:target|budget|ceiling|cap|limit)[^.!?\n]{0,80}\b(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\s+pounds?(?:\s+sterling)?\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // £150,000 / £150k / £1.5M -- bare symbol anywhere in text
    {
        re: /£\s*(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\b/,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // GBP 150,000 / GBP 150k
    {
        re: /\bGBP\s+(~?[\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\b/i,
        extract: (m) => parseNumericSuffix(m[1], m[2] ?? ""),
    },
    // 150,000 pounds / 150k pounds sterling -- no symbol
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
