# Full-PDF 3-LLM Council Re-Score — BESS Brief (v2 PDF, after four-commit fix bundle)

**Date:** 2026-05-09  
**PDF:** `output-1778352864540.pdf` — Containerised 3.5 MWh BESS, 1 MW PCS, LFP prismatic cells, 40-ft ISO container  
**Commits reviewed (since prior council at `bed309b1`):**
- `16cf46f1` — cell quantity derivation regex bug fix  
- `08d8fad5` — FMEA populated with 10 BESS-class risks  
- `a4090550` — spatial solver wiring (Sizing section now has zones + utilisation)  
- `434d7202` — two-tier BOM bug bundle (qty propagation, LLM unit prices, MPN validation, layout)

**Pages reviewed:** 43 pages (pdftoppm 150 DPI, up from 32 in v1 — fixes added content)

---

## Council Seats

| Seat | Model | Provider | Images accepted |
|------|-------|----------|-----------------|
| A | `google/gemini-2.5-pro-preview` | OpenRouter | Yes — all 43 pages |
| B | `anthropic/claude-opus-4-5` | OpenRouter | Yes — all 43 pages |
| C | `qwen/qwen3-vl-235b-a22b-instruct` | Alibaba via OpenRouter | Yes — all 43 pages |

Note: Seat B substituted `claude-opus-4-5` (Opus 4.5) for `claude-opus-4-7` as that model ID was unavailable at time of run. Methodology is otherwise identical to commit `bed309b1`. Qwen's vision accuracy on dense table content was lower this round (see S10 note).

---

## 12-Row Score Matrix — v2 vs v1 Delta

| # | Section | Gemini | Opus | Qwen | **v2 Mean** | **v1 Mean** | **Delta** | **Verdict** |
|---|---------|--------|------|------|-------------|-------------|-----------|-------------|
| 10 | Risk Register (FMEA) | 10 | 8 | 6 | **8.0** | 2.0 | **+6.0** | GOOD |
| 6 | Bill of Materials | 9 | 7 | 6 | **7.3** | 3.7 | **+3.6** | ACCEPTABLE |
| 3 | Sizing and Spatial Allocation | 8 | 7 | 4 | **6.3** | 3.3 | **+3.0** | WEAK |
| 8 | Cost Waterfall and Economics | 9 | 7 | 5 | **7.0** | 4.7 | **+2.3** | ACCEPTABLE |
| 5 | System Modules and Architecture | 8 | 8 | 5 | **7.0** | 5.0 | **+2.0** | ACCEPTABLE |
| 7 | Assembly Shortlist | 6 | 6 | 5 | **5.7** | 4.3 | **+1.4** | WEAK |
| 12 | Source Attribution | 8 | 7 | 5 | **6.7** | 5.3 | **+1.4** | WEAK |
| 9 | Regulatory and Compliance | 9 | 8 | 7 | **8.0** | 6.7 | **+1.3** | GOOD |
| 2 | Brief and Requirements | 9 | 9 | 8 | **8.7** | 7.7 | **+1.0** | GOOD |
| 1 | Cover Page | 9 | 8 | 7 | **8.0** | 7.0 | **+1.0** | GOOD |
| 4 | Feasibility Gate | 7 | 6 | 5 | **6.0** | 5.3 | **+0.7** | WEAK |
| 11 | Audit Log | 8 | 7 | 7 | **7.3** | 7.3 | **+0.0** | ACCEPTABLE |

**Sections at or above 8.0 (Tristan's target): 4 — S10 FMEA, S09 Regulatory, S02 Brief, S01 Cover**  
**Sections below 5.0 (urgent): NONE** ← was 5 sections in v1

---

## Per-Section Detail (worst-first by v2 mean)

### S07 — Assembly Shortlist | v2 Mean: 5.7 — WEAK (prior: 4.3)

**Gemini (6):** The assembly shortlist is missing suppliers for critical, high-cost items like the PCS, LFP cells, and BMS.  
**Opus (6):** All supplier confidence ratings are 'LOW' with no supplier names populated for electronic parts, making procurement planning impossible.  
**Qwen (5):** The Assembly Shortlist section is entirely missing from the report (Qwen may have missed a page — Gemini and Opus did see content).

**Consensus weakness:** Named suppliers are absent for the three highest-cost line items (PCS, LFP cells, BMS). Every row is LOW confidence with no lead time or MOQ.

**Consensus lift:** Add at least two named vendors per major line — Sungrow/SMA for PCS, CATL/EVE for cells, Nuvation/Inventec for BMS — with indicative lead time (weeks) and MOQ.

---

### S04 — Feasibility Gate | v2 Mean: 6.0 — WEAK (prior: 5.3)

**Gemini (7):** The `risk_matrix_populated` check shows FAIL directly contradicting the extensively populated FMEA section later in the report — the gate check is not reading the correct data.  
**Opus (6):** Gate shows 'FEASIBLE — all gates pass' on cover but detailed table shows WARN for `spatial_envelope`, WARN for `cost_feasibility`, and FAIL for `risk_matrix_populated`.  
**Qwen (5):** The `risk_matrix_populated` check explicitly fails with '0 risks', indicating no risk assessment has been conducted.

**Consensus weakness:** The gate logic is disconnected from the artefacts it claims to validate: `risk_matrix_populated` shows FAIL even though the FMEA section has 10 rows; the cover page still declares FEASIBLE despite WARN and FAIL gate outcomes.

**Consensus lift:** Wire `risk_matrix_populated` to read from the generated FMEA rows count (currently populated, so this should pass). Fix the cover-page feasibility verdict to reflect gate outcomes: if any gate is WARN → CONDITIONAL; if any FAIL → NOT-FEASIBLE.

---

### S03 — Sizing and Spatial Allocation | v2 Mean: 6.3 — WEAK (prior: 3.3, +3.0)

**Gemini (8):** Excellent numerical zone-allocation data but no visual layout diagram.  
**Opus (7):** Mass budget shows −7,420 kg (−27.2% margin) flagged 'Action required' but `Layout Feasible` still reads YES — contradictory.  
**Qwen (4):** Zone allocation total mass 34,650 kg exceeds payload mass 27,230 kg by 7,420 kg — a critical design flaw.

**Consensus weakness:** Zone allocation data is now present (major fix vs v1) but the mass budget is critically over-limit (−27% margin) and the feasibility field still reads YES — an unresolved contradiction that will catch every reviewer's eye.

**Consensus lift:** Fix the mass feasibility logic so that a negative mass margin triggers `Layout Feasible: NO — mass over-limit by 7,420 kg`. Add a remediation note suggesting either a lighter cell or a 45-ft container.

---

### S12 — Source Attribution | v2 Mean: 6.7 — WEAK (prior: 5.3)

**Gemini (8):** Verification Status on most sections is 'Unverified' — accurate at this stage but limits the report's authority.  
**Opus (7):** Multiple sections graded C or D with 'Unverified' status while conclusions are stated with confidence.  
**Qwen (5):** Research Sources table reads 'No data available' (page 3), undermining engineering assumptions.

**Consensus weakness:** The page-3 Research Sources table remains empty — same as v1. The page-43 attribution table is populated, but the two-source-table inconsistency persists.

**Consensus lift:** Mirror page-43 citations into the page-3 Research Sources table; add at minimum IEC 62619:2022, NFPA 855:2023, and one market-rate source with publisher + date.

---

### S05 — System Modules and Architecture | v2 Mean: 7.0 — ACCEPTABLE (prior: 5.0, +2.0)

**Gemini (8):** BMS and Fire Detection & Suppression modules have empty BOM rows.  
**Opus (8):** BMS shows 0 BOM rows and no estimated cost despite ENGINEERING maturity rating — a critical uncosted subsystem.  
**Qwen (5):** PCS & Transformer marked PRELIMINARY, flagged as a major risk (Qwen gave a conservative score relative to Gemini/Opus here).

**Consensus weakness (Gemini+Opus):** BMS and FDS are both uncosted at the module level — two safety-critical subsystems with £0 cost contribution.

**Consensus lift:** Add at minimum 3–5 BOM entries for BMS (cell-level boards, master controller, isolation relays, comms harness, enclosure) and FDS (detection heads, fire control panel, Novec cylinders, actuation wiring) with ESTIMATE pricing.

---

### S08 — Cost Waterfall and Economics | v2 Mean: 7.0 — ACCEPTABLE (prior: 4.7, +2.3)

**Gemini (9):** BOM Cost by Module table has empty '% of BOM' column — a missed visualisation of cost drivers.  
**Opus (7):** Total estimated unit cost £988,957 is 449% over the £180,000 ceiling — a fundamental blocker unaddressed by the report narrative.  
**Qwen (5):** Cost analysis based on unpriced components (cells at £0 in BOM) making economics unreliable.

**Consensus weakness:** The cost is now in the correct order of magnitude (~£1M vs prior £100k artifact) — but the cost-ceiling mismatch (449% over) is stated without any narrative response. The report does not attempt to explain, justify, or route-around the overrun.

**Consensus lift:** Add a Cost Headroom section explaining the £180k ceiling is likely a single-unit production target vs. a first-article engineering cost; add a learning-curve or volume-pricing scenario (50-unit batch) to show the path to margin. Populate the '% of BOM' column in the cost-by-module table.

---

### S11 — Audit Log | v2 Mean: 7.3 — ACCEPTABLE (prior: 7.3, +0.0)

**Gemini (8):** Duration column is empty throughout.  
**Opus (7):** Duration shows all dashes — pipeline performance assessment impossible.  
**Qwen (7):** Audit Log section missing (Qwen may have missed a page).

**Consensus weakness:** Duration data is still absent. The log is structurally unchanged from v1.

**Consensus lift:** Populate Duration with actual timing data (in seconds or ms) per pipeline step.

---

### S06 — Bill of Materials | v2 Mean: 7.3 — ACCEPTABLE (prior: 3.7, +3.6)

**Gemini (9):** BOM is fragmented across 7 module pages, making holistic review cumbersome.  
**Opus (7):** Multiple critical items show £0 or £1 placeholder pricing — BMS £1, Fire Detection £0, Thermal Insulation £0, Liquid Cooling Loop £0.  
**Qwen (6):** BMS and EMS listed at £1 unit cost — placeholder data.

**Consensus weakness:** Cell quantities and most BOM rows are now correct (major fix vs v1), but BMS, FDS, Thermal Insulation, and Liquid Cooling remain at £0/£1 placeholder pricing. Structural improvement is real, but cost accuracy is still incomplete.

**Consensus lift:** Fill BMS, FDS, and thermal management unit prices with ESTIMATE values sourced from market rates (BMS controller module ~£2,000–5,000, Novec cylinder ~£800–1,500 each, liquid cooling loop ~£3,000–8,000).

---

### S09 — Regulatory and Compliance | v2 Mean: 8.0 — GOOD (prior: 6.7, +1.3)

**Gemini (9):** All standards show 'not_started' status — no proactive engagement.  
**Opus (8):** All 7 standards show 'not_started' with no compliance timeline or responsible party.  
**Qwen (7):** No test plans or certification paths mapped to standards.

**Consensus weakness:** Standards are identified and well-described, but all compliance statuses are 'not_started' with no timeline or owner.

**Consensus lift:** Add a target-status column (e.g., PENDING, IN-PROGRESS, PLANNED-Q3-2026) and a responsible engineering stream for each standard.

---

### S01 — Cover Page | v2 Mean: 8.0 — GOOD (prior: 7.0, +1.0)

**Gemini (9):** Headroom shown as large negative number could be misinterpreted without fine print.  
**Opus (8):** Headroom −£840,604 (467% over budget) contradicts the 'FEASIBLE — all gates pass' status, creating credibility confusion.  
**Qwen (7):** No formal project approval signature or date.

**Consensus weakness:** The −£840,604 headroom and 'FEASIBLE — all gates pass' verdict are on the same cover, and they directly contradict each other. A reviewer sees a project that is 467% over budget but declared feasible.

**Consensus lift:** Fix feasibility verdict logic (see S04) and rename 'Headroom' to 'Cost vs Ceiling' with explicit label 'EXCEEDS CEILING — see Economics section'.

---

### S10 — Risk Register (FMEA) | v2 Mean: 8.0 — GOOD (prior: 2.0, +6.0)

**Gemini (10):** 'Existing Controls' field is 'Pending' for all 10 FMEA rows — no inherent design controls documented.  
**Opus (8):** FMEA is well-populated with 10 risks and proper RPN scoring, but all verification tests are 'OPEN — verification test not yet executed' with no schedule.  
**Qwen (6):** Qwen incorrectly reported the Risk Register as empty — this is a Qwen visual parsing error; Gemini and Opus both confirmed 10 rows with S/O/D and RPN scores.

**Calibrated consensus (Gemini + Opus, disregarding Qwen's parsing error):** The FMEA is genuinely populated with BESS-class risks — thermal runaway, DC arc fault, BMS comms loss, HVAC cooling failure, etc. — with Severity/Occurrence/Detection scores and computed RPNs. This is the most dramatic improvement in the document.

**Remaining lift:** Populate 'Existing Controls' with at least a one-line description of the primary design control per risk (e.g., thermal runaway → "Cell-level fuse + BMS over-temperature cutoff"). Add target verification dates for OPEN tests.

---

### S02 — Brief and Requirements | v2 Mean: 8.7 — GOOD (prior: 7.7, +1.0)

**Gemini (9):** Research Sources table (page 3) remains empty — undermines stated constraints.  
**Opus (9):** Research Sources table shows 'No data available' despite referencing industry data.  
**Qwen (8):** 'Why Now' section is generic with no specific market data or customer demand forecast.

**Consensus weakness:** The Research Sources table on page 3 is empty — unchanged from v1. This is the only significant gap in the strongest section.

**Consensus lift:** Populate the Research Sources table with at minimum the source records already captured on the attribution page (IEC 62619, NFPA 855, Wood Mackenzie grid-scale BESS market report).

---

## Overall Consensus

**Worst section:** S07 Assembly Shortlist (5.7) — three-seat consensus: no supplier names, all LOW confidence, no lead times.

**Best section:** S02 Brief and Requirements (8.7) — two-seat top choice (Gemini + Opus).

**Systemic issues (all three seats):**

- Gemini: Gate logic is disconnected from artefacts — `risk_matrix_populated` fails even though the FMEA is populated; cover page says FEASIBLE despite WARN/FAIL gates.
- Opus: The same feasibility-verdict-vs-gate-data contradiction. The report is now technically coherent in its data layers but the top-level summary layer (cover + gate verdict) hasn't been updated to reflect the new data.
- Qwen: Gap between high-level requirements and detailed engineering — noted specifically that the mass overrun is not acknowledged in any narrative.

**Unified systemic issue:** The pipeline now generates substantive data in the body sections (FMEA, zone tables, BOM quantities) but the summary-layer (cover verdict, gate status, headroom label, source table on page 3) is not being recomputed from the new data. The result is a report whose middle is credible but whose front page is contradictory.

---

## Per-Model Verdicts

| Seat | Model | Verdict | Worst | Best |
|------|-------|---------|-------|------|
| A | Gemini 2.5 Pro Preview | FOCUSED-REWORK | S07 | S10 |
| B | Claude Opus 4.5 | FOCUSED-REWORK | S04 | S02 |
| C | Qwen3-VL-235B | FOCUSED-REWORK | S03 | S02 |

**Overall verdict: FOCUSED-REWORK**  
No section below 5.0. Four sections at or above 8.0. Three sections drag the average: S07 (5.7), S04 (6.0), S03 (6.3). The mass overrun in S03 is a structural issue, not a cosmetic one, but it can be resolved without architectural changes.

---

## Top 3 Concrete Remaining Changes (ranked by leverage)

### 1. Fix the summary layer to reflect gate data (S04 → S01, highest leverage)
The feasibility gate logic is reading stale/wrong data. `risk_matrix_populated` reports FAIL despite 10 FMEA rows existing. The cover page verdict says FEASIBLE despite WARN/FAIL gate outcomes. One targeted fix in the gate evaluation code propagates correctly to cover page, gate section, and section headings simultaneously. This single fix lifts S04 from 6.0 and removes the cover-page contradiction driving S01 below 9.

### 2. Resolve the mass-over-limit contradiction in S03 (structural credibility)
The zone allocation now has real data — a genuine improvement. But the mass total (34,650 kg) exceeds the payload limit (27,230 kg) by 7,420 kg and the `Layout Feasible` field still reads YES. The fix is: make the feasibility flag conditional on the mass margin sign, add a remediation note. This lifts S03 from 6.3 toward 8+ and removes a contradiction that any structural engineer will flag immediately.

### 3. Populate Assembly Shortlist with named vendors (S07, procurement-critical)
S07 is the only section still stuck below 6. The data structure is present but completely empty of content. Adding two named vendors per line (PCS, cells, BMS, switchgear) with indicative lead times takes S07 from 5.7 to 8+, which is sufficient for the overall verdict to move from FOCUSED-REWORK toward SHIP-READY.

---

## One Thing the Council Noticed

Gemini noted — and this would not be visible from code inspection — that the cost waterfall total (£988,957) is now in the correct order of magnitude for a 3.5 MWh BESS (~£280/kWh pack-level). The prior council's £100,731 figure was a code artifact. The fix worked. However, the pipeline has no mechanism to contextualise the cost vs. the budget ceiling — the report simply states the overrun number without any technical narrative about first-article vs. production cost, learning curves, or volume pricing. A human reviewer reading only the cover page would see "449% over budget — FEASIBLE" and stop reading.

---

## Cost Spent

| Model | Prompt tokens | Completion tokens | Cost (USD) |
|-------|--------------|-------------------|------------|
| Gemini 2.5 Pro Preview | 11,816 | 3,994 (incl. 2,745 reasoning) | $0.0547 |
| Claude Opus 4.5 | 67,773 | 1,111 | $0.3666 |
| Qwen3-VL-235B | 18,053 | 1,178 | $0.0072 |
| Gemini retry (token budget fix) | ~12,000 | ~160 (truncated) | $0.0559 |
| **Total** | | | **$0.4844 (~£0.38)** |

Well under the £6 budget. Opus consumed the most tokens due to its high-fidelity multimodal encoding of 43 dense pages.
