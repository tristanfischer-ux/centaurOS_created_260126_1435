/**
 * supplier-slot-backfill.ts — pure backfill-selection logic for the VF
 * supplier slot-backfill feature (task #18).
 *
 * When cross-archetype dedup drops a candidate from a slot, this module
 * selects the next-best replacement from the archetype's retained pool
 * (candidates that passed LLM scoring but were not in the initial top-N pick).
 *
 * Pure + deterministic — no I/O. All inputs passed in.
 * Exported so the enrich-state-with-suppliers.tsx script can call it, and
 * so unit tests can exercise it in isolation.
 */

/**
 * Minimal shape describing a candidate slot — only the fields the backfill
 * logic needs. Mirrors the relevant fields of SupplierCandidate in
 * enrich-state-with-suppliers.tsx; kept minimal to keep this module
 * dependency-free.
 */
export interface BackfillCandidate {
  website_url: string | null
  llm_score: number | null
  name: string
}

/**
 * Extract the registrable apex domain from a URL.
 * Returns '' on parse failure or missing input.
 * Mirrors extractRegistrableDomain in enrich-state-with-suppliers.tsx.
 */
export function extractApex(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    if (!host) return ''
    const parts = host.split('.')
    if (parts.length <= 2) return host
    const twoLabelSuffixes = new Set([
      'co.uk', 'com.au', 'co.nz', 'co.jp', 'com.cn', 'co.in', 'co.za',
      'org.uk', 'ac.uk', 'gov.uk', 'ne.jp', 'or.jp',
    ])
    const lastTwo = parts.slice(-2).join('.')
    if (twoLabelSuffixes.has(lastTwo)) return parts.slice(-3).join('.')
    return parts.slice(-2).join('.')
  } catch {
    return ''
  }
}

/**
 * Pick backfill candidates from `retainedPool` for a single archetype slot.
 *
 * Selection rules (in order):
 *   1. The candidate must appear in `retainedPool` (already passed LLM scoring,
 *      URL and category filters were applied before scoring).
 *   2. The candidate's apex domain must NOT already be in `committedApexes`
 *      (would re-introduce a dedup collision in the same archetype).
 *   3. The candidate's apex domain must NOT appear in `otherArchetypeApexes`
 *      (preserves the cross-archetype dedup invariant: no domain in two slots).
 *   4. Candidates are taken in order (retainedPool is pre-sorted by llm_score
 *      descending), up to `needed` items.
 *
 * If the pool is exhausted before `needed` items are found, the returned array
 * will be shorter than `needed` — the caller is expected to surface this as an
 * explicit `candidate_shortfall` rather than silently leaving a gap.
 *
 * @param retainedPool  Candidates that passed filters but weren't in initial top-N.
 *                      MUST be sorted by descending llm_score (best first).
 * @param committedApexes  Apex domains already present in this archetype's slot.
 * @param otherArchetypeApexes  All apex domains committed across OTHER archetypes.
 * @param needed  Number of backfill slots to fill.
 * @returns Selected backfill candidates (length <= needed).
 */
export function pickBackfillCandidates<T extends BackfillCandidate>(
  retainedPool: T[],
  committedApexes: ReadonlySet<string>,
  otherArchetypeApexes: ReadonlySet<string>,
  needed: number,
): T[] {
  if (needed <= 0 || retainedPool.length === 0) return []

  const result: T[] = []
  const usedApexes = new Set(committedApexes)

  for (const candidate of retainedPool) {
    if (result.length >= needed) break
    const apex = extractApex(candidate.website_url)
    // Must not conflict with already-committed slots in this archetype.
    if (apex && usedApexes.has(apex)) continue
    // Must not conflict with other archetypes' committed slots.
    if (apex && otherArchetypeApexes.has(apex)) continue
    result.push(candidate)
    // Register the apex so subsequent iterations in this same backfill call
    // don't pick a second candidate from the same domain.
    if (apex) usedApexes.add(apex)
  }

  return result
}
