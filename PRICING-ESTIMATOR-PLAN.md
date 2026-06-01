# Engine B pricing estimator — improvement plan (for coding-council review)

**Goal:** cut the ~45% of priced BoM lines flagged out-of-range (haps: 35/77) that drag the BOM section to 7.33, **universally** (no per-product-class hand-tables — must work for new classes on the fly).

## Root causes — DIAGNOSED on the haps run (engine_c_summary: 12 in-range / 18 over / 17 under / 30 no-reference)

1. **`oem_subsystem` over-classification → flat high anchors (biggest £ impact).** 6 lines flat-pinned at £50–80k because the Flash-Lite classifier buckets them `oem_subsystem` and haps's `PRODUCT_CLASS_REFERENCE_OVERRIDES.oem_subsystem = £80,000`. Mis-classed: **"solar array skin"** (a structure!), "leading edge ice protection", "flight computer triplex", "LTE-S basestation", "GCS rugged console". = **£330k of the £2.4M bill on 6 lines.** The `OEM_SUBSYSTEM_FORBIDDEN` post-filter regex doesn't catch aircraft/structural names. Same mechanism as the historical BESS "£113.20 fingerprint."
2. **Magnitude-blindness (the universal defect).** Engine B computes `unit = referenceUnitCostFor(class, product_class) × interpolateCurve(class, volume)` and **never reads a magnitude modifier.** The per-word `kind:'capacity'|'dimension'|'rating_primary'|'mass'` signals are present on the word at pricing time (and already parsed by 4 sibling audit files) but DROPPED at `estimate-missing-prices.tsx` `PartContext` (:94) + the `targets.push` block (:1012). So a 280Ah cell and an 18650 get the same £8 anchor; intra-class variance is up to 100×.
3. **Non-physical line-items priced as parts.** "EUROCAE ED-279 compliance" £45k, "system FMEA document" £1200 — documents/NRE, not components.
4. **Thin corpus (not fixable here).** 30/77 lines have NO corpus reference — manufacturers don't publish component prices (memory: corpus is supply-side limited, 0.2% priced). Engine C stays evidence-only; it cannot be the price source.

## The plan — universal-first, prioritised by £ impact

### Increment 1 — Magnitude-aware scaling (the universal core; fixes #2, softens #1)
- **Capture** per-word magnitude modifiers (currently dropped): add `capacity/dimension/rating/mass/performance` (value+unit) to `PartContext`; extract in the `targets.push` block; parse units with the same helpers the sibling audits use. Secondary signal: `state.orchestratorContract.quantities` design scalars (`cell_capacity_ah`, `continuous_power_kw`, `bus_continuous_current_a`) for words lacking a modifier.
- **Scale:** `unit = ref_price × (part_magnitude / class_typical_magnitude)^elasticity × curve(volume)`, where `(axis, typical_magnitude, elasticity)` is a small **per-ComponentClass** table (24 classes — UNIVERSAL, not per-product-class). Axes: battery_cell→Ah, electronic_power_module/motor_actuator→kW, electronic_connector/cable→A, structural_*→kg, thermal→kW, sensor/ic/passive→low-variance (elasticity≈0). 
- **Fallback:** no magnitude signal → current behaviour (ref × curve). Strictly additive; degrades gracefully.
- This subsumes the per-product-class override tables over time (a 280Ah cell prices itself; no `bess.battery_cell=100` hand-entry needed) and works for NEW classes automatically.

### Increment 2 — Material-cost routing for structures (fixes the worst of #1)
- Parts where `isMaterialDominated(name)` (structural_metal/polymer, skins, enclosures, spars) route to the **`material_prices` DB** (£/kg × mass_kg) — already built (materials growing-DB, 2026-05-30) via `deriveMacroMaterialRateGbpPerKg`. This directly fixes "solar array skin £50k" → material cost (~£/kg × area×areal-density). Magnitude axis = mass.

### Increment 3 — Classifier hardening for `oem_subsystem` (caps the fingerprint at source)
- Extend `OEM_SUBSYSTEM_FORBIDDEN` with structural/aircraft/scope keywords (skin, laminate, spar, ice, console, basestation, "flight computer", antenna-array) → re-route to the correct class. Belt-and-braces with Increment 1 (magnitude scaling already softens a mis-class).

### Increment 4 — Non-physical line-item scoping (fixes #3)
- Compliance docs / FMEA / certification / test-reports are NRE/engineering cost, not BoM components. Either exclude from component pricing or route to a fixed engineering-cost bucket. (May be an upstream emitter-scope issue — flag for decision.)

## Calibration source (the key risk — prior "double-compression" burns)
`(typical_magnitude, elasticity)` per class from: **(a)** derive from the real parts already in `pretraining_extracted_parts` (median magnitude + a log-log price∝magnitude regression where ≥N priced rows exist); **(b)** Grok-validated benchmark fallback (how COMPONENT_CURVES were calibrated) where the DB is too thin. Calibrate against an Engine-B-priced state produced by the NEW code (memory: never re-derive a calibration against the OLD pipeline's output).

## Validation + regression
Re-run haps → target out-of-range <20% (from 45%), gate-21 + gate-10-B4 still PASS, BOM re-score. New invariant: **magnitude-monotonicity** — a 280Ah cell prices strictly higher than an 18650 in `battery_cell`; a 1000A busbar higher than a 100A one in `electronic_connector` (the spec confirms no such test exists today).

## Questions for the council
1. **Sequence/scope:** is magnitude-aware scaling (Inc 1) the right PRIMARY fix, or is the `oem_subsystem` fingerprint (Inc 3, ~£330k on 6 lines) the bigger/cheaper lever to do FIRST? Could Inc 2+3 alone get out-of-range under 20% without the heavier Inc 1?
2. **Calibration feasibility:** can `(typical_magnitude, elasticity)` be derived from `pretraining_extracted_parts` reliably, or is this a fresh mis-calibration risk? What's the safe validation?
3. **Elasticity:** linear (cells, structural £/kg) vs sub-linear ~0.6–0.8 (power modules, economies of scale) — how to pick per class without over/under-pricing the tails?
4. **Double-count:** Inc 2 material-routing vs the renderer's `macro_assembly_prices` override (highest precedence for big structural macros) — do they collide?
5. **Clamp/gate interaction:** does magnitude scaling break the floor/ceiling/sanity clamp stack or trip gate-21/gate-10-B4? (The new prices must still pass.)
6. **Non-physical items (Inc 4):** fix in Engine B (exclude) or upstream (emitter shouldn't emit a "compliance document" BoM word)?
7. Anything cheaper/simpler we're missing? (e.g. is just Inc 3 + a magnitude override for `oem_subsystem`/`unknown` 80% of the win?)

---

## ⚖️ COUNCIL VERDICT (3 seats, 2026-06-01) — PLAN OVERTURNED + REVISED

**Strong convergence. The original sequencing was wrong. Key findings:**

1. **Inc 1 (magnitude scaling) is mis-targeted — it touches 0 of the problem lines.** Seat 1 checked the haps state: of the 8 lines ≥£10k that constitute the £330k defect, **0 carry a magnitude modifier**; only 16/77 lines have any magnitude signal and all are small (£3–£900). The £50k lines are flat-pinned by the haps `oem_subsystem`=£80k reference clamped to the C5 £50k sanity-max — a **classification + reference-anchor artefact**, not magnitude-blindness. Inc 1 cannot move its own headline metric.
2. **The model double-counts** (Seat 1+3): `ref × (mag/typical)^k` is wrong because `referenceUnitCostFor` already returns a magnitude-encoding anchor (`bess.battery_cell=£100` IS the 280Ah price). Correct form: denominator = the REFERENCE part's magnitude, anchored to the **canonical `COMPONENT_CURVES` ref** (NOT the per-product override), so factor=1.0 at reference. Insert inside `curveEstimateFor` before the curve multiply; **suppress `COMPONENT_CLASS_FLOORS_GBP` for magnitude-scaled rows** or the floor silently re-flattens downward corrections.
3. **DB-derived calibration is FANTASY for the classes that matter** (Seat 1): the priced corpus is large (26,889 rows, 71% priced — the "0.2%" memory was stale) BUT the magnitude AXIS appears in single-digit rows per class (battery_cell: 4 mention Ah; structural_metal: 3 mention kg; motor_actuator: 9 mention kW). Only `electronic_power_module` (620 rows with A) is regressable. So elasticity falls back to hand-picked benchmarks = fresh mis-calibration risk (the double-compression failure mode).
4. **Inc 2 material-routing duplicates existing code + collides** (Seat 3 BLOCKER): `applyMaterialRepriceLever` (auto-improve.ts:212) already does material £/kg repricing on `macro_assembly_prices`, and the renderer's macro override (highest precedence) would silently discard an Engine-B material estimate. Inc 2 must route THROUGH `applyMaterialRepriceLever`, not a new path.
5. **THE MPN-PRECEDENT WARNING** (Seat 1+2): MPN coverage didn't move the BOM score; price accuracy is a *weaker* signal than MPN credibility, so it may not move it either. **Run the cheap experiment BEFORE building anything heavy.**

### REVISED PLAN (council-recommended sequence)
- **Step 1 — Inc 3 classifier hardening (hours, ~40 lines, reversible).** Re-route the clearly-mis-classed names OUT of `oem_subsystem`: `solar array skin / laminate → structural_polymer`; `basestation / GCS console → electronic_pcb`; `ice protection → thermal`. **CAUTION (Seat 3): do NOT route "flight computer triplex" out — a real TMR avionics box genuinely is an £80k oem_subsystem; routing it to electronic_pcb £35 would catastrophically under-price it.** The deeper issue is the single flat £80k anchor for ALL oem_subsystems.
- **Step 2 — sane anchor for the `unknown` class** (5 lines, £98k) — product-class-context bias or a haps `unknown` sanity ceiling.
- **Step 3 — THE CHEAP EXPERIMENT (the gate):** re-run `estimate-missing-prices.tsx` on the EXISTING haps `state.json` (no full chain run), re-score the BOM section in isolation. **If BOM moves >0.5 → price-accuracy validated, continue. If <0.2 → the binding axis is elsewhere (Part B DB enrichment / parts completeness); STOP the pricing path** — don't repeat the MPN non-result with a 2–3 day build.
- **Step 4 (only if Step 3 passes) — Inc 2 via `applyMaterialRepriceLever`.**
- **Step 5 (deferred, maybe never) — Inc 1 magnitude**, scoped to the 16 magnitude-bearing small lines only, with the ref-bound denominator + canonical-ref anchor + floor-suppression + an **anchor-invariance guard** (magnitude==reference ⇒ price unchanged vs today — the anti-double-compression test). Per-class typical_magnitude must be per (class × product-bucket), not a corpus median (BESS-biased).

**Net: the cheap classifier fix (Steps 1–2) is ~70% of the price-accuracy win in hours; the heavy magnitude model is deferred and gated behind a 2-hour experiment that asks whether price accuracy moves the score at all.**
