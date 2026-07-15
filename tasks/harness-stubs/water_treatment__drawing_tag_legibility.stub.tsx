// AUTO-DRAFTED regression-harness invariant stub — 2026-07-09T15:39:04.026Z
// Origin: gate 'drawing:tag_legibility' FAILED on class 'water_treatment', routed to fix-stage: draw_ga _TagPlacer (view-bounds clip guard + title/dim obstacles + elevation same-name range-collapse).
// Loss recurrence in the ledger: 5  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/codema-full-20260709-1538  @ 2ac9bea54
// Detail: general-arrangement: 1 illegible tag(s): tag pile-up in sheet: 'TK-110' ∩ 'TK-111' = 60% of the smaller bbox (max 20%)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw_ga _TagPlacer (view-bounds clip guard + title/dim obstacles + elevation same-name range-collapse)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'WATER_TREATMENT.drawing_tag_legibility_regression',
  description: "drawing:tag_legibility must pass for water_treatment (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw_ga _TagPlacer (view-bounds clip guard + title/dim obstacles + elevation same-name range-collapse) and promote into regression-harness.tsx',
}
