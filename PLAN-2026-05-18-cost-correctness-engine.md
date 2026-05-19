# ForgeOS — Cost-correctness engine, 2026-05-18

> Heat pump at £10,668/kW vs market £600-1,200/kW (789% over) is unacceptable for the same reason a BoM that violates conservation of energy is unacceptable — it makes the report unauthoritative. This plan replaces the W3 band-aid with a real multi-layer cost-correctness engine, structurally analogous to the physics-and-grammar validator we already run.
>
> W3's per-class scale multiplier (currently in flight) is a stopgap that buys us a week. It does NOT replace what's below. Ship W3 to stop the bleeding; build this in parallel.

## Where the cost model is wrong — 5 root-cause layers

A real BoM should equal the sum of: **(component unit cost × quantity × batch-volume scale) + assembly labour + integration + margin + warranty + freight + tax**. The current pipeline computes only the first term, and even that wrong. Five distinct failure modes:

### Layer 1 — Unit pricing is single-quantity trade

Distributor APIs (DigiKey, Mouser, Farnell) quote single-unit trade prices. A 28V Vishay capacitor that quotes £0.50 at 1-off is £0.02 at 100k-off. The pipeline uses the £0.50. Consumer goods shipping 1M units/year inherit a 10-25× over-price on every electronic line.

### Layer 2 — Estimate fallback uses the wrong anchor

When distributor lookup fails, the Flash-Lite price estimator (`estimate-missing-prices.tsx`) prompts: "Estimate the UK trade price in GBP… at scale-of-one trade pricing". That's correct for industrial heavy items but catastrophically wrong for consumer goods. Same problem as Layer 1 but for the long tail of parts that don't have a distributor hit.

### Layer 3 — BoM omits everything that isn't a component

A CGM patch has a BoM of ~£8 (capacitor + IC + battery + sensor housing). It ships at £45 retail. The £37 gap is: assembly labour + sterile packaging + clinical validation amortisation + margin + warranty + freight + tax. The BoM is showing 18% of cost of goods sold and we're calling it the price.

### Layer 4 — Pipeline emits incomplete part lists

Phase 3 measured 23-79% sub-module recall on the LLM emitter. So 20-80% of real parts are missing from `moduleDecomposition.modules[].sub_modules[].words[]`. Industrial heavy items lose less to this (one big-ticket item dominates); consumer goods lose more (every BoM line matters).

### Layer 5 — No write-time anchor band check

Stage 1.7 emits sub-modules. Stage 6 generates BoM. Stage 6.5 (the renderer-time `computePriceReality()` shipped tonight) flags out-of-band totals. But the flag is post-hoc — the pipeline already wrote the bad BoM, the founder sees both the bad number AND the warning, and the warning doesn't change the number. We need a write-time anchor that LOOPS the pipeline back to fix the BoM, not just labels it as broken.

## The engine — 5 layers, structurally analogous to physics grammar

The physics-and-grammar engine has: `class-priors.ts` (what modules must/can/can't exist) + `prompts.ts` worked examples (canonical correct sub-module placements) + Stage 1.7 multi-emitter UNION + post-emission validator + auto-strip. Cost-correctness mirrors each layer:

### Engine A — Anchor band write-time check (Layer 5 fix)

**What**: At BoM emission, compute the per-class natural metric (£/kWh, £/L, £/kW, £/kg etc) and compare to `class-price-bands.ts`. If outside band by >50%, refuse to write — re-emit with corrective prompt: "Current BoM lands at £X/metric, target £Y-Z. Either (a) the part list is incomplete (re-decompose missing modules) or (b) the unit prices are at wrong batch scale. Diagnose which."

**Cost**: £0 to build (deterministic), £2-5 in extra LLM calls per pipeline run when the gate fires.
**Time**: 1 day.
**Risk**: Low — purely additive validation gate.

### Engine B — Component-class batch curve (Layers 1 + 2 fix)

**What**: Each component type (electronic_ic, electronic_passive, electronic_pcb, structural_metal, motor_actuator, sensor, mechanical_fastener, plastics_moulded, etc) has a known cost-vs-annual-volume curve. The brief declares (or pipeline infers) annual volume. BoM emission applies the correct point on the curve.

```ts
type ComponentClass = 'electronic_ic' | 'electronic_passive' | 'structural_metal' | ...
type CostCurve = { volume_band: [low, high], unit_cost_multiplier: number }[]
// e.g. electronic_ic: [[1, 10, 1.0], [11, 1000, 0.6], [1001, 100000, 0.15], [100001, ∞, 0.05]]
```

The pipeline classifies each word into a ComponentClass (one-time Flash-Lite call per part, cacheable), looks up the curve point at the brief's annual volume, multiplies through.

**Cost**: £30-50 to build (one-time component-class classifier across the corpus + curve calibration from public benchmarks).
**Per-run cost**: ~£0.20 (component classification is cached after first run).
**Time**: 2-3 days.
**Risk**: Medium — needs calibration data per component class. Anchor against Phase 4 corpus reference products.

### Engine C — Reference-product anchoring (Layer 3 + 4 fix, USES THE CORPUS we built tonight)

**What**: For each emitted BoM, retrieve the 3 most-similar reference products from `pretraining_spec_documents`. Compare per-line component costs vs reference — flag any line that's >2× or <0.5× the reference price for similar components. For COG sum, compare BoM-total + assumed-labour against reference's stated retail price; flag if BoM exceeds reference retail.

**Cost**: £0 to build the retrieval (RAG layer in W1 does the embedding work).
**Per-run cost**: ~£0.10.
**Time**: 1-2 days (depends on W1 RAG landing first).
**Risk**: Low — uses the corpus already built.

### Engine D — Total-cost decomposition (Layer 3 fix)

**What**: Stop calling it "BoM". Report breaks down: raw materials BoM | assembly labour | integration | margin | warranty / freight | tax | retail price. Each layer has class-specific scale factor. Founder sees "BoM £8 + assembly £4 + margin £25 + warranty £8 = £45 cost of goods" not a misleading £8.

```ts
type CostBreakdown = {
  bom_raw_materials_gbp: number
  assembly_labour_gbp: number      // class-specific labour-hour assumption × wage
  integration_test_gbp: number     // class-specific
  margin_gbp: number               // class-specific markup
  warranty_freight_gbp: number     // class-specific  
  tax_gbp: number                  // class-specific VAT / sales tax
  cogs_total_gbp: number           // sum
  expected_retail_gbp: number      // anchor from reference products
  // ratio of cogs_total / expected_retail should land 60-90% across classes
}
```

**Cost**: £0 (deterministic).
**Time**: 1 day for class-specific scale-factor table + renderer update.
**Risk**: Low.

### Engine E — Multi-emitter cost ensemble (analogous to Stage 1.7 multi-emitter)

**What**: Three independent BoM-cost-estimation methods run in parallel: (a) distributor cascade + batch curve, (b) reference-product anchor lookup, (c) Flash-Lite analogical estimate from similar BoMs in corpus. Compare outputs — if they diverge by >50%, the BoM is flagged for council review. If 2 of 3 agree within 20%, use that; if all three diverge, refuse to emit and re-prompt.

This is the **structural mirror** of the physics-grammar engine's 6-emitter Stage 1.7 UNION.

**Cost**: £0.30-0.50 per pipeline run (3 cost-estimation calls).
**Time**: 3-4 days.
**Risk**: Medium — needs the other engines (A-D) in place first as the three independent paths.

## Sequencing

### Day 1 (today, immediate)

- **Diagnostic agent**: full root-cause investigation of the heatpump £10,668/kW outlier across the 5 layers. £2-3 LLM. Goal: prove the layer-by-layer attribution numerically (how much of the +789% deviation is each layer responsible for).
- **W3 finishes** (already in flight): per-class scale multiplier ships as the band-aid that stops the bleeding. Heatpump will land in band by the time W3 lands.

### Days 2-3

- **Engine A** (write-time anchor band check + corrective re-prompt loop) — highest leverage, lowest cost. Lands first.
- **Engine D** (total-cost decomposition + render the breakdown) — changes what the report SHOWS without architectural commitment.

### Days 4-7

- **Engine C** (reference-product anchoring) — depends on W1 RAG layer landing.
- **Engine B** (component-class batch curve) — needs Flash-Lite component classification pass against the 23k-record corpus.

### Days 8-14

- **Engine E** (multi-emitter cost ensemble) — the structural mirror of physics-grammar multi-emitter. Ship after A-D are validated working in isolation.

## Total cost + time

- Day 1 diagnostic: £3 / ~2 hours
- W3 band-aid: already in flight
- Engine A + D (week 1): £2-5 in code-review LLM + £0 runtime; 2-3 days
- Engine B + C (week 2): £30-50 calibration + £0.30/run; 3-4 days
- Engine E (week 3): £5-10 design + £0.50/run; 3-4 days

**Total to fully-functioning engine: ~£45-70 LLM + 2 weeks of focused work.**

## What success looks like

Per class, after the engine is on:
- £/natural-metric ratio: all 60 classes land within ±30% of their market band (today: 50%+ deviation on >half the classes)
- BoM-total reconciles to "expected retail × cogs-ratio" within ±20% on 90% of pipeline runs
- Out-of-band BoMs trigger automatic re-emission — pipeline self-corrects, doesn't ship absurd numbers
- Founder report shows the cost BREAKDOWN, not just "BoM total"
- Reference-product comparison flag visible per BoM line ("this part is 3× more expensive than the Tesla Megapack equivalent — investigate")

## Open decisions (small)

1. **Brief-declared annual volume?** Should the brief require the founder to declare "we will make N units/year" so Engine B can pick the right batch curve point? Or should the pipeline infer from class + customer language? Recommended: REQUIRE it, with sensible defaults per class (consumer = 100k/year, industrial = 100/year, etc).
2. **What's the cogs_total / expected_retail target ratio per class?** Industry rules of thumb: consumer electronics ~25-35% (high-margin), industrial ~50-70% (lower margin), regulated medical ~10-20% (high regulatory + clinical overhead). Codify these in `class-cost-structure.ts`.
3. **When the anchor band check fails, how many re-emission attempts before giving up?** Recommend: 2 attempts max, then ship the BoM with an explicit "PIPELINE-ESTIMATED COST IS OUT-OF-BAND, MANUAL REVIEW REQUIRED" badge at the top of the report.

I'll resolve all three with sensible defaults and ship — just flagging them so you can override.
