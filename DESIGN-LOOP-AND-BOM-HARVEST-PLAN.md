# Closed design loop + bill-of-materials harvest — PLAN (for sign-off)

> Status: **PROPOSED, nothing built.** Written 2026-06-12 after tracing one number end-to-end.
> Honesty rule for this whole workstream: every "done" claim is backed by a file field or a
> grep you can run, or it is marked "unknown". Each phase has ONE machine-checkable proof.

## 0. The verified current truth (so the plan rests on facts, not memory)

What I confirmed by reading the code + a live dossier (`out/redo-efuel-env-budget`):

1. **The bill of materials is built from the word tree, module by module** — `bom-builder.ts::buildDeterministicPhase(modules: Module[])`. It is NOT harvested from the Blender model. *(verified: function signature)*
2. **The Blender world already routes real pipe + cable runs** — `route-manifest.json` carries, per run, `length_m`, `outer_dia_mm`, `size_label` (e.g. DN50), `waypoints`, and `fittings` (elbows). 8 runs: 6 fluid, 1 thermal, 1 electrical. *(verified: read the JSON)*
3. **The physics↔CAD convergence loop already exists** — `convergence_loop.py` iterates pipe-friction→pump-load and cable-I²R→cooling-load to a fixed point in 2–4 passes. *(verified: read it; it ran, converged in 2 iters)*
4. **The loop is OPEN — its output is decorative.** Traced end-to-end: the loop converged electrical demand 6000 → **6013.925 kW** and sized a **5895 mm² Cu feeder at 9137 A**. The dossier still uses **6000 kW** (`connected_electrical_load_kw`, source: brief); "6013" / "5895" / "9137" appear **0×** in `state.json`. The PDF prints one sentence about the loop and engineers with the pre-loop number. *(verified: grep counts)*
5. **Interconnect is absent from the bill of materials** — 5 discrete valves, **zero** pipe-metres, cable-metres, fittings, trays or supports. The emitter has no `length_m`/route reference, so even the valves aren't priced off the real routed geometry. *(verified: grep)*
6. **"Cheaper / smaller" is a power-law estimate, not a re-design** — `budget_solve.py` scales cost ∝ capacity^0.6 and reports implied output; it does not re-size, re-route, or re-cost. The page says so. *(verified: I wrote it)*

**Conclusion:** three islands (engine · CAD-with-routing · cost/scale-estimates) that don't close. Your intuition was right on all three points.

## 1. The target architecture

```
brief ─▶ PHYSICS: size equipment + loads
           │
           ▼
        CAD/ROUTE: place + route pipes & cables → lengths, diameters, fittings   [EXISTS]
           │
   ┌──────▶├─ FEEDBACK: converged loads + geometry RE-ENTER physics → re-size    [BUILD: Gap 1]
   │       │     pumps / feeders / cooling
   │       ▼
   └─ loop ≥2× until the numbers stop moving        [logic EXISTS, not wired back]
           │
           ▼
        HARVEST: bill of materials FROM the converged model —
                 equipment + every metre of pipe + every metre of cable +
                 fittings + trays + supports → ONE list                          [BUILD: Gap 2 ★]
           │
           ▼
        COST from the harvested list                                             [partly EXISTS]
           │
           ▼
        ADJUST: (a) cheaper, hold in/out  →  value-engineer (grade, wall, route)  [BUILD: Gap 3]
                (b) cheaper, can't hold    →  shrink → e.g. 50% cost ≈ 60% output
           │  (any adjustment re-enters PHYSICS → CAD → harvest)
           ▼
        FINAL PHYSICS CHECK pass → render the 8 sheets + dossier
```

Note: this is a **separate subsystem from the PDF renderer** — exactly as you sensed. It produces a
converged `state.json` + a harvested bill of materials. The PDF is a downstream consumer.

## 2. Phases (each independently shippable + provable)

> ### ⚠ CORRECTION 2026-06-12 (pre-change search + open-and-look — verified vs source AND the rendered page)
> Corrected TWICE this turn. Most of this entire plan is **already built (2026-06-11)** — verified in
> source and by opening the rendered PDF:
> - Harvester + cost model + feedback loop: `connection_cost` / `connection_schedule_costed` /
>   `merge_distribution_bom` / `size_connection_to_spec` in `connection_sizing.py`; `convergence_loop.py`
>   + Phase-D auto-upsize. **Built.**
> - **The interconnect bill of materials already RENDERS** — `render-minimal-pdf.tsx::buildDistributionCablingPages`
>   (invoked line 17177) produces **page 100 "Part 3 · Distribution & cabling", £41,854**, honestly
>   labelled (UK-2026 supply+install model, AACE Class 4, indicative). My earlier "empty grep" checked the
>   wrong file (the CHAIN); the wiring is in the RENDERER. **Built + renders.** (Task #75 / W4.1.)
>
> So the spine I proposed is ~80% pre-existing. The GENUINELY-remaining work, re-scoped:
> - **R1 — close the loop to the ENGINE.** Converged demand (6013.9 kW) + feeder must flow back into the
>   engine's headline quantities (still 6000). Today the loop moves the drawings, not the numbers. Small.
>   *(Ordering wrinkle: convergence runs in `generate_drawing_set` ~line 6682, AFTER BoM/cost/render — so
>   closing it needs an early routing+convergence pass before BoM/cost. Verify ordering before editing.)*
> - **R2 — TOPOLOGY DENSIFICATION (the real long-pole, the "higher-quality outcome").** 8 routed runs →
>   £41,854 (one £31,201 bus dominates); 2–3 orders below a real plant's total field piping/cabling/
>   instrument-wiring/utilities/tray-fill. Densify toward a P&ID census so the harvested BoM is COMPLETE.
>   Multi-day; coverage not code; the same universal long-pole as the rest of the engine.
> - **R3 — fold the interconnect £ into the HEADLINE cost** (gate-2 B-3 + gate-32 reconcile). Do this
>   ONLY AFTER R2 — folding an incomplete number into a £34M headline would mislead; additive+labelled is
>   the honest interim (its current state).
> - **R4 — cost-adjust as a real RE-RUN** (value-engineer / scale-down), replacing the power-law estimate.
> - **R5 — orchestrate ≥2 physics↔CAD round trips + a final physics check** before render; + the ledger (old Phase 0).
>
> The old Phase 0/1/2/4/5/6 numbering below predates this correction — read R1–R5 as the live scope.

### Phase 0 — the loop ledger (the honesty backbone). ~½ day, low risk.
Add `design-loop-ledger.json`: one record per pass with the numbers that changed
(`{pass, electrical_kw, feeder_mm2, bom_total_gbp, output, changed_fields[]}`).
**Proof:** the ledger exists and shows N passes. Every later "it looped 3 times" claim is read from here.

### Phase 1 — close the geometry→physics feedback (Gap 1). ~1 day, low risk.
Write `convergence_loop`'s converged outputs BACK into the engine's quantities BEFORE the bill of
materials + cost + spec sheet are built: `connected_electrical_load_kw` 6000→6013.925, emit the
feeder busbar spec, uplift pump driver power by the friction term.
**Proof:** `state.json` shows 6013.925 and the 5895 mm² feeder; the spec sheet prints the converged
demand, not 6000. *(Honest caveat: numerically small here — 0.23% — but it proves the loop closes and
is the scaffold for the rest. On long-run / high-current plants it matters more.)*

### Phase 2 — harvest interconnect into the bill of materials (Gap 2 — ★ highest value). ~2–4 days.
For each run in `route-manifest.json` emit real bill-of-materials lines:
pipe (`length_m` × £/m by diameter+material+schedule), elbows/fittings (from `fittings[]`), flanges,
inline valves, **pipe supports** (1 per N m), cable (`length_m` × £/m by size), **cable tray**, glands,
terminations. Needs a small **interconnect unit-rate model** (£/m by size+material) grounded in the
DOE/NETL piping factors or a distributor table — built on the existing `process-equipment-cost.ts`.
**Proof:** the bill-of-materials JSON gains lines like "Pipe, DN50, CS, 14.82 m"; the line count
matches the 8 routes' material take-off; installed cost rises by a **defensible** interconnect fraction
(independently sanity-checked vs the 20–40% industry band — not asserted).
*(Honest risk: defensible unit rates are the hard part; it will start with a coarse rate table and tighten.)*

### Phase 3 — make the model the single source for EQUIPMENT too (cross-check, not rewrite). ~1 day.
Today equipment bill of materials = word tree; the model is parallel. Add a **reconciliation gate**:
every placed object in `parts-manifest.json` must map to a bill-of-materials line and vice-versa; flag
divergences. (Don't rip out the word-tree emitter yet — cross-check first, converge later.)
**Proof:** a gate that lists any object-without-a-line or line-without-an-object; target zero.

### Phase 4 — real cost-adjust loop, two modes (Gap 3). ~2–3 days, depends on 1+2.
Replace the power-law estimate with an actual re-run at a target:
- **(a) value-engineering** — hold inputs/outputs; turn levers (material grade, wall schedule, shorter
  routes, standardised sizes); re-harvest; re-cost. Report the £ saved + what changed.
- **(b) scale-down** — reduce the output target; re-size; re-route; re-harvest; re-cost; **report the
  output penalty** ("£ −50% ⇒ output −40%", from the real re-run, not cost^0.6).
**Proof:** a £-target produces a NEW `state.json` with changed diameters/equipment + a ledger entry
showing the re-run; cost is harvested, not power-law.

### Phase 5 — footprint / output as first-class dials. ~1 day, depends on 4.
"Bigger/smaller footprint" and "more/less output" drive a **real** re-run through Phase 1–2 (today the
envelope output-flex is an estimate). **Proof:** a footprint request yields a re-routed, re-harvested model.

### Phase 6 — orchestrate the mandatory 2–3 round trips + final check. ~1 day, depends on all.
Driver: physics→CAD→physics→CAD→physics (**≥2 round trips**), then a **final physics confirmation pass**,
THEN render. **Proof:** the ledger shows ≥2 round trips with converging numbers and a final "confirmed" pass.

## 3. What already exists (so we don't rebuild it)
- `route-manifest.json` with length + diameter + fittings — the harvest INPUT is ready. ✔
- `convergence_loop.py` — the feedback maths is done; it just isn't wired back. ✔
- `process-equipment-cost.ts` (DOE/NETL curves), `build-cost-basis.ts`, `costStack` — equipment cost engine. ✔
- `bom-builder.ts` — equipment bill of materials from the word tree (becomes a cross-check in Phase 3). ✔
- `budget_solve.py`, envelope output-flex — estimates, upgraded to real re-runs in Phase 4–5. ✔

**New code = 4 focused pieces:** the CAD→engine write-back bridge (P1), the interconnect-harvester +
unit-rate model (P2), the loop orchestrator + ledger (P0/P6), the real cost-adjust re-run modes (P4).

## 4. Honest effort + sequencing
Spine: **0 → 1 → 2** (the loop closes + the bill of materials gets the missing 20–40%). Then **4–5**
(cost/footprint adjust) which depend on 2. **3 + 6** harden + orchestrate. Rough total ~9–13 focused days.
Each phase ships + proves on its own; we stop/steer between any two.

## 5. The honesty mechanism (standing, per phase)
1. One machine-checkable proof per phase (a grep/field above) — green or it isn't done.
2. `design-loop-ledger.json` records every pass; "looped N times" is read from it, never claimed.
3. For anything rendered, I open the page and look (today's lesson).
4. A regression invariant per phase (project rule) so iter-N catches iter-(N+1).
5. Confidence level + file:field on every status I report.

## 6. Decision needed
- Approve the spine (Phase 0→1→2) to start? Or adjust scope/sequence first?
- One open question for you: the interconnect **unit-rate source** for Phase 2 — DOE/NETL factor method
  (fast, defensible, ±30%) vs distributor/RS-Means-style line rates (slower, tighter). My lean: factor
  method first, tighten later. Your call.
