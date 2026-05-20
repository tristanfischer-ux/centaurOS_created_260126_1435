# Iter-9 Red Team — Revised Priorities

**Trigger:** Verify chain (job `a3e05161`) just completed. PDF emitted at 358 KB / 80 pages. `acceptanceStatus='blocked'` per the new physics-critic gate. Analysis of what today's 12 commits ACTUALLY delivered vs what's still broken.

## The brutal finding: most of today's NEW arithmetic gates are dead code

Physics critic flagged 5 HIGH-severity findings in the new VF PDF:

| # | Critic finding | Which gate SHOULD have caught it | Did it fire? |
|---|---|---|---|
| 1 | LED density 694 W/m² vs brief 200 W/m² (3.5× over) | None exists | n/a |
| 2 | **LED driver 17.44 kW deficit** (8 × 320W ≠ 20 kW) | `driverLoadPowerBalanceGate` (commit `7a8565b6d`) | **NO** |
| 3 | Copeland ZR18K5E-TFD is 5.27 kW not 18 kW (model-number confusion) | None exists | n/a |
| 4 | **Grundfos MAGNA3 max 8m head, design needs 25m** | `fluidPressureBalanceGate` (commit `7a8565b6d`) | **NO** |
| 5 | Chilled water loop has no chiller | None exists | n/a |

**2 of today's new gates were directly relevant to today's findings. Both failed to fire.**

### Why the gates didn't fire

Both are field-presence guarded — only run if Generator emits the specific `derived_parameters` fields:

- `driverLoadPowerBalanceGate` needs `driver_count, driver_power_w, load_count, load_power_w` on the same module
- `fluidPressureBalanceGate` needs `pump_rated_bar` (or `pump_rated_head_m`) + `required_pressure_bar`

Generator emitted the parts in the BoM (Mean Well HLG-320H-48 drivers, Grundfos MAGNA3) but **didn't surface those values as `derived_parameters`**. So the gates silently skip — exactly as iter-6 trigger/verify pattern designed (no fields → no firing).

### What this means for the iter-9 plan

**The bottleneck is NOT gate coverage. The bottleneck is Generator emission of structured fields.**

Today I:
- Wrote ~250 lines of arithmetic gate code (Power Balance, Pressure Balance, Fan Static)
- Wrote ~440 lines of Performance Card framework
- Wrote ~250 lines of Design Decisions Review
- Wrote ~90 lines of BoM duplicate detection + supplier URL reconciliation

Of these:
- ✅ Performance Card + Design Decisions are VISIBLE in the new PDF (deliver value)
- ✅ BoM dedup + supplier URL reconciliation fired correctly (6 dup groups + 2 supplier suppressions)
- ✅ Physics-critic blocking fired correctly (DO-NOT-PROCURE banner)
- ✅ Title sentence-boundary worked
- ✅ Per-m² band correctly shows "38% below typical"
- ✅ Hero image correctly suppressed (envelope > 8 m³)
- ❌ **3 new arithmetic gates didn't fire on the actual findings they target**
- ⚠️ Engine B floor clamp DID raise BoM from £8k → £22k (3×), but still 50% below realistic (£372/m² vs £600-1200/m² band)

### And the iter-9 plan adds MORE infrastructure consuming Generator output that isn't emitted

- **W1 deterministic tools** — same gating problem. Tools called from Phase 1 won't help if Generator doesn't surface fields they need.
- **W3 MoE specialists** — would catch findings 1, 3, 5 (which need domain knowledge). But findings 2 + 4 (LED driver, pump head) need STRUCTURED FIELDS to verify, not better LLM judgment.
- **W6-lite regression harness** — would freeze TODAY'S broken behaviour as the baseline. Value is preventing future regressions, but at our commit rate (12 fixes/day, 0 regressions) the marginal value is low.
- **W0 object model** — council corrected my overclaim. W0 prevents K10 bleed (already fixed for free) + duplicate IDs (already detected). Other claimed wins (fan stall, LED mismatch) need W1 not W0.

**Most of iter-9 plan v3 is over-investment in infrastructure for marginal value at our current scale.**

---

## Revised priorities — incremental, highest-value-first

### THE single highest-leverage workstream

**Step 1: Fix the Generator prompt to emit a MANDATORY `derived_parameters` schema per module class.**

This is a 3-5 day effort that activates **6+ existing arithmetic gates** which are currently dead code:
- `cellsAhVoltageCapacityGate` (iter-6) — needs `cell_count + cell_capacity_ah + cell_voltage_v + capacity_kwh`
- `moduleCellCountGate` (iter-6) — needs `cell_count + module_count + cells_per_module`
- `driverLoadPowerBalanceGate` (today) — needs `driver_count + driver_power_w + load_count + load_power_w`
- `fluidPressureBalanceGate` (today) — needs `pump_rated_bar + required_pressure_bar`
- `fanStaticPressureFeasibilityGate` (today) — needs `fan_size_mm + fan_static_pressure_pa + fan_type`
- `copThermalElectricalGate` (iter-6) — needs `cop + rated_thermal_kw + rated_electrical_kw`

**Proof point:** re-run today's verify brief. Physics critic findings 2 + 4 (LED driver deficit, pump head shortfall) should now also appear as arithmetic-gate failures in Phase 2 — which means the chain has a CHANCE to repair them before emission, instead of just flagging them post-hoc.

**Why this beats every other workstream:**
- Activates code already shipped (12 commits today × ~6 of them gated on this)
- One file change (`src/lib/pdf-engine-v2/radical/generator-prompt.ts` or equivalent)
- Measurable immediately (gate-fire count BEFORE vs AFTER)
- Doesn't add new infrastructure to maintain
- No new LLM costs
- No new operational concerns

### Step 2: 2-3 new arithmetic gates the verify chain surfaced

Today's findings 1, 3, 5 don't have existing gates. Add:

**`briefConstraintPropagationGate`** — every module with a `derived_parameters` field that has a corresponding `parsedBrief.constraints.X` must equal the brief (within tolerance). Catches finding 1 (LED density 3.5× over brief).

**`closedFluidLoopHasHeatRejectionGate`** — any module with a fluid loop + cooling coil + pump but no heat rejection device fails. Catches finding 5 (chilled loop missing chiller).

**`partNumberCapacityVsModelGate`** — parse model strings like "ZR18K5E" for capacity-implying suffixes; if the design's claimed capacity is >2× what the model implies, flag. Catches finding 3 (Copeland 18K = 18,000 BTU/hr = 5.27 kW, not 18 kW).

Effort: 2-3 days. All universal (apply to every product class).

### Step 3: Engine B per-class calibration

VF iter-8 BoM landed £372/m² — band is £600-1200/m², so 38% below. Engine B class floor + overrides moved BoM 3× (£8k → £22k) but didn't go far enough.

Specifically: VF override for `optical` is £200, but the LED panel finding showed the chain emitted 40 × 200W panels at £200 each = £8k. Real Osram PHYTOVYNE (or Samsung LM301H assemblies) for 100m² VF would be £15-25k total.

**Tighter VF overrides** (council convergence with field data):
- `optical` £200 → £400 (high-quality horticultural LED panels)
- `thermal` £100 → £300 (commercial-grade insulation panels + DX coils)
- `structural_metal` £800 → £1500 (20ft+40ft ISO container shells)

Effort: 1 day + 3 verify runs to calibrate.

**Stop building infrastructure. Start moving anchor values.**

### Step 4: VF K10 reference graph

Today's verify chain log: `[chain] K10 shadow: NO_GRAPH for vertical_farm (add to class-reference-graphs/ to enable)`.

The K10 cross-class bleed fix from today (commit `aa394cef8`) correctly suppresses BESS-bleed but doesn't add VF-specific required edges. Building the VF K10 graph closes the gap.

Effort: 1-2 days (template from `bess-utility-scale.ts`).

### Step 5: G5 fake-rate attack via expanded SKU pattern bank

Today's verify chain stripped 74 SKUs via the pattern-strip pre-pass, but 73 are still flagged unverified. The pattern bank in `patternLooksLikeDescriptionNotSku` catches 4 patterns; the iter-7 PDF had ~10 distinct hallucination patterns.

**Expand to ~12 patterns** observed across the iter-7 + iter-8 PDFs:
- Trade-name-without-model ("PHYTOVYNE R1500")
- Model-prefix-only ("HC-40-ISO-2024")
- Description-as-SKU ("200 W, 0.9 PF") ✓ already covered
- Misspellings ("BobaCAT 5")
- Generic-with-rating ("18K Compressor")

Effort: 1 day, plus regression on 5 iter-7 + iter-8 PDFs.

### Step 6: G5 RAG catalogue — DEFERRED

Council finding #1 by impact, but BIG scope. Octopart/Mouser API integration + vector index. **2-3 weeks effort.** Do AFTER Steps 1-5 deliver. May not be needed at all if Steps 1-5 reduce fake-rate from 50% to <15%.

---

## What I'm NOT proposing (and why)

- **W0 canonical object model**: 2-6 weeks. Council corrected my overclaim — only prevents K10 bleed (already fixed) + duplicate IDs (already detected). LOW marginal value at our current quality. Defer to iter-10+.
- **W1 Python deterministic tools**: 1.5+ weeks. Existing lookup tables in gates already cover 80% of the value. Marginal precision improvement at significant infrastructure cost. Defer.
- **W3 MoE specialists**: 1.5 weeks + recurring LLM cost. Speculative ROI — today's 4-reviewer chain produced strong engineering content. Catch the field-emission bottleneck first. Defer.
- **W4 adversarial dev**: 0.5 week + recurring. TypeScript + 16 existing tests catch most regressions. LLM red-team adds noise. Skip until we have a regression problem we can't catch with existing tools.
- **W6-lite regression harness**: 1 week + $15-50/wk recurring. Currently 0 regressions; preventing future ones at unclear ROI. Defer until we have a class-by-class quality baseline worth protecting.
- **W7 exemplar packs**: 0.5 week. Helps Generator format/style, doesn't fix the substance gaps. Defer.
- **W2 multimodal at render**: 1-2 weeks + image curation. Today's dimensional envelope check (commit `cb3feb843`) already catches cabinet-vs-container at zero LLM cost. Defer.
- **W5 distillation + W6-full continuous learning**: months of infrastructure for marginal value at low usage volume. Defer to when we have ≥20 chain runs per class.

## Revised sequence (incremental, value-first)

| # | Step | Effort | Value | Proof |
|---|---|---|---|---|
| 1 | Generator prompt → mandatory `derived_parameters` schema | 3-5 days | Activates 6+ shipped gates | LED driver + pump-head findings appear as Phase 2 gate failures (currently only physics-critic catches them) |
| 2 | 3 new gates (brief-constraint, closed-loop, model-capacity) | 2-3 days | Catches 3 of 5 today's physics findings at gate-level | Findings 1, 3, 5 appear as Phase 2 failures + repair candidates |
| 3 | Engine B VF override calibration | 1 day | BoM moves from £372/m² → £600-900/m² (in band) | Cover band check turns IN_BAND |
| 4 | VF K10 reference graph | 1-2 days | K10 shadow validation actually runs for VF | K10 shadow returns PASS or specific missing-edge list, not NO_GRAPH |
| 5 | Expand SKU pattern bank | 1 day | G5 fake-rate drops from ~50% to ~30% | 73 unverified → ~45 unverified |
| 6 | G5 RAG catalogue (DEFERRED if Steps 1-5 sufficient) | 2-3 weeks | G5 fake-rate <10% | Council validates |

**Total Steps 1-5: ~1.5 weeks engineering. All compound on existing shipped code. No new infrastructure to maintain.**

**Compare to iter-9 v3 plan: ~8-10 weeks for infrastructure with uncertain marginal value at our scale.**

## Recommendation

Skip the iter-9 v3 plan. Execute Steps 1-5 over the next 5-7 working days. After each step, re-run the verify chain and measure the delta. If at the end of Step 5 the chain still has physics-critic findings >2 HIGH per run OR fake-rate >20%, THEN start considering iter-9 v3 workstreams selectively.

The right rule: **don't build infrastructure ahead of demand.** Today's 12 commits delivered partial value because the bottleneck (Generator emission) wasn't fixed first. Fix the bottleneck, then re-assess.
