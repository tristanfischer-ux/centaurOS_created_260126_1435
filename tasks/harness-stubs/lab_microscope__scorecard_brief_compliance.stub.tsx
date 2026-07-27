// AUTO-DRAFTED regression-harness invariant stub — 2026-07-19T18:54:59.711Z
// Origin: gate 'scorecard:brief_compliance' FAILED on class 'lab_microscope'.
// Loss recurrence in the ledger: 5  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/openflexure-20260719-1639  @ 3cd57f1c6
// Detail: section brief_compliance=7/10 after 8 iters; defects: FAIL (soft): focus_resolution_um — target 1 um, achieved 0.6111111111111112 (abbe_resolution_um) | advisory: self-audit (LLM) scored this section 8/10 — Focus resolution listed unverified while headline asserts exact target value
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage '?', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'LAB_MICROSCOPE.scorecard_brief_compliance_regression',
  description: "scorecard:brief_compliance must pass for lab_microscope (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage ? and promote into regression-harness.tsx',
}
