// AUTO-DRAFTED regression-harness invariant stub — 2026-07-08T02:17:20.879Z
// Origin: gate 'drawing:qty_coverage' FAILED on class 'aquaculture_ras', routed to fix-stage: contract qty-N replication + parts-manifest expansion.
// Loss recurrence in the ledger: 327  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/b3-replay  @ 6ac59cae7
// Detail: pid: tank: contract qty 30, parts-manifest has 2 instance(s) (need ≥24)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'contract qty-N replication + parts-manifest expansion', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'AQUACULTURE_RAS.drawing_qty_coverage_regression',
  description: "drawing:qty_coverage must pass for aquaculture_ras (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage contract qty-N replication + parts-manifest expansion and promote into regression-harness.tsx',
}
