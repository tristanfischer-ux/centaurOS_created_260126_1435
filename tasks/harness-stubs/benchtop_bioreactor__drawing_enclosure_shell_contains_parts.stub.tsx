// AUTO-DRAFTED regression-harness invariant stub — 2026-07-25T20:47:23.008Z
// Origin: gate 'drawing:enclosure_shell_contains_parts' FAILED on class 'benchtop_bioreactor', routed to fix-stage: minimum_working_envelope (functional-stack height pack) + place_sealed_enclosure env_mm — shell must contain the real mechanical+fluidic part stack.
// Loss recurrence in the ledger: 78  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/organoid-9drive-r11-allfixes  @ 9fa9d7a76
// Detail: renders: parts bbox 225×200×104 mm exceeds shell 6×5×3 mm: largest dim: parts 225 mm > shell 6 mm (excess 219 mm, tol ±10 mm); middle dim: parts 200 mm > shell 5 mm (excess 195 mm, tol ±10 mm); smallest dim: parts 104 mm > shell 3 mm (excess 101 mm, tol ±10 mm)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'minimum_working_envelope (functional-stack height pack) + place_sealed_enclosure env_mm — shell must contain the real mechanical+fluidic part stack', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'BENCHTOP_BIOREACTOR.drawing_enclosure_shell_contains_parts_regression',
  description: "drawing:enclosure_shell_contains_parts must pass for benchtop_bioreactor (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage minimum_working_envelope (functional-stack height pack) + place_sealed_enclosure env_mm — shell must contain the real mechanical+fluidic part stack and promote into regression-harness.tsx',
}
