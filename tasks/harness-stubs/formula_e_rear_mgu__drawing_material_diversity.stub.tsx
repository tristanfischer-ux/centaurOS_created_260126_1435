// AUTO-DRAFTED regression-harness invariant stub — 2026-07-28T23:51:20.837Z
// Origin: gate 'drawing:material_diversity' FAILED on class 'formula_e_rear_mgu', routed to fix-stage: connection_sizing (per-service material).
// Loss recurrence in the ledger: 6  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-rear-mgu-20260728-2340  @ 85d86ffd7
// Detail: process-schedules: 1 distinct pipe material(s): ['hdpe/pe100']
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'connection_sizing (per-service material)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'FORMULA_E_REAR_MGU.drawing_material_diversity_regression',
  description: "drawing:material_diversity must pass for formula_e_rear_mgu (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage connection_sizing (per-service material) and promote into regression-harness.tsx',
}
