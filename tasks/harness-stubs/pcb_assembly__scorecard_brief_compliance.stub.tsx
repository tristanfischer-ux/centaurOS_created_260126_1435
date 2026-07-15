// AUTO-DRAFTED regression-harness invariant stub — 2026-07-12T12:55:20.287Z
// Origin: gate 'scorecard:brief_compliance' FAILED on class 'pcb_assembly'.
// Loss recurrence in the ledger: 3  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/colorimeter-pcbtest  @ 0d5c58a9a
// Detail: section brief_compliance=5/10 after 8 iters; defects: UNVERIFIED (hard): optical_path_length_mm — target 10 mm; no delivered contract quantity matches by name + unit family | UNVERIFIED (soft): min_wavelength_nm — target 430 nm; no delivered contract quantity matches by name + unit family | UNVERIFI
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage '?', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'PCB_ASSEMBLY.scorecard_brief_compliance_regression',
  description: "scorecard:brief_compliance must pass for pcb_assembly (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage ? and promote into regression-harness.tsx',
}
