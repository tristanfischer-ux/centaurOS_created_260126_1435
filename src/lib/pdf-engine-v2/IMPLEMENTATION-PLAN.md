# PDF Engine v2 — Implementation Plan

**Target:** BESS-quality engineering reports (102 pages, deterministic calculations, LLM narrative, source grading)
**Reference:** `/Users/tristanfischer/Downloads/bess_engineering_report.pdf` (102 pages, BESS-40FT-LFP-001, Rev A, Forge v2.2)
**Architecture:** Compute first, narrate second. Deterministic code does math. LLMs write prose.

---

## Current State (27 files, 6505 lines)

| File | Status | What it does |
|---|---|---|
| `product-classifier.ts` | KEEP | Classifies product type from brief |
| `brief-validator.ts` | KEEP | Validates required fields |
| `feasibility-gate.ts` | KEEP | Decides report type |
| `universal-scorer.ts` | KEEP | Section scoring |
| `source-grading.ts` | KEEP | A-E source grades |
| `r290-safety.ts` | KEEP | R290 safety constraints |
| `cost-constraints.ts` | KEEP | Engineering cost floors |
| `council-scorer.ts` | KEEP | LLM-based section scoring |
| `scorer.ts` | KEEP | Deterministic fallback scoring |
| `validators.ts` | KEEP | Quality gates |
| `sanitiser.ts` | KEEP | LLM output cleaning |
| `types.ts` | KEEP | Type definitions |
| `index.ts` | KEEP | Orchestrator |
| `run.ts` | KEEP | CLI entry point |
| `7-pdf.tsx` | REWRITE | Must match BESS renderer quality |
| `1-research.ts` | REWRITE | Must match BESS brief quality |
| `2-decompose.ts` | REWRITE | Must produce 8-12 modules with BESS depth |
| `3-size-layout.ts` | REWRITE | Must match BESS zone allocation |
| `4-bom-cost.ts` | REWRITE | Must match BESS BOM quality |
| `5-suppliers.ts` | KEEP | Working with Brave API |
| `6-review.ts` | REWRITE | Must match BESS FMEA quality |
| `0-training-data.ts` | KEEP | Stage 0 knowledge dump |

---

## What the BESS Report Contains (that we must match)

| Section | Pages | Key quality markers |
|---|---|---|
| Cover + Dashboard | 1-2 | 8 metrics, feasibility verdict, source grades |
| Feasibility Gate | 3-4 | 7 checks with Status/Reason/Evidence |
| Brief | 5-7 | 12 constraints, 6 sources, mission, market context |
| Regulatory | 7-12 | 5 deep-dive cards with gap actions + costs |
| Sizing | 13-14 | Zone allocation, dimensions, mass, clearances |
| Modules | 15-31 | 8 modules: Purpose, Why It Matters, Technical Description (2-3 paragraphs), Key Specs, BOM table |
| Cost | 32-33 | Waterfall, NRE table, 4 reduction paths |
| Risks | 34-38 | FMEA with S/O/D, RPN, verification tests, owners |
| Audit | 39 | 11-step trace |
| Attribution | 40 | Section-by-section grading |

---

## Implementation Tasks

### Task 1: Deterministic Calculators (NEW)

Create `src/lib/pdf-engine-v2/calculators/` directory with:

#### 1a. `bom-rollup.ts` — BOM cost aggregation
- Input: BOMLine[] with qty, unit_cost
- Output: { total, by_module, by_grade, supplier_coverage_pct }
- Formula: total = sum(qty * unit_cost), by_module = group by module, coverage = (A+B costs) / total

#### 1b. `cost-waterfall.ts` — Full cost model
- Input: BOM total, labour hours, testing, shipping, overheads%, contingency%, NRE items, ceiling
- Output: CostWaterfall with unit_cost, margin, headroom
- Formulas:
  - labour = hours * rate
  - overheads = (bom + labour + testing + shipping) * overhead_pct
  - contingency = subtotal * contingency_pct
  - unit_cost = subtotal + contingency
  - margin = ceiling - unit_cost

#### 1c. `fmea-scorer.ts` — RPN arithmetic
- Input: severity, occurrence, detection (each 1-10)
- Output: rpn = S * O * D, critical flag if S >= 9

#### 1d. `zone-sizing.ts` — Zone volume and mass
- Input: zones with L, W, H, allocated mass
- Output: volume per zone, total mass, clearance checks

#### 1e. `feasibility-gate.ts` — 7-check gate (enhance existing)
- BOM population, cost feasibility, layout feasibility, sourcing feasibility, brief completeness, safety feasibility, regulatory feasibility
- Output: PASS/FAIL/WARN per check with evidence

---

### Task 2: Data Models (NEW)

Create `src/lib/pdf-engine-v2/models/` with Pydantic-style TypeScript interfaces:

#### 2a. `types.ts` — Update with full report schema
- Add: BOMLine with supplier, grade, lead_time, source_url
- Add: FMEARisk with S/O/D, rpn, cause, effect, controls, mitigation, verification_test, owner
- Add: RegulatoryStandard with version, jurisdiction, owner, applicability, impact, evidence, gap_action
- Add: CostWaterfall with full breakdown
- Add: Module with maturity level, key_specs, technical_description
- Add: EngineeringConstraint with source_grade

#### 2b. `enums.ts` — Source grades, status enums
- SourceGrade: A-E
- MakeBuy: Make/Buy
- GateStatus: Pass/Fail/Conditional
- ModuleMaturity: Concept/Prototype/Production

---

### Task 3: LLM Prompts (NEW)

Create `src/lib/pdf-engine-v2/prompts/` with section-specific prompts:

#### 3a. `system-prompt.ts` — Authoritative UK engineering voice
```
You are a principal UK engineering report author.
MANDATORY STYLE RULES:
1. British spelling: colour, centre, aluminium, behaviour, modelling
2. No filler: never use leverage, utilising, synergise, world-class, cutting-edge
3. Quantification: every sentence must contain at least one number
4. Source grades: [A] primary data, [B] supplier quote, [C] trade journal, [D] estimate, [E] assumption
5. Uncertainty: state bounds or confidence intervals for estimates
6. Max 25 words per sentence, active voice
7. If requirement not met, quantify the shortfall
```

#### 3b. `module-narrative.ts` — Per-module 2-3 paragraph generator
- Input: module specs, BOM items, key part numbers
- Output: structured JSON with purpose, whyItMatters, technicalDescription
- Style: engineer-to-engineer, specific part numbers, specific measurements

#### 3c. `regulatory-card.ts` — Deep-dive per standard
- Input: standard name, version, jurisdiction, applicability
- Output: applicability, engineering_impact, evidence_required, gap_action, gap_cost, gap_timeline

#### 3d. `brief-narrative.ts` — 3-page brief
- Input: constraints, research sources, market context
- Output: overview, mission, customers, why_now, constraints table

#### 3e. `fmea-narrative.ts` — Risk cause/effect/mitigation
- Input: risk description, S/O/D scores
- Output: cause, effect, controls, mitigation, verification_test

---

### Task 4: Report Assembly (REWRITE 7-pdf.tsx)

Rewrite the PDF renderer to match BESS quality:

- Cover page: economics dashboard with 8 metrics
- Feasibility gate table: 7 checks with Status/Reason/Evidence
- Brief section: 3-page narrative with constraints
- Regulatory section: 5 deep-dive cards
- Sizing section: zone allocation table
- Module sections: 8 modules × (Purpose + Why It Matters + Technical Description + Key Specs + BOM table)
- Cost waterfall: breakdown + NRE + 4 reduction paths
- Risks: FMEA with RPN arithmetic
- Audit log: 11-step trace
- Source attribution: section-by-section grading

---

### Task 5: Pipeline Integration

Wire new calculators into orchestrator (index.ts):

```
Stage 0: Knowledge dump (keep)
Stage 1: Brief parsing + research (rewrite)
Stage 2: Product classification (keep)
Stage 3: Assumption generation (NEW — use Stage 0 knowledge)
Stage 4: Research synthesis (rewrite)
Stage 5: Regulatory extraction (rewrite)
Stage 6: Module decomposition (rewrite — 8-12 modules)
Stage 7: BOM generation (rewrite — real MPNs)
Stage 8: Sizing solver (rewrite — zone allocation)
Stage 9: Cost computation (NEW — deterministic waterfall)
Stage 10: FMEA generation (rewrite — RPN arithmetic)
Stage 11: Feasibility gate (enhance)
Stage 12: Narrative generation (NEW — LLM per section)
Stage 13: Report assembly (rewrite renderer)
```

---

## Execution Order

**The 4-Pass Architecture:**

```
PASS 1: LLM DRAFTS (training knowledge → full report draft)
├── Stage 0: 3-LLM knowledge dump → 60K char dossier
├── Stage 3: LLM writes market context, competitors, timing
├── Stage 4: LLM extracts regulatory standards
├── Stage 5: LLM decomposes into 8-12 modules with technical descriptions
└── Stage 6a: LLM selects part families and estimates costs

PASS 2: DATABASE FACT-CHECKING (validate the draft)
├── Stage 2: Deterministic product classification
├── Stage 6b: Supplier catalogue lookup → Grade B pricing
├── material_properties table → real densities, costs
├── process_capabilities table → real tolerances, lead times
└── design_standards table → real standard codes

PASS 3: DETERMINISTIC CALCULATION (compute derived values)
├── Stage 7a: Sizing solver → zone allocation, volume, mass
├── Stage 7b: Cost computation → waterfall, NRE, headroom
└── Stage 8: Feasibility gate → 7 checks with evidence

PASS 4: LLM NARRATIVE POLISH + RENDERING
├── Stage 10: Renderer formats everything into PDF
└── No additional LLM calls — narrative was written in Pass 1
```

**Stage 0 is the foundation.** It provides the LLM with domain knowledge so Stages 3-6 can make informed design decisions. Without Stage 0, the LLM guesses. With Stage 0, the LLM decides based on training knowledge about this product class.

**Databases validate the draft.** Marketplace listings provide real component data. Material properties provide real engineering values. Process capabilities provide real manufacturing constraints. The deterministic calculators then compute derived values from this validated data.

| Step | Task | Depends on | Est. Effort |
|---|---|---|---|
| 1 | Data models (Task 2) | — | Small |
| 2 | Deterministic calculators (Task 1) | Task 2 | Medium |
| 3 | LLM prompts (Task 3) | — | Medium |
| 4 | Report assembly rewrite (Task 4) | Tasks 2, 3 | Large |
| 5 | Pipeline integration (Task 5) | Tasks 1-4 | Medium |
| 6 | Test with BESS brief | All above | Small |
| 7 | Iterate to match BESS quality | Task 6 | Large |

---

## Scoring Criteria (for quality measurement)

Each section scored 1-10 on:

| Dimension | What it measures |
|---|---|
| Factual Accuracy | Numbers trace to calculations, not LLM hallucination |
| Completeness | All required fields populated, no empty sections |
| Source Grading | Every claim has A-E grade, verified status shown |
| Narrative Quality | BESS-style prose, British spelling, no filler |
| Actionability | Gap actions with cost and timeline, named owners |
| Engineering Depth | Specific part numbers, tolerances, calculations shown |

---

## Status

- [x] Current engine assessed (27 files, 6505 lines)
- [x] BESS reference read (102 pages) — confirmed correct file
- [x] Prompt architecture read — mapped 10 stages to 4-pass architecture
- [x] Council consulted (6 models) — unanimous on compute-first architecture
- [x] Plan created with 4-pass data flow
- [x] Stage 0, database, and calculator roles defined
- [ ] Data models implemented
- [ ] Deterministic calculators implemented
- [ ] LLM prompts created
- [ ] Report assembly rewritten
- [ ] Pipeline integrated
- [ ] Tested against BESS brief
- [ ] Iterated to quality target
