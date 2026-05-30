# Auto-Improve Loop — spec (Tristan decision 2026-05-30: "also auto-improve the design")

_Make the engine iterate a design toward its brief instead of just reporting the miss. Author: Claude, 2026-05-30. Grounded in the engine's existing feasibility machinery._
_View styled: `~/.claude/scripts/show-md "/Users/tristanfischer/Developer/CentaurOS created 260126 1435/AUTO-IMPROVE-SPEC.md"`_

## What exists already (build ON this, don't duplicate)
The engine already **detects** brief-misses and **accepts** them as trade-offs:
- `closures` carry `brief_target_feasibility` (=0 means an accepted shortfall) + `status:'warn'` trade-off closures (serial-design-chain-v2.tsx:836-867).
- Stage `1.8-brief-target-reconciliation` reconciles brief target vs achievable scale.
- The gate-17 Brief Compliance table now emits a PASS/FAIL row for every brief metric (this session) — that FAIL set is the **exact objective function** the loop minimises.
- The compliance narrative even computes the achievable point in prose ("scaling to the £4.8M ceiling lands at ~X MWh").

So the engine knows WHERE it misses and BY HOW MUCH. The gap: it stops at "accepted shortfall" instead of iterating.

## The loop (after the design + compliance are computed, before final render)
1. Collect the compliance FAIL rows → the miss vector: `{metric, brief, achieved, direction (over/under), severity}`.
2. If misses exist AND iteration < MAX_ITERS (default 4) AND not previously-stalled:
   a. Pick the dominant miss (HARD before soft; biggest relative gap first).
   b. Apply the cheapest lever that reduces it (table below).
   c. Re-derive the affected contract quantities + re-run the cost-stack + compliance.
3. Stop when: all HARD constraints PASS, OR no lever improves the objective (genuine infeasibility — keep the honest trade-off), OR MAX_ITERS.
4. Render the FINAL design + a **"Design evolution"** block: each iteration's lever + the resulting trade-off (so the reader sees how it got there — honesty preserved).

## Levers (generic, ranked cheapest-first)
| Miss | Lever | Risk | Notes |
|---|---|---|---|
| Cost OVER ceiling | **(L1) Re-price material-dominated macros to grounded commodity rate** via `deriveMacroMaterialRateGbpPerKg` (decision 2) | LOW | Only cuts cost where a macro is over-priced vs reality. No design change. Safest lever — do first. |
| Cost OVER ceiling | (L2) Downrate output to fit the ceiling (scale the size-driving quantity) | MED | Real design change; trades performance for cost. Re-runs physics. |
| Cost OVER ceiling | (L3) Swap to a cheaper material/component class (e.g. geared vs direct-drive, R32 vs R290) | MED | Class-specific; needs a curated swap table per class. |
| Performance UNDER target | (L4) Scale up the size-driving quantity (more cells / bigger rotor / more canopy) | MED | Trades cost for performance — the inverse of L2; the loop balances L2↔L4 toward the brief. |
| Performance UNDER target | (L5) Upgrade a component (higher-grade, if within the cost ceiling) | MED | Class-specific. |

L2 and L4 are opposing forces; the loop converges when the design sits on the cost/performance Pareto point closest to the brief (or proves the brief infeasible at this envelope).

## Phasing (each phase validatable before the next)
- **Phase 1 — structured trade-off (SAFE, no design mutation).** Emit the miss vector + the specific recommended lever + magnitude as structured data ("downrate to 5.0 MW to meet £4.8M; costs 17% annual energy"). Render it. Deterministically testable. _This is the safe down-payment; it's strictly more than today's prose._
- **Phase 2 — L1 auto-apply (LOW risk).** Auto-apply the material-DB re-pricing lever + re-evaluate. The only mutation is grounding over-priced macros in commodity reality — it can only make the BoM more honest. Validate: council ≥ baseline on BESS.
- **Phase 3 — L2/L4 convergence loop (the real capability).** Downrate/scale to converge on the brief, with: a monotonic objective (misses must strictly decrease or stop), a MAX_ITERS cap, a stall detector, and a hard "never breach a HARD gate" guard. **Needs council validation per class** — this is where a design-mutation loop can destabilise, so it's a focused, council-gated session, NOT autonomous.

## Validation (ties to decision 1 — "one class to 8+ then wide")
Apply to **BESS first** (furthest along, ~7.45 council). The hypothesis: a design auto-improved to honour its brief scores higher (fidelity + cost-reality axes rise). Gate: council ≥ 8 on the auto-improved BESS, determinism preserved (two runs byte-stable), no HARD-gate regressions. Once proven on BESS, the levers are generic → replicate wide (the hybrid plan).

## Guards (non-negotiable — a mutation loop must not run wild)
- Objective must strictly decrease each accepted iteration, else stop (no oscillation).
- MAX_ITERS hard cap; stall detector (≤ small Δ over 2 iters → stop).
- Every iteration re-runs the 30 deterministic gates; a lever that breaks ANY gate is rejected + rolled back.
- The final "Design evolution" block must show every adjustment — auto-improvement is transparent, never hidden. (A design silently mutated to hit the brief would be a reproducible lie.)
- Determinism preserved: same brief → same evolution path (levers are deterministic, ranked, threshold-driven).

## Build status (2026-05-30)
- ✅ **Phase 1 — DONE + rendered.** `computeImprovementPlan()` (lib/auto-improve.ts) computes the miss vector + ranked quantified levers + verdict; the renderer shows an "Auto-improve — design adjustments" block on the Brief Compliance page. Verified on wind (`infeasible_at_envelope`, L2 downrate to 2.3 MW / L4 scale-up). Commit 356f38153.
- ✅ **Phase 2 lever L1 — DONE + verified (mechanism).** `applyMaterialRepriceLever()` (pure) re-prices over-priced material macros to grounded commodity rates; `applyAutoImproveToState()` applies it to a state (mutates `engineeringContract.macro_assembly_prices`, records `state.autoImproveLog`), and the renderer shows "Applied automatically — saved £X". Verified: a £180/kg steel macro → £2.3/kg, £8.89M saved, log rendered. Commits 36192e9e2 + (apply/render commit).
- ✅ **Chain integration — DONE (wired safely as an enrichment subprocess).** `scripts/apply-auto-improve.tsx` reads state.json → `applyAutoImproveToState` → writes back; wired into `serial-design-chain-v2.tsx` right AFTER the cost-repair block (~line 4818, on `statePath`) — the SAME established enrichment-subprocess pattern as cost-repair + suppliers (each reads+writes statePath before render). So it runs after pricing settles + before render + before the post-render BoM cost gate. Default ON; `CHAIN_DISABLE_AUTO_IMPROVE=1` to skip. Verified via CLI (no-op on clean wind; applies on an injected over-priced macro). The earlier "don't wire blind" caveat was resolved by finding the subprocess pattern — no blind state-object guess was needed.
- ❌ **Council validation on BESS** (decision 1 hybrid) — run a full BESS chain (now auto-improving) → council; confirm the auto-improved design scores ≥ baseline (ideally ≥8). Add the chain-level invariant `B-8 HIGH count == 0 after auto-improve`.
- ❌ **Phase 3 (L2/L4 downrate/scale convergence)** — the design-changing loop, after BESS validation, with the convergence/rollback/transparency guards above (council-gated).

## First increment for the next focused session
1. Full BESS chain run (auto-improve now ON) → council; confirm ≥ baseline + B-8 HIGH == 0. 2. Then Phase 3 (downrate/scale convergence) with the guards above.
