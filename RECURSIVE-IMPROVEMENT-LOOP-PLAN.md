# Plan — Recursive Self-Improvement Loop (deterministic engine→blender→BoM, harsh-scored, universal)

**Directive (Tristan, 2026-06-13):** drive the engine to produce a design a professional engineer with 20 years' experience would be *thrilled* with — on a UNIVERSAL basis for all archetypes. Iterate the DETERMINISTIC core (engine → blender → BoM, NO LLM narrative, NO PDF render) ~20 rounds per archetype. Score harshly: rebase the current state to **≤5** and work to **10**. Go round and round until perfect.

---

## 1. Why deterministic-only + no PDF
The PDF render + the LLM word-tree are slow (~15 min/run) and noisy. The *engineering* — sizing, geometry, bill of materials, cost — is deterministic and fast (~1–2 min). Iterating the numbers-core is the right loop: reproducible, cheap, and it isolates the real wall (sizing/BoM plausibility) from prose flake. This is exactly the "deterministic numbers-core separate from the narrative layer" decision already on record.

## 2. The deterministic core (A→H)
```
A tool-select   composeToolGraph (auto-planner, universal)
B size          contract physics quantities (tank vol, feed, duty, current…)
C lay out       build_universal_scene + connection_sizing → geometry + measured runs
D feed back     writeback-bridge (converged loads + measured lengths)  ← Inc-1 done
E re-size       physics re-runs; pull any tool the layout reveals
F settle        2–3× to a fixed point
G harvest BoM   from the SETTLED model (every placed part at final size)  ← the gap to finish
H price         DB lookup → deterministic engineering estimate on miss
```
Round-0 work: a fast standalone runner `scripts/det-loop-runner.tsx` that runs A→H on a brief and emits a **scorecard** (numbers + BoM + geometry summary + cost), no Phase-2 LLM, no render. Completing **G** (BoM from the settled model, not the LLM word-tree) is itself early-loop work.

## 3. The harsh scorecard — the 20-year-engineer test (score the FLOOR, not the average)
Per archetype, 0–10 on each dimension; **the archetype's score is the MINIMUM** (the worst dimension is what an experienced engineer notices first):
1. **Sizing correctness** — quantities/ratings right for the scale; plausible vs a known reference. *(RAS today: £34k for an £8M plant = 1/10.)*
2. **Cost realism** — £/output inside the industry band; headline reconciles with the BoM sum.
3. **BoM completeness + plausibility** — every major item present, correctly *scaled* and *priced*; no ×1 placeholders; no scale-wrong parts (a Xylem PL7020 for a 156 kW duty = fail).
4. **Geometry** — right parts at right size/location; sensible, buildable layout; nothing rendered as a cube that isn't an object.
5. **Interconnect completeness** — every tie-in routed; no severed connections; full-density census.
6. **Internal coherence** — the numbers reconcile across sizing ↔ geometry ↔ BoM ↔ cost.

**Rebase:** the current engine scores **≤5** (be harsh — most archetypes are 1–4 on sizing today). 10 = a 20-year engineer would be thrilled.

## 4. Archetypes (representative; fixes are UNIVERSAL so they compound)
RAS (process/aquaculture), CO₂ mineralisation (chemical), e-fuel (synthesis), BESS (battery), industrial robot (machine), small-sat (aero/space). One universal fix lifts the floor across all six.

## 5. The loop (each round)
1. Run the deterministic core on every archetype → scorecards.
2. Take the **global floor** (worst dimension across all archetypes).
3. Identify the **worst UNIVERSAL gap** (the one root cause limiting the most archetypes — never a per-class patch).
4. Fix it universally in the engine.
5. Re-run → re-score. Record the floor moving.
Repeat until the floor reaches 10 (or 20 rounds, reporting honestly where it plateaus and why).

## 6. Discipline (non-negotiable)
- **Deterministic** — no LLM in the loop. Reproducible, fast.
- **Universal** — no `if class`. Every fix is archetype-agnostic (the super-brief direction).
- **Score the FLOOR** — the average hides the wall.
- **Harsh** — if an experienced engineer would wince, it's not a 10.
- **No PDF** — numbers, geometry, BoM only.
- **Root cause** — fix the cause once, universally; don't paper over a symptom per archetype.

## 7. Round 1 (starts now)
The RAS run already exposes the global-floor gap: **the BoM + cost do not consume the contract's computed quantities + anchor** — the contract computed `design_equipment_capex_gbp = £8.15M` and all the physics, but the BoM emits ×1 scale-wrong catalogue parts and the cost stack reports £34k bottom-up. This is universal (any archetype whose generic BoM is scale-wrong). Round-1 fix: make the deterministic BoM harvest scale each item from the contract quantities + price it, reconciled to the anchor. Re-run → re-score.
