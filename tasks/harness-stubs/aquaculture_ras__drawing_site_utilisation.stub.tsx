// AUTO-DRAFTED regression-harness invariant stub — 2026-07-08T02:17:20.886Z
// Origin: gate 'drawing:site_utilisation' FAILED on class 'aquaculture_ras', routed to fix-stage: deterministic_layout min-area fold + periphery row + ground-slab 3 m apron (the deck must hug the plant hull).
// Loss recurrence in the ledger: 27  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/b3-replay  @ 6ac59cae7
// Detail: general-arrangement: plant hull 1170.5 m² / deck 5234.8 m² = 0.22 (floor 0.45 — below it the plant sits in a corner of an empty deck)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'deterministic_layout min-area fold + periphery row + ground-slab 3 m apron (the deck must hug the plant hull)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'AQUACULTURE_RAS.drawing_site_utilisation_regression',
  description: "drawing:site_utilisation must pass for aquaculture_ras (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage deterministic_layout min-area fold + periphery row + ground-slab 3 m apron (the deck must hug the plant hull) and promote into regression-harness.tsx',
}
