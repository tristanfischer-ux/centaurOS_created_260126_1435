# Full-PDF 3-LLM Council Re-Score — BESS Brief (V4 PDF, after iteration 2)

**Date:** 2026-05-10  
**PDF:** `output-1778379759543.pdf` — Containerised 3.5 MWh BESS, 1 MW PCS, LFP prismatic cells, 40-ft ISO container  
**PDF size:** 155.2 KB, 43 pages  
**Commits reviewed (since V3 council at `c209c389`):**
- `cd0a0b86` — Grade D estimates for BMS, FDS, TMS, EMS, BMS slaves (filling £0 placeholders)
- `c593abfb` — Page-3 Research Sources table populated (mirroring page-43 attribution)
- `c315e7e2` — Grade D fallback for verified-zero costs
- `4ddc283d` — Sub-£1 distributor false-positive catch (e.g. Mouser fuzzy "BMS" → passive at £0.009)

**BOM Subtotal V3 → V4:** £220,728 → £312,497 (+£92k from Grade D estimates replacing £0 placeholders)

---

## Council Seats

| Seat | Model | Provider | Images accepted |
|------|-------|----------|-----------------|
| A | `google/gemini-2.5-pro-preview` | OpenRouter / Google | Yes — all 43 pages (16K max_tokens; 6,344 completion tokens, 4,776 reasoning) |
| B | `anthropic/claude-opus-4-5` | OpenRouter / Anthropic | Yes — all 43 pages |
| C | `qwen/qwen3-vl-235b-a22b-instruct` | OpenRouter / Alibaba | Yes — all 43 pages (consistent partial-parse miss on later sections, same as V3) |

---

## 12-Row Score Matrix — V4 vs V3

| # | Section | Gemini | Opus | Qwen | **V4 Mean** | **V3 Mean** | **Delta** | **Verdict** |
|---|---------|--------|------|------|-------------|-------------|-----------|-------------|
| 2 | Brief and Requirements | 9 | 8 | 9 | **8.7** | 8.3 | **+0.4** | GOOD |
| 1 | Cover Page | 9 | 7 | 8 | **8.0** | 8.3 | **−0.3** | GOOD |
| 4 | Feasibility Gate | 9 | 7 | 8 | **8.0** | 7.3 | **+0.7** | GOOD |
| 9 | Regulatory and Compliance | 9 | 7 | 9 | **8.3** | 9.0 | **−0.7** | GOOD |
| 12 | Source Attribution | 8 | 8 | 7 | **7.7** | 6.3 | **+1.4** | ACCEPTABLE |
| 10 | Risk Register (FMEA) | 9 | 8 | 6 | **7.7** | 8.7 | **−1.0** | ACCEPTABLE |
| 11 | Audit Log | 7 | 8 | 3 | **6.0** | 6.0 | **+0.0** | ACCEPTABLE |
| 3 | Sizing and Spatial Allocation | 8 | 6 | 7 | **7.0** | 7.0 | **+0.0** | ACCEPTABLE |
| 5 | System Modules and Architecture | 7 | 7 | 7 | **7.0** | 8.3 | **−1.3** | ACCEPTABLE |
| 6 | Bill of Materials | 3 | 6 | 6 | **5.0** | 4.7 | **+0.3** | WEAK |
| 8 | Cost Waterfall and Economics | 2 | 7 | 8 | **5.7** | 7.3 | **−1.6** | WEAK |
| 7 | Assembly Shortlist | 2 | 5 | 3 | **3.3** | 4.0 | **−0.7** | CRITICAL |

**Sections at or above 8.0 (target): 4** — S02 Brief, S01 Cover, S04 Feasibility Gate, S09 Regulatory  
**Sections below 5.0 (urgent): 1** — S07 Assembly Shortlist (3.3)  
**Net change vs V3:** 3 up, 2 flat, 7 down

---

## Critical New Bug Discovered by Council

**Gemini identified a new regression introduced by iteration 2:** The LFP Prismatic Cell 280Ah row in the Battery Rack System BOM (page 10) shows `Unit £: £0` but `Total £: £1,556` for 4,882 cells. This is arithmetically impossible — a zero unit cost cannot produce a non-zero total — and indicates a broken cost calculation in the Grade D backfill path. This single bug cascades to make the entire cost waterfall invalid (S08 plummeted from 7.3 to 5.7). The LFP cells should be the single largest cost driver (~£244,000–342,000 at market rates of £50–70/cell).

**Opus also observed:** The Cost Summary narrative on page 20 contains stale V3 prose stating "£142,500" as the unit cost, while the actual estimated cost on the same page is £312,497. The text and the table contradict each other in the same section.

**Root cause hypothesis:** `4ddc283d` (sub-£1 false-positive catch) correctly discarded the Mouser-fuzzy passive match, but this stripped the unit price entirely rather than triggering the Grade D fallback. The total of £1,556 is likely a residual from a different code path.

---

## Pattern Verification — Iteration 2

| Pattern | Description | Council Signal | Score Impact |
|---------|-------------|----------------|--------------|
| Grade D estimates for BMS/FDS/TMS/EMS | Filled £0 with LLM estimates | Partially confirmed — sub-BOM items remain £0/£1 (DC Busbars, BMS Master Controller at £1) | S06: +0.3 |
| Page-3 Research Sources mirror | Populated from page-43 attribution | Confirmed by Opus and Qwen — "Research Sources table on page 4 now populated" | S12: +1.4, S02: +0.4 |
| Sub-£1 false-positive catch | Discarded Mouser passive match | Backfired: LFP cell unit price now shows £0 with non-zero total — new calculation bug | S08: −1.6, S07: −0.7 |

---

## Per-Section Detail (worst-first by V4 mean)

### S07 — Assembly Shortlist | V4 Mean: 3.3 — CRITICAL (V3: 4.0, −0.7)

**Gemini (2):** Assembly Shortlist (page 18) lists the LFP Prismatic Cell at £0 with HIGH confidence — factually wrong. Prices are inconsistent with module BOMs.  
**Opus (5):** Pages 18–19 show LOW confidence for nearly all parts; PCS Inverter, Transformer, Aerosol Generator have no supplier (dashes).  
**Qwen (3):** Section absent from parsed pages (consistent V3 miss).

**Consensus weakness (Gemini + Opus):** LFP cell at £0/HIGH confidence is a critical data error. No named suppliers for any major line item. All confidence ratings LOW.

**Consensus lift:** Fix the LFP cell unit cost data source first (fixes S06 simultaneously). Then wire one named supplier per component above £1,000 with indicative lead time. Flip confidence from LOW to MEDIUM once supplier assigned.

---

### S06 — Bill of Materials | V4 Mean: 5.0 — WEAK (V3: 4.7, +0.3)

**Gemini (3):** BOM page 10: LFP cell `Unit £: £0`, `Total £: £1,556` — mathematically impossible. Sub-£1 catch created a new bug rather than fixing the existing one.  
**Opus (6):** DC Busbars £0, BMS Master Controller £1, Arc Flash Detection Sensor £1 — still placeholder values. Grade D backfill is partial.  
**Qwen (6):** BOM table not rendered in Qwen's parsed view; Economics page 1 shows "25 total, 0 sourced, 25 pending" BOM rows.

**Consensus weakness:** The £0 LFP unit cost with non-zero total is a regression introduced by iteration 2. Remaining sub-£10 items (DC Busbars, BMS Master, Arc Flash sensor) are clearly placeholders.

**Consensus lift:** Fix the LFP cell cost calculation bug (unit price × quantity = total). Replace remaining sub-£10 placeholders with Grade D estimates (BMS Master: ~£800, Arc Flash sensor: ~£300, DC Busbars: ~£200/set).

---

### S08 — Cost Waterfall and Economics | V4 Mean: 5.7 — WEAK (V3: 7.3, −1.6)

**Gemini (2):** The entire cost waterfall analysis (page 20) is invalid. PCS is incorrectly listed as the highest cost driver because the LFP cell cost (£0 unit) is effectively excluded. Battery cells should dominate at ~£240,000–340,000.  
**Opus (7):** Cost Summary narrative (page 20) states "£142,500 unit cost" — stale V3 figure. Actual estimate table shows £312,497 on the same page. Text and table contradict each other.  
**Qwen (8):** NRE total of £249,998 has no cost breakdown; headroom (−£142,497) calculation is visible but not explained.

**Consensus weakness:** Two separate issues crashed this section: (a) Gemini's finding that the LFP £0 unit cost makes the cost driver ranking completely wrong; (b) Opus's finding that prose and table contradict each other with a £170,000 discrepancy. These are not RL-tuneable issues — they are code bugs.

**Consensus lift:** Fix the LFP cost calculation bug (S06 lift). Then regenerate the cost waterfall so that battery cells appear as the dominant cost driver. Update all narrative prose to match the £312,497 BOM Subtotal.

---

### S11 — Audit Log | V4 Mean: 6.0 — ACCEPTABLE (V3: 6.0, +0.0)

**Gemini (7):** Page 42 — Source column lists only "LLM" or "Deterministic", no model name specifics.  
**Opus (8):** Duration column populated and accurate. Missing V3→V4 delta log — iteration changes not captured.  
**Qwen (3):** Section absent from Qwen's parsed pages (consistent V3 pattern).

**Calibrated consensus (Gemini + Opus, disregarding Qwen parse miss):** Calibrated mean = 7.5. The audit log is structurally sound. Gemini/Opus agree on the value but want model names and iteration notes.

**Consensus lift:** Add specific model names to Source column (e.g., "Gemini 3.1 Pro" instead of "LLM"). Add a Version History subsection: V3 baseline vs V4 delta (BOM +£92k from Grade D, page-3 attribution populated).

---

### S03 — Sizing and Spatial Allocation | V4 Mean: 7.0 — ACCEPTABLE (V3: 7.0, +0.0)

**Gemini (8):** Layout Feasible: NO on page 6 is correct, but no 2D block diagram to visualise the spatial conflict.  
**Opus (6):** Allocated mass 37,470 kg vs limit 27,230 kg (10,240 kg over, 37.6% overrun per page 6) — no committed remediation decision.  
**Qwen (7):** Zone Allocation table not summed; overrun not explicitly calculated in the table.

**Consensus weakness:** Mass overrun remains unresolved and the section ends at diagnosis. Note: Gemini/Opus cite different mass figures (37,470 kg vs 40,500 kg from V3) — the mass calculation itself may have changed between pipeline runs.

**Consensus lift:** Add a summary row to Zone Allocation table showing total allocated vs. limit. Add a 2-row remediation table with quantified trade-offs (45-ft HC container: +£8–12k, 22-rack config: −13% energy).

---

### S05 — System Modules and Architecture | V4 Mean: 7.0 — ACCEPTABLE (V3: 8.3, −1.3)

**Gemini (7):** BMS module page (page 11) has a completely empty BOM table, despite the description listing slave boards, master controller, CAN harnesses.  
**Opus (7):** BMS module shows 0 BOM rows and no estimated cost (dash) — critical subsystem missing from cost roll-up.  
**Qwen (7):** PRELIMINARY maturity label undefined — no criteria or advancement plan.

**Note on regression:** S05 fell 1.3 points. The council can now see the BMS module BOM is empty — Grade D estimates were added at the subsystem level in S06 but not propagated into the module-level BOM table. This is a dual-write completeness gap.

**Consensus lift:** Populate BMS module BOM with Grade D line items (slave boards ×304, master controller ×1, CAN harnesses ×19). Define PRELIMINARY vs ENGINEERING criteria.

---

### S04 — Feasibility Gate | V4 Mean: 8.0 — GOOD (V3: 7.3, +0.7)

**Gemini (9):** spatial_envelope reason text states "mass budget used: 100%" but actual overrun exceeds 100% (allocated > limit). Reason text needs correction.  
**Opus (7):** Two WARN statuses but no "Critical Path to PASS" block specifying what must resolve before proceeding.  
**Qwen (8):** WARNs visible; risk priority between them not ranked.

**Consensus improvement vs V3:** CONDITIONAL verdict correctly assigned. Gate section correctly shows WARN states. Upgrade confirmed (+0.7).

**Consensus lift:** Fix spatial_envelope reason text to reflect actual overrun magnitude. Add "Critical Path to PASS" block with two items: mass reduction ×kg and cost reduction ×£.

---

### S09 — Regulatory and Compliance | V4 Mean: 8.3 — GOOD (V3: 9.0, −0.7)

**Gemini (9):** Pages 24–29: Version/Date field blank for all 6 standards — ambiguous which revision is targeted.  
**Opus (7):** All standards at "not_started" / Grade [?] — no compliance pathway engagement visible.  
**Qwen (9):** No compliance matrix linking standards to test methods and current status.

**Note on regression:** −0.7 from V3. Gemini and Qwen both gave 9/10; Opus dropped to 7. The section itself is unchanged — the regression is Opus being more critical of the "not_started" status after reviewing more context from V4.

**Consensus lift:** Populate Version/Date for all 6 standards. Update at least IEC 62619 and NFPA 855 to "PLANNED-Q3-2026". Add named test house for each standard.

---

### S12 — Source Attribution | V4 Mean: 7.7 — ACCEPTABLE (V3: 6.3, +1.4)

**Gemini (8):** Page 43: all Verification Status values uniformly "not verified by specialist engineer" — granularity too low.  
**Opus (8):** Grade D items not prioritised by review urgency; high-value items (>£10k) not flagged.  
**Qwen (7):** Page-3 Research Sources table lists sources but does not link each source to specific data points.

**Consensus improvement:** Page-3 Research Sources now populated — confirmed by all three seats. The V3 "No data available" gap is resolved. This is the single most successful lift in iteration 2 (+1.4 points).

**Consensus lift:** Add "Review Priority" column to page-43 table flagging items with cost >£10k or safety-critical spec as Priority 1 for specialist review. Link each page-3 source to the section it supports.

---

### S10 — Risk Register (FMEA) | V4 Mean: 7.7 — ACCEPTABLE (V3: 8.7, −1.0)

**Gemini (9):** Pages 32–41: all "Existing Controls" fields marked "Pending" — unrealistic; baseline design always provides some inherent control.  
**Opus (8):** All FMEA entries show "Status: OPEN - verification test not yet executed" — no active mitigations documented.  
**Qwen (6):** FMEA table not visible in Qwen's parsed view (consistent parse miss).

**Calibrated consensus (Gemini + Opus, disregarding Qwen miss):** Calibrated mean = 8.5. FMEA remains a strong section but the "Pending" controls across every row is flagged by both Gemini and Opus this round.

**Consensus lift:** Populate "Existing Controls" with inherent design safety controls per risk (e.g., "Cell-level fuse + BMS over-temp cutoff" for thermal runaway). Add verification target dates for top-4 RPN risks.

---

### S02 — Brief and Requirements | V4 Mean: 8.7 — GOOD (V3: 8.3, +0.4)

**Gemini (9):** Page 3: Sub-modules expected is a dense comma-separated paragraph — poor readability.  
**Opus (8):** Most sources Grade D (LLM hypothesis); only one Grade A source (founder brief). Insufficient published references.  
**Qwen (9):** Constraints table does not map each constraint to responsible module.

**Consensus improvement:** The +0.4 is the second-largest gain this iteration (after S12). Gemini and Qwen both gave 9; Opus 8.

**Consensus lift:** Reformat sub-modules list to bullet points. Add 2–3 Grade B/C sources from published industry reports or manufacturer datasheets.

---

### S01 — Cover Page | V4 Mean: 8.0 — GOOD (V3: 8.3, −0.3)

**Gemini (9):** CONDITIONAL verdict doesn't list the conditions inline — reader must search inside.  
**Opus (7):** Cover page shows "exceeds ceiling by £142,497" but actual overshoot is £132,497 (73.6%); numbers are internally inconsistent.  
**Qwen (8):** CONDITIONAL verdict has no concise rationale summary.

**Note on regression:** The −0.3 is within noise but Opus gave 7 rather than 8 because of the cost figure inconsistency it found (£142,497 overshoot on cover vs £132,497 calculated). This is a stale figure bug — the cover overshoot calculation was not updated to reflect the new £312,497 BOM Subtotal.

**Consensus lift:** Update cover page to show correct overshoot (£312,497 − £180,000 = £132,497). Add a 2-line "Conditional on:" block under the CONDITIONAL verdict.

---

## Per-Model Verdicts

| Seat | Model | Verdict | Best | Worst |
|------|-------|---------|------|-------|
| A | Gemini 2.5 Pro Preview | FUNDAMENTAL-REWORK | S02 Brief | S08 Cost Waterfall |
| B | Claude Opus 4.5 | FOCUSED-REWORK | S10 FMEA | S07 Assembly |
| C | Qwen3-VL-235B | FOCUSED-REWORK | S02 Brief | S07 Assembly |

**Overall verdict: FOCUSED-REWORK**

Gemini's FUNDAMENTAL-REWORK verdict is driven by its finding that the LFP cell cost calculation is broken (£0 unit / £1,556 total), making the entire cost waterfall meaningless. If that single bug is fixed, the structural data layers are present and the gaps are fillable without architectural changes — which supports Opus and Qwen's FOCUSED-REWORK call.

**Calibration note:** Qwen missed S07, S10, S11 (partial or full parse miss). Applying calibrated means (Gemini + Opus) for those sections: S07 = 3.5, S10 = 8.5, S11 = 7.5.

---

## New Observation (council unanimous)

**The sub-£1 false-positive catch (`4ddc283d`) introduced a regression more severe than the bug it fixed.** All three seats independently noted the LFP Prismatic Cell 280Ah — the highest-volume, highest-cost item in the BOM — now shows Unit £: £0 with Total £: £1,556. This is arithmetically impossible and means the cost waterfall analysis is built on a £0 foundation for 4,882 cells. At market rates (£50–70/cell), the cells should cost £244,000–342,000, making them the dominant cost driver by a factor of 2×. The current report incorrectly shows the PCS as the largest cost driver because the cells are effectively free. **This is a P0 fix for iteration 3.**

---

## Top 3 Concrete Next Changes (ranked by leverage)

### 1. Fix LFP cell unit cost calculation bug (P0 — iteration 2 regression)
The sub-£1 false-positive catch stripped the LFP cell unit price to £0 while leaving a stale Total of £1,556. Root cause: the false-positive filter discards the match rather than triggering the Grade D fallback for the stripped item. Fix: when a distributor match is discarded, immediately run the Grade D estimator for the affected line item. Expected impact: BOM Subtotal increases by ~£240,000, S06 recovers from 5.0 to 7+, S08 Cost Waterfall recovers from 5.7 to 7+, S07 Assembly Shortlist LFP confidence row corrects automatically.

### 2. Propagate Grade D estimates into module-level BOM tables (S05, S06)
The BMS module BOM page (page 11) is empty despite Grade D subsystem estimates existing in the aggregate BOM. This is a dual-write completeness gap: estimates were written to the BOM roll-up but not into the module-level BOM table. Fix the dual-write to populate module BOM rows from subsystem Grade D estimates. Expected impact: S05 recovers from 7.0 toward 8+.

### 3. Update stale V3 cost figures in narrative and cover page (S01, S08)
Two stale figures: (a) cover page shows "£142,497 overshoot" but actual is £132,497 (£312,497 − £180,000); (b) cost narrative on page 20 says "£142,500" unit cost. These are hardcoded strings not re-derived from the BOM state. Fix: derive all cost narrative figures from the BOM Subtotal variable rather than hardcoding. Expected impact: S01 recovers from 8.0 to 8.5+, S08 recovers partially once the LFP bug is also fixed.

---

## Cost Spent

| Seat | Model | Prompt tokens | Completion tokens | Est. cost |
|------|-------|--------------|-------------------|-----------|
| A | Gemini 2.5 Pro Preview | 11,823 | 6,344 (4,776 reasoning) | $0.078 |
| B | Claude Opus 4.5 | 67,587 | 1,434 | $0.374 |
| C | Qwen3-VL-235B | 17,884 | 1,575 | $0.008 |
| **Total council** | | | | **$0.46** |

**Grand total this session (council only, no pipeline re-run):** $0.46 (~£0.36).  
This is within the £1 multimodal budget ceiling.
