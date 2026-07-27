// AUTO-DRAFTED regression-harness invariant stub — 2026-07-25T13:18:58.121Z
// Origin: gate 'drawing:plan_render_coherence' FAILED on class 'benchtop_bioreactor', routed to fix-stage: settle-loop stale-render wipe + generate_drawing_set _align_plan_render_to_manifest + draw_ga data-placement-fp (plant: 01-top; product: 00-hero cutaway).
// Loss recurrence in the ledger: 4  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/organoid-9drive-r10-vesselfix  @ 44899d78d
// Detail: renders: GA placement fingerprint 479f7019cded149b ≠ manifest 41d7f9cb0f2cd2ed — GA and Blender do not share the same parts-manifest generation
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'settle-loop stale-render wipe + generate_drawing_set _align_plan_render_to_manifest + draw_ga data-placement-fp (plant: 01-top; product: 00-hero cutaway)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'BENCHTOP_BIOREACTOR.drawing_plan_render_coherence_regression',
  description: "drawing:plan_render_coherence must pass for benchtop_bioreactor (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage settle-loop stale-render wipe + generate_drawing_set _align_plan_render_to_manifest + draw_ga data-placement-fp (plant: 01-top; product: 00-hero cutaway) and promote into regression-harness.tsx',
}
