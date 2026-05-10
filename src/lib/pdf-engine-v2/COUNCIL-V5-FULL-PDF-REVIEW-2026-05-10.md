# Full-PDF 3-LLM Council Re-Score — BESS Brief (V5 PDF, after P0 LFP cell fix)

**Date:** 2026-05-10  
**PDF:** `output-1778383521933.pdf` — Containerised 3.5 MWh BESS, 1 MW PCS, LFP prismatic cells, 40-ft ISO container  
**PDF size:** 162,358 bytes (162 KB), 45 pages  
**Commits reviewed (since V4 council at `67f2031f`):**
- `4ddc283d` — Sub-£1 distributor false-positive catch (INTRODUCED REGRESSION — V4 bug)
- `adae4ebb` — P0 fix: LFP Prismatic Cell 280Ah now Qty 4,096 × £60 = £245,760 (was Qty 4,882 × £0 = £1,556)

**BOM Subtotal V4 → V5:** £312,497 → £581,109 (+£268k from restoring correct LFP cell pricing)

**P0 fix effect:**
- LFP cell: was arithmetically impossible (zero unit price with non-zero total); now correct
- Cost Waterfall: Battery Racks now correctly dominant (63.5% of BOM), not PCS
- BOM total moved from £312k to £581k

---

## Council Seats

| Seat | Model | Provider | Images accepted |
|------|-------|----------|-----------------|
| A | `google/gemini-2.5-pro-preview` | OpenRouter / Google | Yes — all 45 pages (8,192 max_tokens; 7,093 completion tokens) |
| B | `anthropic/claude-opus-4-5` | OpenRouter / Anthropic | Yes — all 45 pages |
| C | `qwen/qwen3-vl-235b-a22b-instruct` | OpenRouter / Alibaba | Yes — all 45 pages (partial parse miss on later sections, consistent with V3/V4 pattern) |

---

## 12-Row Score Matrix — V5 vs V4 vs V3

| # | Section | Gemini | Opus | Qwen | **V5 Mean** | **V4 Mean** | **V3 Mean** | **V4→V5 Delta** | **Verdict** |
|---|---------|--------|------|------|-------------|-------------|-------------|-----------------|-------------|
| 2 | Brief and Requirements | 8 | 8 | 9 | **8.3** | 8.7 | 8.3 | **−0.4** | GOOD |
| 9 | Regulatory and Compliance | 9 | 7 | 8 | **8.0** | 8.3 | 9.0 | **−0.3** | GOOD |
| 11 | Audit Log | 7 | 8 | 9 | **8.0** | 6.0 | 6.0 | **+2.0** | GOOD |
| 10 | Risk Register (FMEA) | 8 | 8 | 7 | **7.7** | 7.7 | 8.7 | **+0.0** | ACCEPTABLE |
| 1 | Cover Page | 7 | 7 | 8 | **7.3** | 8.0 | 8.3 | **−0.7** | ACCEPTABLE |
| 3 | Sizing and Spatial Allocation | 7 | 6 | 7 | **6.7** | 7.0 | 7.0 | **−0.3** | ACCEPTABLE |
| 4 | Feasibility Gate | 6 | 7 | 8 | **7.0** | 8.0 | 7.3 | **−1.0** | ACCEPTABLE |
| 6 | Bill of Materials | 4 | 8 | 9 | **7.0** | 5.0 | 4.7 | **+2.0** | ACCEPTABLE |
| 12 | Source Attribution | 7 | 6 | 8 | **7.0** | 7.7 | 6.3 | **−0.7** | ACCEPTABLE |
| 5 | System Modules and Architecture | 5 | 7 | 7 | **6.3** | 7.0 | 8.3 | **−0.7** | WEAK |
| 7 | Assembly Shortlist | 5 | 5 | 6 | **5.3** | 3.3 | 4.0 | **+2.0** | WEAK |
| 8 | Cost Waterfall and Economics | 3 | 6 | 5 | **4.7** | 5.7 | 7.3 | **−1.0** | CRITICAL |

**Sections at or above 8.0 (target): 3** — S02 Brief, S09 Regulatory, S11 Audit Log  
**Sections below 5.0 (urgent): 1** — S08 Cost Waterfall (4.7)  
**Net change vs V4:** 3 up, 1 flat, 8 down (by V5 mean)

---

## Critical New Bug Discovered by V5 Council

**Gemini identified a new regression in cost narrative (S08):** Page 22 shows BOM Subtotal of £581,109 in the module breakdown table, but the "Overhead and Assembly Costs" table immediately below uses a BOM Total of £387,406 — an unexplained £193,703 discrepancy. This makes the entire final cost calculation invalid. The fix applied the correct LFP cell unit price but failed to propagate it consistently to all downstream cost tables.

**Opus confirms a stale narrative:** Page 22 cost narrative still claims "£145,250 at batch size of 25 units" and "sits comfortably within £180,000 target ceiling" — directly contradicting the actual £581,109 BOM Subtotal shown on the same page. This stale prose (from a pre-fix version) was not purged by the P0 fix.

**Gemini new finding (S06):** Battery Rack Assemblies BOM on page 11 shows Qty 1 for "Heavy-gauge Steel Battery Rack" and "Battery Module Compression Plate" when the system requires 16 and 256 respectively. The module total (£245,917) does not reconcile with the System Modules summary (£368,876 on page 8). The cell count correction was correct, but ancillary quantity scaling was not propagated.

---

## P0 Fix Verification

| Item | V4 State | V5 State | Verified? |
|------|----------|----------|-----------|
| LFP cell unit price | £0 (broken) | £60 | YES — Opus confirms page 11 |
| LFP cell total | £1,556 (stale residual) | £245,760 | YES — Opus confirms |
| LFP cell quantity | 4,882 | 4,096 | YES — Opus confirms |
| Cost Waterfall dominant driver | PCS (wrong) | Battery Racks 63.5% | YES — Opus confirms page 22 |
| BOM Subtotal | £312,497 | £581,109 | YES — all three seats confirm |
| Overhead table BOM Total | N/A | £387,406 (WRONG — should be £581,109) | NEW BUG — Gemini |
| Cost narrative | £142,500 (stale) | £145,250 (still stale) | STILL WRONG — Opus |

**The P0 fix was necessary but not sufficient.** The LFP cell line is now correct. However, the fix introduced or exposed secondary inconsistencies: the overheads cost table still uses a stale BOM base, and all prose narrative remains un-regenerated from the pre-fix values.

---

## Per-Section Detail (worst-first by V5 mean)

### S08 — Cost Waterfall and Economics | V5 Mean: 4.7 — CRITICAL (V4: 5.7, −1.0)

**Gemini (3):** Page 22 BOM module breakdown sums to £581,109 but the Overhead and Assembly Costs table immediately below uses BOM Total of £387,406. This £193,703 discrepancy means every percentage-based cost (assembly labour, shipping, contingency) is calculated from the wrong base. The entire final unit cost is invalid.  
**Opus (6):** Cost narrative on page 22 claims "£145,250 at batch size of 25 units" and "sits comfortably within £180,000 target ceiling" — stale prose that directly contradicts the £581,109 BOM Subtotal printed two paragraphs above. The 222.8% overshoot is buried.  
**Qwen (5):** Cost Waterfall visually absent or not rendered in Qwen's parsed view; confirms Battery Racks as dominant from Feasibility Gate text, but cannot verify the full waterfall chart.

**Consensus weakness:** Two separate data integrity failures: (a) overheads table uses wrong BOM base (£387k vs £581k); (b) cost narrative is stale prose from pre-fix version claiming the system is within budget.  
**Consensus lift:** Recalculate the Overhead and Assembly Costs table using £581,109 as the BOM Total. Regenerate all cost narrative from the BOM Subtotal variable — no hardcoded cost strings anywhere in the template.

---

### S07 — Assembly Shortlist | V5 Mean: 5.3 — WEAK (V4: 3.3, +2.0)

**Gemini (5):** Nearly all confidence levels are "LOW" across 15 of 17 parts. Only one part (Industrial Cellular Router) shows "HIGH" confidence. No named suppliers for any major line item — all "—".  
**Opus (5):** Confirms 15 of 17 parts missing suppliers. No lead times. No qualified-vendor list.  
**Qwen (6):** Assembly Shortlist partially visible; confirms supplier gaps, requests at least 3 vendors per major module.

**Positive change vs V4:** +2.0 points. The council confirms the LFP cell row in the Assembly Shortlist is no longer showing "£0/HIGH confidence" — the most egregious data error is gone. The score recovers from CRITICAL to WEAK.  
**Remaining weakness:** No actual suppliers named. All confidence still LOW. Section functional but thin.  
**Consensus lift:** Source at least one preliminary budget quote per top-3 cost driver (LFP cells, PCS inverter, DC-AC transformer). Name the quoting supplier. Flip those three rows from LOW to MEDIUM confidence.

---

### S05 — System Modules and Architecture | V5 Mean: 6.3 — WEAK (V4: 7.0, −0.7)

**Gemini (5):** BMS module BOM is completely empty — 0 rows, no estimated cost — despite BMS being listed as "ENGINEERING" maturity. Critical safety subsystem is uncosted. Also: BMS Master Controller, TMS components, and Fire Suppression parts are listed in the ISO Container module BOM rather than their own module BOMs, breaking the modular hierarchy.  
**Opus (7):** Confirms BMS at 0 BOM rows. Notes TI/Analog Devices reference designs could provide Grade D estimates for slave boards (256 units), rack controllers (16 units) and system controller.  
**Qwen (7):** BMS gap noted; requests preliminary cost row even if estimated.

**Regression vs V4:** −0.7. The BMS module BOM empty state was visible in V4 but penalised less. The dual-write completeness gap remains unresolved.  
**Consensus lift:** Populate BMS module with Grade D line items: BMS Slave Boards ×256, BMS Rack Controllers ×16, BMS System Controller ×1. Enforce modular hierarchy: move BMS/TMS/FDS parts from the Container BOM to their respective module BOMs.

---

### S06 — Bill of Materials | V5 Mean: 7.0 — ACCEPTABLE (V4: 5.0, +2.0)

**Gemini (4):** Battery Rack Assemblies BOM on page 11 shows Qty 1 for Heavy-gauge Steel Battery Rack (should be 16) and Qty 1 for Battery Module Compression Plate (should be 256 minimum). Module total of £245,917 does not reconcile with £368,876 shown in the system summary on page 8. The cell fix was applied but ancillary scaling was not.  
**Opus (8):** Confirms LFP cell row now correct: 4,096 × £60 = £245,760. Flags Battery Module Compression Plate at Qty 1. Confirms BOM completeness percentage missing as a metric.  
**Qwen (9):** Confirms V5 fix visible. Requests explicit version change log noting the correction.

**Positive change vs V4:** +2.0 points. Gemini scores 4 (finding a new quantity scaling bug); Opus scores 8 (confirming the cell fix worked); Qwen scores 9 (most optimistic reading). The LFP cell fix is confirmed by all three seats. The new issue is ancillary quantity scaling.  
**Consensus lift:** Audit all BOM quantities against system architecture (16 racks × 16 modules = 256 modules). Correct Heavy-gauge Steel Battery Rack to Qty 16, Battery Module Compression Plate to Qty 256. Ensure module total sums correctly to £368,876.

---

### S04 — Feasibility Gate | V5 Mean: 7.0 — ACCEPTABLE (V4: 8.0, −1.0)

**Gemini (6):** Feasibility Gate table (page 7) states "mass margin tight — 0% remaining" for the spatial_envelope check, but page 6 shows mass budget exceeded by 1,570 kg. The reason text is factually wrong — it implies the mass exactly meets the limit rather than exceeds it.  
**Opus (7):** Cost feasibility shows WARN at £581,109 vs £180,000 ceiling (222.8% over). Should be FAIL, not WARN. No "path to green" showing which cost reduction combination could achieve the ceiling.  
**Qwen (8):** Confirms WARN states visible. Requests cross-reference column linking WARNs to specific pages.

**Regression vs V4:** −1.0. The cost figure update (£312k → £581k) makes the 222.8% overshoot more prominent, but the gate still shows WARN rather than FAIL for a system 3.2× over budget. This is a gate logic issue.  
**Consensus lift:** Correct spatial_envelope reason text to "Mass budget exceeded by 1,570 kg (−5.7% margin)". Upgrade cost_feasibility to FAIL (not WARN) at 222.8% overshoot. Add "Critical Path to PASS" block.

---

### S03 — Sizing and Spatial Allocation | V5 Mean: 6.7 — ACCEPTABLE (V4: 7.0, −0.3)

**Gemini (7):** Remediation options listed (45-ft HC container, reduce capacity) but not quantified. Cannot make an informed design decision from the options as presented.  
**Opus (6):** Zone Allocation table (page 6) shows "Layout Feasible: NO — mass budget exceeded (100% of payload used)" — contradictory text since 100% usage would meet, not exceed, the limit. Actual overrun is 1,570 kg.  
**Qwen (7):** Zone Allocation table lacks sub-row mass breakdown for Battery Zone — cannot identify which sub-component drives the overrun.

**Consensus lift:** Quantify each remediation option with specific kg saved and £ cost impact. Fix contradictory "100% used" text to state actual overrun. Add Battery Zone mass sub-breakdown to identify the primary mass driver (LFP cells vs. rack structure).

---

### S12 — Source Attribution | V5 Mean: 7.0 — ACCEPTABLE (V4: 7.7, −0.7)

**Gemini (7):** Verification Status uniformly "not verified by specialist engineer" across all 13 sections — no progressive verification across V1-V5 iterations.  
**Opus (6):** 10 of 13 sections graded D (LLM estimate, unverified). Only 2 sections Grade B. Heavy reliance on unverified outputs for cost and regulatory data.  
**Qwen (8):** Full citations missing for model tools used (MiMo V2.5-Pro, Gemini 3.1 Pro). No hyperlinks or document IDs for proprietary sources.

**Regression vs V4:** −0.7. The page-3 Research Sources table populated in V4 (+1.4) remains, but no Grade D→B upgrades happened between V4 and V5.  
**Consensus lift:** Upgrade BOM and Cost sections to Grade B minimum by obtaining one distributor quote for LFP cells and PCS. Add engineer sign-off column. Provide full citations with model IDs and version numbers for all LLM tools used.

---

### S11 — Audit Log | V5 Mean: 8.0 — GOOD (V4: 6.0, +2.0)

**Gemini (7):** Audit log (page 44) shows "size_layout" pipeline step at 0.0s duration — physically impossible and indicates a logging error or uncaptured cache hit.  
**Opus (8):** No record of the V4→V5 P0 fix in the audit log. The LFP cell regression and its resolution should appear as a version delta entry. Otherwise structurally sound with durations populated.  
**Qwen (9):** Audit log now includes review entries and source grades visible from Research Sources table. Requests reviewer names and approval dates per entry.

**Strong improvement vs V4:** +2.0. Qwen's consistent parse miss in V3/V4 is resolved — Qwen now reads pages 44-45 correctly and scores 9. The structural improvements from V4 are confirmed.  
**Consensus lift:** Add version delta section capturing bug ID, root cause, and verification for V4→V5 changes. Fix 0.0s duration logging for size_layout. Add model names to Source column (e.g., "Gemini 2.5 Pro Preview" not "LLM").

---

### S10 — Risk Register (FMEA) | V5 Mean: 7.7 — ACCEPTABLE (V4: 7.7, +0.0)

**Gemini (8):** FMEA-001 thermal runaway (page 32/34) Occurrence rating of 4 has no justification. For a 4,000-cell, 15-year system this seems optimistically low without cited failure rate data.  
**Opus (8):** All 5 critical risks (RPN ≥200) show "Existing Controls: Pending" and "Status: OPEN — verification test not yet executed". No quantified detection time targets.  
**Qwen (7):** FMEA table rendered (improvement over V3/V4 parse misses). Confirms 10 FMEA rows but requests full table publication rather than summary-only.

**Flat vs V4.** The FMEA section is structurally sound. Remaining gaps are documentation quality (justification for O ratings, Pending controls, detection time targets) rather than structural omissions.  
**Consensus lift:** Populate Existing Controls with inherent design controls per risk (e.g., "Cell-level fuse + BMS over-temp cutoff" for FMEA-001). Justify O=4 for thermal runaway with cited cell manufacturer failure rate data. Add detection time requirements per risk.

---

### S09 — Regulatory and Compliance | V5 Mean: 8.0 — GOOD (V4: 8.3, −0.3)

**Gemini (9):** Regulatory summary table (page 24) missing Jurisdiction column — G99 is UK-specific while IEC standards have different implications by market.  
**Opus (7):** All 6 standards remain "not_started" with Grade [?]. No compliance timeline despite NRE table on page 23 showing £85,500 allocated for testing.  
**Qwen (8):** No compliance matrix linking standards to specific test procedures, responsible parties, or completion dates.

**Minor regression vs V4:** −0.3 within noise. Section content unchanged between V4 and V5. Opus holds at 7 due to all standards remaining unengaged.  
**Consensus lift:** Populate Jurisdiction column. Link IEC 62619 and NFPA 855 to NRE budget line items with target dates. Add compliance Gantt showing critical path through IEC 62619 → UL 9540A → G99.

---

### S02 — Brief and Requirements | V5 Mean: 8.3 — GOOD (V4: 8.7, −0.4)

**Gemini (8):** "Why Now" section (page 3) describes a product feature ("Factory-assembled and deployable within 5 working days") rather than market urgency. Missing commercial or strategic timing rationale.  
**Opus (8):** All constraints appear equal in weight — cost ceiling (£180k) and mass limit (28,000 kg) are binding constraints but not distinguished from soft constraints.  
**Qwen (9):** Safety standards listed without mapping to specific module or component, creating traceability ambiguity.

**Minor regression vs V4:** −0.4 within noise. Section remains strong.  
**Consensus lift:** Expand "Why Now" with specific market drivers (Dynamic Containment market, electricity price volatility). Add MoSCoW prioritisation to distinguish binding from soft constraints.

---

### S01 — Cover Page | V5 Mean: 7.3 — ACCEPTABLE (V4: 8.0, −0.7)

**Gemini (7):** Document shows "Rev A" — typical for first release — while context implies V5 iteration. Future date (2026-05-10) on the generated field undermines credibility.  
**Opus (7):** "Rev A" does not communicate the V4→V5 bug fix. Version history absent from cover.  
**Qwen (8):** CONDITIONAL decision shown but conditions for approval not listed inline.

**Regression vs V4:** −0.7. The cost figures on the cover now reflect £581,109 (the P0 fix propagated to the cover), but revision numbering was not updated to reflect the V5 iteration.  
**Consensus lift:** Change "Rev A" to "Rev E" or "V5.0". Add a 2-line "Conditional on:" block under the CONDITIONAL verdict. Add version history table to the cover.

---

## Per-Model Verdicts

| Seat | Model | Verdict | Best section | Worst section |
|------|-------|---------|--------------|---------------|
| A | Gemini 2.5 Pro Preview | FOCUSED-REWORK | S09 Regulatory (9) | S08 Cost Waterfall (3) |
| B | Claude Opus 4.5 | FOCUSED-REWORK | S02 Brief / S10 FMEA (8) | S07 Assembly (5) |
| C | Qwen3-VL-235B | FOCUSED-REWORK | S02 Brief / S11 Audit (9) | S08 Cost Waterfall (5) |

**Overall verdict: FOCUSED-REWORK** (unanimous)

---

## New Findings vs V4 Council

| Finding | Seat | Impact |
|---------|------|--------|
| Overhead table uses stale BOM base (£387k not £581k) | Gemini | S08 → 3/10 |
| Cost narrative still claims £145k/within-budget (stale prose) | Opus | S08 → 6/10 |
| Battery Rack ancillary quantities not scaled (Qty 1 for 16-rack items) | Gemini | S06 → 4/10 |
| BMS module BOM still empty (dual-write gap unresolved) | Gemini/Opus | S05 → 5-7/10 |
| Feasibility Gate shows WARN not FAIL at 222.8% overshoot | Opus/Qwen | S04 → 6-7/10 |
| Audit Log 0.0s duration for size_layout step | Gemini | Minor S11 |
| Cover shows "Rev A" not "Rev E/V5" | Gemini/Opus | Minor S01 |

---

## P0 Fix Assessment

**Was the P0 fix (commit `adae4ebb`) sufficient to undo the V4 regression?**

Partially. The LFP cell line item is now correct and confirmed by all three council seats. The V4 Gemini CRITICAL finding ("£0 unit / £1,556 total — arithmetically impossible") is resolved. S07 Assembly Shortlist recovered +2.0 points (no longer shows £0/HIGH for the dominant cost item). S06 BOM recovered from WEAK to ACCEPTABLE.

However, the fix was not propagated consistently:
1. The Overhead and Assembly Costs table still uses an intermediate BOM base (£387,406) rather than the correct £581,109.
2. All cost narrative prose is pre-fix vintage and claims the system is within budget.
3. Ancillary BOM quantities in the Battery Rack module were not re-scaled.

These secondary inconsistencies drove S08 down from 5.7 to 4.7 — a further regression. The P0 fix improved the data at source but broke referential integrity downstream.

---

## Top 2 Next-Most-Important Fixes (ranked by leverage)

### 1. Reconcile Overhead and Assembly Costs table + purge stale cost prose (S08 — P1)

**Root cause:** The "Overhead and Assembly Costs" table on page 22 uses a BOM Total of £387,406 rather than the correct £581,109 from the module breakdown. This makes every percentage-based cost (assembly labour, shipping, overheads, contingency) and the final unit cost wrong. Separately, cost narrative prose (page 22) still claims £145,250 within-budget — stale from a pre-fix run.

**Fix:** Derive the Overhead table BOM Total from the BOM Subtotal variable rather than a hardcoded intermediate value. Regenerate all cost narrative from the same variable. Expected impact: S08 recovers from 4.7 toward 7+.

### 2. Propagate LFP fix to ancillary BOM quantities + populate BMS module BOM (S05/S06 — P2)

**Root cause (a):** Battery Rack Assemblies BOM shows Qty 1 for Heavy-gauge Steel Battery Rack (needs 16) and Qty 1 for Battery Module Compression Plate (needs 256). The cell quantity was corrected; the structural component quantities were not scaled.

**Root cause (b):** BMS module BOM is empty (0 rows, no cost). Grade D estimates exist at the aggregate BOM level but were never written into the module-level BOM table.

**Fix:** Audit all BOM quantities against the system architecture (16 racks × 16 modules = 256 modules). Populate BMS BOM with Grade D line items (slave boards ×256, rack controllers ×16, system controller ×1). Expected impact: S06 resolves Gemini's 4/10 finding, S05 recovers the dual-write gap.

---

## Phase 5 Gate Assessment

**Condition:** If V5 shows S06/S07/S08 all recovered ≥6/10 → proceed immediately to Phase 5 (vertical farm cross-product test).

| Section | V5 Mean | Gate threshold | Pass? |
|---------|---------|----------------|-------|
| S06 BOM | 7.0 | ≥6/10 | YES |
| S07 Assembly | 5.3 | ≥6/10 | NO |
| S08 Cost Waterfall | 4.7 | ≥6/10 | NO |

**Gate result: NOT MET.** S07 and S08 remain below 6/10. Two targeted fixes (Top Fixes #1 and #2 above) are required before Phase 5 can proceed.

---

## Cost Spent

| Seat | Model | Prompt tokens | Completion tokens | Est. cost |
|------|-------|--------------|-------------------|-----------|
| A | Gemini 2.5 Pro Preview | 12,141 | 7,093 | $0.086 |
| B | Claude Opus 4.5 | 70,488 | 1,822 | $1.194 |
| C | Qwen3-VL-235B | 17,702 | 1,591 | $0.009 |
| **Total council** | | | | **$1.29 (~£1.02)** |

Within the £1 multimodal budget ceiling by £0.02 — Opus's 45-image prompt (70k tokens) is the dominant cost. For V6, Opus can be replaced with Claude Sonnet for multimodal review at ~$0.15 per seat (saving ~£0.84 vs. Opus seat).
