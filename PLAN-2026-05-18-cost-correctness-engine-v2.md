# ForgeOS — Cost-correctness engine v2 (post-council), 2026-05-18

> v1 was councilled by 6 seats + supported by per-layer diagnostic attribution. 5 BLOCKERs surfaced. This is the revised plan that incorporates the BLOCKERs and the empirical attribution (Layer 2 = 85% of heatpump deviation).
>
> Changes vs v1 summarised at the bottom.

## Foundational decisions locked

1. **Target economic layer: installed ASP** (what a buyer typically pays — manufacturer list / channel list price). Why: founders compare against this; market data reports it; Phase 4 corpus datasheets state it; downstream BoM-to-ASP decomposition is well-understood.

2. **Engine E dropped** (UNANIMOUS 6/6 council verdict — window-dressing, not load-bearing). Budget redirected to corpus refresh + lightweight deterministic median-of-3 conflict flag instead.

3. **W3 batch-economics multiplier retires the day Engine B ships**. Until then it remains the band-aid that keeps shipped reports in band.

4. **Engine C ships only when underlying class has ≥10 docs + ≥500 records in Phase 4 corpus** (currently 8 classes qualify). For other classes, Engine A + B carry the burden.

5. **Annual production volume required in brief** (per all 6 seats agreeing). Sensible defaults: consumer-class 100k/yr, mid-volume 1k/yr, industrial-heavy 100/yr. Brief overrides default.

## The 4 engines (Engine E removed)

### Engine B — Component-class batch curve ⭐ FIRST PRIORITY

**Goal**: Each BoM word is classified into a component class (electronic_ic, electronic_passive, structural_metal, motor, sensor, mechanical_fastener, plastics_moulded, electronic_pcb, motor_actuator, magnetic_component, optical_component, structural_polymer, etc). Each class has a unit-cost-vs-annual-volume curve calibrated from the Phase 4 corpus. The brief's annual volume selects the curve point.

**Why first**: Diagnostic showed Layer 2 (Flash-Lite estimator's "scale-of-one" anchor) is 85% of the heatpump +789% deviation. Engine B fixes Layer 2 directly by replacing the estimator's blanket "trade price" anchor with a per-component, per-volume curve.

**Sub-steps**:
1. Define 15-20 component classes (taxonomy in `src/lib/pdf-engine-v2/component-classes.ts`)
2. One-time Flash-Lite classification pass over the 23,397 Phase 4 records → assign component_class to each. Cache.
3. Calibrate per-class cost curves from corpus prices + public benchmark data (Grok 4.3 for class-typical volume-vs-price curves, validated against Phase 4 reference products)
4. Add `apply_component_batch_pricing(state, volume)` in BoM stage replacing W3's class-level scale multiplier
5. Validate on heatpump iter-64 — target: £/kW drops from £907 (post-W3) to band-centre £800 with proper attribution per line

**Cost**: £40-60 (one-time component classification + curve calibration); £0.05/run after
**Time**: 3-4 days
**Risk**: Medium — component taxonomy can drift; curves need calibration evidence

### Engine A — Write-time anchor gate + re-emit loop (gated on B)

**Goal**: At BoM emission, compute proposed total + per-metric ratio + ASP comparison. If outside band by >50%, refuse to write and trigger corrective re-emit with diagnostic: "Current BoM lands at £X (band £Y-Z installed ASP). Either re-classify mis-priced components or flag missing modules. Specific lines >2× over band: [N1, N2, N3]"

**Why second**: A is null without B's batch curves to give the re-emit a fix-target. Council 5/6 agreed on this ordering.

**Sub-steps**:
1. Hook BoM stage with `validate_bom_against_band(state, bomTotals, priceBand)` 
2. Re-emit prompt for Stage 6 includes the anchor + diagnostic
3. Max 2 re-emit attempts before shipping with "MANUAL REVIEW REQUIRED" badge
4. Validate on Tesla Megapack + heatpump + CGM iter-64

**Cost**: £3-5 in re-emit LLM calls per pipeline run (only when gate fires)
**Time**: 1-2 days, ships after B
**Risk**: Low

### Engine C — Reference-product anchoring (gated on Phase 4 corpus GREEN per class)

**Goal**: At BoM emission, retrieve top-3 similar reference products from Phase 4 corpus. Flag any BoM line >2× or <0.5× the reference price for similar components. Flag BoM grand-total ASP if outside reference's stated price range.

**Why parallelisable with B**: C ships only for the 8 currently production-ready classes. The other 52 use only A + B until their corpus depth lifts.

**Per-class gate**: ≥10 Phase 4 docs + ≥500 records. Today: pv_string_inverter, heat-pump-residential, industrial_robot_arm, bess-utility-scale, insulin_pump, dc_fast_ev_charger, vfd-motor-drive, escalator. The W5+ extended sourcing pass (in flight) is lifting AMBER classes to GREEN, so this list expands.

**Sub-steps**:
1. Embed all 23,397 records (Flash-Lite embeddings) — depends on W1 RAG layer
2. Build `retrieve_reference_products(brief, class, k=3)` 
3. Build `compare_bom_line_to_references(line, refs)` returning {price_ratio, flag, evidence_excerpt}
4. Wire into BoM-stage write-time check (alongside Engine A)

**Cost**: £15-25 (embedding pass + retrieval calls)
**Time**: 2-3 days (after W1 RAG embeddings land)
**Risk**: Low — uses corpus already built

### Engine D — Cost decomposition (parallelisable with B)

**Goal**: Stop calling it "BoM". The renderer breaks down: **raw_materials_BoM → factory_COGS → OEM_transfer → channel_list → installed_ASP**. Each layer has class-specific markup factor. Founder sees the FULL cost stack, not a misleading single number.

```ts
type CostStack = {
  raw_materials_bom_gbp: number    // sum of component costs (Engine B output)
  assembly_labour_gbp: number      // class-specific hours × wage
  factory_overhead_gbp: number     // class-specific
  factory_cogs_gbp: number         // = raw + labour + overhead
  margin_gbp: number               // class-specific markup
  oem_transfer_price_gbp: number   // = factory_cogs × (1 + margin_pct)
  channel_markup_gbp: number       // distributor markup, class-specific
  channel_list_price_gbp: number   
  installation_cost_gbp: number    // class-specific (where applicable — heatpump, BESS, EV charger)
  installed_asp_gbp: number        // = channel_list + installation
}
```

Per-class cost-stack ratios stored in `src/lib/pdf-engine-v2/class-cost-structure.ts`. The price-reality-check from yesterday compares `installed_asp_gbp` not `raw_materials_bom_gbp` against market band.

**Cost**: £0 (deterministic)
**Time**: 1-2 days
**Risk**: Low

### Replacement for Engine E — Deterministic median-of-3 + conflict flag

**Not a multi-emitter ensemble**. Just at write time, compute the BoM total three ways:
1. Pure Engine B (component batch curves) 
2. Engine C reference-anchored (where corpus allows)
3. W3-style class scale factor (legacy band-aid, kept as third opinion)

Median of the three is the shipped number. If max/min ratio >2×, flag the BoM with a "Cost estimate uncertain — three methods diverge X×" badge and surface the three numbers for human review.

**Cost**: £0 (deterministic, reuses A+B+C outputs)
**Time**: 0.5 days
**Risk**: Very low

## Revised sequencing

### Week 1 (Day 1-5)

- **Day 1-2**: Engine B taxonomy + component classification pass over 23k corpus records + curve calibration from corpus + Grok benchmarks
- **Day 3**: Engine D cost decomposition tables + renderer wire-in (parallelisable)
- **Day 4-5**: Engine A write-time anchor gate built on top of Engine B's output

### Week 2 (Day 6-10)

- **Day 6-7**: Engine C reference-product retrieval (depends on W1 RAG layer landing)
- **Day 8**: Median-of-3 + conflict flag (lightweight)
- **Day 9-10**: Integration validation — heatpump, CGM, drone, BESS, Tesla Megapack re-validation pipeline runs

### Week 3 (Day 11-15)

- Retire W3 multiplier from `class-price-bands.ts` (Engine B has replaced it)
- Per-class re-validation across all 8 production-ready Phase 4 classes
- Final per-class anchor band re-calibration if Engine B reveals systematic deviation
- Surface "cost engine on" badge on PDF cover so the founder knows which version they're reading

**Total**: 3 weeks, **£100-150 LLM** (per council's revised estimate), 1 part-time engineer level of bandwidth.

## Open decisions resolved

1. **Brief-declared annual volume**: required. Default per class (consumer 100k/yr, mid-volume 1k/yr, industrial-heavy 100/yr). Brief CAN override.
2. **Per-class cogs/retail ratios**: derived from Phase 4 corpus + cross-checked with public market data. Stored in `class-cost-structure.ts`.
3. **Max re-emission attempts on Engine A band-fail**: 2. After 2 fails, ship with "PIPELINE-ESTIMATED COST OUTSIDE BAND, MANUAL REVIEW REQUIRED" badge.

## Two side-issues surfaced by the diagnostic that need separate workstreams

### S1 — Over-decomposition in Stage 1.7

Heatpump iter-64 emits 265 sub-module words / 539 effective parts vs Phase 4 reference manuals averaging ~40 parts per heat-pump installer guide. Pipeline is over-decomposing by 6×. This is partially MASKING the cost-pricing issue (£17k spread over 265 lines vs the real ~£3k spread over 40 lines = £75/line vs £75/line = same per-line absurdity, but the headline £17k looks less bad).

Action: separate council on Stage 1.7 over-decomposition. Likely cause: prompt asks for "every part" without a calibration target. Fix: prompt should reference Phase 4 corpus's reference decomposition density (~40 parts per heat-pump unit, ~100 per BESS, ~200 per VFD parameter manual).

Defer to AFTER the cost engine ships — fixing under-pricing first puts every BoM in band; fixing over-decomposition then refines per-line correctness.

### S2 — W1 RAG layer ordering

Engine C depends on the W1 RAG embedding layer. That was planned for day 2 of the spec-reproduction plan. Engine C now needs the embedding pass to be on day 1.

Move RAG embedding work to day 1 (cheap — £2-5).

## Changes vs v1 plan (council BLOCKERs incorporated)

| Council BLOCKER | v1 plan | v2 fix |
|---|---|---|
| Drop Engine E (6/6) | Engine E was the multi-emitter ensemble | Removed. Replaced with deterministic median-of-3 + conflict flag |
| A null without B (5/6) | A on day 1, B on week 2 | B on day 1-2, A on day 4-5 |
| Missing economic-layer target (2-seat → BLOCKER) | Plan never said what £600-1,200/kW means | Locked: installed ASP. Engine D shows the full stack |
| Timeline understated (6/6) | 2 weeks / £45-70 | 3 weeks / £100-150 |
| C blocked on Phase 4 GREEN (5/6) | C in week 2 unconditionally | C per-class gated on ≥10 docs + ≥500 records (8 classes today; W5+ pass adds more) |

Plus diagnostic-evidence integration:
- Layer 2 dominance (85% attribution) directly drives "Engine B first"
- Over-decomposition finding surfaced as S1 separate workstream
- Layer 1 (distributor 1-off) confirmed as 0.5% only — no urgent action needed

## Sign-off check

Three things Tristan should confirm before I dispatch Engine B build:

1. Target economic layer = installed ASP. (Default; recommend yes.)
2. Engine E dropped, replaced with median-of-3 deterministic conflict flag. (Council unanimous; recommend yes.)
3. Engine B as day-1 priority, A as day 4-5. (Diagnostic evidence + council 5/6 say yes.)

If yes to all three, dispatching Engine B build immediately.
