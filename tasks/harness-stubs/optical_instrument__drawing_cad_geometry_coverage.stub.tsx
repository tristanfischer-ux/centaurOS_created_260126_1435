// AUTO-DRAFTED regression-harness invariant stub — 2026-07-13T07:57:08.910Z
// Origin: gate 'drawing:cad_geometry_coverage' FAILED on class 'optical_instrument', routed to fix-stage: cad_asset_resolver DB-first cache + seed_internal_cad_assets + build_universal_scene family imports.
// Loss recurrence in the ledger: 13  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/colorimeter-20260713-0819  @ b0fffe058
// Detail: renders: no verified CAD family geometry recorded — product remains primitive-only
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'cad_asset_resolver DB-first cache + seed_internal_cad_assets + build_universal_scene family imports', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'OPTICAL_INSTRUMENT.drawing_cad_geometry_coverage_regression',
  description: "drawing:cad_geometry_coverage must pass for optical_instrument (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage cad_asset_resolver DB-first cache + seed_internal_cad_assets + build_universal_scene family imports and promote into regression-harness.tsx',
}
