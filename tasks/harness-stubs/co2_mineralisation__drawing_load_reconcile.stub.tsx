// AUTO-DRAFTED regression-harness invariant stub — 2026-07-06T06:26:23.479Z
// Origin: gate 'drawing:load_reconcile' FAILED on class 'co2_mineralisation', routed to fix-stage: contract (connected_electrical_load_kw) + panel kW resolution.
// Loss recurrence in the ledger: 80  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/co2-campaign-v9  @ ee5554826
// Detail: single-line-diagram: panel total 886 kW vs contract 559 kW (ratio 1.59, ±15%)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'contract (connected_electrical_load_kw) + panel kW resolution', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'CO2_MINERALISATION.drawing_load_reconcile_regression',
  description: "drawing:load_reconcile must pass for co2_mineralisation (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage contract (connected_electrical_load_kw) + panel kW resolution and promote into regression-harness.tsx',
}
