# Stage RL Manifest — PDF Engine v2

> Prepared as preparation for the stage-agnostic RL ladder.
> Source of truth: `src/lib/pdf-engine-v2/index.ts` (pipeline orchestrator).
> Do not edit without re-auditing against `index.ts`.

---

## Pipeline Stage Table

| Stage | `trackStage` key in `index.ts` | Prompt file / location | Output key in `PipelineState` | Existing RL script | Council scores it? | Ready for RL framework? |
|---|---|---|---|---|---|---|
| Training Data Dump | `training_data` | Inline `systemPrompt` in `stages/0-training-data.ts` | `(transient)` — dossier string passed to downstream, not stored on state | `scripts/stage-rl-loop.sh` (generic) | N — council scores `Research` as proxy | **N** — prompt hardcoded inline; dossier not on state so no direct scorer target |
| Brief Generation | `brief_generation` | Inline `BRIEF_SYSTEM_PROMPT` constant in `stages/0-brief-generation.ts` | `state.generatedBrief` (`GeneratedBrief`) | `src/lib/pdf-engine-v2/brief-rl-iterate.ts` + `scripts/brief-rl-loop.sh` | Y — `Brief` section in council | **Y** — structured output, council scores `Brief`, RL iterate script exists |
| Research | `research` | `RESEARCH_SYNTHESIS_SYSTEM` in `src/lib/pdf-engine-v2/prompts.ts` | `state.research` (`ResearchResult`) | `scripts/stage-rl-loop.sh` (generic) | Y — `Research` section in council | **Y** — prompt in dedicated file, structured JSON output, council scores |
| Brief Revision | _(loop, not tracked)_ | Inline `REVISION_PROMPT` constant in `stages/3.5-brief-revision.ts` | `state.briefRevisions[]` (via `as any`) | None | N — no council section for revisions | **N** — not tracked as a stage; output shape is untyped `as any` on state; no council scorer |
| Feasibility Gate | _(not LLM; deterministic)_ | `src/lib/pdf-engine-v2/feasibility-gate.ts` (rule-based, no prompt) | `state.feasibility` (via `as any`) | `scripts/feasibility-rl-loop.sh` + `scripts/feasibility-full-rl-loop.sh` + `src/lib/pdf-engine-v2/feasibility-rl-iterate.ts` | Y — `Feasibility` section in council | **N** — deterministic, no LLM prompt to evolve; council scores output but there is nothing to RL-train |
| Feasibility Advisor | _(stub — not wired)_ | `stages/1.5-feasibility-advisor.ts` (DEFERRED, throws) | Not wired | None | N | **N** — not implemented |
| Decompose | `decompose` | `MODULE_DECOMPOSITION_SYSTEM` in `src/lib/pdf-engine-v2/prompts.ts` | `state.modules` (`Module[]`) | `src/lib/pdf-engine-v2/decompose-rl-iterate.ts` + `scripts/decompose-rl-loop.sh` | Y — `Modules` section in council | **Y** — prompt in dedicated file, structured typed output, council scores, iterate script exists |
| Size + Layout | `size_layout` | `stages/3-size-layout.ts` (fully deterministic rule-based solver, no LLM prompt) | `state.dimensionSheet` (`DimensionSheet`) | `scripts/sizing-rl-loop.sh` + `src/lib/pdf-engine-v2/sizing-rl-iterate.ts` | Y — `Sizing` section in council | **N** — deterministic solver with no LLM prompt; RL scripts score council output but cannot evolve a prompt |
| BOM + Cost | `bom_cost` | `BOM_GENERATION_SYSTEM` in `src/lib/pdf-engine-v2/prompts.ts` | `state.parts` (`Part[]`), `state.bomLines` (`BomLine[]`), `state.costBreakdown` (`CostBreakdown`) | `scripts/stage-rl-loop.sh` (generic) | Y — `BOM` + `Cost` sections in council | **Y** — prompt in dedicated file, structured typed output, two council sections |
| Suppliers | `suppliers` | `stages/5-suppliers.ts` — no LLM prompt; uses semantic embedding + Brave Search | `state.suppliers` (`SupplierMatch[]`) | `scripts/stage-rl-loop.sh` (generic) | Y — `Suppliers` section in council | **N** — no LLM prompt to evolve; matching is embedding-based + search-based |
| Review (Fang + Proofreader) | `review` | Inline prompt string inside `fangReview()` in `stages/6-review.ts`; separate inline prompt inside `proofread()` in same file | `state.reviews` (`SpecialistReview[]`), `state.proofreadFindings` (`string`) | `scripts/stage-rl-loop.sh` (generic) | Y — `Risks` as proxy for review; `Proofreader` scored deterministically (excluded from council per code comment) | **N (partial)** — Fang prompt hardcoded inline; proofreader output is free-text string (unstructured); `Proofreader` excluded from council; two separate prompts in one file need splitting |
| Polish | _(not tracked by trackStage)_ | Inline `POLISH_SYSTEM_PROMPT` constant in `stages/7-polish.ts` | `state.modules` (overwrites in-place) | None | N — no council section | **N** — prompt hardcoded inline; overwrites modules in-place rather than writing to a distinct state key; no scorer |
| PDF Render | `pdf` (manual push) | `stages/7-pdf.tsx` (React/PDF renderer, no LLM) | `EngineResult.pdf` (base64 blob, not on state) | None | N | **N** — not an LLM stage; output is a binary blob |

---

## Council Sections vs Pipeline Stages

Sections the production council scores with LLM judges (from `council-scorer.ts` line 139):

```
ExecutiveSummary, Brief, Feasibility, BOM, Cost, Suppliers, Risks, Regulatory, Sizing, Modules, Research
```

Sections scored **deterministically** (length/keyword heuristics only):
```
Proofreader, AuditLog
```

Council section → pipeline stage mapping (from `stage-rl-iterate.ts`):

| Council section | Pipeline stage |
|---|---|
| `Research` | `training_data`, `research` |
| `Brief` | `brief_generation` |
| `Modules` | `decompose` |
| `Sizing` | `size_layout` |
| `BOM`, `Cost` | `bom_cost` |
| `Suppliers` | `suppliers` |
| `Risks` | `review` |
| `Feasibility` | Feasibility gate (deterministic) |
| `Regulatory` | Extracted inside `research` stage (no separate stage) |
| `ExecutiveSummary` | Derived from full state, no dedicated stage |
| `Proofreader` | Sub-function of `review` stage |
| `AuditLog` | Constructed from `EngineResult.stages`, not `PipelineState` |

---

## Findings

### Prompts hardcoded inline — must be extracted before per-stage RL is possible

1. **`stages/0-training-data.ts`** — `systemPrompt` is a template literal inside `runTrainingDataDump()`. No exported constant.
2. **`stages/0-brief-generation.ts`** — `BRIEF_SYSTEM_PROMPT` is a module-level constant but lives in the stage file, not `prompts.ts`. Low friction to move.
3. **`stages/3.5-brief-revision.ts`** — `REVISION_PROMPT` is a module-level constant inside the stage file.
4. **`stages/6-review.ts`** — Two prompts: `fangReview()` builds a template-literal prompt inline at call time (interpolates module fields); `proofread()` builds a separate inline prompt. Neither is extractable as a static constant without refactoring the interpolation.
5. **`stages/7-polish.ts`** — `POLISH_SYSTEM_PROMPT` is a module-level constant but lives in the stage file.

`BRIEF_PARSING_SYSTEM` and `REGULATORY_EXTRACTION_SYSTEM` exist in `prompts.ts` but are **not imported anywhere in the active pipeline** — they appear to be legacy artefacts from an earlier architecture.

### Stages where the production council does not score the output at all

1. **`training_data`** — No council section. Scored only as a contributor to `Research`.
2. **`brief_revision`** — Not a tracked stage; no council section; output on `state` via `as any`.
3. **`polish`** — No council section; overwrites `state.modules` in-place making it invisible to the scorer as a distinct stage.
4. **`pdf`** — Not an LLM stage; no scoring applicable.
5. **`feasibility_advisor`** — Not wired; stub only.

### Stages where the output shape is too unstructured to score reliably

1. **`proofreadFindings`** (`state.proofreadFindings`) — Plain `string`. The council comment in `council-scorer.ts` notes it is `string | null, often null` and thus the council scores it 1 on empty data. Needs a structured output schema (e.g. `{ findings: Array<{ module, issue, severity }> }`) before RL is viable.
2. **`training_data` dossier** — Concatenated free-text string from up to 3 models; never persisted on `PipelineState` (transient variable only). No structured key to score against.
3. **`review.reviews`** — `SpecialistReview[]` is typed but the council maps this stage to `Risks` (the risk matrix on `state.modules`), not to `state.reviews` directly. The connection is indirect.

### Pipeline stages in `index.ts` not in Tristan's expected list

- **`training_data`** (Stage 0a) — parallel to `brief_generation` (Stage 0b), both run before Research.
- **`brief_revision`** — feedback loop between Feasibility and Brief; not listed as a named stage in the original brief but is present in the code.
- **`polish`** — final prose pass on modules; runs after council scoring but before PDF; not tracked with `trackStage`.
- **`feasibility_advisor`** (Stage 1.5) — stub file exists but is explicitly deferred and never called.

### Stages present in `index.ts` but absent from the HTML diagram

Could not load `file:///Users/tristanfischer/Downloads/pdf-engine-pipeline.html` via WebFetch (local `file://` URLs are not accessible to this tool). Cross-check between HTML and `index.ts` was not possible. Tristan should verify manually.

---

## Summary Counts

| Category | Count |
|---|---|
| Total active pipeline stages (tracked or significant) | 13 |
| Stages with LLM prompt | 8 |
| Stages ready for new RL framework (Y) | 3 — `brief_generation`, `research`, `decompose`, `bom_cost` |
| Stages needing prep work before RL | 9 |

> "Ready" = prompt in a dedicated file or easily extractable, structured typed output, and council scores the output.
> `bom_cost` counts as ready; it has two council sections (`BOM` + `Cost`) and the prompt is in `prompts.ts`.
> Corrected count: **4 stages ready** (`brief_generation`, `research`, `decompose`, `bom_cost`).
