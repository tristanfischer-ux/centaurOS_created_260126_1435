# Strict PA Adoption Migration Plan — PDF Engine v2

**Status:** PLANNING ONLY — no code changes  
**Date:** 2026-05-08  
**Reference:** `~/Downloads/prompt_architecture.pdf` (24 pages, PA hereafter)  
**Reference output:** `~/Downloads/bess_engineering_report.pdf` (BESS-40FT-LFP-001, Rev A)  
**Current orchestrator:** `src/lib/pdf-engine-v2/index.ts`  
**Target:** Restructure the 14-stage pipeline to match the 10-stage PA architecture strictly, preserving all accumulated capability.

---

## The Core Decision (2026-05-08)

Tristan has decided to adopt the PA strictly: re-plumb the engine so stages execute in PA order, drop stages with no PA equivalent, and rewrite stage prompts to match the PA prompt schemas. The key ordering change is **Brief Parsing FIRST, Research SECOND**, so Research receives a structured brief JSON and can constrain its market synthesis against known product constraints rather than re-inferring them from raw text.

This is not a cosmetic change. It restructures the causal chain of the pipeline.

---

## Section 1 — Stage Mapping Table

The current pipeline has 14 active stages (counting both v1 BOM path and the in-flight v2 integrated BOM path as one entry, plus Polish as a separate unlabelled stage). The table below covers every stage visible in `index.ts`.

> **Current stage numbering** is based on order of execution in `index.ts`, not filenames. Filenames use an older numbering scheme that no longer matches execution order.

| # | Current stage name | `trackStage` key / file | Maps to PA stage | Migration verdict | Justification |
|---|---|---|---|---|---|
| — | Product Classification (deterministic, runs before Stage 1) | `classifyProduct()` in `product-classifier.ts`, no trackStage | **PA Stage 2 — Product Classification** | **KEEP + RELOCATE** — move to run AFTER Brief Parsing (PA Stage 1). Currently it runs on raw brief text before any parsing; in PA it runs on the structured brief JSON from Stage 1. | PA spec: "Input is the product_description and constraints from Stage 1." Deterministic lookup table stays identical; only its input changes. |
| — | Brief Validation (runs pre-Research, post-Classification) | `validateBrief()`, no trackStage | Absorbed into **PA Stage 1** (Brief Parsing flags `missing_mandatory_fields`) | **FOLD INTO PA Stage 1** | PA Stage 1 already includes a `missing_mandatory_fields` array and `confidence` field. The separate `validateBrief()` call and `brief-validator.ts` logic can be folded: the Brief Parser's structured output drives the same downstream gate that `briefValidation.isValid` currently controls. Keep `brief-validator.ts` as the deterministic checker that reads parsed brief fields rather than raw text. |
| — | Supplier DB grounding load (`loadAllGroundingData`) | No trackStage | Shared library call — persists as-is | **KEEP as orchestrator pre-load** | Not a pipeline stage; a DB warm-up. Stays in the orchestrator preamble. |
| 1 | Training Data Dump | `training_data` / `stages/0-training-data.ts` | **(no PA equivalent)** | **DROP** | PA Brief Parsing (Stage 1) extracts structured constraints from raw text; PA Research Synthesis (Stage 3) receives the structured brief and is expected to generate market context, competitor landscape, and timing rationale from its own parametric knowledge. The Training Data Dump's purpose — seeding downstream stages with domain knowledge — is now met by Research consuming the structured brief. The dossier string is transient and never stored on `PipelineState`; dropping it simplifies the orchestrator without removing any persisted artefact. **Mitigation:** the Research prompt must be strengthened (per PA Stage 3 schema) to fill the gap; the PA's source-grading system (Grade E for LLM-generated claims, `claims_requiring_verification` field) replaces the Training Data Dump's [HIGH]/[MEDIUM]/[LOW] confidence tagging. |
| 2 | Brief Generation | `brief_generation` / `stages/0-brief-generation.ts` | **PA Stage 1 — Brief Parsing** | **REWRITE + REORDER (runs FIRST)** | The current stage runs third (after Classification and Training Data), uses a 5-section formatted template, and writes `state.generatedBrief`. PA Stage 1 is the pipeline's first step, runs on raw user text, and outputs a strict `StructuredBriefJSON` schema (project_id, product_description, mission_statement, target_customers, why_now, constraints{}, missing_mandatory_fields, confidence). The current prompt must be replaced with the PA Stage 1 prompt. The output type changes from `GeneratedBrief` to `StructuredBriefJSON`. The downstream merge into `state.research.designBrief` is replaced by a clean handoff of `StructuredBriefJSON` directly to Classification (Stage 2) and Research (Stage 3). |
| 3 | Research | `research` / `stages/1-research.ts` | **PA Stage 3 — Research Synthesis** | **REWRITE + REORDER** | Currently runs second (before Brief Generation), consumes raw brief text + Training Data dossier, and outputs a mixed `ResearchResult` that embeds `designBrief`, `regulatory`, and `sources` alongside `report`. In PA, Research is Stage 3, receives the `StructuredBriefJSON` from Stage 1, and outputs structured JSON: `market_context`, `why_now`, `competitors[]`, `research_sources[]`, `source_grade_overall`, `claims_requiring_verification`. The PA output schema is tighter: competitors are structured with specific fields; all claims are tagged Grade E; `claims_requiring_verification` forces self-flagging of invented statistics. The current `extractResearchConstraints()` post-processing call is **dropped** — the PA Brief Parser already extracts all constraints deterministically. |
| — | Research Constraint Extraction (`extractResearchConstraints`) | Post-Research call in `index.ts`, no trackStage | Subsumed by **PA Stage 1** | **DROP** | Constraints are now captured deterministically at Brief Parsing. The Research stage outputs market context only, not constraint re-extraction. |
| — | Brief Sync to DesignBrief (merge in orchestrator) | Inline merge code in `index.ts`, no trackStage | Eliminated by clean Brief Parsing output | **DROP** | The current merge exists because Brief Generation runs after Research and must reconcile two constraint sources. When Brief Parsing runs first and Research receives the structured brief, there is only one constraint source. The merge code is deleted. |
| 4 | Feasibility Gate (pre-decompose, early version) | `determineFeasibility()` in `index.ts` preamble, no trackStage | **PA Stage 8 — Feasibility Gate** | **REORDER — moves to after Sizing + Cost** | Currently the pipeline runs Feasibility twice: once before Decompose (to catch RED briefs early) and would run again after Cost (once cost is known). PA runs it once, after all data stages (1-7) are complete. The early pre-Decompose gate is replaced by Brief Parsing's `missing_mandatory_fields` check, which blocks the pipeline if mandatory fields are absent. The full Feasibility Gate runs as PA Stage 8 with all check results (BOM population, cost, layout, sourcing, brief completeness, safety, regulatory). |
| 5 | Brief Revision loop | `stages/3.5-brief-revision.ts`, no trackStage | **(no explicit PA Stage)** — relates to PA self-assessment "No rebrief loop" | **OPEN QUESTION — see Section 6, Q1** | PA acknowledges the absence of a rebrief loop as a gap ("When the cost feasibility check failed, I manually generated four cost-reduction paths"). The current loop runs post-Feasibility; in PA the Feasibility Gate would trigger a rebrief loop if it did not exist. Tristan must decide: preserve the loop (placing it between PA Stage 8 and Stage 9) or drop it in favour of showing cost reduction paths in the FEASIBILITY_EXCEPTION report. |
| 6 | Decompose (Module Decomposition) | `decompose` / `stages/2-decompose.ts` | **PA Stage 5 — Module Decomposition** | **REWRITE** | Current prompt in `prompts.ts` (`MODULE_DECOMPOSITION_SYSTEM`) produces modules with `keyParts: string[]`, `riskMatrix[]`, and no maturity field. PA Stage 5 schema requires: `modules[].expected_parts[]` (with `name`, `quantity`, `role`), `modules[].interfaces[]` (typed), `modules[].failure_modes[]` (with `cause` — "Unknown" is NOT acceptable), `modules[].estimated_mass_kg`, `modules[].estimated_dimensions_mm`, `modules[].estimated_lead_time_weeks`, `modules[].maturity` (CONCEPTUAL/PRELIMINARY/ENGINEERING). The PA also enforces 6-12 modules, each must have at least one interface with another module, and every module must have at least one expected part. The current Training Data dossier input is dropped. |
| 7a | Size + Layout | `size_layout` / `stages/3-size-layout.ts` | **PA Stage 7a — Sizing Solver** | **KEEP + SCHEMA EXTEND** | The current stage is already deterministic code (no LLM prompt — correct per PA). The `run_sizing_solver()` function signature matches PA's spec closely. The PA adds required output fields: `zones[]` (named zones with length/volume/mass/contents), `volumeUtilisationPct`, `massUtilisationPct`, `clearanceNotes`, `massMarginNote`, `externalDimensionsMm`, `internalDimensionsMm`, `tareMassKg`, `availablePayloadMassKg`. The current `DimensionSheet` type must be extended (14 new fields per RENDERER-REDESIGN.md §3.4). The `NEVER use generic_room for non-generic products` critical rule from PA is already implemented via `normaliseDomain()` in `3-size-layout.ts`. |
| 7b | BOM + Cost (v1: `4-bom-cost.ts`) | `bom_cost` / `stages/4-bom-cost.ts` | **PA Stage 6 (BOM Generation) + PA Stage 7b (Cost Computation)** | **FOLD — superseded by v2 integrated stage** | PA Stage 6 combines LLM part generation + optional catalogue lookup. PA Stage 7b is deterministic cost computation. The in-flight v2 integrated stage (`stages/4-bom-cost-suppliers.ts`) already implements this fusion (BOM_PIPELINE=v2 flag). Migration accelerates cut-over of the integrated stage. |
| 7b | BOM + Cost + Suppliers (v2: `4-bom-cost-suppliers.ts`) | `bom_cost_suppliers` / `stages/4-bom-cost-suppliers.ts` | **PA Stage 6 + PA Stage 7b** | **ACCELERATE + COMPLETE** | The v2 integrated stage design (BOM-COST-SUPPLIERS-INTEGRATION-DESIGN.md) is already aligned with PA Stage 6's architecture: real part families, source grading, null-safe cost (null ≠ £0). The PA BOM Generation prompt schema must be adopted: `bom_rows[].part_name`, `quantity`, `quantity_unit`, `unit_cost` (null = unknown), `make_or_buy`, `candidate_suppliers[]`, `source_grade`, `cost_basis`, `lead_time_weeks`, `risk_flag`. The PA rule "null means unknown, zero means free" is already documented in the v2 design. |
| — | Suppliers (v1: `5-suppliers.ts`) | `suppliers` / `stages/5-suppliers.ts` | **Folded into PA Stage 6 (BOM Generation)** | **DROP (v1 path only)** | PA Stage 6 produces "Priced BOM rows with suppliers and source grades" — suppliers are part of BOM output, not a separate stage. The v2 integrated stage already implements this. The v1 `5-suppliers.ts` stage is retained only as the rollback target while the v2 flag is not yet the default. Once v2 is cut-over (Phase E below), `5-suppliers.ts` is deleted. |
| 8 | Review (Fang + Proofreader) | `review` / `stages/6-review.ts` | **(no direct PA equivalent — PA has no review stage)** | **DEMOTE to post-pipeline service** | PA has no dedicated Review or Proofreader stage in its 10-stage pipeline. The Feasibility Gate (Stage 8) is the PA's quality checkpoint. Review adds latency without a PA mandate. Options: (a) retain as a post-pipeline optional service called only on FULL_REPORT; (b) fold FMEA review into Module Decomposition (Stage 5) where failure modes are generated. **Recommendation:** retain Review as a post-Feasibility-Gate optional service, skipped on FEASIBILITY_EXCEPTION and BRIEF_INCOMPLETE reports. Proofreader output moves to the Audit Log. See Section 6, Q2. |
| 9 | Council Scoring | `runCouncilScoring()` in `index.ts`, commit 52bc2e61 | **(no PA equivalent — ForgeOS-specific quality layer)** | **KEEP as post-pipeline service (PROTECTED)** | Council scoring is a ForgeOS investment (commit 52bc2e61 fixed 5 blockers). It has no PA equivalent but it is the primary quality signal driving the RL loop. It runs after all data stages, making it pipeline-stage-independent. Relocate to after Stage 8 (Feasibility Gate), calling it only when the pipeline reaches FULL_REPORT status. The council's 18-class persona mapping and GPT-5.4 judge remain unchanged. |
| 10 | Deterministic Scoring (`scoreAllSections`) | `scoreAllSections()` in `index.ts` | **(no PA equivalent)** | **KEEP as post-pipeline scoring call** | Complements council scoring. No change. |
| 11 | Reference Report Scoring (`scoreReport`) | `scoreReport()` + `computeCompoundScore()` in `index.ts` | **(no PA equivalent)** | **KEEP as post-pipeline scoring call** | The compound score (rubric × 0.4 + council × 0.6) is the headline quality metric. No change. |
| 12 | Polish | `stages/7-polish.ts`, no trackStage | **(no PA equivalent — PA separates content from renderer)** | **DROP from pipeline; consider moving to renderer** | PA's key principle is "The LLM never sees the PDF. It produces data. The renderer consumes data." The Polish stage overwrites `state.modules` in-place with LLM-polished prose, violating this separation. In the new architecture, the renderer produces readable output from structured data; there is no LLM prose pass on top. The Polish stage is dropped. If prose quality is insufficient, the Module Decomposition prompt (PA Stage 5) must be strengthened to produce better `technical_description` content directly. |
| 13 | PDF Render | `stages/7-pdf.tsx` (v1) / `stages/7-pdf-v3.tsx` (in-flight v3) | **PA Stage 10 — Renderer** | **KEEP (v3 target); v1 kept during transition** | PA Stage 10 is deterministic: all data from previous stages, all rendering as functions that consume data. The in-flight BESS-style renderer (`7-pdf-v3.tsx` / RENDERER-REDESIGN.md) is the correct target. PA adds Stage 9 (Report Type Router) which determines which renderer path executes. |
| — | Report Type Router | Not implemented | **PA Stage 9 — Report Type Router** | **NEW — build as deterministic lookup** | PA Stage 9 maps Feasibility Gate output to report type (FULL_REPORT / FEASIBILITY_EXCEPTION / BRIEF_INCOMPLETE) and page budget. Currently this logic is scattered in the orchestrator's if/else branches (`RED`, `BRIEF_INCOMPLETE`, happy path). Centralise into a `routeReportType()` function that replaces the inline conditionals. |
| — | RL Loop Framework | `stage-rl-iterate.ts` + `stages/` RL scripts, commit d3bc6089 | **(no PA equivalent — ForgeOS-specific)** | **KEEP (PROTECTED)** | The stage-agnostic growing-window RL framework (commit d3bc6089) is independent of pipeline order. After migration, the RL manifest (`STAGE-RL-MANIFEST.md`) must be updated to reflect new PA stage names and order. |
| — | Parallel Baseline Runner | `scripts/` + commit 11f6138b | **(no PA equivalent — ForgeOS-specific)** | **KEEP (PROTECTED)** | 4-way parallel baseline runner is independent of pipeline order. No change except updating stage names in any hardcoded references. |

### Consolidated PA → current mapping (reverse view)

| PA Stage | PA Name | Type | Current implementation | Gap |
|---|---|---|---|---|
| 1 | Brief Parsing | LLM | `stages/0-brief-generation.ts` | Wrong output schema, wrong position in pipeline |
| 2 | Product Classification | Deterministic | `product-classifier.ts` | Currently runs before Brief Parsing; input must change from raw text to structured brief |
| 3 | Research Synthesis | LLM | `stages/1-research.ts` | Runs before Brief Parsing; receives raw text instead of structured brief; output schema differs |
| 4 | Regulatory Extraction | LLM | Embedded in `stages/1-research.ts` (`RESEARCH_SYNTHESIS_SYSTEM` prompt) | Not a separate stage; `RegulatoryItem` schema missing 5 PA fields; absorbed into Research output |
| 5 | Module Decomposition | LLM | `stages/2-decompose.ts` | Missing `expected_parts[].quantity/role`, `interfaces[]` typed, maturity enum, dimension estimates |
| 6 | BOM Generation | LLM + catalogue | `stages/4-bom-cost-suppliers.ts` (v2 in-flight) | PA BOM schema not yet adopted; catalogue lookup path (Mouser/Farnell/Digi-Key) exists |
| 7a | Sizing Solver | Deterministic | `stages/3-size-layout.ts` | Missing 14 output fields (zones, utilisation %, dimension splits) |
| 7b | Cost Computation | Deterministic | `cost-model.ts` + `stages/4-bom-cost.ts` | Missing structured overhead lines, NRE items array, reduction paths array |
| 8 | Feasibility Gate | Deterministic | `feasibility-gate.ts` | Missing PA's structured `checks[]` array with machine IDs; currently returns `FeasibilityResult` with different shape |
| 9 | Report Type Router | Deterministic | Inline if/else in `index.ts` | Not a named function; logic scattered |
| 10 | Renderer | Deterministic | `stages/7-pdf-v3.tsx` (in-flight) | BESS-style redesign is in-flight but not yet default |

---

## Section 2 — Accumulated Capabilities Preservation Register

Every capability listed here must survive the migration. None are dropped without Tristan's explicit sign-off.

### 2.1 Distributor API Aggregator

**Where it lives:** `src/lib/pdf-engine-v2/lib/distributors/index.ts` — `findSkuForPart()` queries Mouser + Digi-Key + Farnell in parallel; LCSC stub at `distributors/lcsc.ts` being added.

**What it does:** Best-price selection across three distributors, in-stock filtering, MOQ check, fallback chain (distributor → heuristic → LLM estimate → null).

**In the new architecture:** Owned by PA Stage 6 (BOM Generation). The v2 integrated stage (`4-bom-cost-suppliers.ts`) already routes all Buy lines through `findSkuForPart()`. No change to the aggregator itself. The LCSC stub, once complete, is added to the aggregator call without touching the migration.

**Risk if lost:** Buy parts fall back to LLM cost estimates (Grade D→E), destroying cost credibility.

---

### 2.2 Supplier Corpus — 13,771 Suppliers in Nightshift SQLite

**Where it lives:** `~/Library/Application Support/com.fractionalforge.nightshift/nightshift.db` accessed via `lib/local-corpus.ts` — `semanticSupplierSearch()`.

**What it does:** OpenAI 1536-dim embedding search over 13,771 UK/EU suppliers. Enriched with domain tags, process capabilities, page-chunk snippets via `lib/page-chunks.ts`. Used in Stage 5 (v1) and the v2 integrated stage for Make parts.

**In the new architecture:** Owned by PA Stage 6 (BOM Generation), specifically the Make-part supplier matching sub-task within the integrated stage. The 3-supplier enforcement rule (exactly 3 per Make BOM line, padded with sentinel entries) from BOM-COST-SUPPLIERS-INTEGRATION-DESIGN.md §5.2 is preserved.

**Risk if lost:** Make parts have no supplier shortlist; the report cannot demonstrate sourcing feasibility.

---

### 2.3 FMEA Enforcement in Module Decomposition

**Where it lives:** `stages/2-decompose.ts` → `validateFmea()` in `lib/fmea-validator.ts`. The current prompt produces `module.riskMatrix[]` (mapped from LLM `failure_modes[]`).

**What it does:** Validates that every failure mode has a cause (not "Unknown"), a consequence, and a severity/likelihood/detection triplet. Blocks modules that emit FMEA without causes.

**In the new architecture:** PA Stage 5 (Module Decomposition) requires `failure_modes[].cause` with the explicit rule "Unknown is not acceptable." The PA schema maps directly onto the current `validateFmea()` check. The validator is retained and the decompose prompt is strengthened. The `RiskRow` type is extended with `status` (OPEN/CLOSED/IN_PROGRESS), `gradeOverride`, and `moduleId` fields per RENDERER-REDESIGN.md §3.7.

**Risk if lost:** FMEA section degrades to generic failure modes with no causes — the known failure pattern in the heat pump report.

---

### 2.4 Reverse Process/Material Indexes

**Where it lives:** `lib/reverse-indexes.ts` — `buildReverseIndexes()`, `companiesByProcess()`, `companiesByMaterial()`. Pre-built from the Nightshift corpus. ~35k process keys, ~14k material keys per TRACKER.md estimates.

**What it does:** Enables supplier search by manufacturing process or material rather than by semantic similarity alone. Boosts suppliers that match the specific process/material combination required for a Make part.

**In the new architecture:** Still owned by Stage 6 BOM/Supplier matching. The `tagIntersectionBoost()` and reverse index boost chain in the integrated stage is preserved. No change.

**Risk if lost:** Make-part supplier matching degrades to pure semantic similarity, which rewards large suppliers over capable niche ones.

---

### 2.5 Council Scorer — 18-Class Persona Mapping + GPT-5.4 Judge

**Where it lives:** `council-scorer.ts`, commit 52bc2e61. Three judges: Grok 4.3, MiMo V2.5-Pro, GLM-5.1. Aggregates per-criterion scores, not overall scores. 18-class persona mapping drives judge framing.

**What it does:** Post-pipeline quality scoring. 11 sections scored by LLM judges; 2 scored deterministically. The compound score (rubric × 0.4 + council × 0.6) is the primary quality signal.

**In the new architecture:** Runs after PA Stage 8 (Feasibility Gate), only on FULL_REPORT paths. The 18 section names in `JUDGING_CRITERIA` must be updated if section names change (e.g., "Brief" maps to PA "Brief Parsing", "Modules" maps to "Module Decomposition"). The lineage violation (MiMo V2.5-Pro used as both a content generator and a judge) should be fixed when the Research stage model is updated — but that is a separate concern from this migration.

**Risk if lost:** Lose the primary quality signal driving the RL loop. The baseline runner and RL framework would have nothing to optimise against.

---

### 2.6 Stage RL Loop Framework

**Where it lives:** `stage-rl-iterate.ts`, `brief-rl-iterate.ts`, `decompose-rl-iterate.ts`, `feasibility-rl-iterate.ts`, `sizing-rl-iterate.ts`, commit d3bc6089.

**What it does:** Growing-window RL: iterates a prompt variant against the council scorer, keeps changes that improve the score, rolls back regressions. Stage-agnostic framework callable against any council-scored section.

**In the new architecture:** No structural change needed. After migration, update `STAGE-RL-MANIFEST.md` to reflect new stage names. The RL scripts reference stage names in shell variables — update those string references only. The framework logic is untouched.

**Risk if lost:** Lose the ability to iteratively improve PA-conformant prompts. Must be preserved.

---

### 2.7 Parallel Baseline Runner

**Where it lives:** `scripts/` directory, commit 11f6138b. Runs 4 briefs in parallel and collects scoring data.

**What it does:** Enables regression testing across briefs after each prompt change. Race-safe output filenames. Scores are written to `~/Downloads/engine-evidence/`.

**In the new architecture:** No structural change needed. Works against any pipeline configuration. Update the brief list if new test briefs are added for PA-era products.

---

### 2.8 Per-Cell Deterministic Quantity Derivation

**Where it lives:** `lib/quantity-derivation.ts` — `deriveQuantities()`, `applyOverrides()`. Uses `lib/spec-extraction.ts` — `extractSpecs()`, `summariseSpecs()`.

**What it does:** Extracts product specs from the brief (e.g., MWh capacity → cell count → rack count) and overrides LLM-guessed quantities with deterministic derivations. Prevents the "BESS with 3 cells" hallucination.

**In the new architecture:** Still owned by Stage 6 (BOM Generation). The integrated v2 stage passes `productSpecs` from `extractSpecs()` through to `deriveQuantities()`. After migration, `extractSpecs()` receives the structured brief JSON from PA Stage 1 (more reliable than parsing raw text) — a quality improvement at zero cost.

**Risk if lost:** LLM guesses quantities; BOM contains wrong cell/rack counts. Cost is wrong.

---

### 2.9 Domain-Specific Product Classifier — 18 Classes

**Where it lives:** `product-classifier.ts` — `classifyProduct()`. Covers: `haps`, `auv`, `drone`, `ev_charger`, `bioreactor`, `edge_ai_server`, `wearable_medical`, `pcb_assembly`, `energy_storage`, `vertical_farm`, `heat_pump`, `motor_controller`, `defense_optics`, `surgical_robot`, `satellite`, `industrial_robot`, `power_electronics`, `generic`.

**What it does:** Deterministic keyword/regex classification. Drives solver selection (`iso_container_layout` vs `thermal_system_layout` etc.), minimum BOM row thresholds, required-parts manifest selection, domain tags for supplier search.

**In the new architecture:** PA Stage 2 (Product Classification) is a deterministic lookup — identical to the current implementation. The only change: it now receives the structured brief's `product_description` and `constraints` from Stage 1, not raw text. The 18-class taxonomy expands to cover the PA's sample CLASSIFICATION_MAP (which lists `heat_pump`, `battery_storage`, `drone`, `motor_controller`, `generic` as examples — our 18-class set is a superset). No classes are removed.

---

### 2.10 Brief Revision / Feasibility-Driven Re-Brief Loop

**Where it lives:** `stages/3.5-brief-revision.ts`. Current loop runs after Feasibility Gate; max 2 iterations.

**What it does:** When Feasibility finds RED/AMBER constraints, proposes feasible alternatives (adjusted cost ceiling, mass, production volume) and re-runs Feasibility.

**In the new architecture:** PA self-assessment acknowledges this as a gap ("No rebrief loop"). It is not defined in the 10-stage spec but is explicitly identified as a desirable feature. Tristan must decide whether to preserve it (placed between PA Stage 8 and Stage 9) or replace it with static cost reduction paths in the FEASIBILITY_EXCEPTION report. See Section 6, Q1.

---

### 2.11 Required Parts Manifest

**Where it lives:** `lib/required-parts-manifest.ts` — `REQUIRED_PARTS`, `checkRequiredParts()`. Product-class-specific required part lists.

**What it does:** After BOM generation, checks that mandatory parts (e.g., battery management system for `energy_storage`) are present. Flags missing parts for the PDF renderer.

**In the new architecture:** Remains a post-BOM-generation check within Stage 6. No change to the manifest logic. The PA's rule "Every module from Stage 5 must have at least one BOM row" provides the analogous check at the module level; the required-parts manifest provides the class-level check. Both are preserved.

---

### 2.12 Scoring History + Dashboard

**Where it lives:** `lib/scoring-history.ts` — `recordScoringRun()`, `deriveBriefLabel()`. Writes to `~/Downloads/engine-evidence/scoring-dashboard.html`.

**What it does:** Records per-run compound scores, council judge breakdowns, and status codes (PIPELINE_ERROR, INFEASIBLE, BRIEF_INCOMPLETE, etc.) to a cross-run history. Generates a self-refreshing HTML dashboard.

**In the new architecture:** No change. The `status` field vocabulary may expand (e.g., add `FEASIBILITY_EXCEPTION` as a status code to match PA Stage 9 report types). The `recordScoringRun()` call sites in the orchestrator are preserved.

---

## Section 3 — PipelineState Schema Migration

### 3.1 Old → New Field Mapping

| Current field on `PipelineState` | Status | New location / action |
|---|---|---|
| `briefText` | **KEEP** — raw user text always stored verbatim | Unchanged |
| `research` (`ResearchResult`) | **RESTRUCTURE** — `ResearchResult` splits into two PA outputs | `state.parsedBrief` (`StructuredBriefJSON`, PA Stage 1) + `state.researchSynthesis` (`ResearchSynthesis`, PA Stage 3). The old `state.research.designBrief` is replaced by `state.parsedBrief.constraints`. The old `state.research.regulatory` moves to `state.regulatoryExtraction` (PA Stage 4 output). |
| `research.report` (`string`) | **MOVE** | → `state.researchSynthesis.market_context` + `state.researchSynthesis.why_now` |
| `research.designBrief` (`DesignBrief`) | **REPLACE** | → `state.parsedBrief` (`StructuredBriefJSON`) is the new single source of truth |
| `research.sources[]` (`SourceCitation[]`) | **MOVE + EXTEND** | → `state.researchSynthesis.research_sources[]`. Add `sourceGrade: 'A'|'B'|'C'|'D'|'E'` to `SourceCitation`. |
| `research.designBrief.regulatory[]` | **MOVE + EXTEND** | → `state.regulatoryExtraction` (new top-level field). `RegulatoryItem` extended with 5 PA fields: `sourceGrade`, `versionDate`, `claimType`, `verificationStatus`, `jurisdiction`. |
| `generatedBrief` (`GeneratedBrief`) | **REPLACE** | Removed. Superseded by `state.parsedBrief` (`StructuredBriefJSON`). |
| `researchConstraints` (`ResearchConstraints`) | **DROP** | Constraints now live in `state.parsedBrief.constraints`. The separate constraint extraction call is eliminated. |
| `modules[]` (`Module[]`) | **EXTEND** | Add `maturity: 'CONCEPTUAL'|'PRELIMINARY'|'ENGINEERING'`, `statusNote: string`, `keySpecifications[]`, `bomRows: number`, `estimatedCostGbp: number|null` per RENDERER-REDESIGN.md §3.5. Keep `status` field unchanged for pipeline compatibility. |
| `dimensionSheet` (`DimensionSheet`) | **EXTEND** | Add 14 fields per RENDERER-REDESIGN.md §3.4: `zones[]`, `volumeUtilisationPct`, `massUtilisationPct`, `externalDimensionsMm`, `internalDimensionsMm`, `tareMassKg`, `availablePayloadMassKg`, `clearanceNotes`, `massMarginNote`. |
| `parts[]` (`Part[]`) | **KEEP (backwards compat)** | Populated from `IntegratedBomLine[]` by the v2 BOM stage output adapter. |
| `bomLines[]` (`BomLine[]`) | **KEEP (backwards compat)** | Assembly hierarchy. Not changed. |
| `costBreakdown` (`CostBreakdown`) | **EXTEND + KEEP (backwards compat)** | Keep existing fields. Add `overheadLines[]`, `nreItems[]`, `reductionPaths[]`, `perModule[].pctOfBom`, `perModule[].grade`, `ceilingExceededBanner` per RENDERER-REDESIGN.md §3.6. |
| `suppliers[]` (`SupplierMatch[]`) | **KEEP (backwards compat)** | Populated from `IntegratedBomLine.suppliers` by the v2 stage output adapter. |
| `reviews[]` (`SpecialistReview[]`) | **KEEP** — Review stage demoted but output preserved | No change to type. Populated only on FULL_REPORT path. |
| `proofreadFindings` (`string|null`) | **KEEP** — demote from pipeline to post-pipeline | No type change. |
| `sectionScores[]` | **KEEP** | No change. |
| `sourceAttributions[]` | **KEEP + SUPPLEMENT** | Kept for backwards compat. New `pipelineTrace[]` and `pipelineSourceSummary[]` supplement (not replace) them. |
| `llmAttributions[]` | **KEEP** | No change. |
| `pipelineError` | **KEEP** | No change. |
| `productClass` | **KEEP** | No change. |
| `briefRevisions[]` (via `as any`) | **FORMALISE or DROP** | If Brief Revision loop is preserved (Q1), add `briefRevisions: BriefRevision[]` to the `PipelineState` interface. If dropped, remove the `as any` cast. |
| `feasibility` (via `as any`) | **FORMALISE + EXTEND** | Add `FeasibilityResult` to `PipelineState` interface (remove `as any`). Extend with `checks[]` (PA structured check array), `reportType`, `actionRequired` per RENDERER-REDESIGN.md §3.1. |

### 3.2 New Types to Define

```typescript
// PA Stage 1 output
interface StructuredBriefJSON {
  project_id: string
  product_description: string
  mission_statement: string
  target_customers: string
  why_now: string
  constraints: {
    unit_cost_ceiling: { value: number | null; currency: 'GBP'|'USD'|'EUR'; source: 'user'|'inferred' }
    max_mass_kg: { value: number | null; source: 'user'|'inferred' }
    max_dimensions_mm: { w: number|null; d: number|null; h: number|null; source: 'user'|'inferred' }
    target_performance: { key_metric: string; value: number; unit: string; source: 'user'|'inferred' }
    target_process: { value: string | null; source: 'user'|'inferred' }
    target_material: { value: string | null; source: 'user'|'inferred' }
    batch_size: { value: number | null; source: 'user'|'inferred' }
    design_life: { value: string | null; source: 'user'|'inferred' }
    operating_environment: { temp_min_c: number; temp_max_c: number; source: 'user'|'inferred' }
    safety_standards: Array<{ standard: string; source: 'user'|'inferred' }>
    additional_constraints: Array<{ description: string; source: 'user'|'inferred' }>
  }
  missing_mandatory_fields: string[]
  confidence: 'HIGH'|'MEDIUM'|'LOW'
}

// PA Stage 3 output
interface ResearchSynthesis {
  market_context: string
  why_now: string
  competitors: Array<{
    company: string
    product: string
    pricing: string
    key_specs: string
    strengths: string[]
    weaknesses: string[]
    differentiation_angle: string
  }>
  research_sources: Array<{
    title: string
    type: 'standard'|'market_report'|'datasheet'|'competitor_spec'|'government_policy'
    year: number
    relevance: string
    source_grade: 'A'|'B'|'C'|'D'|'E'
  }>
  source_grade_overall: 'E'  // always E — LLM-generated synthesis
  claims_requiring_verification: string[]
}

// PA Stage 4 output (currently embedded in ResearchResult)
interface RegulatoryExtraction {
  regulatory_entries: Array<RegulatoryItem>  // RegulatoryItem extended with 5 new fields
}

// PA Stage 9 output
type ReportType = 'FULL_REPORT' | 'FEASIBILITY_EXCEPTION' | 'BRIEF_INCOMPLETE'
interface ReportTypeRouterResult {
  reportType: ReportType
  pageBudget: number | null  // null = no limit (FULL_REPORT)
  sectionsToRender: string[]
}
```

### 3.3 Backwards Compatibility Strategy

Two pipelines coexist during migration: the current pipeline (`PDF_RENDERER=v1`, `BOM_PIPELINE=v1`) and the new PA-conformant pipeline (`PDF_RENDERER=v3`, `BOM_PIPELINE=v2`). Strategy:

1. **Additive schema changes only.** All new fields on `PipelineState` are optional during transition. Old pipeline runs populate `undefined`; the v3 renderer has null-safe fallbacks that display "—" for missing fields.
2. **Old fields are not renamed.** `state.research` continues to exist during the transition period. New fields (`state.parsedBrief`, `state.researchSynthesis`, `state.regulatoryExtraction`) are added alongside.
3. **Dual-write during transition.** The new Brief Parsing stage writes to both `state.parsedBrief` (new) and synthesises a compatible `state.research.designBrief` (old) so the v1 renderer continues to work. This dual-write is removed when v1 is retired.
4. **Feature flags control which pipeline runs.** `PA_PIPELINE=true` activates PA Stage 1 (Brief Parsing first) and the new stage ordering. `PA_PIPELINE=false` (default) runs the existing order.
5. **Types file has union approach.** Where a field changes shape, use a union type and narrow at call sites: `state.parsedBrief ?? synthesiseFromResearch(state.research)`.

---

## Section 4 — Phased Migration Plan

### Phase A: Brief Parsing as New Stage 1

**Goals:** Build the PA Stage 1 Brief Parsing stage. It must run first, on raw brief text, and output `StructuredBriefJSON`. Brief Validation's gate logic is absorbed. The output replaces `state.generatedBrief` and begins populating `state.parsedBrief`.

**Files changed:**
- `stages/0-brief-generation.ts` — rewrite prompt to match PA Stage 1 schema (drop 5-section template, adopt `StructuredBriefJSON` output). Rename function to `runBriefParsing()`. Keep filename for now.
- `types.ts` — add `StructuredBriefJSON` interface; add `parsedBrief?: StructuredBriefJSON` to `PipelineState`.
- `index.ts` — move `runBriefParsing()` call to the top of the pipeline (before Classification). Add PA_PIPELINE env flag. On `PA_PIPELINE=true`, dual-write to both `state.parsedBrief` and synthetic `state.research.designBrief`.
- `brief-validator.ts` — update to read `parsedBrief.missing_mandatory_fields` when `parsedBrief` is present.

**Dependencies:** None — Phase A is the foundation.

**Sub-agent dispatch brief (1 Sonnet):** "Rewrite `stages/0-brief-generation.ts` to implement PA Stage 1 Brief Parsing. Replace the 5-section template prompt with the PA Stage 1 system prompt (from prompt_architecture.pdf pages 4-5). The function signature changes to `runBriefParsing(rawBriefText: string): Promise<StageResult<StructuredBriefJSON>>`. Add `StructuredBriefJSON` to `types.ts` matching the PA schema exactly. Add `parsedBrief?: StructuredBriefJSON` to `PipelineState`. Update `index.ts` to call `runBriefParsing()` first (before Classification) when `process.env.PA_PIPELINE === 'true'`. Dual-write: synthesise a `DesignBrief` from `parsedBrief.constraints` for backwards compat with the existing renderer. Do not change the existing `runBriefGeneration()` function — it is the fallback when `PA_PIPELINE` is false. Write a passing unit test against the BESS brief fixture."

**Estimated Sonnet hours:** 3–4

**Verification criteria:**
- `runBriefParsing()` produces valid `StructuredBriefJSON` against the BESS brief fixture.
- `parsedBrief.constraints.unit_cost_ceiling.value` === 180000 for the BESS brief.
- `parsedBrief.missing_mandatory_fields` is empty for the BESS brief.
- `PA_PIPELINE=false` runs run the existing pipeline with no regression (baseline scores unchanged).
- `PA_PIPELINE=true` run produces an identical council score ±0.5 to the PA=false run.

**Cutover strategy:** `PA_PIPELINE=true` env var, Vercel Preview only. Production stays on `PA_PIPELINE=false` until Phase C lands.

**Rollback plan:** Delete `PA_PIPELINE=true` env var. The existing `runBriefGeneration()` path is untouched and continues to be the default.

---

### Phase B: Reorder Research to Consume Brief Parsing

**Goals:** Move Research to run after Brief Parsing (and after Classification). Research now receives `StructuredBriefJSON` as its user-turn input instead of raw brief text. The Research prompt is rewritten to match PA Stage 3 (structured output: `market_context`, `why_now`, `competitors[]`, `research_sources[]`, `claims_requiring_verification`). Training Data Dump is no longer passed to Research.

**Files changed:**
- `stages/1-research.ts` — rewrite `runResearch()` to accept `StructuredBriefJSON` (not `briefText: string`). Adopt PA Stage 3 output schema. Update `callOpenRouter()` to use new prompt. Remove `extractResearchConstraints()` (it becomes redundant — constraints are in the brief already).
- `types.ts` — add `ResearchSynthesis` interface; add `researchSynthesis?: ResearchSynthesis` to `PipelineState`.
- `prompts.ts` — update `RESEARCH_SYNTHESIS_SYSTEM` to match PA Stage 3 prompt. The current prompt calls for structured JSON output for the PDF; the new prompt calls for the PA JSON schema.
- `index.ts` — on `PA_PIPELINE=true`: pass `state.parsedBrief` to `runResearch()` instead of `briefText`. Remove `extractResearchConstraints()` call. Remove the brief-sync merge block. Dual-write `state.research` from `state.researchSynthesis` for backwards compat.

**Dependencies:** Phase A must be complete (requires `state.parsedBrief`).

**Sub-agent dispatch brief (1 Sonnet):** "Rewrite `stages/1-research.ts` to implement PA Stage 3 Research Synthesis. The function signature changes to `runResearch(parsedBrief: StructuredBriefJSON): Promise<StageResult<ResearchSynthesis>>`. Replace the current Research prompt in `prompts.ts` (`RESEARCH_SYNTHESIS_SYSTEM`) with the PA Stage 3 prompt (prompt_architecture.pdf pages 7-8). The output type is `ResearchSynthesis` (add to `types.ts`). In `index.ts`, when `PA_PIPELINE=true`: call `runResearch(state.parsedBrief)` not `runResearch(briefText)`. Remove the `extractResearchConstraints()` call entirely on the PA path. Dual-write `state.research.report = state.researchSynthesis.market_context` for v1 renderer compat. Write a test confirming `source_grade_overall === 'E'` and `claims_requiring_verification` is populated for any statistic claim."

**Estimated Sonnet hours:** 3–4

**Verification criteria:**
- `state.researchSynthesis.competitors.length >= 3` for BESS brief.
- `state.researchSynthesis.claims_requiring_verification` is non-empty (contains at least one statistic).
- `source_grade_overall === 'E'` always.
- Research council score ≥ current baseline.

**Rollback plan:** `PA_PIPELINE=false` reverts to the original `runResearch(briefText)` path.

---

### Phase C: Drop Training Data Dump

**Goals:** Remove `runTrainingDataDump()` from the pipeline entirely. On `PA_PIPELINE=true`, the orchestrator no longer calls it. On `PA_PIPELINE=false`, it remains (backwards compat for old pipeline during transition).

**Files changed:**
- `index.ts` — remove `runTrainingDataDump()` call on `PA_PIPELINE=true` path. Remove `trainingDossier` variable on that path.
- `stages/0-training-data.ts` — no changes; file is kept for `PA_PIPELINE=false` fallback and as rollback target. Marked `@deprecated` in JSDoc.

**Dependencies:** Phase B must be complete (Research must no longer receive the dossier).

**Sub-agent dispatch brief (0.5 Sonnet):** "In `index.ts`, gate the `runTrainingDataDump()` call and the `trainingDossier` variable with `if (!PA_PIPELINE)`. Ensure downstream calls that previously received `trainingDossier || options?.trainingDataDossier` still compile correctly on both paths. Add a JSDoc `@deprecated` comment to `stages/0-training-data.ts`. Run `tsc --noEmit` to confirm no type errors."

**Estimated Sonnet hours:** 0.5–1

**Verification criteria:**
- `PA_PIPELINE=true` pipeline run has no `[stage-0] Starting parallel execution` log line.
- Total pipeline wall-clock time on PA path decreases by expected Training Data duration (~3-5 minutes).
- Council `Research` section score unchanged or improved vs baseline.

**Rollback plan:** Remove the `if (!PA_PIPELINE)` gate. Training Data Dump resumes.

---

### Phase D: Restructure Modules / Sizing / BOM / Cost to PA Shapes

**Goals:** Update PA Stages 4, 5, 7a, 7b to match PA schemas. Specifically: (a) extract Regulatory Extraction as a PA Stage 4 call, (b) rewrite Module Decomposition prompt to PA Stage 5 schema, (c) extend Sizing Solver output with 14 new fields, (d) extend Cost Computation to emit `overheadLines[]`, `nreItems[]`, `reductionPaths[]`.

**Files changed:**
- `stages/2-decompose.ts` — rewrite prompt in `prompts.ts` (`MODULE_DECOMPOSITION_SYSTEM`) to PA Stage 5 schema. Add `expected_parts[].quantity/role`, `interfaces[]` typed, maturity enum, `estimated_dimensions_mm`, `estimated_lead_time_weeks`. Update `validateDecomposeResult()` to enforce new required fields.
- `stages/1-research.ts` — extract the Regulatory Extraction portion into its own stage call. The Research prompt produces market context only; a separate `runRegulatoryExtraction()` call produces `RegulatoryExtraction` using PA Stage 4 prompt.
- `stages/3-size-layout.ts` — extend `DimensionSheet` output with 14 new fields. For `iso_container_layout`, the zone data is already computed internally; surface it in the output.
- `cost-model.ts` — restructure output to emit `overheadLines[]` (each overhead component as a named line), `nreItems[]` (individual NRE activities), `reductionPaths[]` (populated from the brief revision loop output or static defaults).
- `types.ts` — extend `Module`, `DimensionSheet`, `CostBreakdown`, `RegulatoryItem` with new fields per RENDERER-REDESIGN.md §3.2–§3.6.
- `lib/nre-from-regulatory.ts` — update to produce `NreItem[]` shape instead of a single total.

**Dependencies:** Phase B complete (Research structure change must land first). BOM-related changes can run independently.

**Sub-agent dispatch brief (split into two parallel Sonnet dispatches):**

*Dispatch D1 (Module + Regulatory):* "Rewrite `MODULE_DECOMPOSITION_SYSTEM` in `prompts.ts` to match PA Stage 5 prompt schema (prompt_architecture.pdf pages 11-13). The output JSON must use `expected_parts[]` (with `name`, `quantity`, `role`), `interfaces[]` (with `type`, `connects_to`, `description`), `failure_modes[]` (with `mode`, `cause` — 'Unknown' is rejected), `estimated_mass_kg`, `estimated_dimensions_mm`, `estimated_lead_time_weeks`, `maturity` (CONCEPTUAL/PRELIMINARY/ENGINEERING). Update `validateDecomposeResult()` in `stages/2-decompose.ts` to enforce these fields. Add the 6 new Module fields to `types.ts`. Separately, extract the regulatory extraction portion from the Research prompt into a new `runRegulatoryExtraction(parsedBrief, classification): Promise<StageResult<RegulatoryExtraction>>` function in `stages/1-research.ts` (or a new `stages/4-regulatory.ts`). Adopt the PA Stage 4 prompt schema including `source_grade: 'C'`, `verification_status: 'UNVERIFIED'` on every entry. Add 5 new fields to `RegulatoryItem` in `types.ts`."

*Dispatch D2 (Sizing + Cost schema):* "Extend `stages/3-size-layout.ts` to emit 14 new fields on `DimensionSheet` (per RENDERER-REDESIGN.md §3.4). For `iso_container_layout`, the zone allocation logic already computes zone dimensions — surface these as `DimensionSheet.zones[]`. Emit `volumeUtilisationPct`, `massUtilisationPct`, `externalDimensionsMm`, `internalDimensionsMm`, `tareMassKg`, `availablePayloadMassKg`, `clearanceNotes`, `massMarginNote`. Extend `CostBreakdown` in `types.ts` with `overheadLines[]`, `nreItems[]`, `reductionPaths[]`, `perModule[].pctOfBom`, `perModule[].grade`, `ceilingExceededBanner` (per RENDERER-REDESIGN.md §3.6). Update `cost-model.ts` and `lib/nre-from-regulatory.ts` to populate these new fields. All new fields must be optional and null-safe."

**Estimated Sonnet hours:** 6–8 (3–4 per dispatch, running in parallel)

**Verification criteria:**
- `state.modules[0].maturity` is populated on all 10 baseline briefs.
- `state.modules[0].expected_parts.length >= 1` for all modules.
- `state.regulatoryExtraction.regulatory_entries[0].source_grade === 'C'` for BESS brief.
- `state.dimensionSheet.zones.length >= 1` for BESS brief.
- `state.costBreakdown.overheadLines.length >= 3` (BOM, assembly, overhead at minimum).
- Council Modules, Regulatory, Sizing, Cost scores ≥ current baseline.

**Rollback plan:** All new fields are optional. Setting `PA_PIPELINE=false` on the orchestrator path reverts to the old field population. The v1 renderer ignores new fields.

---

### Phase E: Drop v1 Suppliers Stage, Cut Over Integrated BOM/Suppliers

**Goals:** Make the v2 integrated BOM/Cost/Suppliers stage (`4-bom-cost-suppliers.ts`) the default. Remove the `BOM_PIPELINE` env flag. Delete `stages/5-suppliers.ts` (after a 1-sprint hold period). Cut-over the LCSC stub integration once it is complete.

**Files changed:**
- `index.ts` — remove `USE_INTEGRATED_BOM` flag. Make `runBomCostSuppliers()` the only BOM path. Remove the v1 `runBomCost()` + `runSuppliers()` call block.
- `stages/4-bom-cost.ts` — mark `@deprecated`, keep file for 1 sprint, then delete.
- `stages/5-suppliers.ts` — mark `@deprecated`, keep file for 1 sprint, then delete.
- `lib/distributors/lcsc.ts` — wire into `findSkuForPart()` aggregator in `lib/distributors/index.ts` once LCSC integration is confirmed complete.
- BOM prompt in `4-bom-cost-suppliers.ts` — adopt PA Stage 6 BOM Generation prompt schema (PA pages 14-15).

**Dependencies:** Phase D must be complete. The v2 integrated stage must have passed baseline scoring ≥8 for BOM, Cost, Suppliers on all 10 baseline briefs (per BOM-COST-SUPPLIERS-INTEGRATION-DESIGN.md §6.2 cut-over criterion).

**Sub-agent dispatch brief (1 Sonnet):** "In `index.ts`, remove the `USE_INTEGRATED_BOM` conditional block entirely. Make `runBomCostSuppliers()` the unconditional BOM/Cost/Suppliers stage. Remove the imports for `runBomCost` and `runSuppliers`. Mark `stages/4-bom-cost.ts` and `stages/5-suppliers.ts` as `@deprecated` in JSDoc with a 'delete after 2026-05-22' note. Wire `lcsc.ts` into `lib/distributors/index.ts`'s `findSkuForPart()` call (it is currently a stub — check its exported interface first). Run `tsc --noEmit`. Run the baseline against all 10 briefs and confirm BOM ≥8, Cost ≥8, Suppliers ≥8."

**Estimated Sonnet hours:** 2–3

**Verification criteria:**
- No `BOM_PIPELINE` references remain in `index.ts`.
- Baseline BOM ≥8, Cost ≥8, Suppliers ≥8 on all 10 baseline briefs.
- `lib/distributors/index.ts` calls 4 APIs (Mouser, Digi-Key, Farnell, LCSC) in parallel if LCSC is ready; 3 otherwise.

**Rollback plan:** Git revert the `index.ts` changes. `stages/4-bom-cost.ts` and `stages/5-suppliers.ts` remain available as rollback targets during the 1-sprint hold period.

---

### Phase F: Review and Polish — Demote to Post-Pipeline Services

**Goals:** Drop `runPolish()` from the pipeline (PA principle: LLM never post-processes data that feeds the renderer). Demote `runReview()` to a post-Feasibility-Gate optional service that runs only on `FULL_REPORT` paths. Add PA Stage 9 Report Type Router as a named function.

**Files changed:**
- `index.ts` — remove `runPolish()` call entirely. Move `runReview()` call to after the Feasibility Gate, inside a `if (reportType === 'FULL_REPORT')` guard. Add `routeReportType()` call after Feasibility Gate computation. Store result on `state.reportType`.
- `feasibility-gate.ts` — add `reportType: ReportType` to `FeasibilityResult`. Add logic mapping `status × FAIL_count → ReportType`.
- New: `report-type-router.ts` — `routeReportType(feasibilityResult: FeasibilityResult): ReportTypeRouterResult`. Implements PA Stage 9 lookup table (PASS → FULL_REPORT, WARN (no FAIL) → FULL_REPORT with banners, WARN (1 FAIL) → FULL_REPORT with cost/safety/regulatory warnings, FAIL (>1 FAIL) → FEASIBILITY_EXCEPTION max 12 pages, BLOCKED → BRIEF_INCOMPLETE max 6 pages).
- `types.ts` — add `reportType?: ReportType` to `PipelineState`. Add `reportType` to `FeasibilityResult`. Add `ReportTypeRouterResult` interface.
- `stages/7-polish.ts` — mark `@deprecated`. Keep file. Do not call it.

**Dependencies:** Phases A, B, C, D must be complete (Feasibility Gate receives full data from all upstream stages before routing).

**Sub-agent dispatch brief (1 Sonnet):** "Create `src/lib/pdf-engine-v2/report-type-router.ts` implementing PA Stage 9's lookup table: `routeReportType(feasibilityResult: FeasibilityResult): ReportTypeRouterResult`. The mapping is: PASS → FULL_REPORT (no page limit, all sections); WARN with zero FAIL checks → FULL_REPORT with warning banners; WARN with exactly one FAIL check → FULL_REPORT with prominent cost/safety/regulatory warnings; FAIL with more than one FAIL check → FEASIBILITY_EXCEPTION (max 12 pages); BLOCKED (from `determineFeasibility` status RED with brief incompleteness) → BRIEF_INCOMPLETE (max 6 pages). Add `ReportType` and `ReportTypeRouterResult` to `types.ts`. Add `reportType?: ReportType` to `PipelineState`. In `index.ts`: call `routeReportType()` after the feasibility gate; store result on `(state as any).reportType`; guard `runReview()` call with `if (routeResult.reportType === 'FULL_REPORT')`; remove `runPolish()` call entirely. Mark `stages/7-polish.ts` @deprecated."

**Estimated Sonnet hours:** 2–3

**Verification criteria:**
- BESS brief (one FAIL: cost) routes to `FULL_REPORT`.
- A brief with BOM=0 routes to `FEASIBILITY_EXCEPTION`.
- A brief missing mass and cost ceiling routes to `BRIEF_INCOMPLETE`.
- Polish log line `[polish] Starting narrative polish pass` does not appear in any run.
- Review runs on FULL_REPORT paths; skipped on FEASIBILITY_EXCEPTION paths.

**Rollback plan:** Re-add `runPolish()` call and remove `routeReportType()` guard on `runReview()`.

---

### Phase G: Add Report Type Router to Renderer (PA Stage 9 → Stage 10)

**Goals:** The v3 renderer (`stages/7-pdf-v3.tsx` / in-flight BESS-style renderer from RENDERER-REDESIGN.md) uses `state.reportType` to conditionally include/exclude sections. FULL_REPORT renders all sections; FEASIBILITY_EXCEPTION renders cover + feasibility gate + brief only (max 12 pages); BRIEF_INCOMPLETE renders cover + brief only (max 6 pages).

**Files changed:**
- `stages/7-pdf-v3.tsx` — add section guards based on `state.reportType`. Each major section component checks `props.state.reportType` before rendering.
- `index.ts` — ensure `PDF_RENDERER=v3` is the default on `PA_PIPELINE=true`.

**Dependencies:** Phase F must be complete (reportType must be on state). RENDERER-REDESIGN.md Phase A–F upstream data changes must be complete.

**Sub-agent dispatch brief (1 Sonnet):** "This phase is handed off to the renderer sonnet (RENDERER-REDESIGN.md). The migration plan passes: `state.reportType: ReportType` is now available. The renderer sonnet should: (1) wrap each major section in `if (props.state.reportType !== 'BRIEF_INCOMPLETE')` guards per the PA Stage 9 section inclusion table; (2) add a `maxPages` enforcement guard (12 for FEASIBILITY_EXCEPTION, 6 for BRIEF_INCOMPLETE — React-PDF does not support hard page limits natively, so implement as a section-count guard on the document array); (3) make `PDF_RENDERER=v3` the default when `PA_PIPELINE=true`."

**Estimated Sonnet hours:** 2–3 (within renderer sonnet scope — this migration plan hands off)

**Verification criteria:**
- FEASIBILITY_EXCEPTION report PDF ≤ 12 pages.
- BRIEF_INCOMPLETE report PDF ≤ 6 pages.
- FULL_REPORT renders all sections from RENDERER-REDESIGN.md §2.4 section order.

**Rollback plan:** `PDF_RENDERER=v1` reverts to the existing renderer for any report type.

---

### Phase H: v1 Renderer Retirement and PA Pipeline as Default

**Goals:** Once v3 renderer is stable and PA pipeline passes all baseline briefs at ≥8 on all council sections, flip `PA_PIPELINE=true` and `PDF_RENDERER=v3` to be the defaults (not requiring env vars). Delete deprecated files. Update `STAGE-RL-MANIFEST.md` and RL scripts for new stage names.

**Files changed:**
- `index.ts` — flip defaults: `PA_PIPELINE` defaults to `true`; `PDF_RENDERER` defaults to `'v3'`.
- Delete `stages/0-training-data.ts`, `stages/7-polish.ts`, `stages/4-bom-cost.ts`, `stages/5-suppliers.ts` (after hold period).
- `STAGE-RL-MANIFEST.md` — update stage table to reflect PA stage names and ordering.
- RL scripts (`brief-rl-iterate.ts`, `decompose-rl-iterate.ts`, etc.) — update any hardcoded stage name references.
- `stages/7-pdf.tsx` — mark `@deprecated`. Keep for 1 sprint. Delete after final regression check.

**Dependencies:** All prior phases complete. Baseline ≥8 across all 10 briefs on all council sections.

**Estimated Sonnet hours:** 1–2

**Verification criteria:**
- Default `npm run engine` produces a PA-conformant pipeline run with no env vars required.
- All 10 baseline briefs produce council scores ≥8 across all sections.
- No `@deprecated` stage files are imported anywhere.

**Rollback plan:** Git revert the `index.ts` defaults flip. Old files still present during the hold period.

---

## Section 5 — Risk Register

Ranked by severity (HIGH / MEDIUM / LOW).

### Risk 1 — Brief Parsing fails on thin briefs (HIGH severity)

**Description:** PA Stage 1 must extract structured constraints from user text. If the user writes "I want a BESS" with no dimensions, cost, or mass, the parser produces a brief with many `null` constraints and a long `missing_mandatory_fields` array, routing the report to `BRIEF_INCOMPLETE`. The current pipeline handles this by inferring constraints from Research (the dossier fills gaps). After migration, Research receives the structured brief and no longer fills constraint gaps — the Brief Parser is the only chance to infer reasonable defaults.

**Mitigation:**
1. The PA Stage 1 prompt explicitly allows inference: "If you infer a constraint from context (e.g., ISO container dimensions from '40ft container'), source = 'inferred'." The prompt must be tuned aggressively to infer from any available context.
2. Add a fallback path: if `missing_mandatory_fields.length > 0` and `confidence === 'LOW'`, run a "brief enrichment" LLM call that asks the user targeted questions. This is a UX concern but avoids routing a reasonable brief to `BRIEF_INCOMPLETE`.
3. Maintain a regression test suite of thin briefs that currently produce valid reports — ensure Phase A does not degrade them to `BRIEF_INCOMPLETE`.

---

### Risk 2 — Loss of FMEA quality when Module Decomposition prompt changes (HIGH severity)

**Description:** The current Decompose prompt (in `prompts.ts` `MODULE_DECOMPOSITION_SYSTEM`) has been iteratively improved via the RL loop. Phase D rewrites it to match PA Stage 5. The rewrite may lose nuances that drove the current FMEA quality (specific cause requirement, failure mode depth).

**Mitigation:**
1. Run the council scorer on the PA Stage 5 prompt against all 10 baseline briefs before committing Phase D. Accept Phase D only if Modules council score ≥ current baseline.
2. The PA Stage 5 prompt already enforces `cause` ≠ "Unknown" explicitly. This is stronger than the current prompt. Risk is likely lower than feared.
3. Keep the current `MODULE_DECOMPOSITION_SYSTEM` string as `MODULE_DECOMPOSITION_SYSTEM_V1` in `prompts.ts` as a rollback target.
4. Use the RL framework (commit d3bc6089) to iterate the PA Stage 5 prompt after Phase D if the initial score is below baseline.

---

### Risk 3 — Distributor API integration orphaned during BOM stage rewrite (HIGH severity)

**Description:** Phase E cuts over to `4-bom-cost-suppliers.ts` as the only BOM path. If the integrated stage has bugs in its `findSkuForPart()` wiring, the distributor APIs may silently return no results, falling back to LLM estimates across all Buy lines.

**Mitigation:**
1. The cut-over criterion (§6.2 of BOM-COST-SUPPLIERS-INTEGRATION-DESIGN.md) requires BOM ≥8, Cost ≥8, Suppliers ≥8 on all 10 baseline briefs before Phase E proceeds. This guards against silent failures.
2. Add an explicit log line per distributor API call that shows SKU match / no match / error. The current `findSkuForPart()` aggregator logs results — verify these appear in the Phase E baseline run.
3. Keep `stages/4-bom-cost.ts` and `stages/5-suppliers.ts` for 1 sprint post-cutover as rollback targets.

---

### Risk 4 — Research prompt weakens after Training Data Dump is dropped (MEDIUM severity)

**Description:** The Training Data Dump pre-loaded domain knowledge (competitor specs, material costs, supplier names) that the Research stage currently consumes via the dossier. Without it, Research generates market context from parametric LLM knowledge alone, which may be shallower.

**Mitigation:**
1. The PA Stage 3 prompt is designed for this: "Use real companies and real products where possible. Do NOT invent competitor names or fictional product specs." Source grading forces the LLM to flag uncertain claims in `claims_requiring_verification`.
2. Run comparative baseline before committing Phase C (Training Data drop). If Research council score drops by >1 point, strengthen the Research prompt or reconsider dropping the dossier entirely (option: keep the dossier but don't pass it to Research — pass it to Module Decomposition as domain context instead, since that is where specific part knowledge matters most).
3. The BESS report's research synthesis (pages 5-7) was written without a Training Data Dump and received high quality. PA Stage 3 is the proven approach.

---

### Risk 5 — Brief Revision loop uncertain fate causes technical debt (MEDIUM severity)

**Description:** The Brief Revision loop (`3.5-brief-revision.ts`) has no clear home in the PA 10-stage architecture. If Tristan decides to preserve it (Phase F), it must be placed between Stage 8 and Stage 9. If Tristan decides to drop it, existing runs that relied on it to rescue infeasible briefs will route to `FEASIBILITY_EXCEPTION` instead of producing a revised feasible report.

**Mitigation:**
1. Tristan answers Q1 (Section 6) before Phase F is dispatched.
2. If preserving: the loop runs between Stage 8 and Stage 9, guarded by `reportType === 'FEASIBILITY_EXCEPTION'`. It updates `state.parsedBrief.constraints` (not `state.generatedBrief.fields`) and re-runs the Feasibility Gate.
3. If dropping: add a `cost_reduction_paths` array to the `FEASIBILITY_EXCEPTION` report template so users see actionable next steps without needing the loop.

---

### Risk 6 — Council scorer lineage violation (MiMo as both generator and judge) persists (MEDIUM severity)

**Description:** MiMo V2.5-Pro is used in the Research stage (as the LLM that generates research content) and as a council judge. This violates the independence principle the council requires. The SCORER-AUDIT.md flagged this as F9/SCORE-F9.

**Mitigation:**
1. When Phase B rewrites the Research stage, change the Research LLM from MiMo to a different model (e.g., Gemini 3.1 Pro or DeepSeek). This resolves the lineage violation without touching the council.
2. If MiMo must remain in Research, remove it from the council judge pool and replace with a non-engine-lineage model.
3. Track this explicitly in `SCORER-AUDIT.md` update as part of Phase B.

---

### Risk 7 — Sizing Solver `zones[]` output for non-BESS products (LOW severity)

**Description:** The `iso_container_layout` solver computes zones internally. Other solvers (`thermal_system_layout`, `generic_room`) do not have zone concepts. Phase D extends `DimensionSheet` with `zones[]` — but for heat pump or generic products, this array may be empty or null.

**Mitigation:**
1. `zones[]` is optional on `DimensionSheet`. The renderer has null-safe fallbacks.
2. Each product-class solver is responsible for populating zones if the concept applies. The `generic_room` solver emits a single zone (the whole envelope) if no sub-zone allocation exists.
3. The Required Parts Manifest check for zone allocation (if introduced) is product-class-specific.

---

## Section 6 — Open Questions for Tristan

### Q1 — Brief Revision Loop: preserve or drop?

**Context:** The current pipeline runs a feasibility-driven brief revision loop (up to 2 iterations) when constraints are infeasible. PA has no equivalent and explicitly lists "No rebrief loop" as a known gap. If preserved, the loop runs between PA Stage 8 (Feasibility Gate) and Stage 9 (Report Type Router) on FEASIBILITY_EXCEPTION paths.

**Options:**
- **A (preserve, recommended):** Keep the loop between Stage 8 and Stage 9. Update it to write to `state.parsedBrief.constraints` instead of `state.generatedBrief.fields`. Max 2 iterations. If after 2 iterations the report is still FEASIBILITY_EXCEPTION, proceed to Stage 9 with FEASIBILITY_EXCEPTION routing.
- **B (drop):** Remove the loop. A brief with infeasible constraints goes straight to FEASIBILITY_EXCEPTION and shows static cost reduction paths in the report.

**Impact:** Option B loses the ability to recover a brief from infeasibility automatically. Option A adds ~1 Sonnet hour to Phase F and keeps the loop's current behaviour.

---

### Q2 — Does Polish disappear entirely, or move post-pipeline?

**Context:** Phase F drops `runPolish()` from the pipeline because PA's core principle is "LLM never sees the PDF; it produces data." The Polish pass post-processes `state.modules[].description` with LLM prose, violating this separation.

**Options:**
- **A (drop — recommended):** Polish is removed entirely. Module Decomposition prompt (PA Stage 5) must be strengthened to produce publication-quality `technical_description` directly. If the council Module score drops, iterate the Stage 5 prompt via the RL loop.
- **B (post-pipeline service):** Polish runs after the PDF is generated on the MODULE DATA (not the PDF), re-running the LLM on module descriptions only, and updating `state.modules` before a second PDF render pass. This is expensive (extra LLM call + extra render) and delays the pipeline.

**Impact:** Option A requires the RL loop to compensate for any prose quality drop. Option B adds ~30-60 seconds to pipeline wall-clock time.

---

### Q3 — Council Scoring: stays in-pipeline or becomes a separate service?

**Context:** Council scoring currently runs as the final LLM stage before PDF generation, adding ~3-5 minutes to the pipeline (11 sections × 3 judges in parallel). It is not part of the PA 10-stage architecture. PA's quality control is the Feasibility Gate (Stage 8), not a post-hoc LLM judge.

**Options:**
- **A (stay in-pipeline, recommended):** Council scoring remains in the pipeline, running after Stage 8 on FULL_REPORT paths only. It is not run on FEASIBILITY_EXCEPTION or BRIEF_INCOMPLETE paths (saves ~3-5 minutes on those paths).
- **B (separate service):** Council scoring becomes an async service called after the pipeline returns the PDF. The pipeline result is returned to the user immediately; council scores arrive ~3-5 minutes later via a webhook/callback. Requires UI changes to show "scoring in progress."

**Impact:** Option A is the status quo with a minor guard. Option B requires a separate async job queue and UI changes.

---

### Q4 — PA Stage 4 (Regulatory Extraction): new stage or stay embedded in Research?

**Context:** PA defines Regulatory Extraction as a separate Stage 4 LLM call. Currently, regulatory data is extracted within the Research prompt (Research produces both market context and regulatory items in one call). Splitting it adds one LLM call per run but enables the PA Regulatory prompt schema (which is more specific about jurisdiction, claim type, verification status).

**Options:**
- **A (split — recommended):** Create a separate `runRegulatoryExtraction()` function called after Research. Adopts the PA Stage 4 prompt schema. The Research prompt is simplified (market context + competitors only). This enables the RL loop to target Regulatory separately from Research.
- **B (stay embedded):** Keep regulatory extraction inside the Research call. Extend the Research output schema to include the PA regulatory fields. Saves one LLM call per run (~20-40 seconds).

**Impact:** Option A aligns with the PA strictly and enables per-stage RL for Regulatory. Option B saves latency but produces a hybrid stage that the RL manifest notes as "not RL-ready" for Regulatory.

---

### Q5 — Suppliers section in the v3 renderer: include or fold into BOM?

**Context:** RENDERER-REDESIGN.md Q2 raised this. The BESS reference PDF has no standalone supplier shortlist section. PA Stage 10 does not mandate one. The current renderer has three supplier pages (Buy/Make/Services). These pages are unique to ForgeOS and valuable to the founder.

**Options:**
- **A (keep, recommended):** Supplier shortlist pages remain in the FULL_REPORT after Cost, before Risk Register. They get the BESS visual treatment (dark-navy headers, no pill badges). On FEASIBILITY_EXCEPTION and BRIEF_INCOMPLETE, they are omitted.
- **B (fold into BOM table):** Supplier data moves to the module BOM table's `Supplier` column only. The three supplier pages are removed. Simpler PDF structure; loses the shortlist's standalone value to the founder.

---

### Q6 — RL manifest update: who owns this?

**Context:** After migration, `STAGE-RL-MANIFEST.md` is stale. Stage names, positions, and RL-readiness flags must be updated to reflect the PA stage naming. This is a ~1-hour documentation task that can be done at Phase H or incrementally.

**Options:**
- **A (incremental):** Each Sonnet dispatched for each phase updates the relevant rows in `STAGE-RL-MANIFEST.md` as part of its brief.
- **B (Phase H batch):** Update `STAGE-RL-MANIFEST.md` in a single pass at Phase H.

---

### Q7 — What is the minimum viable PA pipeline for a first production run?

**Context:** The migration has 8 phases. Running all 8 before switching production is the cleanest approach but takes the most time. A minimum viable set might be Phases A + B + F (Brief Parsing first, Research rewired, Report Type Router added) with the rest following.

**Decision needed:** What is the minimum set of phases that Tristan considers "PA adoption" for marketing/product purposes? This determines when the pipeline version is bumped from v2 to v3.

---

## Section 7 — Total Effort and Timeline

### Phase-by-Phase Estimate

| Phase | Scope | Sonnet hours | Wall-clock days | Parallelisable with |
|---|---|---|---|---|
| A — Brief Parsing as Stage 1 | 1 Sonnet dispatch | 3–4 | 1 | Nothing (foundation) |
| B — Research rewired | 1 Sonnet dispatch | 3–4 | 1 | Nothing (needs Phase A) |
| C — Drop Training Data Dump | 1 Sonnet dispatch | 0.5–1 | 0.5 | Nothing (needs Phase B) |
| D — Module / Sizing / BOM / Cost PA schemas | 2 parallel Sonnet dispatches | 6–8 | 1–1.5 | D1 + D2 run in parallel; both need Phase B |
| E — BOM/Suppliers cut-over | 1 Sonnet dispatch | 2–3 | 0.5–1 | Needs Phase D |
| F — Review/Polish demote + Report Type Router | 1 Sonnet dispatch | 2–3 | 1 | Needs Phases A–D |
| G — Renderer phase integration | Renderer sonnet (separate) | 2–3 | 0.5–1 | Can overlap with Phase F |
| H — Flip defaults + cleanup | 1 Sonnet dispatch | 1–2 | 0.5 | Needs all prior phases |
| **Total** | **~9 dispatches** | **20–28** | **6–7** | |

### Aggressive Schedule (1-2 phases dispatched per day)

| Day | Phases | Notes |
|---|---|---|
| 1 | A | Brief Parsing foundation |
| 2 | B | Research rewired; run comparative baseline |
| 2 (afternoon) | C | Training Data drop (trivial once B is done) |
| 3 | D1 + D2 (parallel) | Module + Regulatory in parallel with Sizing + Cost |
| 4 | D baseline validation | Run all 10 baseline briefs; council scoring |
| 5 | E | BOM/Suppliers cut-over (only if Phase D baseline passes) |
| 5 (parallel) | G | Renderer sonnet can start as soon as Phase D data shapes are defined |
| 6 | F | Report Type Router + demotions |
| 7 | H | Flip defaults, clean up deprecated files |

### Things That Could Blow Up the Estimate

1. **Brief Parsing regressions on thin briefs.** If Phase A causes 3+ baseline briefs to route to `BRIEF_INCOMPLETE` that currently produce FULL_REPORT, the phase requires an additional iteration to strengthen the inference rules. Add 2–4 Sonnet hours.

2. **Module Decomposition council score drops below baseline.** The PA Stage 5 prompt rewrite is a full prompt replacement. If the RL loop needs to iterate to recover the baseline, add 3–5 Sonnet hours and 1–2 days.

3. **The v2 integrated BOM stage has unresolved bugs.** Phase E requires BOM ≥8, Cost ≥8, Suppliers ≥8. If the integrated stage is not yet at that bar, Phase E is blocked until BOM-COST-SUPPLIERS-INTEGRATION-DESIGN.md work is complete. This is a parallel workstream that should be advancing independently.

4. **Research + Regulatory split (Q4) is contentious.** If Tristan decides to keep Regulatory embedded in Research (Option B), Phase D's sub-agent brief must be revised. Adds 0.5–1 day.

5. **Renderer sonnet (Phase G) discovers upstream data shape gaps.** If the renderer requires fields from Phase D that Phase D didn't emit, a second Phase D iteration is needed. This is the most likely source of schedule slip given the 52 new fields required by RENDERER-REDESIGN.md. Add 2–4 Sonnet hours.

6. **MiMo V2.5-Pro FMEA on the PA Stage 5 decompose prompt.** The FMEA validator catches "Unknown" causes. If the new prompt triggers this frequently, decompose runs fail and the stage retries. Add 1 Sonnet hour.

### Honest Total Range

- **Optimistic:** 20 Sonnet hours, 6 wall-clock days, no regressions, all Q1-Q7 decisions in Tristan's favour.
- **Realistic:** 25–30 Sonnet hours, 8–10 wall-clock days, one major prompt iteration needed.
- **Pessimistic:** 35–40 Sonnet hours, 12+ wall-clock days, BOM integrated stage not ready by Phase E, Brief Parsing regressions on thin briefs.

The single biggest unknown is whether the integrated BOM stage (`4-bom-cost-suppliers.ts`) reaches the ≥8 bar before Phase E. If it is not ready, Phase E is blocked and the migration stalls at Phase D for an indeterminate period while the BOM sonnet catches up.

---

*End of plan. Commit this file; do not change any `.ts` files.*
