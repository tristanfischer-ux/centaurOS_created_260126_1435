// AUTO-DRAFTED regression-harness invariant stub — 2026-07-07T19:40:27.994Z
// Origin: gate 'scorecard:brief_compliance' FAILED on class 'aquaculture_ras'.
// Loss recurrence in the ledger: 3  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/det-ledger-c  @ 3cd45db17
// Detail: section brief_compliance=4/10 after 1 iters; defects: FAIL (hard): total_rearing_volume_m3 — target 10000 m3, achieved 327 (rearing_tank_volume_each_m3) | UNVERIFIED (soft): water_turnover_per_hr — target 4 hr^-1; no delivered contract quantity matches by name + unit family | UNVERIFIED (soft): hydr
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage '?', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'AQUACULTURE_RAS.scorecard_brief_compliance_regression',
  description: "scorecard:brief_compliance must pass for aquaculture_ras (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage ? and promote into regression-harness.tsx',
}
