// AUTO-DRAFTED regression-harness invariant stub — 2026-07-25T20:50:16.895Z
// Origin: gate 'scorecard:brief_compliance' FAILED on class 'benchtop_bioreactor'.
// Loss recurrence in the ledger: 2  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/organoid-9drive-r11-allfixes  @ 9fa9d7a76
// Detail: section brief_compliance=7/10 after 8 iters; defects: UNVERIFIED (soft): bom_cost_midpoint_gbp — target 330 GBP; no delivered contract quantity matches by name + unit family | UNVERIFIED (soft): bom_cost_floor_gbp — target 275 GBP; no delivered contract quantity matches by name + unit family | advis
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage '?', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'BENCHTOP_BIOREACTOR.scorecard_brief_compliance_regression',
  description: "scorecard:brief_compliance must pass for benchtop_bioreactor (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage ? and promote into regression-harness.tsx',
}
