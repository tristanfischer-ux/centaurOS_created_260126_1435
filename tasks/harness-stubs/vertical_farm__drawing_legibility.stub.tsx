// AUTO-DRAFTED regression-harness invariant stub — 2026-06-25T17:41:10.941Z
// Origin: gate 'drawing:legibility' FAILED on class 'vertical_farm', routed to fix-stage: draw-script (layout / multi-sheet wrap).
// Loss recurrence in the ledger: 1
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/fischer-farms-v4  @ 0c133929a
// Detail: process-schedules: process-schedules 2492x11076 aspect 4.4:1 (limit 4:1)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw-script (layout / multi-sheet wrap)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'VERTICAL_FARM.drawing_legibility_regression',
  description: "drawing:legibility must pass for vertical_farm (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw-script (layout / multi-sheet wrap) and promote into regression-harness.tsx',
}
