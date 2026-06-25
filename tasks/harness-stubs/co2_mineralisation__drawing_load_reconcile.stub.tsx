// AUTO-DRAFTED regression-harness invariant stub — 2026-06-24T11:30:15.058Z
// Origin: gate 'drawing:load_reconcile' FAILED on class 'co2_mineralisation', routed to fix-stage: contract (connected_electrical_load_kw) + panel kW resolution.
// Loss recurrence in the ledger: 6  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/co2-converged-r0  @ f7039600c
// Detail: single-line-diagram: panel total 337 kW vs contract 87 kW (ratio 3.86, ±15%)
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
