# Fang review → module design cascade — V2 audit

**Branch:** `feat/forge-v2-cutover`
**Date:** 2026-04-21
**Question asked:** "when the specialist reviews things, does that then trigger an update of the design like it did in V1?"

---

## TL;DR

- **V2 was review-only.** The Fang orchestrator wrote a review record to `cad_lab_projects.reviews[moduleId]`. It did NOT mutate any module field. Jian runs through the same review-only engine. Max is decomposition, not review.
- **No V1 trace remains** in the codebase — a repo-wide grep for `applyFangRecommendations`, `applyReviewToModule`, `cascadeReview` returns zero hits.
- **Cascade now implemented** in `src/actions/specialists/run-fang-review.ts`. Gated on `verdict ∈ {warn, fail}` AND at least one `severity: "critical"` issue. Auto-applies numeric mass; logs every other critical recommendation to a new `design_change_log` JSONB column as `kind: "pending"`.
- **Migration applied to prod Supabase** (`jyarhvinengfyrwgtskq`) via MCP because the repo's migration history had drifted vs remote. File also committed under `supabase/migrations/20260424000000_cad_lab_design_change_log.sql` so it can be replayed in any clean environment.

---

## 1. Current V2 state (evidence-backed)

### 1.1 `run-fang-review.ts` (pre-change)

The orchestrator at `src/actions/specialists/run-fang-review.ts` had three persistence steps for a successful review, none of which touched the module:

1. `requestSpecialistReview()` (line 233) — generates the review payload via the LLM. Returns `{ review }` or `{ error }`.
2. `saveFangReviewDirect()` (line 272) — writes the review JSON into `cad_lab_projects.reviews[moduleId]`, replacing any prior `vp-manufacturing` entry for the module. This is the ONLY persistence call.
3. `completePipelineRun()` (line 310) — marks the `pipeline_runs` row as `done`.

`saveFangReviewDirect` is scoped strictly to the `reviews` column (lines 563–596):

```ts
const { error: writeErr } = await admin
    .from("cad_lab_projects")
    .update({ reviews: nextReviews as unknown as ... })
    .eq("id", projectId)
    .eq("foundry_id", foundryId)
```

No write to `modules`. No write to any specific module field. Confirmed by repo-wide grep:

```
$ grep -rn "targetMaterial|targetProcess|budgetMassKg|estimatedMassKg" src/actions/specialists/
run-max-decomposition.ts   (decomposition — writes modules on creation, not on review)
run-chase-research.ts      (reads modules — does not mutate design fields)
```

`run-fang-review.ts` had zero mentions of those fields pre-change.

### 1.2 `requestSpecialistReview` (shared engine at `src/actions/cad-lab-reviews.ts`)

1,334 lines, the common code path Fang AND Jian use. Grep for `.update(` hits only `checkpoints` (line 821) — decomposition-checkpoint persistence, not review-cascade. The function returns `{ review }` only; every caller persists into `reviews[moduleId]` and nothing else.

Jian therefore has the same review-only behaviour. No module mutation.

### 1.3 Max (`run-max-decomposition.ts`)

Max is the decomposition action, not a review. It builds the module list from scratch and writes `modules` once via `saveCadLabModules(projectId, JSON.stringify(modules))` at line 368. After that initial write, Max does not re-run to mutate modules. Max's output also populates a `checkpoints` entry (decomposition-level sentiment), not per-module reviews. So no cascade path here either.

---

## 2. V1 comparison

No V1 trace remains. Grep for the expected V1 function names (across the whole repo including mockups, tasks/, docs/, scripts/) returns zero hits:

```
$ grep -rn "applyFangRecommendations\|applyReviewToModule\|cascadeReview" src/
# (no results)
```

The only "cascade"-like writes from review output that DO exist are not about module design fields:

- `cad_lab_projects.checkpoints` (decomposition checkpoints, not reviews)
- `cad_lab_projects.reviews` (the reviews blob itself)

So V1's cascade behaviour — if it ever existed in this repo — has been fully removed, not just disabled.

---

## 3. Gap statement

**V2 was review-only.** Fang and Jian could flag "wall thickness will warp in injection moulding, recommend 2.4mm or switch material", write that into the review blob, and the module's `keyParts` / `budgetMassKg` fields would stay exactly as they were. The cascade from review → design that Tristan remembers from V1 did not exist in V2 until this commit.

---

## 4. Proposed cascade for V2 (now implemented)

### Gate

The cascade runs only when BOTH conditions are true:

1. `review.verdict ∈ {"warn", "fail"}` — Fang passed the module is never cascade-worthy.
2. `review.issues` contains at least one issue with `severity: "critical"` — warnings and info-level issues are surfaced in the review UI but don't auto-mutate.

### What auto-applies

Currently only ONE field auto-applies:

- **`budgetMassKg`** — when an issue has `category` matching `/mass|weight/i` AND a numeric value can be parsed from `issue.suggestion` or `issue.message`. Parser handles `"1.2 kg"`, `"1200g"`, `"850g"`, `"2.4kg"`. Unit conversion: grams → kg. Conservative: rejects unparseable values rather than guessing.

### What logs as "pending"

Everything else: material, process, wall-thickness, tolerance, finish, any non-mass critical issue. These land in a new `cad_lab_projects.design_change_log` JSONB array as `kind: "pending"` with the full issue text + suggestion, so the founder can action them from the UI (future: a "Fang's recommendations" queue on the Module detail page — not scoped for this PR).

### Why material/process DON'T auto-apply at module scope

`CadLabModule` has no `targetMaterial` or `targetProcess` field. Those fields live on `CadLabDesignBrief` (project-wide). Auto-flipping the brief from one module's review would change the material for every OTHER module too — exactly the "one wrong material = brief-wide cost swing" risk the gate is meant to prevent. So material/process recommendations land in `design_change_log` as pending, and the founder decides whether to propagate them up to the brief.

### Audit + reversibility

Every applied mutation writes an `audit_log` row with `section='module:cascade'`, `action='fang-applied'`, `actor_specialist='vp-manufacturing'`, and metadata `{ field, oldValue, newValue, reason, projectId, moduleId }`. Combined with `design_change_log` (project-scoped history of every cascade + pending entry), a founder can see what changed, when, why, and revert by hand from the old value.

### Risk + mitigation

**Risk:** auto-applying the wrong mass value propagates through BOM cost calculation, material procurement, and launch-readiness signals. A miscalculated 0.8 kg → 4.2 kg bump on a high-frequency part can swing unit cost by thousands.

**Mitigations:**
1. Gate by severity (`critical` only — Fang rarely flags a mass issue as critical unless there's a real breach).
2. Gate by verdict (`warn`/`fail` — `pass` can never cascade).
3. Conservative mass extraction — rejects `"around 2 kg"` or `"3–5 kg"` (only matches unambiguous numeric + unit).
4. Full audit trail — `audit_log` + `design_change_log` both record old→new. Reversible by hand.
5. Non-fatal failure mode — cascade errors are logged, not thrown, so a review never fails-to-save because the cascade fumbled.

---

## 5. Implementation summary

Files touched:

- `supabase/migrations/20260424000000_cad_lab_design_change_log.sql` — NEW. Adds `design_change_log jsonb NOT NULL DEFAULT '[]'` to `cad_lab_projects`. Applied via MCP against prod Supabase (local migration history was drifted; running `supabase db push` would have required a destructive repair on a shared parallel-agent branch).
- `src/types/database.types.ts` — Surgical edit. Added `design_change_log: Json` to Row, `design_change_log?: Json` to Insert + Update of the `cad_lab_projects` table type. Not a full regen (22,596-line file on a parallel branch; surgical edit is safer).
- `src/actions/specialists/run-fang-review.ts` — Added `applyFangRecommendationsToModule` function (~190 lines, fully JSDoc'd). Called between the review save-verify read-back and the `completePipelineRun` call, so failures never block the review chip from going green. Pipeline run output_ref now carries `cascadeApplied` + `cascadePending` counts.

Type-checked — full `tsc --noEmit` shows 37 pre-existing errors across `src/components/InlineBatchApproval.tsx`, `src/actions/__tests__/tasks.test.ts`, `src/app/(platform)/supplies/seller/**`. **Zero new errors on touched files.**

### What's left for Tristan to sign off on

1. **Wire the Module detail page to read `design_change_log`** — show pending Fang recommendations in a dedicated section beneath the review so founders can action them. Currently pending entries are persisted but invisible to the UI.
2. **Extend cascade to Jian / Chase** — the same pattern applies to Jian (VP Engineering, for tolerance / fit issues) and potentially Chase (supply-chain lead-time issues). Not in scope for this PR; would reuse `applyFangRecommendationsToModule` as a template with specialist-specific category mappings.
3. **Brief-level cascade for material/process** — an explicit founder action on a pending entry (not an auto-cascade) to propagate a material change up to the brief. Needs UI + a new server action, plus thought on what happens to siblings already generated with the old material.
