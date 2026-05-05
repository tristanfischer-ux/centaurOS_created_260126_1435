# Handover Document — PDF Engine v2

**Date:** 5 May 2026
**Author:** Claude (Sonnet sub-agent session)
**Status:** Partially done — code written, quality not validated
**Recovery:** All code is on disk but UNCOMMITTED. See "Recovery" section below.

---

## What This Is

A standalone, product-agnostic PDF engineering report engine. It takes a founder's product brief (free text) and produces a structured engineering report as a PDF. It lives at `src/lib/pdf-engine-v2/` and has zero imports from the rest of the ForgeOS codebase.

The goal: any founder describes a product, the engine produces a useful engineering report that a human could actually use for design review.

---

## Architecture (What Was Built)

**28 files, ~6,500 lines of TypeScript/React.**

The pipeline runs 8 stages sequentially in a single process:

```
Stage 0: Training Data Dump (3 LLMs in parallel → knowledge dossier)
Stage 1: Research Synthesis (LLM → structured JSON with brief, regulatory, competitors)
Stage 2: Module Decomposition (LLM → physical subsystems with parts, interfaces, failure modes)
Stage 3: Size + Layout (deterministic solver → dimensions, feasibility check)
Stage 4: BOM + Cost (LLM gap-fill + deterministic cost calculation)
Stage 5: Suppliers (Brave Search API → supplier matches)
Stage 6: Review (LLM → engineering review + proofread)
Stage 7: Polish (LLM → narrative rewrite) + PDF (React-PDF renderer)
```

**Key files:**

| File | Purpose |
|---|---|
| `index.ts` | Orchestrator — runs all stages, manages state |
| `types.ts` | All TypeScript interfaces |
| `prompts.ts` | Exact prompts from prompt_architecture.pdf |
| `stages/0-training-data.ts` | 3-LLM knowledge dump |
| `stages/1-research.ts` | Research synthesis with combined prompt |
| `stages/2-decompose.ts` | Module decomposition with fallback models |
| `stages/3-size-layout.ts` | Deterministic sizing solver |
| `stages/4-bom-cost.ts` | BOM generation + cost calculation |
| `stages/5-suppliers.ts` | Supplier matching via Brave Search |
| `stages/6-review.ts` | Engineering review + proofread |
| `stages/7-polish.ts` | LLM narrative polish pass |
| `stages/7-pdf.tsx` | React-PDF renderer (all sections) |
| `lib/feasibility-gate.ts` | Feasibility gate (RED/AMBER/GREEN) |
| `lib/source-grading.ts` | Source grade assignment (A-E) |
| `lib/r290-safety.ts` | R290 refrigerant safety validator |
| `lib/cost-constraints.ts` | Cost ceiling validator |
| `lib/llm.ts` | OpenRouter API client |
| `lib/council-scoring.ts` | Multi-LLM council scoring |
| `council-scorer.ts` | Council scoring orchestration |
| `scorer.ts` | Deterministic section scoring |
| `score-rubric.ts` | Reference report scoring (100-point scale) |
| `universal-scorer.ts` | Universal section scoring |
| `product-classifier.ts` | Product class detection |
| `brief-validator.ts` | Brief completeness check |
| `db-queries.ts` | Supabase database queries |
| `sanitiser.ts` | LLM output sanitiser |
| `validators.ts` | Gate validators |

---

## What Works

1. **Pipeline runs end-to-end.** Give it a brief, get a PDF. No crashes (mostly).
2. **Product classification works.** Detects BESS, heat pumps, vertical farms, etc.
3. **Brief validation works.** Checks required fields, blocks if incomplete.
4. **Feasibility gate exists.** Can return RED/AMBER/GREEN based on data quality.
5. **Stage 0 training data dump works.** 3 models (Grok, Claude Sonnet, Gemini) respond reliably.
6. **Council scoring works.** 5 LLMs score sections, produce a 100-point rubric.
7. **Source grading system exists.** Assigns A-E grades to every data point.
8. **PDF renders.** Produces 30-48 page PDFs with all sections.
9. **Score rubric evaluates against reference report.** Brief 100, Regulatory 100, Modules 100, BOM 70, Cost 0, Risks 80.

---

## What Doesn't Work (The Problems)

### Problem 1: The LLM Is Generating Data Instead of Reasoning About Data

**This is the fundamental problem.** Every section in the PDF is the LLM writing from its training data. The LLM has no connection to real material properties, real costs, real component specs. The pipeline should work like this:

1. Get the data — from databases, not the LLM
2. Calculate — deterministically, not with LLM arithmetic
3. Use the LLM to explain — what the data means, not what the data is
4. Validate — against real-world constraints before showing anything

Right now it's backwards. The LLM generates everything, then we try to validate after the fact. That's why:
- Brief shows "Not computed" — LLM didn't have the data, so it wrote nothing
- BOM shows 0 parts — sizing failed so there's no real input to generate from
- Cost shows £0.00 — no real BOM data means no real cost calculation
- Compliance statements are wrong — LLM hallucinated standards it half-remembered
- Module descriptions are generic — LLM has no access to actual component specifications

### Problem 2: Feasibility Gate Doesn't Actually Block

The gate exists in `lib/feasibility-gate.ts` but `index.ts` has a bug: when sizing is INFEASIBLE, the code sets `isInfeasible = true` but then continues to run BOM, cost, suppliers, review anyway. The `else` branch that should skip these stages is structured wrong — there's a missing closing brace or the logic flows through.

**What should happen:** If feasibility is RED or sizing is INFEASIBLE, skip all downstream stages and produce a short "blocked" report with the decision page.

**What actually happens:** The pipeline continues, producing empty/zero sections.

### Problem 3: Database Data Is Loaded But Never Used

`db-queries.ts` loads 47 material properties, 20 process capabilities, and 30 marketplace listings from Supabase. This data is loaded into `groundingData` in `index.ts` but never passed to any stage. The stages don't receive it. The BOM generator doesn't use it. The cost calculator doesn't use it.

### Problem 4: Cost Calculation Is Fabricated

The BOM cost model in `stages/4-bom-cost.ts` uses keyword matching to assign costs:
- "compressor" → £2,000
- "motor" → £500
- "battery" → £3,000
- "sensor" → £50
- Default → £200

These are not real costs. A 30kW R290 heat pump compressor alone costs £1,500-3,800 depending on supplier. The unit cost of £8,153 is fabricated.

### Problem 5: BOM Generation Has No Real Input

When sizing is INFEASIBLE, there's no dimension sheet, no module dimensions, no part list. The BOM generator receives empty data and produces empty output. The cost waterfall shows £0.00. The PDF renders "No parts generated" or similar.

### Problem 6: Regulatory Standards Are Hallucinated

The LLM generates regulatory standards from memory. It doesn't look up actual标准文本. It half-remembers standard numbers and writes plausible-sounding but incorrect compliance statements. The reference report has 5 standards with specific costs and timelines to compliance — our reports have generic "not-started" rows.

### Problem 7: Source Grades Exist But Aren't Visible

The source grading system exists in `lib/source-grading.ts` and assigns A-E grades. But these grades don't appear in the PDF body. They're computed and stored in `state.sourceAttributions` but the PDF renderer doesn't render them inline next to the data they refer to.

### Problem 8: PDF Renderer Crashes Intermittently

`stages/7-pdf.tsx` has an intermittent null rendering error: "Cannot read properties of null (reading 'props')". This happens when certain state fields are null or undefined. The last successful run produced a 31-page PDF, but subsequent runs crash.

### Problem 9: The Report Continues When Core Stages Fail

If research fails, the pipeline returns early. But if decompose fails, or sizing fails, or BOM fails, the pipeline continues and produces a PDF with missing sections. There's no "abort if critical stage fails" logic beyond the initial research check.

### Problem 10: No Real FMEA Data

The FMEA section has risks but no verification tests, no detection scores, no residual risk calculations. The reference report has 6 risks with full S/O/D scoring, RPN calculations, cause chains, and specific verification tests. Our reports have generic "thermal runaway" risks with no engineering depth.

---

## What I'm Struggling With

### 1. The Sub-Agent Pattern Doesn't Work Well Here

Each sub-agent gets a fresh context. It can't see what previous sub-agents did. So:
- Sub-agent A writes `index.ts` with a certain structure
- Sub-agent B edits `index.ts` without knowing A's intent
- Sub-agent C adds a feature that conflicts with B's changes

The result: inconsistent code, broken imports, TypeScript errors that accumulate.

### 2. The Code Is Too Large for One Session

6,500 lines across 28 files. A single session can't hold all the context. Sub-agents read individual files but don't understand the full architecture. The orchestrator (`index.ts`) has grown to 500+ lines with deeply nested logic.

### 3. The Reference Report Sets an Unrealistic Bar

The BESS reference report is 102 pages with real supplier names, real costs, real test data. It was produced by a mature engine (Forge v2.2) with access to actual databases, real supplier quotes, and real engineering data. Our engine is trying to match that quality from a single founder's brief text. That's not possible without real data sources.

### 4. The Prompt Architecture Document Has Exact Prompts But We're Not Following It

`prompt_architecture.pdf` specifies a 10-stage pipeline with exact prompts for each stage. We built an 8-stage pipeline that approximates it. The prompts in `prompts.ts` are close but not exact. The data requirements in the prompt architecture document aren't being satisfied — stages are called without their required inputs.

### 5. TypeScript Errors Accumulate

Each sub-agent introduces small TypeScript errors. The `gateResults` scope error in `index.ts`. The `matchedMaterial` possibly undefined in `bom-cost.ts`. The `safe()` function undefined in the PDF renderer. These aren't caught until runtime because the project is too large for `tsc` to type-check quickly.

### 6. OpenRouter Rate Limits Kill Stage 0

Stage 0 tries to call 5 models in parallel. Chinese providers (GLM, MiMo, Kimi) timeout at 300s on OpenRouter. We reduced to 3 models (Grok, Claude Sonnet, Gemini) which works, but the knowledge dump is thinner than intended.

---

## What I Think Might Work

### 1. Flip the Architecture: Data First, LLM Second

Instead of:
```
LLM generates → validate → calculate → render
```

Do:
```
Database provides data → LLM explains data → validate → calculate → render
```

Specifically:
- **Stage 1 (Research):** LLM generates the brief + regulatory, but IMMEDIATELY validate against database. Fix incorrect standards. Fill in missing fields from database.
- **Stage 2 (Decompose):** LLM suggests modules, but cross-reference with `material_properties` and `process_capabilities` to ensure the parts it names actually exist.
- **Stage 4 (BOM):** Use `marketplace_listings` for real supplier data. Use `material_properties` for real material costs. Use `process_capabilities` for real manufacturing costs. Only fall back to LLM estimates when database has no match.
- **Stage 3 (Sizing):** Run the solver BEFORE BOM. If INFEASIBLE, stop. Don't generate BOM for an infeasible design.

### 2. Make the Feasibility Gate Actually Block

Fix the control flow in `index.ts` so that when feasibility is RED or sizing is INFEASIBLE, the pipeline genuinely skips downstream stages and produces a short blocked report. The reference report does this — it has a "Decision Dashboard" that says "CONDITIONALLY FEASIBLE" with specific warnings.

### 3. Wire Database Data Into Every Stage

`groundingData` is loaded but never passed anywhere. Pass it to every stage:
- `runDecompose(research, groundingData)` — LLM sees real materials and processes
- `runBomCost(modules, dimensions, groundingData)` — BOM uses real costs
- `runReview(modules, research, groundingData)` — Review validates against real data

### 4. Fix the PDF Renderer Null Error

The intermittent crash is likely caused by `state.modules` or `state.parts` containing null entries. Add null checks at the top of every section renderer. The reference report handles this with defensive rendering — if data is missing, render "Not computed" instead of crashing.

### 5. Reduce Scope to What Works

Instead of trying to match 102 pages, produce 30-40 pages with:
- Brief (filled from LLM + database validation)
- Regulatory (5 standards with applicability, impact, evidence, gap action)
- Modules (5-8 modules with real parts, real suppliers, real costs)
- Cost waterfall (real numbers, honest about ceiling breach)
- FMEA (6 risks with S/O/D scoring)
- Source grades (visible inline, not hidden)
- Decision dashboard (feasibility gate result)

### 6. Use Sequential Review

Instead of parallel council scoring, have one model review, fix, then the next reviews. This catches issues that parallel review misses because each reviewer sees the fixed version, not the broken one.

---

## Recovery

### If You Want Another LLM to Continue This Work

1. **The code is at:** `src/lib/pdf-engine-v2/` (28 files, untracked)
2. **Read this handover first.** It explains the architecture, what works, what doesn't, and what to try next.
3. **Read `ISSUE-TRACKER.md`** in the same directory for the specific issues.
4. **Read `IMPLEMENTATION-PLAN.md`** in the same directory for the original plan.
5. **The reference report is at:** `/Users/tristanfischer/Downloads/bess_engineering_report.pdf` (102 pages, the quality target)
6. **The prompt architecture is at:** `/Users/tristanfischer/Downloads/prompt_architecture.pdf` (the exact prompts specification)
7. **Run `npx tsc --noEmit` from the project root to see current TypeScript errors.**

### What to Do First

1. Fix the TypeScript errors (there are at least 2: `gateResults` scope, `matchedMaterial` undefined)
2. Fix the feasibility gate control flow so it actually blocks
3. Wire `groundingData` into the stages that need it
4. Fix the PDF renderer null crash
5. Run the pipeline end-to-end and read the output

### What NOT to Do

- Don't add more features. Fix what exists.
- Don't add more scoring. Fix the data flow first.
- Don't add more LLM calls. Use the data you have.
- Don't try to match 102 pages. Match the quality, not the length.

---

## Git Status

```
Untracked: src/lib/pdf-engine-v2/ (entire directory)
Untracked: ~50 output PDFs and QA score JSONs
Modified: 14 files in the existing codebase (not related to pdf-engine-v2)
Last commit: d81f9a12 (FAQ accordion fix)
```

**Nothing from this session is committed.** If you want to save this work, commit it before doing anything else.

---

## Files to Read (In Order)

1. `HANDOVER.md` (this file)
2. `ISSUE-TRACKER.md` (specific issues)
3. `IMPLEMENTATION-PLAN.md` (original plan)
4. `types.ts` (all data structures)
5. `index.ts` (orchestrator — the control flow bug is here)
6. `prompts.ts` (exact prompts from prompt_architecture.pdf)
7. `stages/7-pdf.tsx` (PDF renderer — the null crash is here)
8. `stages/4-bom-cost.ts` (BOM generator — the fabricated costs are here)
9. `lib/feasibility-gate.ts` (feasibility gate logic)
10. `db-queries.ts` (database queries — loaded but unused)
