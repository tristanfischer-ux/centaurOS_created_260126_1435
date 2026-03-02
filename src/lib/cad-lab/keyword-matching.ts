/**
 * @file keyword-matching.ts
 *
 * @description Shared keyword-overlap matching for CAD Lab module IO labels.
 * Used by both the ProcessFlowDiagram and the build page's connection graph.
 *
 * FLOW: extractKeywords() strips stop words + short words → hasKeywordOverlap()
 *       counts shared keywords against a threshold.
 *
 * DECISION: Short-label fix — when either label produces ≤2 keywords (e.g. "Fuel"),
 * effectiveMin drops to 1 so single-word labels can still match. Without this,
 * minShared=2 is impossible when one side has only 1 keyword.
 */

/** Stop words excluded from keyword matching. */
export const KEYWORD_STOP_WORDS = new Set([
  "the", "a", "an", "to", "of", "for", "from", "in", "on", "at", "and",
  "or", "via", "per", "with", "each", "all", "into", "between", "by",
])

/**
 * Extracts significant keywords from an IO label.
 *
 * DECISION: Naive plural normalization (strip trailing 's' for words >4 chars)
 * so "signals"→"signal", "controls"→"control". The `!w.endsWith("ss")` guard
 * preserves words like "stress", "process", "access".
 *
 * @param text - Raw IO label string
 * @returns Set of lowercase keywords (>2 chars, non-stop-words, plural-normalized)
 */
export function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !KEYWORD_STOP_WORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) ? w.slice(0, -1) : w),
  )
}

/**
 * Returns true if two IO labels share enough keywords to be considered a match.
 *
 * @param a - First IO label
 * @param b - Second IO label
 * @param minShared - Minimum shared keywords required (default 2)
 * @returns Whether labels share enough keywords
 */
export function hasKeywordOverlap(a: string, b: string, minShared: number = 2): boolean {
  const kA = extractKeywords(a)
  const kB = extractKeywords(b)

  // INTENT: Short labels like "Fuel" produce ≤2 keywords, making minShared=2
  // impossible. Lower the threshold so short labels can still match.
  const effectiveMin = (kA.size <= 2 || kB.size <= 2)
    ? Math.min(minShared, 1)
    : minShared

  let shared = 0
  for (const w of kA) {
    if (kB.has(w)) {
      shared++
      if (shared >= effectiveMin) return true
    }
  }
  return false
}
