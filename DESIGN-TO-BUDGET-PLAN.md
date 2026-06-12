# Plan (c) — Design-to-Budget: fix a £ budget, engine returns a conforming design

**Ask (Tristan 2026-06-12):** "fix a budget and then the engine will give me a design
that conforms to that budget. It may result in a very different design."

## 1. The shape of the problem
Today the engine runs **forward**: brief → design → cost. Design-to-budget runs the
**inverse**: brief + £ ceiling → a design whose cost ≤ ceiling. There is rarely a
closed-form inverse (cost is a non-linear function of dozens of design choices), so we
solve it the same way (b) the visual loop solves render quality: a **constraint-
satisfaction iteration loop** that proposes → costs → adjusts → re-proposes until it
either lands under budget or proves the budget infeasible.

This is now tractable **because of the cost-scale work** (commits 3f7157d29 → e8f938e23):
the BoM cost now tracks the design's throughput/size bottom-up, so the engine can
**predict** how much a given adjustment saves (halving capacity ≈ ×0.6 cost by six-
tenths; carbon steel vs 316L ≈ ×0.4 on a vessel; single vs N+1 train ≈ −train cost).
Before that fix the cost was blind to the design, so "design to a budget" was impossible.

## 2. Where the budget enters (already half-present)
The brief schema **already carries cost ceilings** — the e-fuel brief states
`Installed capital cost: ≤ £45,000,000 FOAK / ≤ £20,000,000 NOAK`, parsed into
`parsedBrief.constraints.unit_cost_ceiling` / a capex ceiling. Gate-32 (independent
cost-sanity) already COMPARES the achieved £/output to bands. So the inputs + the
measurement exist; what's missing is the **act on the breach** (adjust the design),
not just flag it.

Add an explicit `budget` input (a hard £ ceiling on `costStack.oem_transfer_price_gbp`
or installed) so the user can drive it directly, separate from the brief's own ceiling.

## 3. The loop (reuse the (a)/(b) iteration scaffold + the auto-adjust precedent)
There is a precedent already chosen + shipped: **in-pipeline auto-adjust + retry**
(`src/lib/sizing/auto-adjust.ts`, `decideAutoAdjustment`, drawer "Brief auto-adjustment
architecture", Architecture A) — max 2 passes, a cover banner shows what was relaxed.
Generalise it from feasibility to **budget**:

```
design (forward pass)
  → cost (the bottom-up cost stack)
  → within budget?  ── yes → ship, banner "designed to £X budget; achieved £Y"
       │ no
       ▼
  pick the smallest-delta adjustment that closes the gap (ranked operators §4)
  → re-derive the affected quantities → re-emit BoM → re-cost
  → repeat (cap N passes; then "budget infeasible at this brief" report)
```

Cap blast radius exactly like the feasibility loop: **max ~3 budget passes**, then ship a
"this brief cannot be met under £X — the floor is £Z, driven by [H₂ feedstock / the FT
reactor / …]" report rather than looping forever or shipping a fantasy.

## 4. The adjustment operators (the cost levers), ranked
Ranked by £-impact × reversibility (cheapest, least-destructive move first). Each is a
deterministic transform on the engineering contract / emitter params — the same surfaces
the cost-scale fix taught us drive cost:

| Operator | Lever | £ effect | Notes |
|---|---|---|---|
| **Down-scale capacity** | reduce the brief's throughput target | ×(new/old)^0.6 (six-tenths) | the BIG move; "very different design". Bounded by a min viable scale. |
| **Material downgrade** | 316L → carbon steel + coating where the process allows | ~×0.4 on a vessel shell | gated by the physics critic (corrosion/temp) — never downgrade a wetted-MEA part. |
| **Redundancy trim** | N+1 → N on pumps/compressors | −1 unit cost | gated by availability requirement in the brief. |
| **Spec trim** | reduce design-pressure/temp margins to code-minimum | curve shift | gated by the safety gates. |
| **Make-vs-buy shift** | buy a packaged skid vs field-fabricate | varies | uses the Part-2 make-vs-buy layer (already built). |
| **Feature cut** | drop a non-essential sub-module (e.g. a polishing stage) | −module | last resort; flagged in the banner. |

The engine **predicts** each operator's saving from the cost model, picks the smallest
set that closes the gap, applies, re-costs to confirm. "Very different design" = the
down-scale + material operators are allowed to make large moves, not just trim.

## 5. The "design changed" contract (Tristan: "may result in a very different design")
- The loop is allowed to change the DESIGN, never silently the BRIEF's hard goals
  (the canopy_area=672 disaster rule). If hitting budget needs a smaller plant, that is
  a DESIGN change the user opted into by fixing a budget — but it MUST be surfaced:
  cover banner + a "Budget-driven design decisions" page: "To meet £X: capacity 2,000 →
  1,300 t/yr, vessels carbon-steel, single recycle compressor. Net £Y."
- If the budget can only be met by violating a HARD brief constraint (e.g. the SAF
  output floor), that is "infeasible" → report, don't ship a design that quietly misses
  the brief.

## 6. Why it finds bugs / is useful
- It **stress-tests the cost model end-to-end**: design-to-budget only works if the cost
  genuinely drops when you scale down — which is exactly the bottom-up scaling the 2×
  test forced in. A flat/frozen cost line (the bug class just fixed) makes the loop fail
  to converge → surfaces residual cost-scale bugs (e.g. the deferred #86 carbon/transport
  mass, or any class still on flat pins).
- It makes the dossier **decision-useful**: a founder with £20M sees the £20M design, not
  a £45M one they can't fund.

## 7. Implementation phases
1. **P1 — budget input + the cost-vs-budget gate** (small): add `budget_gbp` to the
   brief/CLI; a deterministic check `costStack vs budget` after the forward pass.
2. **P2 — the operator library** (`design-to-budget.ts`): the ranked operators §4 as pure
   transforms on the engineering contract, each with a `predictedSaving()` + a guard
   (which gate forbids it). Reuse `auto-adjust.ts`'s decide→apply→retry skeleton.
3. **P3 — the loop** wired into the chain after costing, before render (cap 3 passes),
   emitting `budget-report.json` {target, achieved, operators_applied[], infeasible?}.
4. **P4 — reporting**: cover banner + a "Budget-driven design decisions" page.
5. **P5 — verify**: run e-fuel at £45M, £30M, £20M; confirm distinct, cheaper, COHERENT
   designs (not just relabelled numbers) + the cost actually lands under each ceiling.

## 8. Risks / guards
- **Goodhart**: the loop must not "hit budget" by under-pricing (that's the flat-pin bug
  inverted). Cost grounding (DOE/NETL) keeps each line honest; gate-21/B-7 catch under-bill.
- **Oscillation**: dampen (smallest-delta operator, no operator + its inverse in one run).
- **Hard-constraint protection**: never trade away a brief HARD goal to hit budget — that's
  "infeasible", per §5.
- **Min viable scale**: down-scaling has a floor (a 10 t/yr SAF plant isn't a real plant);
  bound it per class.
