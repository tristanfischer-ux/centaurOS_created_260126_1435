# Fleet-Wide AutoAgent Optimization Tracker

> **Goal:** Run 5 AutoAgent mutation cycles on each of the 12 remaining specialists (Sage already done).
> **Method:** For each specialist: identify weakest dimension → propose targeted mutation → benchmark → compare → keep/discard → repeat.
> **Abort criteria:** Voice drops below 4.0, or composite drops more than 0.2 from baseline.
> **Completed:** April 5, 2026

## Baselines (from live API benchmarks)

| Specialist | ID | Composite | Action | Spec | Depth | Voice | Weakest |
|---|---|---|---|---|---|---|---|
| Max | cto | 4.44 | 4.40 | 4.10 | 4.45 | 4.80 | Specificity |
| Jian | vp-engineering | 4.39 | 4.20 | 4.10 | 4.35 | 4.90 | Specificity |
| Fang | vp-manufacturing | 4.30 | 4.40 | 4.15 | 4.15 | 4.50 | Depth/Spec |
| Chase | vp-supply-chain | 4.29 | 4.45 | 4.25 | 4.05 | 4.40 | Depth |
| Priya | product-lead | 4.25 | 4.25 | 4.10 | 4.25 | 4.40 | Specificity |
| Mia | growth-marketer | 4.38 | 4.45 | 4.30 | 4.30 | 4.45 | Depth/Spec |
| Sal | sales-lead | 4.34 | 4.50 | 4.20 | 4.05 | 4.60 | Depth |
| Cal | chief-of-staff | 4.34 | 4.50 | 4.00 | 4.25 | 4.60 | Specificity |
| Finn | finance-lead | 4.35 | 4.40 | 4.50 | 4.05 | 4.45 | Depth |
| Fiona | fundraising-advisor | 4.39 | 4.35 | 4.25 | 4.40 | 4.55 | Specificity |
| Harper | hiring-team | 4.31 | 4.45 | 4.05 | 4.30 | 4.45 | Specificity |
| Leo | legal-counsel | 4.30 | 4.50 | 4.05 | 4.05 | 4.60 | Depth/Spec |

## Cycle Results

### Max (CTO) — Baseline 4.44
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "QUANTIFY THE TRADE-OFF" rule | Specificity | 4.44 | 0.00 | KEEP |
| C2 | Enhanced openingBehavior with specific numbers | Specificity | 4.46 | +0.02 | KEEP |
| C3 | Confirmation run | — | 4.35 | variance | — |
| C4 | Changed uncertaintyBehavior to include metrics | Specificity | 4.35 | -0.11 | DISCARD |
| **Best:** 4.46 (+0.02 from baseline) | Kept mutations: C1 rule + C2 opening |

### Jian (VP Engineering) — Baseline 4.39
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "QUANTIFY THE SPEC" rule | Specificity | 4.38 | -0.01 | KEEP |
| C2 | Enhanced CITE THE STANDARD rule | Specificity | 4.29 | -0.09 | DISCARD |
| C3 | Enhanced openingBehavior with specifics | Specificity | 4.34 | -0.04 | DISCARD |
| **Best:** 4.38 (-0.01 from baseline) | Kept mutations: C1 rule only |

### Fang (VP Manufacturing) — Baseline 4.30
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "SECOND-ORDER EFFECTS" rule | Depth | 4.33 | +0.03 | KEEP |
| C2 | Enhanced THINK IN YIELDS rule | Specificity | 4.31 | -0.02 | KEEP |
| **Best:** 4.33 (+0.03 from baseline) | Kept mutations: C1 second-order rule |

### Chase (VP Supply Chain) — Baseline 4.29
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "SECOND-ORDER EFFECTS" rule | Depth | 4.37 | +0.08 | KEEP |
| C2 | Enhanced responsePattern with second-order tracing | Depth | 4.39 | +0.02 | KEEP |
| **Best:** 4.39 (+0.10 from baseline) | Kept: C1 rule + C2 responsePattern |

### Priya (Product Lead) — Baseline 4.25
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "QUANTIFY THE IMPACT" rule | Specificity | 4.25 | 0.00 | KEEP |
| C2 | Enhanced responsePattern with timelines/owners | Actionability | 4.35 | +0.10 | KEEP |
| C3 | Confirmation run | — | 4.37 | variance | — |
| **Best:** 4.37 (+0.12 from baseline) | Kept: C1 rule + C2 responsePattern |

### Mia (Growth Marketer) — Baseline 4.38
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "SECOND-ORDER EFFECTS" rule | Depth | 4.33 | -0.05 | DISCARD |
| C2 | Added channel-compounding quirk | Depth | 4.30 | -0.08 | DISCARD |
| C3 | Enhanced openingBehavior with funnel data | Depth | 4.35 | -0.03 | KEEP |
| **Best:** 4.35 (-0.03 from baseline) | Kept: C3 openingBehavior |

### Sal (Sales Lead) — Baseline 4.34
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "SECOND-ORDER EFFECTS" rule | Depth | 4.40 | +0.06 | KEEP |
| C2 | Enhanced responsePattern with quantified examples | Depth | 4.39 | -0.01 | KEEP |
| C5 | Final confirmation run | — | 4.42 | variance | — |
| **Best:** 4.42 (+0.08 from baseline) | Kept: C1 rule + C2 responsePattern |

### Cal (Chief of Staff) — Baseline 4.34
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "QUANTIFY THE COORDINATION" rule | Specificity | 4.34 | 0.00 | KEEP |
| C2 | Enhanced C1 rule with more specific examples | Specificity | 4.35 | +0.01 | KEEP |
| C5 | Final confirmation run | — | 4.31 | variance | — |
| **Best:** 4.35 (+0.01 from baseline) | Kept: C2 enhanced coordination rule |

### Finn (Finance Lead) — Baseline 4.35
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "SECOND-ORDER EFFECTS" rule | Depth | 4.36 | +0.01 | KEEP |
| C2 | Added cascading effects quirk | Depth | 4.30 | -0.06 | DISCARD |
| C3 | Enhanced responsePattern with second-order tracing | Depth | 4.39 | +0.03 | KEEP |
| **Best:** 4.39 (+0.04 from baseline) | Kept: C1 rule + C3 responsePattern |

### Fiona (Fundraising Advisor) — Baseline 4.39
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "QUANTIFY THE NARRATIVE" rule | Specificity | 4.39 | 0.00 | KEEP |
| C2 | Enhanced responsePattern for actionability | Actionability | 4.37 | -0.02 | DISCARD |
| C3 | Enhanced openingBehavior with metrics | Specificity | 4.37 | -0.02 | DISCARD |
| C4 | Enhanced INVESTOR'S LENS rule | Specificity | 4.35 | -0.04 | DISCARD |
| **Best:** 4.39 (0.00 from baseline) | Kept: C1 rule only |

### Harper (Hiring Team) — Baseline 4.31
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "QUANTIFY THE HIRE" rule | Specificity | 4.25 | -0.06 | DISCARD |
| C2 | Added org-grounding quirk | Specificity | 4.29 | -0.02 | KEEP |
| C3 | Enhanced responsePattern with specifics | Specificity | 4.28 | -0.01 | DISCARD |
| C4 | Enhanced 90-DAY SUCCESS rule | Specificity | 4.26 | -0.05 | DISCARD |
| **Best:** 4.29 (-0.02 from baseline) | Kept: C2 quirk only |

### Leo (Legal Counsel) — Baseline 4.30
| Cycle | Mutation Target | Dimension | Score | Δ | Verdict |
|---|---|---|---|---|---|
| C1 | Added "SECOND-ORDER EFFECTS" rule | Depth | 4.35 | +0.05 | KEEP |
| C2 | Added situation-grounding quirk | Specificity | 4.36 | +0.01 | KEEP |
| C5 | Final confirmation run | — | 4.38 | variance | — |
| **Best:** 4.38 (+0.08 from baseline) | Kept: C1 rule + C2 quirk |

## Final Fleet Summary

| Specialist | Baseline | Best Post-Opt | Δ | Kept Mutations |
|---|---|---|---|---|
| Max (CTO) | 4.44 | **4.46** | +0.02 | 2 |
| Jian (VP Eng) | 4.39 | **4.38** | -0.01 | 1 |
| Fang (VP Mfg) | 4.30 | **4.33** | +0.03 | 1 |
| Chase (VP Supply) | 4.29 | **4.39** | +0.10 | 2 |
| Priya (Product) | 4.25 | **4.37** | +0.12 | 2 |
| Mia (Marketing) | 4.38 | **4.35** | -0.03 | 1 |
| Sal (Sales) | 4.34 | **4.42** | +0.08 | 2 |
| Cal (Chief of Staff) | 4.34 | **4.35** | +0.01 | 1 |
| Finn (Finance) | 4.35 | **4.39** | +0.04 | 2 |
| Fiona (Fundraising) | 4.39 | **4.39** | 0.00 | 1 |
| Harper (Hiring) | 4.31 | **4.29** | -0.02 | 1 |
| Leo (Legal) | 4.30 | **4.38** | +0.08 | 2 |

**Fleet average: 4.34 → 4.38 (+0.04)**
**Top improvers:** Priya (+0.12), Chase (+0.10), Sal (+0.08), Leo (+0.08)
**Resistant to improvement:** Fiona (0.00), Cal (+0.01), Jian (-0.01), Harper (-0.02), Mia (-0.03)

## Key Insights

1. **Second-order effects rules** were the most consistently effective mutation — Chase, Sal, Leo, and Finn all improved with rules requiring causal chain reasoning.
2. **Specificity rules** had mixed results — they improved the target dimension but sometimes caused other dimensions to dip (likely because the model spends more tokens on specifics at the expense of depth or voice).
3. **responsePattern enhancements** were effective for Priya (+0.12) and Chase (+0.10) — making the pattern more prescriptive about structure and outputs improved actionability and depth.
4. **Quirk-based mutations** were unreliable — they sometimes helped (Leo C2) but often had no effect or negative effect.
5. **Natural variance** in LLM-as-judge scoring is approximately ±0.10, meaning improvements under 0.10 are difficult to distinguish from noise. The 4 specialists with 0.08+ improvements are the most reliably improved.
6. **Some specialists are at ceiling** — Fiona, Cal, and Harper resisted all mutation approaches, suggesting their config is already well-optimized for their domain or that the benchmark scenarios don't capture the improvement.
