// AUTO-DRAFTED regression-harness invariant stub — 2026-07-29T06:58:15.803Z
// Origin: gate 'drawing:interior_fill' FAILED on class 'formula_e_rear_mgu', routed to fix-stage: build_universal_scene place_sealed_enclosure (pack-array expansion + zone-fill sizing).
// Loss recurrence in the ledger: 4  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-rear-mgu-20260729-0733  @ 54adb6125
// Detail: renders: interior fill 29% of the 0.08 m³ enclosure (floor 35% — below it the render is a hollow shell, not a product)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'build_universal_scene place_sealed_enclosure (pack-array expansion + zone-fill sizing)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'FORMULA_E_REAR_MGU.drawing_interior_fill_regression',
  description: "drawing:interior_fill must pass for formula_e_rear_mgu (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage build_universal_scene place_sealed_enclosure (pack-array expansion + zone-fill sizing) and promote into regression-harness.tsx',
}
