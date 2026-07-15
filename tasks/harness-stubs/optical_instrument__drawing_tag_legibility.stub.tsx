// AUTO-DRAFTED regression-harness invariant stub — 2026-07-13T12:33:45.127Z
// Origin: gate 'drawing:tag_legibility' FAILED on class 'optical_instrument', routed to fix-stage: draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger).
// Loss recurrence in the ledger: 11  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/colorimeter-20260713-1323  @ 69692124a
// Detail: general-arrangement: 31 illegible tag(s): tag pile-up in elevation-aa: 'I-111' ∩ 'X-107' = 84% of the smaller bbox (max 20%) | tag pile-up in elevation-aa: 'I-111' ∩ 'I-101' = 71% of the smaller bbox (max 20%) | tag pile-up in elevation-aa: 'X-104' ∩ 'I-106' = 88% of the smaller bbox (max 20%) | tag
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'OPTICAL_INSTRUMENT.drawing_tag_legibility_regression',
  description: "drawing:tag_legibility must pass for optical_instrument (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger) and promote into regression-harness.tsx',
}
