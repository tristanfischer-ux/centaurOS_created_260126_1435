// AUTO-DRAFTED regression-harness invariant stub — 2026-07-12T14:26:17.277Z
// Origin: gate 'drawing:tag_legibility' FAILED on class 'pcb_assembly', routed to fix-stage: draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger).
// Loss recurrence in the ledger: 3  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/colorimeter-corefix-20260712-1453  @ 9bb33ca6f
// Detail: general-arrangement: 4 illegible tag(s): tag pile-up in plan: 'X-102' ∩ 'X-108' = 25% of the smaller bbox (max 20%) | tag pile-up in plan: 'X-104' ∩ 'X-105' = 25% of the smaller bbox (max 20%) | tag pile-up in plan: 'X-107' ∩ 'X-103' = 25% of the smaller bbox (max 20%) | tag pile-up in plan: 'X-101'
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'PCB_ASSEMBLY.drawing_tag_legibility_regression',
  description: "drawing:tag_legibility must pass for pcb_assembly (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw_ga _TagPlacer (view-bounds clip + title/dim obstacles + elev same-name range-collapse) + _draw_external_drain_points (same-edge EXT.DRAIN range-collapse + along-edge stagger) and promote into regression-harness.tsx',
}
