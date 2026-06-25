// AUTO-DRAFTED regression-harness invariant stub — 2026-06-24T11:02:49.512Z
// Origin: gate 'drawing:legibility' FAILED on class 'co2_mineralisation', routed to fix-stage: draw-script (layout / multi-sheet wrap).
// Loss recurrence in the ledger: 2  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/co2-converged-r0  @ e12f5a342
// Detail: block-flow-diagram: block-flow-diagram 5526x1276 aspect 4.3:1 (limit 4:1)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw-script (layout / multi-sheet wrap)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'CO2_MINERALISATION.drawing_legibility_regression',
  description: "drawing:legibility must pass for co2_mineralisation (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw-script (layout / multi-sheet wrap) and promote into regression-harness.tsx',
}
