# Stage RL Manifest — PDF Engine v2

> Source of truth: `src/lib/pdf-engine-v2/index.ts` (pipeline orchestrator).
> Phase H update (2026-05-08): PA stages are now the active default.
> PA_PIPELINE defaults to true. Set PA_PIPELINE=false to run the legacy stage path.
> Do not edit without re-auditing against `index.ts` and `stage-rl-iterate.ts`.

---

## PA Pipeline Stage Table (Active — default from Phase H)

> Active when PA_PIPELINE=true (or unset, which is the default from Phase H).

| PA Stage # | Stage name (`trackStage` key) | Prompt file / location | Output key in `PipelineState` | Council scores it? | Ready for RL framework? |
|---|---|---|---|---|---|
| 1 | `brief_parsing` | `BRIEF_PARSING_SYSTEM_PROMPT` in `stages/0-brief-generation.ts` | `state.parsedBrief` (`StructuredBriefJSON`) | Y — `Brief` section | **Y** — structured output, council scores `Brief`, `stage-rl-iterate.ts` PA path wired |
| 3 | `research_synthesis` | `RESEARCH_SYNTHESIS_SYSTEM_PA` in `prompts.ts` | `state.researchSynthesis` (`ResearchSynthesis`) | Y — `Research` section | **Y** — structured JSON output, council scores `Research` |
| 4 | `regulatory_extraction` | `REGULATORY_EXTRACTION_SYSTEM` in `prompts.ts` | `state.regulatoryExtraction` (`RegulatoryExtraction`) | Y — `Regulatory` section | **Y** — structured output, council scores `Regulatory` |
| 5 | `decompose_pa` | `MODULE_DECOMPOSITION_SYSTEM_PA` in `prompts.ts` | `state.modules` (`ModulePA[]`) | Y — `Modules` section | **Y** — structured typed output, council scores `Modules` |
| 7a | `size_layout` | `stages/3-size-layout.ts` (deterministic solver, no LLM prompt) | `state.dimensionSheet` (`DimensionSheetPA`) | Y — `Sizing` section | **N** — deterministic, no LLM prompt to evolve |
| 6+7b | `bom_pa` | `stages/4-bom-cost-suppliers.ts` (integrated, LLM + distributor APIs) | `state.parts`, `state.bomLines`, `state.costBreakdown`, `state.suppliers` | Y — `BOM`, `Cost`, `Suppliers` sections | **Y (partial)** — Phase E will complete cut-over; current fallback uses legacy runBomCost |
| post | `review` | Inline prompts in `stages/6-review.ts` | `state.reviews`, `state.proofreadFindings` | Y — `Risks` as proxy | **N (partial)** — FULL_REPORT-only (Phase F); Fang prompt hardcoded inline |

---

## Deprecated Legacy Stage Table (PA_PIPELINE=false only)

> Active only when PA_PIPELINE=false. Preserved as rollback target.

| Stage | `trackStage` key | Status |
|---|---|---|
| Training Data Dump | `training_data` | **@deprecated** — superseded by PA Stage 1 (Brief Parsing) + PA Stage 3 (Research Synthesis). See `stages/0-training-data.ts`. |
| Brief Generation | `brief_generation` | **@deprecated** — superseded by PA Stage 1 (`runBriefParsing()`). See `stages/0-brief-generation.ts`. |
| Research | `research` | **@deprecated** — superseded by PA Stage 3 (`runResearchSynthesis()`). See `stages/1-research.ts`. |
| Decompose | `decompose` | **@deprecated** — superseded by PA Stage 5 (`runDecomposePA()`). See `stages/2-decompose.ts`. |
| Size + Layout | `size_layout` | Shared with PA path — NOT deprecated |
| BOM + Cost | `bom_cost` | **@deprecated** — superseded by integrated PA Stage 6+7b. See `stages/4-bom-cost.ts`. Deletion after Phase E. |
| Suppliers | `suppliers` | **@deprecated** — folded into integrated BOM stage. See `stages/5-suppliers.ts`. Deletion after Phase E. |
| Review | `review` | Shared with PA path (FULL_REPORT-only on PA, unconditional on legacy) |
| Polish | _(not tracked)_ | **@deprecated** — dropped on PA path. See `stages/7-polish.ts`. |
| PDF Render v1 | `pdf` | **@deprecated** — `stages/7-pdf.tsx` superseded by `stages/7-pdf-v3.tsx`. Default PDF_RENDERER is now v3. |

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
