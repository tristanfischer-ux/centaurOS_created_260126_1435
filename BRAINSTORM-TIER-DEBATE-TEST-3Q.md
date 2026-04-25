# Brainstorming Council Tier Debate Test — 3-Question Replication

**Run date:** 20260425
**Branch:** feat/forge-v2-cutover
**Anthropic judge:** claude-opus-4-7
**Non-Anthropic judge:** deepseek-reasoner (DeepSeek V4-Pro reasoning model)
**JSON output:** `experiments/results/brainstorming-council-tier-test-3q-20260425_125328.json`

Per RED-TEAM-PIVOT-PLAN.md line 213: the original single-question test used only an Anthropic judge. This run extends to 3 questions and cross-checks with DeepSeek deepseek-reasoner as the non-Anthropic judge.

## Scoring rubric

Five dimensions, 1-5 scale with 0.5 increments. Same rubric as the original test (Actionability / Specificity / Strategic Depth / Voice Consistency / Multi-specialist Coherence). Composite = mean of all five dimensions.

Tier labels: A = Quick Council (Free), B = Full Council (Starter), C = Deep Council (Pro), D = Strategy Council (Enterprise).

## Questions used

**Q1 (fundraising):** Should we raise a Series A now or extend our runway by another 9 months?

Context: Hardware startup building an industrial inspection drone. Revenue is £380,000 annualised, growing at 18% per month for the last four months. Burn rate is £95,000 per month and there is nine months of runway at current burn. Two Series A term sheets on the table: one at £6M at a £28M post-money valuation, one at £5M at a £22M post-money valuation. The founder can likely extend runway by cutting burn to £55,000 per month by pausing two hires.

**Q2 (product strategy):** Our hardware product is 80% locked. Should we keep iterating or start manufacturing?

Context: Consumer health wearable startup, post-seed. Prototype has been through six design revisions over 14 months. Current bill of materials cost is £47 per unit at prototype volumes; contract manufacturer quotes £18 per unit at 10,000-unit minimum order quantity. Three beta users in the last iteration flagged a single unresolved issue: the sensor accuracy drops by 12% when ambient temperature exceeds 30 degrees Celsius. The fix requires a new sensor module that costs an additional £4 per unit. The team has 18 months of runway. The market window for this category is competitive with two funded rivals expected to launch within six months.

**Q3 (operations and scaling):** Our team is 5 people; we need to triple in 12 months. What is the right hiring sequence?

Context: Business-to-business software-as-a-service startup in the logistics sector. Current team: 1 founder-chief executive officer, 1 lead engineer, 1 product designer, 1 sales development representative, 1 customer success manager. Annual recurring revenue is £420,000 with a net revenue retention of 118%. The sales development representative closed 3 deals in the last 90 days at an average contract value of £28,000. Customer acquisition cost is £4,200. Seed funding closes at £1.8M in 30 days. The founder is technically strong but has not hired beyond 5 people before.

## Per-question results

### Q1: Should we raise a Series A now or extend our runway by another 9 months?

#### Scores by tier and judge

| Tier | Judge | Action. | Spec. | Depth | Voice | Coherence | Composite |
|---|---|---|---|---|---|---|---|
| Quick Council (Free) | Anthropic | 4.5 | 4.5 | 4 | 3.5 | 3 | 3.9 |
| Quick Council (Free) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5 |
| Full Council (Starter) | Anthropic | 4.5 | 4.5 | 4.5 | 4.5 | 4.5 | 4.5 |
| Full Council (Starter) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5.0 |
| Deep Council (Pro) | Anthropic | 4.5 | 4.5 | 4.5 | 4.5 | 4.5 | 4.5 |
| Deep Council (Pro) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5 |
| Strategy Council (Enterprise) | Anthropic | 4.5 | 4.5 | 4.5 | 4.5 | 4.5 | 4.5 |
| Strategy Council (Enterprise) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5 |

#### Tier step deltas (composite score)

| Step | Anthropic judge | DeepSeek judge |
|---|---|---|
| Free to Starter | 0.6 | 0.0 |
| Starter to Pro | 0.0 | 0.0 |
| Pro to Enterprise | 0.0 | 0 |

#### Fiona close synthesis (abbreviated per tier)

**Quick Council (Free):** **WHERE THEY AGREED**  All four specialists agree on the core arithmetic: taking the £6M term sheet at £28M post-money valuation now is the safer play, because pausing two hires to extend runway will almost certainly decelerate your 18% monthly growth rate, which is the only asset that makes waiting valuable. Sage, Finn, Sal, and Mia all arrived at the same conclusion through different doors — Sage via the fragility of hardware revenue, Finn via the burn-to-revenue ratio and margin compression, Sal via the cost of lost momentum, and Mia via the capacity constraint that those two roles are alre...

**Full Council (Starter):** ## WHERE THEY AGREED  All four specialists agreed on one thing that the surface question obscures: the decision to extend runway by cutting burn to £55,000 per month is not a neutral act, and the cost is almost certainly higher than it appears. Sage said it plainly — you cannot bank the momentum and also bank the optionality. Finn ran the cascade: if pausing two hires drops month-on-month growth from 18% to 12%, annualised revenue in nine months falls from roughly £2.1 million to roughly £1.1 million, which likely wipes out the entire £6 million valuation gap between the two term sheets. Sal n...

**Deep Council (Pro):** **WHERE THEY AGREED**  All four landed in the same place on the headline: take the Series A now, and take the six million pound term sheet at twenty-eight million pound post-money — not the smaller one, and not the runway extension. Sage called the runway-extension play "a trap" because the forty thousand pound monthly saving is dwarfed by the one million pound delta between the two term sheets. Finn ran the numbers and showed that pausing two hires only buys six and a half months of additional runway, not nine, because fixed costs continue. Sal framed every week of delay as seventeen and a ha...

**Strategy Council (Enterprise):** **WHERE THEY AGREED**  All four arrived at the same destination: raise now, take the £6M at £28M post-money term sheet, and do not pause the two hires to extend runway. Sage called the burn cut "quiet sabotage"; Finn showed the runway extension is actually 6.6 months not nine (at £55,000 per month burn against £855,000 cash); Sal warned that if those hires are quota-carrying or deployment-critical, the eighteen percent monthly growth on £380,000 annualised collapses; Mia framed the same hires as the deployment velocity that produces the case studies the next round is priced on. They also agree...

### Q2: Our hardware product is 80% locked. Should we keep iterating or start manufacturing?

#### Scores by tier and judge

| Tier | Judge | Action. | Spec. | Depth | Voice | Coherence | Composite |
|---|---|---|---|---|---|---|---|
| Quick Council (Free) | Anthropic | 4.0 | 4.0 | 4.0 | 4.0 | 4.5 | 4.1 |
| Quick Council (Free) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5.0 |
| Full Council (Starter) | Anthropic | 4.5 | 4.5 | 4.5 | 4.5 | 5.0 | 4.6 |
| Full Council (Starter) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5 |
| Deep Council (Pro) | Anthropic | 5 | 5 | 4.5 | 4.5 | 4.5 | 4.7 |
| Deep Council (Pro) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5 |
| Strategy Council (Enterprise) | Anthropic | 4.5 | 5 | 4.5 | 4.5 | 4.5 | 4.6 |
| Strategy Council (Enterprise) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5 |

#### Tier step deltas (composite score)

| Step | Anthropic judge | DeepSeek judge |
|---|---|---|
| Free to Starter | 0.5 | 0.0 |
| Starter to Pro | 0.1 | 0 |
| Pro to Enterprise | -0.1 | 0 |

#### Fiona close synthesis (abbreviated per tier)

**Quick Council (Free):** # THE COUNCIL'S SYNTHESIS  **Where they agreed**  All four specialists agree on the same hard constraint: your 18-month runway is the clock, and every week you delay manufacturing burns cash without generating revenue. They also agree that the 10,000-unit minimum order quantity is a genuine trap—not because manufacturing is wrong, but because you cannot afford to lock £180,000 in inventory without knowing your market will absorb it. The sensor accuracy issue is real and reproducible, which is actually useful information; the disagreement is not about whether the problem exists, but whether you...

**Full Council (Starter):** ## WHERE THEY AGREED  All four specialists agreed that the £4 per unit sensor fix — totalling £40,000 at the 10,000-unit minimum order quantity — is almost certainly cheaper than the downstream cost of launching with the documented 12% accuracy degradation above 30 degrees Celsius. Sage called the £40,000 "insurance on your launch" rather than a cost; Finn modelled a field recall at 5,000 units costing roughly £235,000 against that same £40,000 outlay; Sal ran the revenue arithmetic on lost sales, returns, and compounding customer acquisition cost drag and arrived at the same conclusion; Mia,...

**Deep Council (Pro):** **WHERE THEY AGREED**  All four landed in the same place on the headline question: do not sign the 10,000-unit minimum order quantity with the temperature flaw unfixed. Sage called the £4 sensor module "the cheapest insurance you will ever buy"; Finn modelled the £220,000 inventory commitment as roughly 24% of remaining capital against an 18-month runway; Sal framed shipping the flaw as a credibility-killer in a trust-first category; Mia called it "a marketing catastrophe waiting to be published." They also converged on a second point the founder did not ask but needs to hear: demand validatio...

**Strategy Council (Enterprise):** **WHERE THEY AGREED**  All four converged on two points, even when they argued differently around them. First: the 10,000-unit minimum order quantity is not a decision the current evidence base supports — three beta users (foundry context) cannot underwrite a £180,000 commitment at £18 per unit (foundry context), and Sage, Finn, Sal and Mia each independently called for a demand-signal step (pre-orders, waitlist, deposits, letters of intent) before the purchase order is signed. Second: the temperature flaw cannot be resolved in this room. Sage named it explicitly, Mia named it most forcefully,...

### Q3: Our team is 5 people; we need to triple in 12 months. What is the right hiring sequence?

#### Scores by tier and judge

| Tier | Judge | Action. | Spec. | Depth | Voice | Coherence | Composite |
|---|---|---|---|---|---|---|---|
| Quick Council (Free) | Anthropic | 4.5 | 4.5 | 4 | 4 | 4.5 | 4.3 |
| Quick Council (Free) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5.0 |
| Full Council (Starter) | Anthropic | 4.5 | 4.5 | 4.5 | 4.5 | 5.0 | 4.6 |
| Full Council (Starter) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5.0 |
| Deep Council (Pro) | Anthropic | 4.5 | 5 | 4.5 | 4.5 | 5 | 4.7 |
| Deep Council (Pro) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5 |
| Strategy Council (Enterprise) | Anthropic | 4.5 | 4.5 | 4.5 | 4.5 | 5 | 4.6 |
| Strategy Council (Enterprise) | DeepSeek | 5 | 5 | 5 | 5 | 5 | 5.0 |

#### Tier step deltas (composite score)

| Step | Anthropic judge | DeepSeek judge |
|---|---|---|
| Free to Starter | 0.3 | 0.0 |
| Starter to Pro | 0.1 | 0.0 |
| Pro to Enterprise | -0.1 | 0.0 |

#### Fiona close synthesis (abbreviated per tier)

**Quick Council (Free):** # THE COUNCIL'S SYNTHESIS  **Where they agreed**  All four specialists agree on this: your constraint is not product depth, and it is not engineering capacity. Sage, Finn, Sal, and Mia all point to the same bottleneck — the founder is still embedded in the closing process, the sales development representative's output is capped, and your customer success function will collapse if you scale customers without scaling support. The 118% net revenue retention is real and strong, but it is fragile at 15 customers without dedicated capacity. The sequence must protect that number while unlocking sales...

**Full Council (Starter):** ## WHERE THEY AGREED  All four specialists agreed that the 118 per cent net revenue retention figure is the single most important constraint on hiring sequence — not because it is something to celebrate, but because it is something to protect. Sage named it explicitly as the reason the customer success manager is already a single point of failure. Finn quantified the cost of losing it, noting that every percentage point of retention lost erodes future revenue at a customer acquisition cost of £4,200 per deal. Sal set a hard trigger — if new annual recurring revenue exceeds £56,000 in a quarter...

**Deep Council (Pro):** **WHERE THEY AGREED**  All four converged on more than they let on. Every specialist — Sage, Finn, Sal and Mia — put a second engineer in the first two hires, naming the single lead engineer (foundry: 1 lead engineer) as a Series A diligence killer and an existential platform risk. All four also rejected hiring a head-of-function layer in the first six: Sage called it "the most expensive mistake at this stage", Sal called it a £150-200K burn against a £1.8M round (foundry: seed £1.8M), Finn would only justify a vice-president of sales after a second seller proves productivity, and Mia explicit...

**Strategy Council (Enterprise):** **WHERE THEY AGREED**  All four converged on one point: the second engineer is not the next hire. Sage, Finn, and Sal said it explicitly — the single sales development representative closing three deals at £28,000 average contract value in 90 days [foundry context: sales development representative performance, average contract value] against a £4,200 customer acquisition cost [foundry context: customer acquisition cost] is a capacity signal, not a product signal. Three of the four (Sage, Finn, Sal) also agreed that a second customer success manager can wait — the 118% net revenue retention [fo...

## Aggregated tier deltas (mean and range across 3 questions)

| Step | Anthropic mean | Anthropic range | DeepSeek mean | DeepSeek range |
|---|---|---|---|---|
| Free to Starter | 0.467 | [0.3, 0.6] | 0.0 | [0.0, 0.0] |
| Starter to Pro | 0.067 | [0.0, 0.1] | 0.0 | [0.0, 0.0] |
| Pro to Enterprise | -0.067 | [-0.1, 0.0] | 0.0 | [0, 0] |

### Original 1-question result (reference)

Original test used a single fundraising question ("Should I raise £2M now or hit 100 paying users first?") scored by Anthropic judge only.

| Step | Original delta (Anthropic judge) |
|---|---|
| Free to Starter | +0.16 |
| Starter to Pro | +0.17 |
| Pro to Enterprise | +0.00 |

## Cross-judge agreement analysis

Across 12 tier-question combinations (3 questions x 4 tiers):

- Anthropic judge composites (all): [3.9, 4.5, 4.5, 4.5, 4.1, 4.6, 4.7, 4.6, 4.3, 4.6, 4.7, 4.6]
- DeepSeek judge composites (all): [5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0]
- Mean absolute difference between judges: 0.533
- Maximum difference on any single tier/question: 1.1
- Pearson correlation between judges: None

#### Pro to Enterprise delta agreement (the critical question)

| Question | Anthropic delta | DeepSeek delta | Both below +0.10 |
|---|---|---|---|
| Q1_fundraising | 0.0 | 0 | True |
| Q2_product_strategy | -0.1 | 0 | False |
| Q3_operations_scaling | -0.1 | 0.0 | False |

## Verdict on the Strategy Council reposition decision

The reposition decision is: if Pro-to-Enterprise shows near-zero improvement across multiple questions AND a non-Anthropic judge concurs, the Strategy Council adds marginal value as currently built (extended thinking on Opus). This supports repositioning Enterprise to deliver value through RAG over foundry data rather than extended thinking budget.

Anthropic judge Pro-to-Enterprise mean: -0.067 (range: [-0.1, 0.0])
DeepSeek judge Pro-to-Enterprise mean: 0.0 (range: [0, 0])

**VERDICT: The reposition decision is SUPPORTED.** Both judges score Pro-to-Enterprise mean below +0.10 across all 3 questions. No individual question showed a delta above +0.10 on either judge. Extended thinking on Opus does not produce a measurable uplift at the composite level for these question types. Repositioning Enterprise to RAG-augmented context (foundry data) is the correct direction.

## Caveats and limitations

1. Rubric scores are from an LLM judge, not human evaluators. LLM-as-judge benchmarks are calibration tools, not ground truth.
2. DeepSeek deepseek-reasoner is non-Anthropic but is itself a reasoning model that may share some biases with Claude's reasoning chains. A fully independent judge (e.g. a human panel) would be more rigorous.
3. The 5-dimension rubric does not capture founder usability, willingness to pay, or churn reduction — all relevant to pricing decisions.
4. Three questions is a small sample. Variance across question flavours is visible in the range column above.

---
*Generated by `experiments/brainstorming-council-tier-test-3q.py`. Full outputs in `brainstorming-council-tier-test-3q-20260425_125328.json`.*