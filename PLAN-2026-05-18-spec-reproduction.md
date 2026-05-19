# ForgeOS — spec-reproduction plan, 2026-05-18

> The corpus is built (420 docs, 23,397 records, 8 production-ready classes). This plan turns the corpus into a working spec-reproduction pipeline. Cost-tagged + sequenced + with daytime decisions you need to make flagged at the top.

## Decisions you need to make first (before anything else)

1. **Architecture: RAG + few-shot only, or also fine-tune?**
   - **Recommended: RAG + few-shot only**. £20 to build, £0.25/pipeline run additional. Reversible, debuggable, no infra commitment. (Fine-tuning gives slightly better fluency but locks us into a specific model + costs ~10x more + needs eval infra.)
   - If you say yes to fine-tune later, we can layer it on once RAG is proven.

2. **Which class to demonstrate first** — pick one of the 8 production-ready classes for the first end-to-end demo:
   - **heat-pump-residential** (25 docs, 2,523 records, deepest corpus) — recommended; highest founder-call demand
   - vfd-motor-drive (2,757 records — even denser, but narrower commercial use)
   - bess-utility-scale (Megapack-class — fits Tristan's existing demo arc)
   - insulin_pump (1,411 records — medical regulated, slow founder cycle)

3. **Batch economics fix** — separate workstream but bundled with this one. The price-reality-check finding (CGM +24,000%, drone +1,900%, heatpump +789%) needs a per-class scale factor BEFORE the RAG pipeline ships, otherwise the new high-quality module data lands in a BoM that's still hilariously mis-priced.
   - Cheapest fix: per-class scale multiplier (1 day, £0)
   - Deeper fix: per-component batch curve (3-5 days, £0)
   - Don't ship the new pipeline without it.

## Workstreams (parallelisable)

### W1 — RAG + few-shot retrieval layer ⭐ headline

**Goal**: Stage 1.7 of the pipeline consumes the new corpus at emission time. When the brief says "containerised BESS, 3.5 MWh, IEC 62933", the emitter sees the 3 most-relevant Megapack records before producing modules.

**Sub-steps**:
1. Embed all 23,397 records (Flash-Lite embeddings via OpenRouter, or local sentence-transformers) — £2-5, ~30 min
2. Build a `retrieve_relevant_records(brief, k=5)` function — Python, calls embedding + cosine similarity, returns top-K records as structured text — £0, ~1 hour
3. Wire into Stage 1.7 prompt at `src/lib/pdf-engine-v2/prompts.ts` — append "Here are 5 real reference records for this class" — £0, ~1 hour
4. Add a `RAG_ENABLED` env flag so we can A/B test on/off — £0, ~30 min

**Validation**: Re-run the Phase 3 Tesla Megapack test (synthetic brief → pipeline → score against real Megapack 2 XL records). Phase 3 baseline was 23.4% sub-module recall. Target: ≥50% with RAG on.

**Cost**: £20-30 (embeddings + 3 validation re-runs)
**Time**: 1 day
**Risk**: Low — purely additive to existing pipeline; can be turned off via env flag

### W2 — Ontology council on the 10 queued mismatches

**Goal**: Apply the top 10 ontology mismatches surfaced by the 45-class breadth pass to `prompts.ts` worked-example + `class-module-priors.ts`. The mismatches are queued in TRACKER.md.

**Sub-steps**:
1. Council each mismatch via 4-seat (Sonnet + Grok + Gemini + Kimi) — £0.20 × 10 = £2
2. Apply consensus fixes to `prompts.ts` and `class-module-priors.ts`
3. Run a single BESS pipeline re-validation to confirm no regression

**Cost**: £5-7
**Time**: half a day
**Risk**: Low (council-gated)

### W3 — Batch economics fix

**Goal**: Per-class scale multiplier so consumer goods stop pricing at distributor unit rates.

**Sub-steps**:
1. Extend `class-price-bands.ts` with `bom_scale_factor` per class (from the price-reality bands: industrial=1.0, mid-volume=0.5, consumer=0.05-0.15)
2. Add `apply_batch_economics(state, bom)` post-process in the BoM stage
3. Re-render the 10 phase23+ PDFs; verify CGM lands at £8-15 not £3,658

**Cost**: £0 (deterministic code, no LLM)
**Time**: half a day
**Risk**: Low

### W4 — Phase 3 Tesla validation re-run

**Goal**: Validate the cooling-loop prompt fix landed last night actually moves sub-module recall up. The four fixes were applied; we never ran the £18 validation.

**Sub-steps**:
1. Single Tesla Megapack pipeline run with the new prompts.ts — £4
2. Score against reference. Target lift: 23.4% → 30-34% from prompt fix alone, then 50%+ once W1 RAG layer also lands

**Cost**: £4
**Time**: 1 hour wall-clock (mostly pipeline runtime)
**Risk**: Low

### W5 — RED-class daytime sourcing review

**Goal**: 17 classes with <5 docs need either (a) better sourcing, (b) scope-narrowing, or (c) acceptance that they're software-heavy and skip them.

The 17: building_management_system, custom_hybrid_drone, high_altitude_pseudo_satellite, second_life_battery_pack, brewery_fermenter, industrial_3d_printer, solar_thermal_collector, telehandler, industrial_inspection_drone, lab_microscope, launch_vehicle_upper_stage, small_satellite, sterile_fill_line, automated_guided_vehicle_agv, cubesat_propulsion_module, hydrogen_electrolyser, mini_split_heatpump

**Per-class triage** (1 hour each):
- BMS: re-scope to BMS-controller-hardware-only or skip
- HAPS: 4 active programmes worldwide, sourcing ceiling; accept 1-2 docs
- Custom hybrid drone: industry too fragmented; merge with consumer_cinematography_drone
- Second-life battery: accept thin coverage (single product class)
- Niche industrial (brewery, 3D printer, microscope, telehandler): try harder with sub-segment Brave queries

**Cost**: £2-5 total
**Time**: 1 day (parallel sub-agent)
**Risk**: Medium — some classes may genuinely not be sourceable

### W6 — Final phase23+ PDF render

**Goal**: Merge all the renderer fixes from last night (D+E + suppliers + reality-check + bug fixes) into one coherent phase24 PDF set.

**Sub-steps**:
1. Re-run renderer on the 10 existing state.json files
2. Verify against final-audit script
3. Open BESS for visual review

**Cost**: £0
**Time**: 30 min
**Risk**: Low

### W7 — End-to-end demo

**Goal**: Single full demonstration of the new pipeline on the chosen class from Decision 2.

**Sub-steps**:
1. Write a synthetic brief for that class
2. Run the pipeline end-to-end with RAG + ontology fixes + batch economics + new renderer
3. Render PDF
4. Show before/after vs the old phase23 version
5. Score against reference product

**Cost**: £5
**Time**: 1 hour
**Risk**: Low

## Execution order (recommended)

**Day 1 (today)**:
- W3 batch economics fix (deterministic, no LLM cost, unblocks everything else)
- W2 ontology council in parallel (£5-7)
- W6 phase24 render in parallel (£0)

**Day 2**:
- W1 RAG retrieval layer (the big one — £20-30, 1 day)
- W4 Tesla re-validation when W1 + W2 land (£4)

**Day 3**:
- W7 end-to-end demo on chosen class
- W5 RED-class triage in parallel

**Total time**: ~3 days
**Total cost**: £40-50
**Total LLM spend budget remaining from £100 cap**: ~£70

## What you'll have at the end

- A pipeline that, given a brief, retrieves the most-relevant real engineering records from the corpus and uses them to ground the emission
- BoMs that price at realistic per-class scales (consumer ≠ industrial distributor pricing)
- Tesla Megapack-class brief reproducibility target ≥50% sub-module recall (up from 23.4%)
- A clean phase24 PDF set with all the layout, supplier, and content fixes from last night
- A working end-to-end demo on one chosen class

## What's deliberately NOT in this plan

- Fine-tuning (defer until RAG is proven)
- Full UNION synthesis refactor (over-engineering for current scope)
- Mass ingestion of the 17 RED classes (sourcing review first)
- Pipeline architectural overhaul (W1 RAG is purely additive)
