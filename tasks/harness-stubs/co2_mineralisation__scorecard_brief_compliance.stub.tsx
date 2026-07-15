// AUTO-DRAFTED regression-harness invariant stub — 2026-07-06T04:19:35.578Z
// Origin: gate 'scorecard:brief_compliance' FAILED on class 'co2_mineralisation'.
// Loss recurrence in the ledger: 4  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/co2-campaign-v6  @ 84bed0a79
// Detail: section brief_compliance=4/10 after 8 iters; defects: UNVERIFIED (hard): co2_capture_capacity_tpd — target 1 t/day; no delivered contract quantity matches by name + unit family | FAIL (hard): koh_feed_tpd — target 2.6 t/day, achieved 2.54 (koh_feed_t_per_day)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage '?', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'CO2_MINERALISATION.scorecard_brief_compliance_regression',
  description: "scorecard:brief_compliance must pass for co2_mineralisation (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage ? and promote into regression-harness.tsx',
}
