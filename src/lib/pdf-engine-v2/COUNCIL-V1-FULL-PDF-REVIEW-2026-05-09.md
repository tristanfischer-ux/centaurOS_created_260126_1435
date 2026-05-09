# Full-PDF 3-LLM Council Review — BESS Brief (v1 PDF)

**Date:** 2026-05-09  
**PDF:** `output-1778343800036.pdf` — Containerised 3.5 MWh BESS, 1 MW PCS, LFP prismatic cells, 40-ft ISO container  
**Commit reviewed:** `09ed35ab`  
**Engine Version shown in PDF:** ForgeOS PDF Engine v3  
**Pages reviewed:** 32 pages (pdftoppm 150 DPI)

---

## Council Seats

| Seat | Model | Provider | Images accepted |
|------|-------|----------|-----------------|
| A | `google/gemini-2.5-pro-preview` | Google via OpenRouter | Yes — all 32 pages |
| B | `anthropic/claude-opus-4.7` | Anthropic via OpenRouter | Yes — all 32 pages |
| C | `qwen/qwen3-vl-235b-a22b-instruct` | Alibaba via OpenRouter | Yes — all 32 pages |

xAI Grok `x-ai/grok-2-vision-1212` returned 404 (no endpoint on OpenRouter). Substituted Qwen3-VL-235B per instructions.

---

## 12-Row Score Matrix

| # | Section | Gemini | Opus | Qwen | **Mean** | **Verdict** |
|---|---------|--------|------|------|----------|-------------|
| 10 | Risk Register (FMEA) | 1 | 2 | 3 | **2.0** | BAD |
| 3 | Sizing and Spatial Allocation | 2 | 3 | 5 | **3.3** | BAD |
| 6 | Bill of Materials | 1 | 4 | 6 | **3.7** | BAD |
| 7 | Assembly Shortlist | 4 | 5 | 4 | **4.3** | BAD |
| 8 | Cost Waterfall and Economics | 2 | 5 | 7 | **4.7** | BAD |
| 5 | System Modules and Architecture | 3 | 5 | 7 | **5.0** | WEAK |
| 4 | Feasibility Gate | 4 | 6 | 6 | **5.3** | WEAK |
| 12 | Source Attribution | 9 | 3 | 4 | **5.3** | WEAK |
| 9 | Regulatory and Compliance | 9 | 6 | 5 | **6.7** | WEAK |
| 1 | Cover Page | 8 | 5 | 8 | **7.0** | WEAK |
| 11 | Audit Log | 8 | 6 | 8 | **7.3** | WEAK |
| 2 | Brief and Requirements | 6 | 8 | 9 | **7.7** | WEAK |

**Sections at or above 8.0 (Tristan's target): NONE**  
**Sections below 5.0 (urgent fixes): S10 FMEA, S03 Sizing, S06 BOM, S07 Assembly Shortlist, S08 Cost Waterfall**

---

## Per-Section Detail (worst-first)

### S10 — Risk Register (FMEA) | Mean: 2.0 — BAD

**Consensus weakness:** The FMEA table is completely empty — "No data available" — for a safety-critical lithium-ion system that references NFPA 855, UL 9540A, and IEC 62619. The Feasibility Gate correctly flags `risk_matrix_populated: FAIL` but the cover page still reads `FEASIBLE — all gates pass`, an outright contradiction.

**Consensus lift:** Populate the FMEA with at minimum: thermal runaway propagation, DC arc fault, BMS comms loss, HVAC cooling failure, deflagration vent blockage, and grid fault ride-through — each with Severity / Occurrence / Detection scores and a computed RPN. Five rows is the floor; ten is adequate.

---

### S03 — Sizing and Spatial Allocation | Mean: 3.3 — BAD

**Consensus weakness:** The sizing solver reports `Layout Feasible: YES — 0% volume utilisation, 0% mass utilisation` and the Zone Allocation table shows `No data available`. The conclusion of feasibility is arithmetically unsupported — the solver ran but produced no output.

**Consensus lift:** Populate the Zone Allocation table with zone-by-zone entries for Battery Racks, PCS/Transformer, HVAC/LTMS, and EMS zones — each with length (mm), volume (m³), mass (kg), and contents. Recompute utilisation percentages from the module mass and volume data that already exists in Section 5.

---

### S06 — Bill of Materials | Mean: 3.7 — BAD

**Gemini (1):** The 280Ah LFP prismatic cell is listed at Qty 1, £0 unit cost — catastrophically wrong for a 3.5 MWh system.  
**Opus (4):** 26 of 26 rows are "pending" with zero sourced; items tagged VERIFIED show £0 unit cost, which is contradictory.  
**Qwen (6):** BOM places the Battery Management System as a container-module part rather than under Battery Rack Assemblies.

**Consensus weakness:** The BOM is structurally present but quantitatively hollow — the most capital-intensive line items (cells, PCS, transformer) are either uncosted or wildly under-counted, making the BOM unusable for procurement or cost validation.

**Consensus lift:** Perform first-principles cell count (3,500 kWh ÷ 280 Ah ÷ ~3.2 V nominal = ~3,900 cells at 800 V nominal string), apply market-rate unit cost (~£70–90/cell), and update Qty + Total £ for the battery rack BOM. Flag all £0 VERIFIED rows as ESTIMATE until a real price is obtained.

---

### S07 — Assembly Shortlist | Mean: 4.3 — BAD

**Consensus weakness:** The shortlist has confidence ratings (HIGH/LOW) but no supplier names for the highest-cost items (PCS, transformer, LFP cells), and no lead times or MOQ columns.

**Consensus lift:** Add at least two named vendors per major line — e.g., Sungrow / SMA for PCS, CATL / EVE for cells, Schneider Electric / ABB for switchgear — with indicative lead time (weeks) and MOQ.

---

### S08 — Cost Waterfall and Economics | Mean: 4.7 — BAD

**Gemini (2):** The waterfall total of £100,731 for a 3.5 MWh BESS is driven entirely by the £0 battery rack, making the figure meaningless.  
**Opus (5):** Industry benchmark is ~£250–350/kWh at pack level (≈ £875k–1.2M for this system); the reported £100,731 is off by an order of magnitude.  
**Qwen (7):** No sensitivity analysis or contingency on the cost headroom figure.

**Consensus weakness:** The entire economics section is downstream of an invalid BOM; the unit cost of £100,731 is not a low-cost BESS — it is an artifact of unpriced cells and modules.

**Consensus lift:** Rebuild the cost waterfall using realistic cell pricing once the BOM is corrected. Also add a Cost Sensitivity table showing ±10% variance on the top-3 cost drivers (cells, PCS, transformer).

---

### S05 — System Modules and Architecture | Mean: 5.0 — WEAK

**Consensus weakness:** Every module is PRELIMINARY (expected at this stage) but the Fire Detection & Suppression module has 0 BOM rows and a blank cost despite being the primary safety system mandated by NFPA 855 and UL 9540A.

**Lift:** Populate Fire Detection & Suppression with at minimum: multi-sensor detection heads (photoelectric + gas), fire control panel, aerosol/Novec clean-agent cylinders, and actuation wiring — with costed ESTIMATE entries.

---

### S04 — Feasibility Gate | Mean: 5.3 — WEAK

**Consensus weakness:** `risk_matrix_populated` is FAIL but the gate does not block the FEASIBLE verdict — the cover page still reads `FEASIBLE — all gates pass`, which is factually incorrect.

**Lift:** Wire gate logic so that any FAIL result sets overall verdict to `CONDITIONAL — gates outstanding` rather than FEASIBLE. Alternatively, generate the risk matrix upstream of the gate check so it can pass.

---

### S12 — Source Attribution | Mean: 5.3 — WEAK

**Gemini (9):** Scores high on the Sources page (page 32) which has a well-structured table.  
**Opus (3) / Qwen (4):** Score low because the "Research Sources" table on page 3 reads `No data available` despite the brief claiming grade-C industry sources were used.

**Consensus weakness:** There are two source-related locations in the document that are inconsistent: the Brief (page 3) has an empty source table, while page 32 has a populated attribution table. The empty page-3 table undermines the brief's credibility.

**Lift:** Mirror the source citations from page 32 into the page-3 Research Sources table, and add at least two specific document references (standard number + year, or report title + publisher).

---

### S09 — Regulatory and Compliance | Mean: 6.7 — WEAK

**Consensus weakness:** Six standards are identified with detailed Applicability, Engineering Impact, Evidence Required, and Gap Action sub-sections — the content is strong — but Version/Date, Jurisdiction, and Claim Type fields are all blank across every standard.

**Lift (Gemini):** Populate Version/Date and Jurisdiction for each standard (e.g., IEC 62619:2022, UK/Global; G99: Issue 6 Amendment 7 2023, UK only).  
**Lift (Opus):** Add a compliance traceability matrix column mapping each standard clause to the specific BOM item or module that satisfies it.

---

### S01 — Cover Page | Mean: 7.0 — WEAK

**Consensus weakness:** `FEASIBLE — all gates pass` is contradicted by the Feasibility Gate page which shows one FAIL. Gemini and Qwen scored 8; Opus scored 5 due to this contradiction being the cover page's primary message.

**Lift:** Fix the feasibility verdict logic. Add footnote on NRE amortisation basis (25-unit batch).

---

### S11 — Audit Log | Mean: 7.3 — WEAK

**Consensus weakness:** The log cleanly records pipeline steps and statuses but the Duration column is empty throughout, and there are no warning entries for the empty/failed artefacts (zones table, risk matrix, unpriced BOM rows).

**Lift:** Add warning log entries whenever a downstream artefact is empty or fails validation. Populate Duration with actual timing data.

---

### S02 — Brief and Requirements | Mean: 7.7 — WEAK

**Consensus weakness:** The strongest section in the report. Qwen noted "Why Now" is generic market copy rather than a technical justification. Opus flagged that the 28,000 kg gross mass target leaves almost zero margin when module masses from Section 5 are summed (~27 t payload + 3.75 t tare = 30.75 t, over the limit).

**Lift:** Add a mass budget reconciliation row (target 28 t vs sum-of-module-masses). Replace "Why Now" with a brief technical justification for the LFP + 40ft container choice.

---

## Overall Consensus

**Worst section:** Risk Register (FMEA) — unanimous across all three seats. An empty FMEA on a lithium BESS system is a safety-engineering omission that would cause any competent reviewer to reject the report outright.

**Best section:** Brief and Requirements — two of three seats named it best. Clear, quantified, standards-aware.

**Systemic issue (unanimous):** The pipeline produces well-structured scaffolding — correct headings, properly formatted tables, gate names, section flow — but the downstream data generators for zones, risks, BOM quantities/prices, and research sources are not firing or are returning empty. The result is a report that *looks* complete but contains critical voids. The system then self-declares FEASIBLE despite these voids, which is the most serious credibility failure.

**Overall verdict: FUNDAMENTAL-REWORK**  
5 sections are below 5.0 (BAD). No section reaches the 8/10 target. The cost model is invalid by an order of magnitude. The FMEA is empty. The spatial solver output is empty.

---

## Top 3 Concrete Changes (ranked by leverage)

### 1. Fix the cell quantity and cost in the BOM (highest leverage)
Everything downstream — Cost Waterfall, Economics, Cover Page summary, Assembly Shortlist confidence — is wrong because the 280Ah LFP cell is priced at £0 with Qty 1. Correct the cell count (~3,900 cells) and unit cost (~£75/cell) and the entire cost picture changes. This one fix propagates to S06, S08, S01, and S07 simultaneously.

### 2. Populate the FMEA (safety-critical, blocks acceptance)
An empty risk register on a lithium BESS would cause any technical reviewer, insurer, or regulatory body to immediately reject the report. Generating 8–10 FMEA rows with realistic S/O/D scores also fixes the `risk_matrix_populated` gate failure, which will then allow the cover page FEASIBLE verdict to be legitimate.

### 3. Fix the spatial solver to output zone allocation data (credibility)
The sizing section claiming "FEASIBLE — 0% utilisation" with an empty zone table is the second most visible credibility failure. Wiring the spatial solver to emit zone-by-zone allocations fixes S03, fixes the `spatial_envelope` gate check in S04, and enables a real mass-budget reconciliation in S02.

---

## One Thing the Council Noticed Without Seeing the Code

Gemini flagged that `Battery Management System` and `Energy Management System` appear as line items in the **ISO Container structural BOM** (Section 5, ISO Container & Structural Fit-out module) rather than in their own functional modules. This is an architectural misclassification in the module decomposition logic — the container module is being used as a catch-all for system-level components that have no physical relationship to the container structure. This would not be visible from inspecting source code alone; it only becomes apparent when reading the rendered PDF and cross-referencing module assignments.

---

## Cost Spent

| Model | Prompt tokens | Completion tokens | Cost (USD) |
|-------|--------------|-------------------|------------|
| Gemini 2.5 Pro Preview | 8,900 | 5,753 (incl. 4,156 reasoning) | $0.069 |
| Claude Opus 4.7 | 23,665 | 2,122 | $0.171 |
| Qwen3-VL-235B | 17,806 | 1,290 | $0.005 |
| **Total** | | | **$0.245 (~£0.20)** |

Well under the £10–12 budget estimate (images processed efficiently; Gemini and Qwen are significantly cheaper than expected).
