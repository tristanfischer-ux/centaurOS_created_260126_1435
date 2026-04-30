/**
 * @file llm-output-sanitiser.ts — shared sanitiser for LLM reasoning-trace
 * leaks, tool-call artifacts, and raw data-structure leaks across ALL
 * subagent output streams.
 *
 * Evolved from supplier-description-sanitiser.ts (Loop 26). Extended in
 * Loop 28 to cover Fang tool-use leaks (`lookup_process(sheet_metal)`)
 * and raw JSON arrays in supplier certification cards.
 *
 * Call sites:
 *   1. forge-v2-supplier-match.ts — validate() at generation time
 *   2. export-project-pdf.tsx — cleanReviewText() / SCRATCH_PROMPT_INDICATORS
 *      at render time (covers Fang reviews, supplier cards, all free text)
 */

export const SUPPLIER_DESCRIPTION_FALLBACK =
    "Supplier description pending verification."

/**
 * Category A+B: prompt-echo and reasoning-trace markers.
 * Any single match disqualifies the entire text block.
 */
export const SUPPLIER_DESCRIPTION_LEAK_PATTERNS: ReadonlyArray<RegExp> = [
    // ── Category A: prompt-echo markers ─────────────────────────────────
    /\bwe need to (write|produce|generate)\b/i,
    /\bsentence must\b/i,
    /\bthe (supplier|founder) (description|brief) is\b/i,
    /\boutput only\b/i,
    /\bd50 words\b/i,
    /^supplier:\s/im,
    /^matched bom parts:/im,
    /^(prompt|instructions?|system):/im,

    // ── Category B: reasoning-trace markers (Loop 26) ───────────────────
    /\bwe are asked to (write|produce|generate)\b/i,
    /\bthe user (says|mentions|notes|states)\b/i,
    /\bso we need to infer\b/i,
    /\bno description on file\b/i,
    /\blet me (think|consider|check|look)\b/i,
    /\bi need to (write|produce|generate|find|check)\b/i,
    /\bfirst[,.]?\s+(let'?s|i'?ll|we)\b/i,
    /\bthe question (is|asks)\b/i,
    /\bbased on (this|the above|what)\b/i,
    /\blooking at (this|the|what)\b/i,
    /\bare (not|typically|known for|a)\s+their\s+(typical|usual|main|primary)\b/i,
    /\bbut\s+\w+\s+are\s+not\s+(their|a)\s+(typical|usual|primary|core)\b/i,
    /\bas an ai\b/i,
    /\bmy instructions\b/i,
    /^i (should|will|'ll)\b/im,
    /\.\s+I (should|will|'ll)\b/i,
    /^let'?s\b/im,
    /\.\s+Let'?s\b/i,
    /^here (is|are)\b/im,
    /\.\s+Here (is|are)\b/i,
]

/**
 * Category C (Loop 28): tool-call artifacts from Fang and other
 * specialists that use function-calling / tool-use under the hood.
 *
 * These patterns strip inline function-call syntax from narrative text
 * rather than disqualifying the entire block (the surrounding review text
 * is valuable — only the leaked call signature is garbage).
 */
export const TOOL_CALL_LEAK_PATTERNS: ReadonlyArray<{
    pattern: RegExp
    replacement: string
}> = [
    // "verified via lookup_process(sheet_metal)" — requires parens or backticks
    // to avoid stripping legitimate "verified using non_destructive_testing"
    { pattern: /\bverified\s+(via|using|with)\s+`[a-z][a-z0-9]*_[a-z0-9_]+`(\([^)]*\))?/gi, replacement: "" },
    { pattern: /\bverified\s+(via|using|with)\s+[a-z][a-z0-9]*_[a-z0-9_]+\([^)]*\)/gi, replacement: "" },
    // "(verified via `function_name`)" — parenthesised variant
    { pattern: /\(verified\s+(via|using|with)\s+[^)]*\)/gi, replacement: "" },
    // "Validated using calculate_stress(...)" — requires parens or backticks
    { pattern: /\b(validated|confirmed|checked|verified)\s+(using|via|with|by)\s+`[a-z][a-z0-9]*_[a-z0-9_]+`(\([^)]*\))?/gi, replacement: "" },
    { pattern: /\b(validated|confirmed|checked|verified)\s+(using|via|with|by)\s+[a-z][a-z0-9]*_[a-z0-9_]+\([^)]*\)/gi, replacement: "" },
    // "The lookup_process(x) confirms" → strip "The <call>" leaving "confirms"
    { pattern: /\bthe\s+`?lookup_\w+`?(\([^)]*\))?\s*/gi, replacement: "" },
    // `lookup_process(sheet_metal)` / `lookup_process(injection_molding)` etc.
    { pattern: /\blookup_\w+\([^)]*\)/g, replacement: "" },
    // `calculate_cost(...)` / `search_suppliers(...)` / `get_material(...)`
    // Restricted to known LLM tool prefixes to avoid stripping legitimate
    // engineering terms like check_valve(150psi) or find_bearing(SKF_6205).
    { pattern: /\b(calculate|search|fetch|query|compute|evaluate)_\w+\([^)]*\)/g, replacement: "" },
    // Backticked tool-call function names only — restricted to known tool
    // prefixes (lookup_, calculate_, search_, fetch_, query_, compute_,
    // evaluate_) to avoid stripping legitimate engineering identifiers
    // like `check_valve`, `motor_controller`, `pressure_sensor`.
    { pattern: /`(lookup|calculate|search|fetch|query|compute|evaluate)_[a-z0-9_]+`/g, replacement: "" },
    // "Recommend verify via that" → "Recommend that" (orphaned "verify via")
    { pattern: /\b(verify|check|confirm)\s+(via|using|with)\s+(?=that|this|the|if|whether)/gi, replacement: "" },
]

export function hasSupplierDescriptionLeak(text: string): boolean {
    return SUPPLIER_DESCRIPTION_LEAK_PATTERNS.some((re) => re.test(text))
}

/**
 * Strip tool-call artifacts from narrative text, returning cleaned text.
 * Unlike the full-block leak check, this preserves the surrounding text.
 */
export function stripToolCallLeaks(text: string): string {
    let result = text
    for (const { pattern, replacement } of TOOL_CALL_LEAK_PATTERNS) {
        result = result.replace(pattern, replacement)
    }
    // Collapse artefacts left by removals
    result = result
        .replace(/  +/g, " ")       // double spaces
        .replace(/^ +/gm, "")       // leading spaces
        .replace(/ +$/gm, "")       // trailing spaces
        .replace(/ ([.,;:])/g, "$1") // space before punctuation
        .replace(/\.(\s*\.)+/g, (m) => m.replace(/\s/g, "").length >= 3 ? "…" : ".") // collapse double periods but preserve ellipses
        .replace(/,\s*,/g, ",")     // double commas
        .replace(/\(\s*\)/g, "")    // empty parens
        .replace(/^\s*$/gm, "")     // blank lines
    return result
}

export function sanitiseSupplierDescription(
    text: string,
    context: string,
): string {
    if (hasSupplierDescriptionLeak(text)) {
        console.warn(
            `[llm-output-sanitiser] reasoning-trace leak detected` +
                ` for "${context}" — replacing with fallback.` +
                ` Raw (first 120 chars): "${text.slice(0, 120).replace(/\n/g, " ")}"`,
        )
        return SUPPLIER_DESCRIPTION_FALLBACK
    }
    return stripToolCallLeaks(text)
}

/**
 * Formats a value that may be a JSON array, a stringified JSON array,
 * or a plain string into clean comma-separated text for PDF rendering.
 *
 * Handles:
 *   - `["ISO 9001", "ISO 14001"]` (already parsed array) → "ISO 9001, ISO 14001"
 *   - `'["ISO 9001", "ISO 14001"]'` (stringified) → "ISO 9001, ISO 14001"
 *   - `[]` or `"[]"` → emptyLabel (default "")
 *   - `null` / `undefined` → emptyLabel
 *   - `"ISO 9001, ISO 14001"` (plain string) → returned as-is
 */
export function formatJsonArrayField(
    value: string | string[] | null | undefined,
    emptyLabel = "",
): string {
    if (value == null) return emptyLabel

    // Already a parsed array
    if (Array.isArray(value)) {
        const filtered = value.filter((v) => typeof v === "string" && v.trim().length > 0)
        return filtered.length > 0 ? filtered.join(", ") : emptyLabel
    }

    // String that looks like a JSON array
    const trimmed = (value as string).trim()
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed)
            if (Array.isArray(parsed)) {
                const filtered = parsed
                    .map((v: unknown) => String(v).trim())
                    .filter((v: string) => v.length > 0)
                return filtered.length > 0 ? filtered.join(", ") : emptyLabel
            }
        } catch {
            // Not valid JSON — fall through to return as plain string
        }
    }

    // Plain string — return as-is (unless it's just "[]")
    if (trimmed === "[]") return emptyLabel
    return trimmed || emptyLabel
}
