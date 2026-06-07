# Scenario Planning for the Anvil Engine — Plan (v2, council-hardened)

*v1 drafted 2026-06-07; v2 folds in a design council (x-ai/grok-4.3, google/gemini-3.1-pro-preview, deepseek/deepseek-v4-pro). Decisions taken with Tristan: UNIVERSAL (validate on SAF), INVESTOR-RETURN selection, REAL chart now.*

---

## Anchors (must survive every revision)

- **A1 — UNIVERSAL.** Derived levers, no per-class hardcoding (THE AIM).
- **A2 — HONEST.** Never let a rosy scenario hide a failing base case; FOAK stays labelled FOAK; no fabricated profitability; show the gap when the target is unreachable.
- **A3 — CHEAP/deterministic.** Reuse the pure economics tool; no per-scenario LLM calls.
- **A4 — AUDIENCE FRAMING = CAPEX/OPEX/Reliability** (validated council 2026-05-20).
- **A5 — PHYSICAL COHERENCE (added v2, council #1).** Scenarios vary ONLY exogenous/market/financing assumptions that genuinely do not change the bill of materials. Physical design changes (yield, selectivity, throughput) change the BoM and may NOT be modelled by a financial scalar — they require a design re-run (deferred). Capex moves only via a labelled learning-curve, floored by the bottom-up BoM.

---

## 1. The problem (why this is high-value)

The dossier reports **one** economic outcome per design. For the SAF plant:

| Metric | Live dossier |
|---|---|
| Levelised cost | **£8,620 / t SAF** (brief NOAK target £2,200/t) |
| NPV (10%, 20 yr) | **−£75.3M** |
| Payback | **0 yr** (bug — should read "beyond plant life") |
| H₂-price sensitivity (£3/£4/£6/kg) | brief asked; dossier never provides |

**Stoichiometric reality (the killer insight):** ~1.12 kg H₂ per kg SAF, so H₂ alone costs £4,480/t at £4/kg — half the levelised cost. The £2,200/t target is infeasible unless green H₂ falls below ~£1.5/kg. A single number hides this; scenario planning surfaces it.

---

## 2. What scenario planning is — three layers

1. **Sensitivity (tornado/waterfall).** Vary one exogenous assumption at a time, rank by impact. Backbone.
2. **Named scenarios.** Coherent, BOUNDED bundles: **Downside / Base (FOAK) / NOAK** (nth-of-a-kind replication). No auto-assembled "fantasy best" bundle (council #1/#5).
3. **Goal-seek / breakeven** (replaces the fantasy recommended case; council Gemini #4, DeepSeek #4). Binary-search each lever to the investability hurdle, holding others at base: *"H₂ must fall to £1.30/kg to clear NPV≥0."* Honest, deterministic, exactly what an investor/EPC wants.

---

## 3. The levers — UNIVERSAL + split by coherence (council #1 fix)

Levers are derived from the economic-model inputs + brief, never per-class code. **v2 splits them into two classes:**

### 3a. EXOGENOUS levers — varied in v1 (do NOT change the BoM)
| Lever | Varies | Source | Bound (council gaming fix) |
|---|---|---|---|
| Feedstock/energy price | dominant variable-cost input | largest opex component; brief value overrides | market projection band |
| **Output price + policy premium** (revenue) | sale price incl. mandate/RTFO | brief market + reference price | commodity reference + realistic premium band |
| Utilisation | operating hours / capacity factor | contract | **DOWN freely; UP only to the design's rated hours** (can't exceed design without capex) |
| Cost of capital | discount rate, project life | contract | sector band |
| Capex — FOAK→NOAK | learning-curve step ONLY | literature ~10–20%/doubling | **floored by the bottom-up BoM raw-materials total** (NOAK capex can't go below what the parts cost) |

### 3b. PHYSICAL levers — EXCLUDED from v1 (change the BoM)
Yield / selectivity / round-trip efficiency / nameplate throughput. Improving these is a **design change**, not a financial assumption — it resizes vessels/catalyst/parts → new BoM/capex. Modelled only by **re-running the design chain** (a future "multi-design comparison" feature), never by a scalar in the financial recompute. The dossier states this explicitly so the reader knows why they're not in the scenario table.

**Brief overrides** (e.g. SAF brief's H₂ £3/£4/£6) map onto the feedstock-price lever's low/base/high. v1 uses per-class default ranges; full brief "sensitivity directive" NLU extraction is **deferred to v2** (council DeepSeek #5: fragile NLU overkill for MVP).

---

## 4. How it's computed — cheap, deterministic, bounded

- `yield_economics_npv.py` is a **pure function**; scenario planning calls it N times with perturbed **exogenous** inputs. No LLM calls.
- **New deterministic stage `runScenarioPlanning(state)` AFTER the cost-stack stage** so economics re-base on the **achieved** installed capex (~£25M), not the stale pre-BoM estimate. Fixes `payback=0` + NPV presentation in the same place.
- **Bounded ranges** per lever (council gaming fix) — defensible market/literature bands, not arbitrary ±%.
- **Goal-seek**: binary search the dominant lever to NPV≥0 / IRR-hurdle (deterministic, ~20 iters).
- **Scenario sanity floor** (council DeepSeek #4): re-run the existing cost-sanity check on each scenario's capex/opex; reject perturbations below the BoM-derived physical floor. A NOAK capex below the parts cost is flagged INFEASIBLE, not shown as a win.
- **IRR hurdle** = stated sector/risk default (≈12% FOAK deep-tech / ≈8% NOAK mature infra), labelled as an assumption, NOT user-tunable-to-pass (council #3).
- Output: `state.scenarioPlanning = { base, levers[], scenarios[], goalSeek[], waterfall[], honest_reading }`.

---

## 5. How it's shown in the document

react-pdf is **@react-pdf/renderer ^4.5.1** → native `Svg`/`Rect`/`Line`/`Path` (matplotlib NOT installed, so Svg is the path — vector, deterministic, no Python, no new deps).

New **"Economics & Scenarios"** section:
1. **Base-case KPI strip** — three honest capex figures (ex-works/installed/ceiling), opex (dominant component called out), levelised cost, NPV, IRR, payback. FOAK-labelled.
2. **Scenario matrix** — Downside / Base (FOAK) / NOAK × the exogenous levers + resulting levelised cost, NPV, IRR, "clears hurdle?". No fantasy "Recommended" column.
3. **Goal-seek panel** — "what would it take" per binding lever, incl. INFEASIBLE flags.
4. **Waterfall (Svg)** — bridge base NPV → NOAK NPV, Δ attributed to each lever (council: more investor-standard than a tornado; robust).
5. **Honest reading** — one paragraph naming the binding lever + the thesis.

Aligns with the validated CAPEX/OPEX/Reliability framing (`design-decisions-review.ts`); the two sections reinforce.

### Mockup (illustrative; engine computes actuals)
```
MARKET & FINANCING SCENARIOS   (only exogenous assumptions vary — the BoM is fixed)
                              Downside    Base FOAK    NOAK*
  Hydrogen price (£/kg)       6.0         4.0          2.0
  SAF price incl. premium     1.4         1.8          2.6     (Jet-A + RTFO, £/kg)
  Utilisation (h/yr ≤ design) 6,000       8,000        8,000
  Capex (FOAK→NOAK learning)  £25.2M      £25.2M       £18.0M* *floored by BoM
  Discount rate               10%         10%          8%
  ──────────────────────────────────────────────────────────
  Levelised cost (£/t SAF)    12,400      8,620        4,300
  NPV (20yr)                  −£140M      −£75M        −£22M
  Clears NPV≥0 / 12% IRR?     ✗           ✗            ✗ (closest)

WHAT WOULD IT TAKE?  (goal-seek — one lever to clear NPV≥0, others at NOAK)
  Hydrogen must fall to   £1.30/kg   (vs £2.0 NOAK, £4–6 today)   ← binding
  …or SAF price rise to   £3.90/kg   (a £2.1/kg premium over Jet-A)
  …or capex fall to       £6.5M      (below the £12M BoM floor — INFEASIBLE)

[Svg waterfall]  Base −£75M ▸ +NOAK capex ▸ +cheap H₂ ▸ +8% WACC ▸ −£22M

HONEST READING: uneconomic at FOAK; clears NO bounded scenario. Binding lever is
hydrogen — NPV≥0 needs green H₂ ≈£1.30/kg or a ≈£2.1/kg SAF premium. Capex is not
the lever; even free capex can't offset feedstock. Thesis = hydrogen-cost-down +
policy bet, not an engineering one.
```

---

## 6. Universal vs per-class (THE AIM)
One `scenario-planning.ts` reading the economic-input contract + brief, applying universal exogenous levers, recomputing via the pure economics tool. Validate on SAF, then it covers BESS (£/kWh), wind (£/kW), electrolyser, vertical farm automatically. No e_fuel hardcoding.

**Council class-robustness fixes (#2):** the "dominant variable cost" auto-pick breaks where a *fixed* cost dominates (battery factory labour) or where input≈output are the same commodity (battery: charge vs discharge electricity → don't perturb independently). v1 guards: (a) the feedstock-price lever only applies to a *traded variable input* that is a genuine NPV driver (skip if fixed-cost-dominated); (b) for storage/arbitrage classes, charge & discharge price move on a single spread parameter, not independently.

---

## 7. Architecture / wiring
- New deterministic stage `runScenarioPlanning(state)` after cost-stack/gate-32, before render (`serial-design-chain-v2.tsx`).
- New typed `state.scenarioPlanning` blob.
- New renderer section + Svg waterfall component (`render-minimal-pdf.tsx`).
- Fix `payback=0` + NPV presentation in the new stage.
- **Gate interaction:** base case is what gate-32 judges; scenarios are presentational; scenario sanity floor reuses the cost-sanity check.
- **Regression invariants:** `scenario_recompute_matches_base_economics`, `scenario_levers_are_exogenous_only` (no yield/selectivity perturbation), `scenario_capex_never_below_bom_floor`, `goalseek_reports_infeasible_when_below_floor`, `scenario_section_present_when_economics_present`.

---

## 8. Phasing
- **v1 (core):** stage (exogenous levers, bounded, economics re-based, payback fix) + scenario matrix + goal-seek + Svg waterfall + honest reading + harness invariants. Validate on SAF, spot-check BESS.
- **v2 (polish):** brief sensitivity-directive NLU extraction; probabilistic P10/P50/P90 bands (council Grok #4 / DeepSeek #4); a true multi-design comparison that re-runs the chain for physical-lever changes.
- **Councils:** design council DONE (v2). Implementation council on the diff before merge.

---

## 9. Design council verdict (2026-06-07) + remediations

| # | Finding (convergence) | Remediation (folded into §3–§5) |
|---|---|---|
| 1 | **Physics/economics decoupling** — varying physical levers post-BoM in a financial fn = fraudulent (ALL 3) | §3 lever split; A5 anchor; physical levers EXCLUDED; capex only via BoM-floored learning curve |
| 2 | Universal auto-pick breaks on fixed-cost-dominated / arbitrage classes (Grok, DeepSeek) | §6 guards: skip if fixed-cost-dominated; single spread param for storage |
| 3 | Gaming — unbounded price/premium; user-set hurdle; fantasy "Recommended" bundle (ALL 3) | §3 bounded ranges; §4 stated non-tunable hurdle; §2 drop fantasy bundle → goal-seek |
| 4 | Missing: goal-seek/breakeven; waterfall; scenario sanity floor (Gemini, DeepSeek) | §2/§4 goal-seek; §5 waterfall; §4 sanity floor |
| 5 | Over-engineered: brief-NLU override; auto-narrative; (Grok: tornado fragile) | §3 defer NLU to v2; §5 waterfall instead of tornado; honest reading kept minimal |

---

## 10. Risks / gotchas
- Pre-BoM staleness → re-based in the new stage.
- payback=0 / NPV sign → fixed here.
- Svg charts new (verify primitives import) → vector, no deps.
- Honesty → uneconomic FOAK says so + shows the path.
- Don't perturb physical levers (A5) — the single most important guard.
