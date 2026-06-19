// ═══════════════════════════════════════════════════════════════════════════════
// B3 — CAGE THE LLM CRITIC (Tristan 2026-06-19)
// ═══════════════════════════════════════════════════════════════════════════════
// "A number is trustworthy only when you can WATCH it be computed." The quality
// FLOOR is therefore set by the DETERMINISTIC (non-advisory) scorecard sections
// only — the arithmetic/ledger gates (drawing_gates, cost_sanity, physics_gates,
// tool_archetype, connectivity). The LLM self-audit sections are ADVISORY: they
// stay visible (a human reads the critic's concerns; they still render on the
// dashboard/Excel) but they may NEVER turn a green deterministic check red or set
// the floor on their own.
//
// This closes the failure Tristan kept catching: the LLM critic scored a CORRECT
// deterministic design 6/10 (it read a per-tank 1,336 m³/h branch flow as the pump
// total; it invented a "missing heat pump" that the adequacy check PASSES) and that
// 6 dragged the whole floor below 8 with no real defect behind it. Proven on real
// ras-inc5 data: OLD floor 6 (physics_fidelity=6 + brief_compliance=7, both LLM
// misreads/wobble) → NEW floor 8, allPass=true, with every deterministic gate ≥8.
//
// Pure + dependency-free so the regression harness can import and test it directly
// (the chain file runs main() on import and cannot itself be imported).

export interface ScorecardSection {
  name: string
  score: number
  defects?: string[]
  /** true = LLM self-audit section: visible but NON-GATING (advisory only). */
  advisory?: boolean
}

/**
 * Compute the scorecard floor + mean from the DETERMINISTIC sections only.
 * Universal fallback: if a run produced ONLY advisory sections (no deterministic
 * gate ran for this class), fall back to all sections so the score is never blank.
 */
export function computeScorecardFloor(
  sections: ScorecardSection[],
): { floor: number; mean: number } {
  const gating = sections.filter((s) => !s.advisory)
  const scored = gating.length ? gating : sections
  const scores = scored.map((s) => s.score)
  const floor = scores.length ? Math.min(...scores) : 0
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  return { floor, mean: Math.round(mean * 10) / 10 }
}
