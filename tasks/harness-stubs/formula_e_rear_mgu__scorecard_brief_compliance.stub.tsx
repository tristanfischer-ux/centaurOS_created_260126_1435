// AUTO-DRAFTED regression-harness invariant stub — 2026-07-29T00:26:32.898Z
// Origin: gate 'scorecard:brief_compliance' FAILED on class 'formula_e_rear_mgu'.
// Loss recurrence in the ledger: 1
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-rear-mgu-20260728-2340  @ 85d86ffd7
// Detail: section brief_compliance=4/10 after 8 iters; defects: FAIL (soft): max_rotor_speed_rpm — target 100000 rpm, achieved 40000 (mgu_base_speed_rpm) | FAIL (soft): max_system_voltage_v — target 1000 V, achieved 750 (dc_bus_voltage_v) | UNVERIFIED (soft): assumed_vdc_min_v — target 600 V; no delivered con
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage '?', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'FORMULA_E_REAR_MGU.scorecard_brief_compliance_regression',
  description: "scorecard:brief_compliance must pass for formula_e_rear_mgu (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage ? and promote into regression-harness.tsx',
}
