/**
 * Net brief-infeasibility reconciliation (gate-18 fix, 2026-06-10).
 *
 * WHY THIS EXISTS — edge_ai_server rerun failed gate 18 (cross-page numeric
 * consistency, exit 18): the cover banner said "The brief's peak power draw kw
 * target (0.4 kW) is not physically achievable … relaxed 9.25x increase to
 * 3.7 kW" while p.13's design-decision prose correctly quoted "the 3.70 kW
 * target". The brief's REAL target was 3.7 kW all along: the Phase-0 brief
 * refinement loop OSCILLATED (iter0 reduced 3.7 → 0.4, iter1 raised 0.4 → 3.7)
 * and `state.brief.brief_infeasibility_flag` recorded only the LAST leg of the
 * oscillation, mislabelling the chain's own intermediate value (0.4 kW) as
 * "the brief's target". Two prose locations then quoted contradictory scalars
 * for the same engineering quantity → gate-18 HIGH (TRUE positive — the cover
 * statement was factually wrong, not an audit-guard gap).
 *
 * THE FIX — deterministic, provenance-backed reconciliation (plan E5 auto-
 * correct guard: consistency repairs provably derivable from upstream values
 * ONLY; no LLM): derive the NET revision for the flagged constraint from
 * `state.brief.revision_history` (the chain's own provenance record):
 *   first applied entry's original_value  = the USER's brief value
 *   last  applied entry's revised_value   = the value the chain actually used
 * If net original == net revised (oscillation returned to the brief's own
 * value) there was NO net relaxation → the flag is suppressed entirely (also
 * the anti-cover-banner principle: never tell the reader their target was
 * infeasible when the shipped design meets it). If a net change remains, the
 * flag is rewritten to the net original/revised/factor so the cover and the
 * body quote the SAME canonical brief value.
 *
 * Universal: applies to any constraint and any oscillation shape (A→B→A
 * suppresses; A→B→C nets to A→C with the recomputed factor).
 *
 * Consumed by scripts/render-minimal-pdf.tsx (cover banner) and guarded by
 * regression-harness invariant UNIVERSAL.brief_infeasibility_flag_nets_oscillation.
 */

export interface BriefInfeasibilityFlag {
  constraint: string
  original: string
  revised: string
  factor: string
}

export interface BriefRevisionEntryLite {
  target_constraint?: string
  original_value?: unknown
  revised_value?: unknown
  applied?: boolean
}

/** Parse the leading number out of a value string like "3.7 kW" / "£12,000" / "0.4". */
export function parseLeadingNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw == null) return null
  const m = String(raw).replace(/,/g, '').match(/-?\d*\.?\d+/)
  if (!m) return null
  const n = parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

function formatFactor(ratio: number): string {
  // 9.25 → "9.25× increase"; 1/9.25 → "9.25× reduction"
  const r = ratio >= 1 ? ratio : 1 / ratio
  const s = r.toFixed(2).replace(/\.?0+$/, '')
  return `${s}× ${ratio >= 1 ? 'increase' : 'reduction'}`
}

/**
 * Reconcile a per-leg infeasibility flag against the NET revision recorded in
 * revision_history. Returns:
 *   - null               → no net relaxation (suppress the cover banner)
 *   - a rewritten flag   → net original/revised/factor (provenance-backed)
 *   - the original flag  → no usable provenance to reconcile against
 */
export function computeNetInfeasibilityFlag(
  flag: BriefInfeasibilityFlag | null | undefined,
  revisionHistory: BriefRevisionEntryLite[] | null | undefined,
): BriefInfeasibilityFlag | null {
  if (!flag || !flag.constraint) return flag ?? null
  const legs = (Array.isArray(revisionHistory) ? revisionHistory : []).filter(
    (r) => r && r.target_constraint === flag.constraint && r.applied === true,
  )
  if (legs.length === 0) return flag // no provenance — leave the flag untouched

  const netOriginalRaw = legs[0].original_value
  const netRevisedRaw = legs[legs.length - 1].revised_value
  const a = parseLeadingNumber(netOriginalRaw)
  const b = parseLeadingNumber(netRevisedRaw)

  if (a != null && b != null) {
    const eps = 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1)
    if (Math.abs(a - b) <= eps) return null // oscillation returned to the brief's own value
    const factor = a !== 0 ? formatFactor(b / a) : 'net revision'
    return {
      constraint: flag.constraint,
      original: String(netOriginalRaw),
      revised: String(netRevisedRaw),
      factor,
    }
  }

  // Non-numeric values: compare as trimmed strings.
  if (String(netOriginalRaw).trim() === String(netRevisedRaw).trim()) return null
  return {
    constraint: flag.constraint,
    original: String(netOriginalRaw),
    revised: String(netRevisedRaw),
    factor: 'net revision',
  }
}
