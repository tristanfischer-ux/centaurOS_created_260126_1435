// AUTO-DRAFTED regression-harness invariant stub — 2026-07-22T23:39:19.558Z
// Origin: gate 'drawing:envelope_equality' FAILED on class 'benchtop_bioreactor', routed to fix-stage: generate_drawing_set._manifest_envelope_dims (must read the canonical parts-manifest Enclosure Shell dims_mm — a fallback to the superseded state pre-estimate makes the emitted caption diverge from the shell) + build-excel-export tab_equipment_register (already canonical).
// Loss recurrence in the ledger: 2  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/organoid-bioreactor-20260723-0025  @ da2763e6a
// Detail: renders: envelope MISMATCH — drawing caption 367×335×174 mm ≠ canonical manifest shell 367×335×126 mm: smallest dim: canonical shell 126.0 mm vs drawing caption 174.0 mm (diff 48.0 mm > tol 2.5 mm) — fix: route generate_drawing_set._manifest_envelope_dims to read the canonical parts-manifest Enclosu
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'generate_drawing_set._manifest_envelope_dims (must read the canonical parts-manifest Enclosure Shell dims_mm — a fallback to the superseded state pre-estimate makes the emitted caption diverge from the shell) + build-excel-export tab_equipment_register (already canonical)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'BENCHTOP_BIOREACTOR.drawing_envelope_equality_regression',
  description: "drawing:envelope_equality must pass for benchtop_bioreactor (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage generate_drawing_set._manifest_envelope_dims (must read the canonical parts-manifest Enclosure Shell dims_mm — a fallback to the superseded state pre-estimate makes the emitted caption diverge from the shell) + build-excel-export tab_equipment_register (already canonical) and promote into regression-harness.tsx',
}
