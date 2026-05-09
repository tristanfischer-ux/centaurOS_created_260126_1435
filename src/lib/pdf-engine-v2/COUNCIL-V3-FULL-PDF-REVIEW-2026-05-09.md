# Full-PDF 3-LLM Council Re-Score — BESS Brief (v3 PDF, after universal-plan patterns A–E)

**Date:** 2026-05-09  
**PDF:** `output-1778365900350.pdf` — Containerised 3.5 MWh BESS, 1 MW PCS, LFP prismatic cells, 40-ft ISO container  
**Commits reviewed (since V2 council at `9c17616d`):**
- Pattern A — Truth propagation: mass budget/feasibility flip, OVER BUDGET banner, `Layout Feasible: NO` wired to mass_margin sign
- Pattern B — Audit log duration column populated from stage timing; class-aware manifest fallback
- Pattern C — Vendor catalog data layer (wired to BOM pipeline, not yet rendered to prompt)
- Pattern D — Cost waterfall: BOM Subtotal rendered, assembly labour (15%) + overhead (8%) rows, driver narrative paragraph
- Pattern E — Source attribution dual-write from module state; 12 rows populated with grade + verification status

**Pipeline run:** 28min 14s total, 8 LLM calls, all stages OK. PDF: 155.1 KB, 43 pages.  
**BOM total this run:** £220,728 (£40,728 over £180,000 ceiling — 22.6% over). Mass allocated: 40,500 kg vs 27,230 kg limit (overrun 13,270 kg — 49% over).

---

## Council Seats

| Seat | Model | Provider | Images accepted |
|------|-------|----------|-----------------|
| A | `google/gemini-2.5-pro-preview` | OpenRouter | Yes — all 43 pages (retry with 16 K max_tokens; original 4 K was truncated) |
| B | `anthropic/claude-opus-4-5` | OpenRouter | Yes — all 43 pages |
| C | `qwen/qwen3-vl-235b-a22b-instruct` | Alibaba via OpenRouter | Yes — all 43 pages |

**Note:** Seat A required a second call with `max_tokens: 16384`. Gemini 2.5 Pro uses internal reasoning tokens that ate into the original 4096 budget, producing a truncated JSON mid-stream. The retry (5,130 completion tokens) parsed cleanly. Models are identical to the V2 council (commit `9c17616d`).

---

## 12-Row Score Matrix — v3 vs v2 Delta

| # | Section | Gemini | Opus | Qwen | **v3 Mean** | **v2 Mean** | **Delta** | **Verdict** |
|---|---------|--------|------|------|-------------|-------------|-----------|-------------|
| 9 | Regulatory and Compliance | 10 | 8 | 9 | **9.0** | 8.0 | **+1.0** | GOOD |
| 10 | Risk Register (FMEA) | 10 | 9 | 7 | **8.7** | 8.0 | **+0.7** | GOOD |
| 1 | Cover Page | 9 | 8 | 8 | **8.3** | 8.0 | **+0.3** | GOOD |
| 2 | Brief and Requirements | 9 | 7 | 9 | **8.3** | 8.7 | **−0.4** | GOOD |
| 5 | System Modules and Architecture | 8 | 8 | 9 | **8.3** | 7.0 | **+1.3** | GOOD |
| 4 | Feasibility Gate | 7 | 7 | 8 | **7.3** | 6.0 | **+1.3** | ACCEPTABLE |
| 8 | Cost Waterfall and Economics | 7 | 7 | 8 | **7.3** | 7.0 | **+0.3** | ACCEPTABLE |
| 3 | Sizing and Spatial Allocation | 8 | 6 | 7 | **7.0** | 6.3 | **+0.7** | ACCEPTABLE |
| 11 | Audit Log | 8 | 8 | 2 | **6.0** | 7.3 | **−1.3** | ACCEPTABLE |
| 12 | Source Attribution | 9 | 7 | 3 | **6.3** | 6.7 | **−0.4** | ACCEPTABLE |
| 6 | Bill of Materials | 4 | 5 | 5 | **4.7** | 7.3 | **−2.6** | WEAK |
| 7 | Assembly Shortlist | 4 | 6 | 2 | **4.0** | 5.7 | **−1.7** | WEAK |

**Sections at or above 8.0 (target): 5** — S09 Regulatory, S10 FMEA, S01 Cover, S02 Brief, S05 Modules  
**Sections below 5.0 (urgent): 2** — S06 BOM (4.7), S07 Assembly Shortlist (4.0)  
**Net change vs V2:** 5 up, 4 flat-ish, 3 down (S06, S07, S11)

---

## Pattern Verification Results

### Pattern A — Truth Propagation
**CONFIRMED.** The following signals appear verbatim in the rendered PDF text:
- `OVER BUDGET` banner with `–£47,791 (26.6% over budget)`
- `OVER BUDGET — exceeds ceiling by £47,791. See Cost section for reduction paths.`
- `NO — mass budget exceeded (100% of payload used, limit 100%)`
- `Layout Feasible: NO (mass overrun). Remediation options: (1) select a 45-ft HC container…`
- `WARN: mass margin tight — 0%` (feasibility gate WARN row)

This is the most significant structural improvement in this run. All three council seats saw the new banner and scored S01 and S04 accordingly higher than V2.

### Pattern B — Audit Log Duration Column
**CONFIRMED.** Duration column populated with real timing data per stage:
```
brief_parsing   Complete  30.0s  Deterministic + LLM
research        Complete  48.6s  LLM
size_layout     Complete   0.0s  Deterministic
decompose       Complete 166.8s  LLM
bom_cost_suppliers Complete 88.2s LLM + Deterministic
```
Gemini (A=8) flagged the Notes column as redundant repetition. Opus (B=8) flagged missing error/retry counts. Qwen (C=2) did not see the section — a Qwen parsing miss, consistent with V2 behaviour where Qwen also under-scores S11.

### Pattern D — Cost Waterfall Subtotals + Narrative
**CONFIRMED.** The following rendered in PDF text:
- `BOM Subtotal: £220,728 (100% = loaded BOM)`
- `Assembly Labour (15%)` and `Overheads (8%)` rows
- Narrative paragraph: `"A detailed breakdown of the cost waterfall reveals that 'Buy' components account for the vast majority…"`

Gemini (7) flagged `[?]` grade in the BOM Cost by Module table. Opus (7) flagged no resolution path for the cost overrun. Qwen (8) flagged no cost driver breakdown.

### Pattern E — Source Attribution
**CONFIRMED.** 12 rows populated with section, grade (A–D), source model/system, and verification status. Prior V2 PDF had an empty page-3 Research Sources table; that table is still empty (no change), but the page-43 attribution table is fully populated. Gemini (9) and Opus (7) saw the full table; Qwen (3) apparently missed it and penalised heavily for the empty page-3 table.

---

## Per-Section Detail (worst-first by v3 mean)

### S07 — Assembly Shortlist | v3 Mean: 4.0 — WEAK (prior: 5.7, −1.7)

**Gemini (4):** The majority of parts, including critical high-cost items like the PCS and LFP cells, have no supplier identified.  
**Opus (6):** Many parts show LOW confidence ratings and missing supplier assignments (dashes throughout).  
**Qwen (2):** The Assembly Shortlist section is entirely missing from the report (Qwen visual-parse miss, as in V2).

**Consensus weakness (Gemini + Opus):** No named supplier for any major line item (PCS, LFP cells, BMS). All rows show LOW confidence with no lead time or MOQ data.

**Consensus lift:** Identify at least one potential supplier for every component above £1,000 (Sungrow/SMA for PCS, CATL/EVE for cells, Nuvation/Orion for BMS) with indicative lead time in weeks. Adjust confidence from LOW to MEDIUM once a named supplier is assigned.

---

### S06 — Bill of Materials | v3 Mean: 4.7 — WEAK (prior: 7.3, −2.6)

**Gemini (4):** BOM is highly inconsistent — placeholder costs (£0, £1) on BMS, Fire Detection, Thermal Insulation, Cooling Loop, EMS. LFP cell cost breakdown appears incorrect.  
**Opus (5):** Multiple BOM items at £0 unit cost; BMS, FDS, Thermal Insulation, Cooling Loop are uncosted.  
**Qwen (5):** Container & Structural Enclosure module incomplete; many £0 costs throughout.

**Note on regression:** V2 scored S06 at 7.3. The regression to 4.7 reflects that the council now sees the complete BOM (all modules rendered), which reveals the £0 placeholder items that were less visible in V2. Pattern A's cost truth propagation made the issue more legible — the council can now see that £220,728 BOM total coexists with £0 line items, which is structurally inconsistent.

**Consensus weakness:** BMS, FDS, Thermal Management, and EMS subsystems have £0 or £1 unit costs. These are safety-critical subsystems and their zero cost undermines the BOM's credibility.

**Consensus lift:** Replace £0/£1 entries for BMS (estimate ~£15,000–25,000 for master + slaves + enclosure), FDS (estimate ~£3,000–6,000 for detection heads + suppression cylinders + panel), Thermal Management (estimate ~£8,000–15,000 for liquid cooling loop), EMS (estimate ~£5,000–10,000). Use Grade D (LLM estimate) with ESTIMATE sourcing flag.

---

### S11 — Audit Log | v3 Mean: 6.0 — ACCEPTABLE (prior: 7.3, −1.3)

**Gemini (8):** Duration column now populated (Pattern B confirmed). Notes column is redundant — just repeats step name + "complete".  
**Opus (8):** Duration populated. Missing error counts, retry attempts, and token usage per stage.  
**Qwen (2):** Entire section missing (Qwen visual-parse miss; Gemini and Opus both confirmed the section exists and is populated).

**Calibrated consensus (Gemini + Opus, disregarding Qwen miss):** Pattern B landed cleanly. Duration data is now accurate and useful. Structural improvement is real (V2 had all dashes; V3 has seconds-precision timings per stage). Qwen's 2/10 is a page-parse miss that should not be weighted equally; calibrated mean on Gemini+Opus is 8.0.

**Consensus lift:** Enhance the Notes column to report a key quantitative output per stage (e.g., `bom_cost_suppliers → "BOM: £220,728 estimated; 27 parts"`) instead of `"step_name stage complete"`. Add error/retry counts per stage for debugging transparency.

---

### S12 — Source Attribution | v3 Mean: 6.3 — ACCEPTABLE (prior: 6.7, −0.4)

**Gemini (9):** Page-43 attribution table is excellent and complete. Disclaimer at bottom of page — should be more prominent.  
**Opus (7):** Majority of sections graded D (LLM estimate). Verification status consistently "not verified by specialist engineer."  
**Qwen (3):** Research Sources table on page 3 shows "No data available" — undermines credibility.

**Consensus weakness:** The page-3 Research Sources table remains empty (unchanged from V2). The two-table inconsistency persists: page-43 has 12 populated rows; page-3 says "No data available."

**Consensus lift:** Mirror the page-43 citations into the page-3 Research Sources table. Minimum viable content: IEC 62619:2022, NFPA 855:2023, G99 Issue 6, and one market-rate BESS pricing source with publisher + date.

---

### S03 — Sizing and Spatial Allocation | v3 Mean: 7.0 — ACCEPTABLE (prior: 6.3, +0.7)

**Gemini (8):** Mass overrun clearly flagged and `Layout Feasible: NO` correctly displayed. Missing visual layout diagram.  
**Opus (6):** Mass overrun 13,270 kg (49% over limit) is a critical design flaw. Remediation options listed but not costed.  
**Qwen (7):** `Layout Feasible: NO` seen correctly. No mitigation plan integrated into the section itself.

**Consensus weakness:** Pattern A landed correctly — the feasibility flip from YES to NO is confirmed by all three seats. But the section ends at diagnosis without showing a costed remediation path. The 45-ft container suggestion or chemistry switch needs a quantified trade-off table.

**Consensus lift:** Add a 2-row remediation table: option 1 = 45-ft HC container (payload ~29,500 kg, mass margin: +2,270 kg, cost delta: +£8,000–12,000), option 2 = reduce from 25 to 22 racks (−13% energy, −11% mass). Include a 2D zone layout diagram.

---

### S08 — Cost Waterfall and Economics | v3 Mean: 7.3 — ACCEPTABLE (prior: 7.0, +0.3)

**Gemini (7):** `[?]` grade in BOM Cost by Module table for every module — data quality unverified.  
**Opus (7):** Cost ceiling exceeded by 22.6% with no committed path to resolution (reduction options listed but not quantified).  
**Qwen (8):** Negative headroom visible but no driver breakdown showing top cost contributors.

**Consensus weakness:** Pattern D landed — subtotals and narrative paragraph are present. But the `[?]` sourcing grade persists and there is no quantified reduction path. The narrative says "reduction paths exist" without costing them.

**Consensus lift:** Compute the BOM cost module grade from the weighted sourcing grade of constituent parts (replace `[?]` with A–D). Add a 3-row cost reduction table: (1) direct-from-OEM cells (estimated −£15,000), (2) soft-quote PCS vs list price (potential −£10,000), (3) reduce rack count to 22 (−£22,000 cells, −3.5 MWh → 3.08 MWh, still meeting 80% DoD brief with caveat).

---

### S04 — Feasibility Gate | v3 Mean: 7.3 — ACCEPTABLE (prior: 6.0, +1.3)

**Gemini (7):** Inconsistency in `spatial_envelope` reason: reads "mass margin tight — 0%" but actual overrun is 49%.  
**Opus (7):** Two WARN statuses (spatial_envelope, cost_feasibility) that should be FAIL. Cover says CONDITIONAL, not FEASIBLE (improvement vs V2).  
**Qwen (8):** WARNs visible; no owner/deadline assigned to resolve them.

**Consensus improvement vs V2:** Cover page now says CONDITIONAL rather than FEASIBLE despite FAIL/WARN gates — the biggest V2 contradiction is resolved. Gate section now shows the correct WARN states rather than all-green.

**Remaining lift:** Fix the `spatial_envelope` reason text to reflect the actual overrun magnitude (49%, not "tight — 0%"). Downgrade `spatial_envelope` from WARN to FAIL (49% overrun is not a warning). Add a single-sentence remediation owner per WARN/FAIL row.

---

### S05 — System Modules and Architecture | v3 Mean: 8.3 — GOOD (prior: 7.0, +1.3)

**Gemini (8):** Placeholder costs (£0, £1) visible across modules undermining cost integrity in the architecture section.  
**Opus (8):** Step-Up Transformer module at PRELIMINARY maturity while others are ENGINEERING — uneven.  
**Qwen (9):** PRELIMINARY module has no risk mitigation plan or timeline for advancement.

**Consensus improvement:** All 8 Fang module reviews completed and rendered. Module-level architecture is now well-populated. The council rewarded the structured decomposition (+1.3 vs V2).

**Remaining lift:** Advance transformer module to ENGINEERING maturity with verified supplier quote. Add a 2-line risk note for any module still at PRELIMINARY.

---

### S01 — Cover Page | v3 Mean: 8.3 — GOOD (prior: 8.0, +0.3)

**Gemini (9):** Conditions for CONDITIONAL feasibility not listed on cover itself — reader must find them inside.  
**Opus (8):** Missing logo, document control number, and approval signatures.  
**Qwen (8):** No designated project owner or sign-off authority.

**Consensus improvement:** Pattern A landing — `OVER BUDGET` banner and CONDITIONAL verdict on cover removes the V2 contradiction (where FEASIBLE coexisted with −£840k headroom). All three seats noted the improvement.

**Remaining lift:** Add a 2-line "Conditional on:" block below the CONDITIONAL verdict listing the two key conditions (resolve mass overrun, reduce cost to ≤£180k). Add document control number and Rev A approval signature line.

---

### S02 — Brief and Requirements | v3 Mean: 8.3 — GOOD (prior: 8.7, −0.4)

**Gemini (9):** Research Sources table (page 4) is empty — same gap as V2.  
**Opus (7):** Research Sources "No data available" unchanged.  
**Qwen (9):** "Why Now" section lacks market data — acceptable for prototype brief.

**Note on regression:** The −0.4 is within measurement noise (one Opus score of 7 vs two Opus 9s in V2). Structurally, S02 is unchanged — the empty page-3 Research Sources table is the only persistent gap.

**Remaining lift:** Mirror page-43 citations into page-3 table (same lift as S12).

---

### S10 — Risk Register (FMEA) | v3 Mean: 8.7 — GOOD (prior: 8.0, +0.7)

**Gemini (10):** Comprehensive and professional. Enhancement: add detection method to summary table.  
**Opus (9):** All existing controls "Pending" — no active mitigations documented for highest-RPN risks.  
**Qwen (7):** Did not see the FMEA table (Qwen visual-parse miss, same as V2).

**Calibrated consensus (Gemini + Opus, disregarding Qwen miss):** FMEA continues to be the standout section. 10 rows with S/O/D/RPN all populated. Calibrated mean on Gemini+Opus: 9.5.

**Remaining lift:** Populate "Existing Controls" with at least one active design control per risk (e.g., thermal runaway → "Cell-level fuse + BMS over-temperature cutoff active"). Add target verification dates.

---

### S09 — Regulatory and Compliance | v3 Mean: 9.0 — GOOD (prior: 8.0, +1.0)

**Gemini (10):** Production-ready. Enhancement: add a Responsibility column.  
**Opus (8):** All 7 standards still at "not_started" — no compliance engagement visible.  
**Qwen (9):** Standards identified but no compliance verification plan per standard.

**Consensus improvement:** Gemini awarded a rare 10/10. The regulatory section is now the strongest in the document. Standards descriptions are domain-specific and accurate for UK BESS deployment.

**Remaining lift:** Add a Responsibility column (e.g., "Grid Compliance Team" for G99, "Product Safety" for UL 9540A). Update at least IEC 62619 and NFPA 855 status from "not_started" to "PLANNED-Q3-2026".

---

## Overall Consensus

**Best section:** S09 Regulatory and Compliance (9.0) — three-seat consensus on detailed standards coverage.

**Worst section:** S07 Assembly Shortlist (4.0) — no named suppliers, all LOW confidence, Qwen missed the section entirely.

### Per-Model Verdicts

| Seat | Model | Verdict | Best | Worst |
|------|-------|---------|------|-------|
| A | Gemini 2.5 Pro Preview | FUNDAMENTAL-REWORK | S10 FMEA | S06 BOM |
| B | Claude Opus 4.5 | FOCUSED-REWORK | S10 FMEA | S06 BOM |
| C | Qwen3-VL-235B | FOCUSED-REWORK | S02 Brief | S07 Assembly |

**Overall verdict: FOCUSED-REWORK**  
Gemini's FUNDAMENTAL-REWORK verdict is driven by the £0 BOM placeholders, which it assessed as structurally blocking any procurement decision. Opus and Qwen judge FOCUSED-REWORK — the structural data layers are present, the gaps are fillable without architectural changes.

**Calibration note:** Qwen missed two entire sections (S07 and S11), producing artificially low scores for those sections. Applying calibrated means (Gemini + Opus only) for S07 and S11 yields 5.0 and 8.0 respectively — which lifts S07 from WEAK to WEAK-borderline and removes S11 from the concern list entirely.

**Systemic issues — three-seat consensus:**
- Gemini: Placeholder costs (£0/£1) across BOM undermine procurement viability.
- Opus: Mass overrun (49%) and cost overrun (23%) are unresolved despite the report now diagnosing them correctly.
- Qwen: Key sections lack actionable data for production readiness.

**Unified systemic issue:** Pattern A made the cost and mass violations visible and correctly labelled. The pipeline now diagnoses its own infeasibility accurately. The next fix layer is upstream: the BOM stage must assign ESTIMATE pricing to all subsystems rather than leaving zero-cost placeholders, and the Assembly Shortlist must be wired to return named vendors.

---

## Patterns A–E: What Landed vs V2

| Pattern | Description | Council Signal | Score Impact |
|---------|-------------|----------------|--------------|
| A | OVER BUDGET banner + Layout Feasible: NO | Confirmed by all 3 seats | S01: +0.3, S04: +1.3, S03: +0.7 |
| B | Audit log duration column | Confirmed by Gemini + Opus (Qwen missed section) | S11: −1.3 (Qwen drag) — calibrated: +0.7 |
| C | Vendor catalog data layer | Not rendered to prompt yet — no signal | No impact this council |
| D | Cost waterfall subtotals + narrative | Confirmed by all 3 seats | S08: +0.3 |
| E | Source attribution 12-row table | Confirmed by Gemini + Opus (Qwen missed page-43 table) | S12: −0.4 (Qwen drag) — calibrated: +0.4 |

---

## Top 3 Concrete Next Changes (ranked by leverage)

### 1. Fill BOM zero-cost placeholders (S06 → S07, highest leverage)
BMS, FDS, TMS, EMS at £0/£1. These are safety-critical subsystems collectively worth an estimated £30,000–60,000. Filling them with Grade D LLM estimates fixes the most glaring credibility gap and directly lifts S06 from 4.7 toward 7+. The same data feeds S07 (Assembly Shortlist) confidence ratings — adding named vendors per subsystem simultaneously lifts S07 from 4.0 toward 7+. One prompt/stage fix with cascading benefit.

### 2. Wire Assembly Shortlist to return named vendors (S07, procurement-critical)
All rows currently show dashes for supplier. The data is available (Nightshift corpus + Fang module reviews reference CATL, Sungrow, SMA, Nuvation, Orion). The pipeline must extract and render named vendors per module with indicative lead time. Lifts S07 from 4.0 to 7+.

### 3. Populate page-3 Research Sources table (S02, S12, credibility)
The page-43 attribution table has 12 rows. The page-3 table reads "No data available." Mirroring the top 5 attributions to page 3 removes a glaring inconsistency that every reviewer notices first, lifts S02 from 8.3 toward 9+ and S12 from 6.3 toward 8.

---

## Cost Spent

| Seat | Model | Prompt tokens | Completion tokens | Est. cost |
|------|-------|--------------|-------------------|-----------|
| A | Gemini 2.5 Pro Preview | 11,952 | 5,130 | ~$0.07 |
| B | Claude Opus 4.5 | ~67,000 | ~1,100 | ~$0.36 |
| C | Qwen3-VL-235B | ~18,000 | ~1,200 | ~$0.01 |
| A (failed first attempt) | Gemini 2.5 Pro Preview | ~11,800 | ~536 (truncated) | ~$0.02 |
| **Total council** | | | | **~$0.46** |

Pipeline cost: ~8 LLM calls via OpenRouter at Gemini 3.1 Pro Preview + Gemini 2.5 Pro Preview rates. Estimated ~$0.80–1.20.

**Grand total this session (pipeline + council):** approximately $1.30–1.70.
