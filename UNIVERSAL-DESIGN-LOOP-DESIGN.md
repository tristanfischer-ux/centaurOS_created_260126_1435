# The Universal Design Loop — full design (for sign-off before any engine change)

> Written 2026-06-12. Supersedes the phasing in `DESIGN-LOOP-AND-BOM-HARVEST-PLAN.md` (kept as the
> investigation trail). **Status: design only — nothing built.** One engine, every class. No CO2 fork.
> Every file/line below was verified in source this session; where I'm inferring I say so.

## 0. The aim, in your words
Physics picks the tools and sizes the kit → Blender lays it out for the **shortest runs** and measures
the connections → the layout feeds **back** into physics to re-size → round it **2–3 times until it
settles** → the **settled model is the source of the bill of materials** → each line gets a parts+price
lookup, deterministic estimate where no price exists. Then *"make it X% cheaper"* re-enters the same
loop: hold output, cut cost; and when the money won't buy that output, **shrink the system** (non-linear)
and loop again. **Universal** — CO2 is just another prompt; **deterministic**; and it must never drift
into a second engine.

## 1. The division of labour (the shared vocabulary)
- **Physics decides WHAT and HOW BIG** — which tools fire (the input→process→output chain), unit sizes,
  loads, duties, and the material spec each unit needs (a pressure vessel → steel grade + wall from the
  pressure/temperature; a hot line → trace heating).
- **Blender decides WHERE, WHAT-CONNECTS, and HOW-LONG** — deterministic placement for the shortest runs,
  routes every connection, measures real lengths, and derives the layout-dependent loads (pipe friction →
  pump power; cable I²R → cooling).
- **The loop is them settling together.** The bill of materials is harvested from the settled result.

## 1.5 The deterministic numbers core vs the narrative layer (Tristan 2026-06-12 — key)
The whole of **A→H is a fast, PURE-NUMBERS, deterministic calculation** — tool-select → size → lay out →
settle → harvest bill of materials → price. No LLM in the loop; it just spits out the engineering result,
and it's quick (seconds of compute + a couple of ~1–2 min Blender passes). The **narrative / module prose
/ dossier text is a SEPARATE final layer** generated ONCE on the settled numbers (this is the expensive
LLM part). Two consequences:
- **Cost-adjust runs on the cheap deterministic core, not the LLM.** Re-running the design at a different
  scale/budget = spin A→H again (cheap); the narrative is regenerated only on the final chosen design.
- **Honest current state:** today the chain INTERLEAVES the LLM (module decomposition that defines the
  parts) with the deterministic engineering, and the bill of materials is built from that LLM word-tree.
  Part of this build (Stage F) is **separating them** — the equipment census + sizes + layout + bill of
  materials + cost come from the deterministic settled model; the LLM only writes the prose describing it.
  That separation is what makes the loop fast and cost-adjust cheap. It is a real refactor, staged below.

## 2. What already exists (verified — so we extend, never rebuild)
| Piece | Where | State |
|---|---|---|
| Tool selection (input→process→output) | `composeToolGraph` (`scripts/lib/orchestrator/auto-planner.ts`, `UNIVERSAL_AUTO_PLAN`, `auto-plan-fallback.ts`) | works |
| Physics sizing | orchestrator tools + `engineering-contract.ts` + class plans/emitters | works |
| Equipment bill of materials | `bom-builder.ts::buildDeterministicPhase(modules)` | works — but from the *pre-loop word tree* |
| Blender layout + shortest-run routing | `build_universal_scene.py` (`route_topology`, spine + trunk-and-branch, `_sized_dia_mm`) | works |
| Per-connection sizing + feedback maths | `connection_sizing.py` (`size_connection_to_spec`, Phase-D auto-upsize), `convergence_loop.py` (`run_convergence`) | works — but **siloed** |
| Interconnect bill of materials (priced) | `connection_cost` / `connection_schedule_costed` → `connection-bom.md`; rendered by `buildDistributionCablingPages` (`render-minimal-pdf.tsx:16672`, invoked `:17177`) | works — **additive**, sparse |
| Equipment pricing | parts-DB lookup + `build-cost-basis.ts` + `process-equipment-cost.ts` (DOE/NETL) + deterministic fallback | works |
| Cost-adjust | `budget_solve.py` (six-tenths) | **estimate only**, not a re-run |

**The one structural fault** (verified): the chain runs **BoM + cost (lines 5877–6421) → Blender layout +
routing + convergence (6682) → render (6719)**. The geometry runs *after* the numbers are locked, so the
loop is open: CO2 converges 87.25 → 87.39 kW and e-fuel 6000 → 6013.9 kW, then both dossiers keep the
pre-loop number. Nothing is broken or forked — the stages are just in the wrong order to feed each other.

## 3. The loop (the design)

```
A. TOOL-SELECT   brief → composeToolGraph → the input→process→output tool chain + the process topology
        │
        ▼
B. PHYSICS PASS  run the tools → unit sizes, loads, duties, material specs (per topology edge a rating)
        │
        ▼
C. BLENDER PASS  place for SHORTEST runs → route every connection → measure lengths → size each run →
        │        derive parasitic loads (pipe ΔP → pump kW; cable I²R → cooling kW)
        ▼
D. FEEDBACK      write C's results BACK into the engine quantities:                         ◀── NEW
        │          • converged loads (connected_electrical_load_kw, cooling_kw …)
        │          • measured run lengths, footprint, structural spans
        ▼
E. RE-SIZE       re-run the affected tools with the updated quantities.                      ◀── NEW
        │        AND: the layout may REVEAL A TOOL that wasn't needed until now —
        │          long run → booster-pump tool; wide span → support-steel tool;
        │          hot line → trace-heating tool. Detect, add to the plan, run it.
        │
        └──────▶ loop B→C→D→E until SETTLED (demand, sizes, AND the tool set stop moving
                  within tolerance). Geometric contraction → 2–3 passes (per convergence_loop).
        │
        ▼
F. HARVEST       the SETTLED model IS the bill of materials:                                 ◀── NEW (unify)
        │          • every placed vessel → a line at its final size + tool-derived material spec
        │          • every routed run → an interconnect line at its measured length
        ▼
G. PRICE         each line → parts-DB lookup; deterministic estimate where no price exists   (exists)
        │
        ▼
H. RENDER        the settled design + the harvested bill of materials + the 8 drawings       (exists)
```

**Settle criterion (deterministic, honest):** stop when the relative change in total demand AND in the
equipment-size vector AND in the tool set is below tolerance (e.g. 0.5%), OR at a hard cap of N passes
(e.g. 4) — and if it hits the cap without settling, **say so** in the ledger (damped, never silent).

**The new-tool-mid-cycle mechanism (your point, the reason it's 2–3 not 1):** after each Blender pass, a
small deterministic **"layout-revealed needs" detector** inspects the routed model for features that
demand a tool not yet in the plan (run length > threshold → booster; unsupported span → support steel;
line temperature + length → trace heating; head/flow → re-check pump curve). Anything it finds is added
to `composeToolGraph`'s plan for the next pass. So the tool set itself converges, not just the numbers.

## 4. Cost-adjust — a SEPARATE invocation on the deterministic core (Tristan 2026-06-12)
**When:** the base A→H always spits out the full-spec design at its best honest price — that's the default
dossier. Cost-adjust is a **separate thing you ask for**; it spins the cheap deterministic core (§1.5),
not the LLM. The behaviour you specified:
1. **Always show the full feature-set you asked for, at the best honest price** — the complete design,
   value-engineered as cheap as it can be *without* dropping anything you asked for. This is shown every time.
2. **If you also set a price target and the full spec can't hit it:** the engine **auto-picks the cheapest
   design that still meets the brief**, and then — because the full spec exceeds your price — it **shows, in
   detail, what would have to get SMALLER to hit that price**: the down-rated design, exactly which units
   shrank and by how much, and the **honest output penalty**. The penalty is non-linear (six-tenths): 0.7×
   cost ≈ 0.7^(1/0.6) ≈ **0.57× output**, not 0.7×.
3. **Always show the actual output** of whatever is presented — full-spec and down-rated alike.
So the output is: *(a)* the full design at its best honest price, and *(b)* if a budget was set and missed,
the down-rated-to-budget design in detail with its output penalty. Auto-picked, both shown, nothing hidden.
Every variant is a **real re-run of the deterministic core** (settled model + harvested bill of materials),
not the power-law guess `budget_solve.py` does today.

## 5. Universality + the no-drift guarantee (your central concern)
- **One engine.** All of this lands in `serial-design-chain-v2.tsx` + `build_universal_scene.py` +
  `connection_sizing.py`/`convergence_loop.py`. **No `if co2` / `if efuel` anywhere** — verified there is
  none today, and the rule is it stays that way.
- **Proven on two classes every increment.** Each step below ships only when it's shown working on **CO2
  AND e-fuel in the same run** (different archetypes: process-with-reactors vs process-with-columns).
- **A regression invariant per increment** (`scripts/regression-harness.tsx`) so a change that helps one
  class can't silently break another — the exact mechanism that has caught the recurring bug families.
- **Deterministic loop.** B–H carry no LLM in the convergence; the LLM only frames tool-selection at A.
  Re-runs are reproducible.
- **Drift tripwire.** If any increment would need a class-specific branch, I stop and tell you *then* —
  that's the signal the design is wrong, not a thing to paper over.

## 6. Honesty / verification (built into the loop, not a promise)
1. **A loop ledger** (`design-loop-ledger.json`): per pass, the numbers that changed + the settle test.
   "Settled in 3 passes" is *read from it*, never asserted.
2. **Every bill-of-materials line stamped** with provenance: real price vs deterministic estimate; the
   tool that set its material spec.
3. **Open the rendered page** and look — for CO2 and e-fuel — before any "done".
4. **Interconnect honesty:** until the topology is dense (Increment 6), the interconnect stays labelled
   "major routed runs", because pricing 8 runs as if it were the whole plant is 2–3 orders low.

## 7. Build increments (each provable on CO2 + e-fuel, each independently shippable)
1. **Writeback bridge + ledger** (Stage D + §6.1). Pure, unit-tested: converged loads + measured lengths
   → engine-quantity updates. Low risk (new file, doesn't touch the chain yet).
2. **Close ONE round trip** (B→C→D→E once): insert an early layout+convergence pass *before* the cost
   stack; converged demand + lengths move the headline + the bill of materials. **Prove:** CO2's 87 kW
   and e-fuel's 6000 kW actually change in the rendered dossier.
3. **Iterate to the fixed point** (2–3 passes + the settle criterion + damping + honest cap).
4. **Layout-revealed new tools** (Stage E detector) — start with 2–3 obvious triggers, widen over time.
5. **Bill of materials from the settled model** (Stage F): unify equipment (final sizes) + interconnect
   (measured runs) into one harvested list; reconcile into the headline cost (gates 2 B-3 + 32).
6. **Topology densification — to FULL density (Tristan 2026-06-12).** Not "major runs" — grow the routed
   connection set to the **complete** piping-and-instrumentation census: every connection down to the nail.
   **Completeness is finite, not an asymptote** (your earlier point): the floor is the procurement-meaningful
   component, and screws/bolts/sundries collapse to a **single "fixings & sundries" allowance line** —
   everything else is itemised. The multi-day coverage long-pole, but it has a definite end state: complete.
7. **Cost-adjust outer loop** (Modes 1 + 2) — replace the power-law estimate with real re-runs.

Spine = 1→2→3 (the loop actually closes). 5 makes the model the source of the bill of materials. 6 makes
it complete. 4 + 7 are the high-value extensions. Rough order-of-magnitude: spine ~3–4 days; 4–7 the bulk.

## 8. Honest risks + open questions
- **Loop cost:** the Blender layout pass is ~1–2 min (measured: the CO2 pass just now). 2–3 passes = 3–6
  min added per dossier. Acceptable for a deterministic design loop; flagged so it's a known cost.
- **Convergence may oscillate** for some class — hence damping + a hard pass cap + an honest "did not
  settle" in the ledger rather than a fake fixed point.
- **The new-tool detector is the most novel piece** — it's rules ("what layout feature demands what
  tool"); it'll start small and grow. Not magic; honest about coverage.
- **Topology densification (6)** is the real long-pole — same universal coverage problem as the rest of
  the engine; it's where most of the time goes.
- **Material-spec derivation** (pressure → steel grade) exists partially in the sizing tools; Stage F
  needs it driven from the *settled* model uniformly across classes — may surface per-class gaps to fill.
- **RESOLVED (Tristan 2026-06-12):** the engine **auto-picks the cheapest design that meets the brief**.
  It always shows the full feature-set at its best honest price; and if a price target was set and the full
  spec can't hit it, it *additionally* shows — in detail — the down-rated design that does, with the honest
  output penalty. Both shown, auto-picked, nothing hidden. (See §4.)
- **Topology target is FULL density** (§7.6) — complete census, screws/bolts as one allowance line; not a
  sparse subset. Material-spec derivation (pressure → steel grade) is confirmed in-scope for Stage F.
