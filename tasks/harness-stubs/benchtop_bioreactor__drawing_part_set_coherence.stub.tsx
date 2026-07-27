// AUTO-DRAFTED regression-harness invariant stub — 2026-07-22T22:50:33.834Z
// Origin: gate 'drawing:part_set_coherence' FAILED on class 'benchtop_bioreactor', routed to fix-stage: draw_ga.load_manifest() — GA derives its tag set from parts-manifest.json directly; a PHANTOM (tag on GA absent from manifest) means a stale SVG; a DROPPED part (manifest tag absent from GA) means the placer omitted a part or the generator skipped a class — fix at the source (draw_ga or parts-manifest settle loop).
// Loss recurrence in the ledger: 1
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/organoid-bioreactor-20260722-2335  @ de39b3445
// Detail: general-arrangement: part-set INCOHERENT — 0 phantom(s) + 25 dropped: manifest principal tag(s) absent from GA: I-101, I-102, I-103, I-104, I-105, I-106 …
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'draw_ga.load_manifest() — GA derives its tag set from parts-manifest.json directly; a PHANTOM (tag on GA absent from manifest) means a stale SVG; a DROPPED part (manifest tag absent from GA) means the placer omitted a part or the generator skipped a class — fix at the source (draw_ga or parts-manifest settle loop)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'BENCHTOP_BIOREACTOR.drawing_part_set_coherence_regression',
  description: "drawing:part_set_coherence must pass for benchtop_bioreactor (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage draw_ga.load_manifest() — GA derives its tag set from parts-manifest.json directly; a PHANTOM (tag on GA absent from manifest) means a stale SVG; a DROPPED part (manifest tag absent from GA) means the placer omitted a part or the generator skipped a class — fix at the source (draw_ga or parts-manifest settle loop) and promote into regression-harness.tsx',
}
