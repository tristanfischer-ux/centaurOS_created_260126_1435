# Dead State-Field Audit — ForgeOS PDF-Engine Chain

**Date:** 2026-05-23
**Method:** static `grep` across `scripts/**` + `src/**` (worktrees excluded). No subprocesses run.
**Source file:** `scripts/serial-design-chain-v2.tsx` (chain) + 7 subprocess scripts that mutate `state.json`.
**Consumers checked:**
- `scripts/render-minimal-pdf.tsx` (~6.5k lines — primary state consumer)
- `scripts/audit-pdf-run.ts` (post-render auto-audit)
- `scripts/regression-harness.tsx`
- `scripts/audit-iter62.tsx`, `scripts/flash-audit-iter62.tsx` (historic, one-off)
- `scripts/pdf-engine-worker.mjs` (worker — builds DB snapshot, uploads state.json)
- `src/lib/pdf-engine-v2/{design-decisions-review,performance-card,class-price-bands}.ts`
- `scripts/brief-prose-validate-repair.tsx`, `scripts/cross-module-validate-repair.tsx`, `scripts/render-radical-from-snapshot.ts`, `scripts/extract-state-urls.tsx`, `scripts/retro-validate-*.tsx`

## Summary

| Category | Count |
|---|---|
| **LIVE** (written + read by ≥1 consumer) | 27 |
| **DEAD** (written but NO read anywhere — candidate for deletion) | 8 |
| **WRITE-ONLY-LOG** (written only for `state.json` / DB diagnostic; no logic consumer) | 7 |

## DEAD fields — safe to delete

These are written by the chain (or a subprocess) but **no code reads them anywhere**. Recommended for deletion unless ops explicitly want them in `state.json` for forensics.

| Field | Write site (file:line) | Verdict | Recommendation |
|---|---|---|---|
| `state.physicsRepair` | `scripts/serial-design-chain-v2.tsx:3379` | DEAD | **Delete**. The local `physicsRepairResult` is already serialised into `actions.jsonl` via `logAction` (line ~2728). The state field is redundant. |
| `state.cost_reality_band` | `scripts/serial-design-chain-v2.tsx:3904` | DEAD | **Delete**. The data is also stored inside `state.cost_reality_rejection` (which IS read by the renderer's G2 badge), so removing the standalone field loses nothing. |
| `state.cost_reality_verdict` | `scripts/serial-design-chain-v2.tsx:3937` | DEAD | **Delete**. Duplicate of `state.cost_reality.verdict`, which the worker + renderer DO read. The top-level field is shadowed and never accessed. |
| `state.partVerificationSummary.with_price_estimate` | `scripts/serial-design-chain-v2.tsx:3757` | DEAD | **Delete**. Added 2026-05-19 in re-stamp block; renderer and `design-decisions-review.ts` only read `total/verified/stripped/uncertain/skipped`. |
| `state.partVerificationSummary.with_engine_b_class` | `scripts/serial-design-chain-v2.tsx:3758` | DEAD | **Delete**. Same as above. |
| `state.partVerificationSummary.with_engine_c_flag` | `scripts/serial-design-chain-v2.tsx:3759` | DEAD | **Delete**. Same as above. |
| `state.partVerificationSummary.engine_c_out_of_range` | `scripts/serial-design-chain-v2.tsx:3760` | DEAD | **Delete**. Same as above. |
| `state.toolsUsedPage` (top-level, initial) | `scripts/serial-design-chain-v2.tsx:3356` | AMBIGUOUS — see note | The renderer reads `state?.toolsUsedPage` (line 5976) AND `state?.orchestratorResult?.tools_used_page` (line 5978). Treat as LIVE for safety — the renderer's `state?.toolsUsedPage` branch fires when orchestrator path is unused. |

**Net dead count: 7 deletable fields** (8th — `toolsUsedPage` — reclassified ambiguous, see below).

## WRITE-ONLY-LOG fields — keep for ops diagnostic

These are written but only consumed for diagnostics (DB snapshot column, `state.json` storage forensics, audit harness counts). No production code path uses them. Keep as-is unless storage cost matters.

| Field | Write site | Consumed where | Recommendation |
|---|---|---|---|
| `state.gatesPassed` | `serial-design-chain-v2.tsx:3398` | `pdf-engine-worker.mjs:439` writes it into the `state_snapshot_json` DB column for fast list-page filtering. | **Keep.** Worker uses it. |
| `state.savedAt` | `serial-design-chain-v2.tsx:3432` + haltState 2789 | `pdf-engine-worker.mjs:455` for DB snapshot column. | **Keep.** Worker reads it. |
| `state.suppliers_provenance` | `enrich-state-with-suppliers.tsx:2543` | Mentioned ONLY in a comment in `render-minimal-pdf.tsx:5496` ("preserved for diagnostics"). No code consumes it. | **Keep** (small payload, useful for supplier audit). Or delete if storage tight. |
| `state.g3_review_gaps` | `serial-design-chain-v2.tsx:3975` | `pdf-engine-worker.mjs:449` only reads `Array.isArray(parsed.g3_review_gaps) ? parsed.g3_review_gaps.length : 0` (count for snapshot). The renderer's G3 badge reads `g3ManualReview` boolean — never the gaps array itself. | **Keep** — worker uses the length. Could be reduced to just a count, but the gaps[] payload is small. |
| `state.partVerificationSummary.recommendations_total` | `serial-design-chain-v2.tsx:3371, 3752` | Only `scripts/audit-iter62.tsx:96` (one-off historic audit). | **Keep** or delete — depends on whether the iter62 audit harness is still useful. Production renderer + design-decisions-review do NOT read this. |
| `state.partVerificationSummary.recommendations_unknown` | `serial-design-chain-v2.tsx:3372, 3753` | Same — only `audit-iter62.tsx:97`. | Same as above. |
| `state.haltReason` | `serial-design-chain-v2.tsx:2788` (haltState, exit 3 path) | Never read. The whole haltState is preserved purely for ops forensics after a G0.5 HALT. | **Keep** — it's the human-readable explanation of why the chain exited 3, useful when investigating a failed run from `state.json`. |

## LIVE fields — referenced for confidence

Confirmed READ by at least one production consumer (renderer / worker / src/lib helper / regression-harness as a hard invariant). Listed here to bound the audit:

- `projectId` (renderer line 6258 + estimate-missing-prices.tsx 172 + audit scripts)
- `parsedBrief` (renderer + design-decisions-review + class-price-bands + performance-card + audit + regression)
- `moduleDecomposition` (renderer pervasively + design-decisions-review + performance-card + audit + regression)
- `naturalLanguageLayer` (render-minimal-pdf:6262 + cross-module-validate-repair:356)
- `orchestratorContract` (audit-pdf-run + regression-harness + performance-card)
- `briefOverviewProse` (render-minimal-pdf:2892 + brief-prose-validate-repair:76)
- `keyMetrics` (renderer + class-price-bands + estimate-missing-prices + audit + retro-validate)
- `brief` (renderer 2627/5603/6333/6405-6410 + design-decisions-review)
- `designDecisions` (renderer + design-decisions-review + audit-iter62 + flash-audit-iter62)
- `partVerifications` (renderer 4561+ + regression-harness + Engine B/C mutate it)
- `partRecommendations` (renderer 4561/4719/6357 + extract-state-urls + flash-audit-iter62)
- `partVerificationSummary` (renderer 4563 + design-decisions-review:218 + flash-audit-iter62)
- `physicsCritique` (renderer + design-decisions-review + audit + cover-page-cards)
- `physicsLedger` (renderer ManualReviewBadge collector)
- `complianceGate` (renderer + design-decisions-review + worker for `g1b_verdict`)
- `briefTargetReconciliation` (regression-harness + design-decisions-review)
- `performanceCard` (renderer + audit-pdf-run + design-decisions-review)
- `grammarVerdicts` (design-decisions-review:236 + render-radical-from-snapshot:81)
- `g5ManualReview`, `g5UnverifiedParts` (renderer ManualReviewBadge collector)
- `g3ManualReview` (renderer 1485 + worker 448)
- `acceptanceStatus` (renderer 2032/6325 + design-decisions-review + audit-iter62 + worker 438)
- `engineeringContract` (renderer 885/1096/2068/6178 + audit-pdf-run + performance-card + regression)
- `deploymentEnvelope` (renderer — read via `state.deploymentEnvelope`)
- `cost_reality` (renderer 1641 + worker `bom_total_gbp`/`verdict` + design-decisions-review)
- `cost_reality_status` (renderer 1428/1644)
- `cost_reality_rejection` (renderer 1634)
- `suppliers` (renderer SuppliersPage + worker `supplier_archetype_count` + regression)
- `engine_c_summary` (renderer CoverPage 6325)
- `brief_hero_image_path` (renderer + regression)
- `blender_cover_image_path` (regression-harness:450 — invariant check)
- `module_image_paths` (renderer 5790-ish)
- `cost_repair_summary` (regression-harness 305/425)
- `supplier_validation_summary` (regression-harness 318/426)
- `state.moduleDecomposition.{g4ManualReview, k10ShadowResult, k10EnforcingResult, k10ManualReview, k10ManualReviewEdges}` — these are augmented on the `design` object reference at lines 2925/3007/3020/3288, NOT on state root. Renderer falls back through both paths (e.g. `state?.moduleDecomposition?.k10ShadowResult ?? state?.k10ShadowResult`). LIVE via the moduleDecomposition path.

## Ambiguity flags — manual eye recommended

1. **`state.toolsUsedPage` (top-level)** — written at chain line 3356 and read at renderer 5976. But the renderer ALSO reads `state?.orchestratorResult?.tools_used_page` as alternative (line 5978). If the orchestrator now ALWAYS populates `orchestratorResult.tools_used_page`, the top-level `toolsUsedPage` may be redundant. Recommend tracing one production run to see which branch fires.

2. **`state.suppliers_provenance`** — only "consumed" by a code comment. Decision call: keep for ops forensics, or drop to save state.json payload size. No production reader.

3. **`state.partVerificationSummary.recommendations_total` / `recommendations_unknown`** — only the historic `audit-iter62.tsx` reads them. If iter62 is dead tooling, these become WRITE-ONLY-LOG with no consumer at all.

4. **`state.cost_reality_verdict`** vs `state.cost_reality.verdict` — both written at the same step. The standalone top-level appears redundant. Verify no external dashboard / downstream tool reads the flat field. Best guess: safe to delete.

5. **haltState fields (line 2778)** — every field in haltState is shared with the main state object, so they're individually classified above. The whole haltState pathway only fires on G0.5 halt (exit 3) and produces state.json for ops. None of these are LIVE for renderer purposes (the renderer never runs after exit 3), but they're not dead either — they're WRITE-ONLY-LOG diagnostics for a failed-run state.json.

## Recommendation: deletion plan

**Safe to delete immediately (no consumer, no diagnostic value):**

1. `state.physicsRepair` — duplicate of action-log entry
2. `state.cost_reality_band` — superset of `cost_reality_rejection` data
3. `state.cost_reality_verdict` (top-level duplicate of `cost_reality.verdict`)
4. `state.partVerificationSummary.with_price_estimate`
5. `state.partVerificationSummary.with_engine_b_class`
6. `state.partVerificationSummary.with_engine_c_flag`
7. `state.partVerificationSummary.engine_c_out_of_range`

**Verify before deletion (low-effort grep):**

8. `state.toolsUsedPage` — if orchestratorResult.tools_used_page is always populated when orchestrator runs, the top-level field is dead.

**Keep but consider DB-snapshot inlining:**

- `state.gatesPassed`, `state.savedAt` — worker copies into DB column anyway; could be derived rather than persisted in state.json if storage matters. Low priority.
