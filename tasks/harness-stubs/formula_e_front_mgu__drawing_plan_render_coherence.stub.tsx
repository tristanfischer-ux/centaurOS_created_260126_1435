// AUTO-DRAFTED regression-harness invariant stub — 2026-07-29T13:51:09.610Z
// Origin: gate 'drawing:plan_render_coherence' FAILED on class 'formula_e_front_mgu', routed to fix-stage: settle-loop stale-render wipe + generate_drawing_set _align_plan_render_to_manifest + draw_ga data-placement-fp (plant: 01-top; product: 00-hero cutaway).
// Loss recurrence in the ledger: 4  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432  @ b035e736c
// Detail: renders: general-arrangement.svg is still plant-style PLAN — product/instrument GA must lead with FRONT (door removed · looking in OR product form · Blender exterior OR cover removed · assembly internals)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'settle-loop stale-render wipe + generate_drawing_set _align_plan_render_to_manifest + draw_ga data-placement-fp (plant: 01-top; product: 00-hero cutaway)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'FORMULA_E_FRONT_MGU.drawing_plan_render_coherence_regression',
  description: "drawing:plan_render_coherence must pass for formula_e_front_mgu (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage settle-loop stale-render wipe + generate_drawing_set _align_plan_render_to_manifest + draw_ga data-placement-fp (plant: 01-top; product: 00-hero cutaway) and promote into regression-harness.tsx',
}
