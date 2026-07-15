// AUTO-DRAFTED regression-harness invariant stub — 2026-07-13T07:57:08.894Z
// Origin: gate 'drawing:legibility' FAILED on class 'optical_instrument', routed to fix-stage: draw-script (layout / multi-sheet wrap — A1 pagination via a1_print).
// Loss recurrence in the ledger: 55  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/colorimeter-20260713-0819  @ b0fffe058
// Detail: process-schedules: process-schedules 15232x572 aspect 26.6:1 (limit 4:1)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw-script (layout / multi-sheet wrap — A1 pagination via a1_print)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'OPTICAL_INSTRUMENT.drawing_legibility_regression',
  description: "drawing:legibility must pass for optical_instrument (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw-script (layout / multi-sheet wrap — A1 pagination via a1_print) and promote into regression-harness.tsx',
}
