// AUTO-DRAFTED regression-harness invariant stub — 2026-07-11T01:37:45.174Z
// Origin: gate 'drawing:tag_legibility' FAILED on class 'energy_storage', routed to fix-stage: draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger).
// Loss recurrence in the ledger: 21  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/powerwall-20260711-0133  @ e18e5066a
// Detail: general-arrangement: 26 illegible tag(s): tag pile-up in plan: 'X-102' ∩ 'X-111' = 25% of the smaller bbox (max 20%) | tag pile-up in plan: 'X-102' ∩ 'X-131' = 70% of the smaller bbox (max 20%) | tag pile-up in plan: 'X-103' ∩ 'X-117' = 31% of the smaller bbox (max 20%) | tag pile-up in plan: 'X-103
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'ENERGY_STORAGE.drawing_tag_legibility_regression',
  description: "drawing:tag_legibility must pass for energy_storage (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger) and promote into regression-harness.tsx',
}
