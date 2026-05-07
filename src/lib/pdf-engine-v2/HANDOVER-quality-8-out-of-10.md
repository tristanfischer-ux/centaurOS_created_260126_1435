# Quality plan — raise every PDF section to ≥8/10

**Status:** 2026-05-07. Shipped: 50 engine items, compound scoring live, dashboard populated with 17 historical runs.
**Gap:** 5 sections (Brief, Sizing, BOM, Cost, Research) routinely score 2-6/10 on council judging. Rest already ≥8/10.
**Definition of done:** 3 consecutive runs per brief where (a) compound ≥ 75/100, (b) no section < 7/10, (c) no failed-to-score sections.

---

## Where we are now

Real council numbers from `~/Downloads/engine-evidence/all-items-shipped/bess/qa-scores.json`:

| Section | Score | Source | Status |
|---|---|---|---|
| Regulatory | 8/10 | deterministic | ≥8 ✅ |
| Modules | 8/10 | deterministic | ≥8 ✅ |
| Risks | 8/10 | deterministic (now council tier) | ≥8 ✅ |
| Suppliers | 8/10 | deterministic (now council tier) | ≥8 ✅ |
| Sizing | 6/10 | deterministic | below bar ❌ |
| Research | 6/10 | deterministic | below bar ❌ |
| Brief | 2-5/10 | council | below bar ❌❌ |
| BOM | 4/10 | council | below bar ❌❌ |
| Cost | 4/10 | council | below bar ❌❌ |

The five sub-8 sections are where real engineering content lives. Fixing them is the core remaining work.

---

## The five gaps, ordered by leverage

### Gap 1 — BOM (current 4/10, biggest lever)

**Real council finding, verbatim:**

> "Severe cost hallucinations, placing identical low prices (e.g., $18) on massive capital equipment like an ISO container and high-end electronics."
>
> "Critical HVAC and thermal failures, specifically designing a sealed hydronic cooling loop without an expansion tank or pressure relief valve, ensuring mechanical failure."
>
> "Omission of vital BESS architectural elements such as enclosure thermal insulation and clean-agent overpressure relief."

**Root causes, from reading the code:**

1. **`heuristicCotsCost()` default £18** in `stages/4-bom-cost.ts:430` dominates when no grounding match + no LLM estimate. 60+ keyword heuristics improved v1's £25 default but the tail is still wrong.
2. **No "required-parts manifest" per product class.** BOM LLM produces whatever it thinks of; nothing cross-checks "for a containerised BESS, must have: expansion tank, PRV, PIR insulation, overpressure vent, glycol fill, dehumidifier, deflagration panel". These are product-class safety-critical parts that physics / regulations require.
3. **BOM can truncate silently.** If the LLM response hits max_tokens mid-list, the BOM just ends. No continuation re-prompt.

**Concrete fix — 3 increments, 1 session each:**

| Increment | File | Change |
|---|---|---|
| **BOM-Q1 — required-parts manifest** | new `lib/required-parts.ts` | Hand-curated manifest per product class. BESS: expansion tank, PRV, PIR insulation, overpressure vent, glycol fill, dehumidifier, deflagration panel. Heat pump: EEV, sight glass, LP/HP cut-out, suction accumulator, crankcase heater. Farm: HEPA filter, CO2 regulator, backup nutrient pump, light schedule contactor. Post-BOM validator walks the manifest, adds missing parts as LOW-CONFIDENCE placeholders with rationale + typical cost. |
| **BOM-Q2 — cost-floor sanity check** | `stages/4-bom-cost.ts` heuristicCotsCost | If computed unit cost < £50 AND part mass > 10kg OR part name matches `/container\|enclosure\|compressor\|pcs\|inverter\|chiller/i`, auto-escalate to Brave search for a market price before falling through to heuristic. Stamp `priceSource: 'market_search'` when found. |
| **BOM-Q3 — truncation recovery** | `stages/4-bom-cost.ts` callOpenRouter | After parse, compare part count against expected-per-product-class floor (BESS 40, HP 25, farm 35). If short, re-prompt with `"Continue from part N+1; do not repeat existing parts"` and merge. |

**Expected result:** BOM 4 → 8. The council finding "missing expansion tank + PRV + PIR" is the exact class of fix required-parts manifest targets.

---

### Gap 2 — Cost (current 3-4/10)

**Real council finding:**

> "Cost estimates are unsubstantiated by market data, making them unreliable for budgeting or procurement."
>
> "NRE baseline from 140000 to approximately 1500000 to accurately reflect UL 9540A testing and CFD thermal modeling labor."

**Root causes:**

1. Per-line cost = material kg × £/kg from database, multiplied by process overhead. Never cross-checked against a market price for the whole subsystem.
2. NRE is flat £-per-module. Not tied to the regulatory matrix (E2 already has standards + £ + weeks per standard but NRE rollup doesn't use it).
3. No "what's missing" pass specific to cost — dehumidification, deflagration venting, balance-of-plant.

**Concrete fix — 2 increments:**

| Increment | File | Change |
|---|---|---|
| **COST-Q1 — per-line market anchor for top-10 parts** | `stages/4-bom-cost.ts` searchRealPrice | Already exists but only fires on top-10 by cost. Expand to: any part where material × £/kg differs from Brave result by > 2× OR unit cost < £50 on a capital part. Cite source URL on each anchored part. |
| **COST-Q2 — NRE from regulatory matrix** | `cost-model.ts` + `stages/4-bom-cost.ts` | Sum £-cost of each regulatory standard (E2 already computes this) as the primary NRE figure. Current flat-per-module NRE becomes a floor. For BESS: UL 9540A £100k + G99 £60k + IEC 62619 £40k + firmware £35k + tooling £25k = £260k-£500k range depending on brief's standards. Replaces the £140k that the council said should be £1.5M. |

**Expected result:** Cost 4 → 8. Addresses "unsubstantiated by market data" (via top-N anchoring) and NRE undershoot (via regulatory sum).

---

### Gap 3 — Brief (current 2-5/10)

**Recurring log line from every run:**

> "Field 'product_type' not in structured brief but appears in narrative — extraction may have failed"
> "Field 'target_cost' not in structured brief but appears in narrative"
> "Field 'power_kw' not in structured brief but appears in narrative"

Research LLM extracts narrative prose fine but the structured `designBrief` object is missing required fields, so the scorer dings the section.

**Root cause:** `runResearch` in `stages/1-research.ts` uses a single LLM call with a prompt that's permissive on structure. No post-extraction validation or re-prompt.

**Concrete fix — 1 increment:**

| Increment | File | Change |
|---|---|---|
| **BRIEF-Q1 — validate + repair** | `stages/1-research.ts` | After the existing research call, validate that all fields in `getRequiredFields(productClass)` are present and non-empty on `designBrief`. If any are missing, fire a cheap second LLM call (`google/gemini-2.5-flash`, `max_tokens=1024`, £0.001) with the narrative text + the missing field names asking specifically for those fields as JSON. Merge into designBrief. Log which fields were repaired. |

**Expected result:** Brief 2-5 → 8. Direct targeting of the recurring failure mode.

---

### Gap 4 — Sizing (current 6/10)

Council criteria: physical feasibility, thermal consistency, margin analysis. Current stage does envelope-fit but doesn't state margins or thermal rejection explicitly.

**Concrete fix — 1 increment:**

| Increment | File | Change |
|---|---|---|
| **SIZE-Q1 — margin + thermal statements** | `stages/3-size-layout.ts` + `stages/7-pdf.tsx` SizingSection | After feasibility check, compute and attach: `floorBudgetUsedPct`, `floorBudgetSparePct`, `heatRejectionRequiredKW` (from module power dissipation), `coolingCapacityProvidedKW` (from thermal-management module sizing). Render these on the Sizing PDF page as a margin table. Keywords "margin", "thermal rejection", "safety factor" trigger the deterministic scorer's higher tier. |

**Expected result:** Sizing 6 → 8.

---

### Gap 5 — Research (current 6/10)

Rubric checks: `sources ≥ 5` (30 pts), `competitors ≥ 3` (10 pts), structured fields. Research LLM sometimes returns 2-4 sources + 1-2 competitors.

**Concrete fix — 1 increment:**

| Increment | File | Change |
|---|---|---|
| **RES-Q1 — thresholds + retry** | `stages/1-research.ts` | After initial research call, count sources + competitors. If sources < 5, re-prompt (same model) with "Expand the source list; cite at least 5 specific industry publications, standards bodies, or company reports." If competitors < 3, re-prompt for explicit named UK/EU competitors matching the product class. Merge. |

**Expected result:** Research 6 → 8.

---

### Cross-cutting — council scoring reliability

"All judges failed" happened on Brief in the 2026-05-07 BESS run. When that fires it means zero scores, and until the SCORE-002 commit today it defaulted to 5. The underlying flakiness still needs fixing.

**Concrete fix — 1 increment:**

| Increment | File | Change |
|---|---|---|
| **COUNCIL-Q1 — fire judges in parallel with individual timeouts + 1 retry** | `council-scorer.ts` scoreSectionWithCouncil | Today judges run serially; a hang on one stalls the section. Rewrite to Promise.all with 60s per-judge timeout. If a judge fails, retry once. If ≥1 judge returns a score, aggregate what we have and label the result `partial-council`. Only emit the `score=-1` sentinel when ALL judges fail after retry. |

**Expected result:** Fewer failed-to-score events → more stable numbers → fewer misleading defaults.

---

## Ordering

By leverage-to-effort, start at the top:

| Priority | Item | Effort | Expected lift |
|---|---|---|---|
| 1 | **BOM-Q1** required-parts manifest | 1 session | BOM 4 → 7 |
| 2 | **COST-Q2** NRE from regulatory matrix | 0.5 session | Cost 4 → 6 |
| 3 | **BRIEF-Q1** validate + repair extraction | 0.5 session | Brief 3 → 7 |
| 4 | **BOM-Q2** cost-floor sanity check | 0.5 session | BOM 7 → 8 |
| 5 | **COST-Q1** top-10 line anchoring | 1 session | Cost 6 → 8 |
| 6 | **COUNCIL-Q1** parallel + retry | 0.5 session | stabilise scores |
| 7 | **SIZE-Q1** margin + thermal statements | 0.5 session | Sizing 6 → 8 |
| 8 | **RES-Q1** thresholds + retry | 0.5 session | Research 6 → 8 |
| 9 | **BOM-Q3** truncation recovery | 0.5 session | Robustness |

**Total: ~6 sessions.** Budget per session ≤ £10 OpenRouter. Total ≤ £60.

---

## Evidence loop — how to know it worked

After each increment:

1. Run the affected brief(s) via `./scripts/engine-evidence-bg.sh q1-bom-required-parts/bess src/lib/pdf-engine-v2/briefs/bess.md`. All three (bess + heatpump + farm) for items that touch shared code.
2. Read the `qa-scores.json` + log to confirm the target section's score moved.
3. Refresh `~/Downloads/engine-evidence/scoring-dashboard.html` — the sparkline shows the trajectory.
4. An increment is shipped ONLY when 3 consecutive runs of the same brief keep the section ≥ 8/10. Single-run improvements can be LLM stochastic luck.

## Things that could go wrong

1. **Council judges disagree with the fix.** A required-parts manifest might add an expansion tank, but the council judge might still flag the BOM as "no PRV rating cited" or "glycol grade unspecified". Iterate: read the council's new finding and adjust the manifest entry to carry more spec detail (torque, rating, grade, ingress protection).
2. **Market-search cost anchoring gets wrong prices.** Brave Search surfaces B2C prices for parts that are B2B-procured in volume. Mitigation: filter by UK/EU TLDs, prefer distributor domains (Farnell, Digikey, RS Components, RS Online), reject Amazon/eBay.
3. **NRE computed from regulatory matrix may overshoot.** A brief claiming CE mark only will have small NRE; a brief triggering UL 9540A + G99 + IEC 62619 explodes. That's the point — it reflects reality. But the PDF needs to say "NRE is domain-dependent; your declared standards drove this number".
4. **Brief repair can hallucinate.** When the first research call missed a field, a second LLM guessing at the field value may invent numbers that weren't in the narrative. Mitigation: the repair prompt must take the narrative as input and say "extract only what's stated; return null if absent". Never synthesise.
5. **Council-reliability fix might mask a prompt issue.** Judges fail because they sometimes receive malformed section data. Fix the underlying prompt shape before papering over with retries.

## What the validator will look like per run (proposed)

Pipeline log should end with a clean verdict block:

```
[pipeline] === Quality Gate ===
  Brief:       8/10 ✓
  Regulatory:  8/10 ✓
  Sizing:      8/10 ✓
  Modules:     8/10 ✓
  BOM:         8/10 ✓
  Cost:        8/10 ✓
  Risks:       8/10 ✓
  Suppliers:   8/10 ✓
  Research:    8/10 ✓
  Compound:    84/100 ✓
  VERDICT:     PASS (all sections ≥ 7/10, compound ≥ 75/100)
```

Today it would read:
```
  Brief:       2/10 ✗
  BOM:         4/10 ✗
  Cost:        4/10 ✗
  Sizing:      6/10 ✗
  Research:    6/10 ✗
  Compound:    76/100 ✗
  VERDICT:     FAIL (5 sections below 7/10)
```

Add this verdict renderer as part of the first quality increment.

---

## Files to read before starting

1. `src/lib/pdf-engine-v2/TRACKER.md` — 50 done, 0 outstanding, 1 deferred; add the Q-items here before starting
2. `src/lib/pdf-engine-v2/council-scorer.ts` — the judge dispatcher
3. `src/lib/pdf-engine-v2/score-rubric.ts` — already rewritten for compound scoring
4. `~/Downloads/engine-evidence/all-items-shipped/bess/qa-scores.json` — real council findings with specific suggestions (they're excellent change-of-code prompts, not vague criticism)
5. `~/Downloads/engine-evidence/scoring-dashboard.html` — opens in browser, auto-refreshes, shows sparkline trend

## Why not do this now

This handover is the 14th commit today. Engine-side work is at a natural wrap point: every tracker item done, scoring system honest, dashboard live, watchdog running. The quality-to-8/10 push is a dedicated mission that deserves a fresh session with a clean context and the evidence loop running properly. It's ~6 sessions × 3 evidence runs each = 18 pipeline runs × ~£0.30-£1.50 = £10-30 of OpenRouter; doing it piecemeal in the tail of an already-long session would rush the evidence step and risk calling an increment "done" on one lucky run.
