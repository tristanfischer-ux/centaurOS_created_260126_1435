# Full-PDF 3-LLM Council — Vertical Farm V1 (Phase 5 Cross-Product Validation)

**Date:** 2026-05-10  
**PDF:** `output-1778398037059.pdf` — Modular Indoor Vertical Farm Unit, leafy greens, 40-ft container, £55,000 unit cost ceiling  
**PDF size:** 157,953 bytes (154 KB), 43 pages  
**Brief:** `src/lib/pdf-engine-v2/briefs/baseline-10/07-vertical-farm.md`  
**Pipeline runtime:** 2,098,819 ms (34.9 min) — 7 modules, 31 BOM parts, 10 FMEA rows  
**Internal council compound score:** 46/100 (rubric 89/100 × 0.4 + council 3.8/10 × 0.6)

**Pre-validation checks:**
- PDF size ≥ 150 KB: PASS (157,953 bytes)
- BOM line items with non-zero costs: PASS (31 parts, unit cost £11,633)
- Cost vs ceiling: PASS (£11,633 vs £55,000 — 78.7% under budget)
- FMEA rows: PASS (10 rows with S/O/D/RPN)
- Sizing zone allocations: PASS (Zone Allocation section present, layout conflict flagged)

---

## Council Seats

| Seat | Model | Provider | Method | Notes |
|------|-------|----------|--------|-------|
| A | `google/gemini-2.5-pro-preview` | OpenRouter / Google | Text (PDF extracted) | Vision call failed ×3 — token truncation with 20 × 150 DPI images; text call succeeded (16K max_tokens) |
| B | `anthropic/claude-opus-4-5` | OpenRouter / Anthropic | Vision (43 pages, 150 DPI) | Clean response, all 12 sections |
| C | `qwen/qwen3-vl-235b-a22b-instruct` | OpenRouter / Alibaba | Vision (43 pages, 150 DPI) | 2 parse misses calibrated out (S10, S12 — scored ≥3 below other judges) |

**Parse-miss calibration:**
- S10 (FMEA): Qwen score 3 vs Gemini/Opus mean 7.0 → Δ = −4.0. CALIBRATED OUT.
- S12 (AI Log): Qwen score 8 vs Gemini/Opus mean 4.0 → Δ = +4.0 (above, not below). NOT a parse miss — retained.

---

## 12-Row Score Matrix — Vertical Farm V1 vs BESS V5

| # | Section | Gemini | Opus | Qwen | **VFarm V1** | **BESS V5** | **Delta** | **Verdict** |
|---|---------|--------|------|------|--------------|-------------|-----------|-------------|
| 2 | Executive Summary / Brief | 8 | 8 | 9 | **8.3** | 8.3 | **+0.0** | GOOD |
| 1 | Cover Page | 7 | 7 | 8 | **7.3** | 7.3 | **+0.0** | ACCEPTABLE |
| 11 | Source Attribution | 7 | 6 | 8 | **7.0** | 7.0 | **+0.0** | ACCEPTABLE |
| 10 | FMEA Risk Register | 8 | 6 | — | **7.0** | 7.7 | **−0.7** | ACCEPTABLE |
| 3 | Regulatory Compliance | 6 | 7 | 7 | **6.7** | 8.0 | **−1.3** | ACCEPTABLE |
| 6 | Module Decomposition | 4 | 7 | 7 | **6.0** | 6.3 | **−0.3** | ACCEPTABLE |
| 5 | Feasibility Gate | 5 | 6 | 5 | **5.3** | 7.0 | **−1.7** | WEAK |
| 7 | BOM & Cost per Module | 3 | 6 | 6 | **5.0** | 7.0 | **−2.0** | WEAK |
| 12 | AI Audit Log | 3 | 5 | 8 | **5.3** | 8.0 | **−2.7** | WEAK |
| 4 | Sizing & Layout | 2 | 5 | 6 | **4.3** | 6.7 | **−2.4** | CRITICAL |
| 8 | Cost Waterfall | 4 | 5 | 4 | **4.3** | 4.7 | **−0.4** | CRITICAL |
| 9 | Assembly Shortlist | 5 | 4 | 3 | **4.0** | 5.3 | **−1.3** | CRITICAL |

**Overall average: 5.9** (BESS V5: 6.9)

**Sections ≥ 8.0 (target): 1** — S02 Brief  
**Sections < 5.0 (urgent): 3** — S04 Sizing (4.3), S08 Cost Waterfall (4.3), S09 Assembly Shortlist (4.0)

---

## Section-by-Section Analysis

### S01 — Cover Page (7.3) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 7 | No author or responsible engineering team — traceability and accountability gap | Add 'Author' / 'Lead Engineer' field |
| Opus | 7 | Engine version listed as author (ForgeOS PDF Engine v3), no human named | Explicit author/owner name + departmental approval block |
| Qwen | 8 | Product class 'vertical_farm' too generic; no named author | Name author; expand class to 'Modular Indoor Vertical Farm Unit (40-ft Container)' |

**Consensus:** All 3 judges agree the missing human author is the primary weakness. Structure is otherwise clean.

---

### S02 — Executive Summary / Brief (8.3) — GOOD

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 8 | 'Why Now' section generic; no specific UK market data or competitive analysis | Cite UK import volumes, brief competitive landscape |
| Opus | 8 | Yield target (12-15 kg/week) not annualised; no payback period linked to 100 units/yr | Add annualised yield, payback, constraint traceability matrix |
| Qwen | 9 | Yield not linked to 12 m² footprint — hard to verify density feasibility | State target yield/m²/week explicitly |

**Consensus:** Best-performing section. Requirements are well-captured. Gaps are ROI and density validation.

---

### S03 — Regulatory Compliance (6.7) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 6 | BRCGS standard listed in brief but absent from detailed regulatory breakdown — critical for supermarket sales | Add dedicated BRCGS section with HACCP design features, cleanability, pest control |
| Opus | 7 | No compliance matrix mapping each clause to design features or test evidence | Tabular compliance matrix with clause references and verification evidence |
| Qwen | 7 | Standards listed but no evidence of compliance analysis (test plans, IP ratings, material certs) | Add compliance matrix showing how each standard is addressed |

**Consensus:** Standards identification is complete; compliance mapping is absent. BRCGS gap is particularly significant for target customers (supermarket own-label).

---

### S04 — Sizing & Layout (4.3) — CRITICAL

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 2 | Container envelope dimensions are 10m × 10m × 5m — completely wrong for a 40-ft container (correct: ~12.2m × 2.4m × 2.6m). Layout infeasibility conclusion is nonsensical. | Correct envelope to actual 40-ft container, rerun layout for single unit, add 2D placement diagram |
| Opus | 5 | Module footprint (100 m²) exceeds available envelope (85 m²), flagged but not resolved; power budget absent | Resolve spatial conflict, add kW power budget per zone, dimensioned plan view |
| Qwen | 6 | Zones described but no 2D/3D schematic or power budget per zone | Floor plan with power and cooling load annotations |

**Consensus:** The sizing engine has a serious dimensional data error — the container envelope values are an order of magnitude wrong. This cascades into a false infeasibility result. Gemini's text-based analysis caught this; vision judges could not verify dimensions precisely from rendered tables.

---

### S05 — Feasibility Gate (5.3) — WEAK

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 5 | Superficial check — confirms cost within budget but entirely omits energy (≤2.5 kWh/kg), water (≤1.5 L/kg), and yield validation | Add preliminary power draw, yield from lighting plan, resulting energy efficiency calculations |
| Opus | 6 | Energy (kWh/kg) and water (L/kg) calculations not shown numerically; yield feasibility is asserted, not modelled | Quantified energy and water balance table |
| Qwen | 5 | Feasibility gate only confirms cost — ignores energy and water targets critical for operational viability | Include calculated energy and water use per kg from system specs |

**Consensus:** Cost feasibility passes correctly (£11,633 vs £55k). However the CEA-specific targets — energy and water efficiency — are not checked quantitatively. These are the most important operational metrics for the vertical farm product class.

---

### S06 — Module Decomposition (6.0) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 4 | HVAC/dehumidifier missing from Climate Control BOM; appears as £3 item in Structural Frame module instead. Critical omission. | Correct BOM allocation; add appropriately costed dehumidifier (£1,500–3,000) to Climate Control |
| Opus | 7 | HEPA filtration only mentioned in passing; sensors and PLC combined rather than separately itemised | Break out sensors and PLC as discrete sub-modules; add explicit HEPA sub-module |
| Qwen | 7 | CO2 dosing module and PLC/HMI system listed in brief but not decomposed as explicit modules | Add explicit 'CO2 Dosing System' and 'PLC & HMI Control System' modules |

**Consensus:** 7-module decomposition is directionally correct but has BOM hygiene failures — major components (HVAC, CO2) are either missing or misallocated. Gemini's text reading caught the £3 HVAC item in the wrong module.

---

### S07 — BOM & Cost per Module (5.0) — WEAK

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 3 | LED light bars — the dominant cost item — are absent from BOM. HVAC Fan Coil at £3 in Structural Frame is nonsensical. Cost model invalid. | Complete BOM overhaul: add LED bars to Horticultural Lighting module at realistic cost, remove misplaced parts |
| Opus | 6 | 31 rows present but majority flagged '~ESTIMATE' with missing MPNs; LED bars and dehumidifier lack verified unit costs | Obtain distributor quotes/datasheets for ≥80% of lines; populate MPNs |
| Qwen | 6 | BOM for Structural Frame includes 'LED Grow Lights' and 'HVAC Fan Coil' from other modules — BOM hygiene failure | Ensure each module's BOM contains only its own parts |

**Consensus:** 31 BOM lines present but the cost model has structural errors. Missing LED bars (likely the largest single cost driver at 6 tiers × 60 trays) is a P0-class error. Unit cost of £11,633 is not credible without this.

---

### S08 — Cost Waterfall (4.3) — CRITICAL

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 4 | NRE arithmetic error: items summing to £50k+ shown as £6,980 total. Waterfall based on flawed BOM. | Fix arithmetic; recalculate from corrected BOM |
| Opus | 5 | Total cost shown vs ceiling but no graphical waterfall or percentage breakdown by category; NRE amortisation unexplained | Add cost-waterfall chart with labour/materials/overhead/margin; clarify NRE over 100-unit batch |
| Qwen | 4 | No cost waterfall at all — only total unit cost shown without breakdown | Hierarchical breakdown: material/assembly/R&D/overhead as percentages, with margin |

**Consensus:** Consistent with BESS V5 as the weakest section type across both products. Vertical farm adds arithmetic errors (NRE summation) on top of the missing waterfall visualisation.

---

### S09 — Assembly Shortlist (4.0) — CRITICAL

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 5 | Very generic; 'LOW' confidence for nearly every part; no suppliers listed for most 'Buy' components | Research and list 2-3 suppliers per top-5 cost-drivers with country of origin and confidence |
| Opus | 4 | Table present but many cells blank or '—'; no country/tier classification | Populate 2 supplier candidates per critical part with country and tier (OEM/distributor/CM) |
| Qwen | 3 | Section not visible in rendered PDF; no supplier shortlist or sourcing strategy | Full supplier table: 2-3 per module with country, tier, lead time |

**Consensus:** Assembly Shortlist is the weakest section, scoring below BESS V5 (4.0 vs 5.3). Supplier data is sparse across all 3 judges. Qwen could not locate the section visually.

---

### S10 — FMEA Risk Register (7.0 calibrated) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 8 | Detection scores conflated with mitigations — CO2 leak should score Detection=9/10 (hard to detect) *before* sensor mitigations | Re-evaluate Detection scores pre-mitigation; add post-mitigation RPN column |
| Opus | 6 | 10 FMEA rows referenced but actual S/O/D/RPN table not clearly visible in rendered pages | Full FMEA table with all columns visible |
| Qwen | *3 calibrated out* | Parse miss: scored 3 vs mean 7.0 — "Section not visible" — rendering location issue | — |

**Calibration note:** Qwen S10 score 3 removed (−4.0 vs Gemini/Opus mean 7.0). Calibrated mean = (8+6)/2 = 7.0.

---

### S11 — Source Attribution (7.0) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 7 | No human review/validation noted alongside LLM generation credits — critical process control gap | Add 'Validation' column: engineer name/role who reviewed each AI-generated output |
| Opus | 6 | Research Sources table has grades and model names but lacks URLs, revision numbers, access dates | Add hyperlinks/DOI, retrieval dates, version identifiers |
| Qwen | 8 | Present but lacks direct citations to standards or industry reports used for key parameters | Add hyperlinks or reference numbers to source documents |

**Consensus:** Source attribution is functional. Primary gaps are verifiability (no URLs) and human validation records.

---

### S12 — AI Audit Log (5.3) — WEAK

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 3 | Model names noted per task but no token counts, timestamps, or stage timings — not a true audit log | Structured table: Stage, Model, Timestamp, Tokens in/out, Latency, prompt reference |
| Opus | 5 | AI model names (Gemini 3.1 Pro, MiMo V2.5-Pro) noted per task but no token counts, timestamps, or cumulative timings | Structured log table with model, prompt hash, token in/out, latency, timestamp |
| Qwen | 8 | Present but lacks stage timings and token counts | Include LLM model version, tokens per task, time per stage |

**Note:** S12 Qwen score 8 is +4.0 above Gemini/Opus mean (4.0) — this is a positive outlier (not a parse miss — calibration only removes scores that are ≥3 BELOW others). Score retained. The high spread (3 vs 5 vs 8) suggests Qwen saw the log section clearly while Gemini's text extraction may have been partially truncated at 40KB.

---

## Overall Assessments

**Opus:** "The document captures the core brief, modular architecture, and preliminary BOM reasonably well, placing it at a solid conceptual-design stage. However, critical gaps remain: the spatial layout conflict is unresolved, many BOM lines lack verified costs/MPNs, energy/water feasibility is asserted rather than demonstrated, and the FMEA and AI audit logs are incomplete. Addressing these issues — especially the envelope conflict and cost-confidence levels — is essential before proceeding to detailed design release."

**Qwen:** "The design is conceptually sound and meets the cost ceiling, but critical sections for manufacturing readiness (BOM hygiene, supplier list, FMEA, cost waterfall) are either missing or underdeveloped. The spatial layout is infeasible as presented, requiring a redesign to fit the 40-ft container. Without these fixes, the design is not ready for prototyping or production."

**Gemini:** "This document is a comprehensive-looking but deeply flawed early-stage concept. While it correctly identifies key modules, risks, and regulatory requirements, the details are riddled with contradictions (e.g., container dimensions), missing components (e.g., LED bars), and nonsensical costings, making the £11.6k unit cost estimate completely unreliable. It gives a false impression of project viability and requires a complete, human-led engineering overhaul before being considered for manufacturing readiness."

---

## Side-by-Side: Vertical Farm V1 vs BESS V5

| Section | VFarm V1 | BESS V5 | Delta | Direction |
|---------|----------|---------|-------|-----------|
| Brief | **8.3** | 8.3 | 0.0 | = |
| Cover | **7.3** | 7.3 | 0.0 | = |
| Source Attribution | **7.0** | 7.0 | 0.0 | = |
| FMEA | **7.0** | 7.7 | −0.7 | ↓ |
| Regulatory | **6.7** | 8.0 | −1.3 | ↓↓ |
| Modules | **6.0** | 6.3 | −0.3 | ↓ |
| Feasibility Gate | **5.3** | 7.0 | −1.7 | ↓↓ |
| AI Audit Log | **5.3** | 8.0 | −2.7 | ↓↓↓ |
| BOM | **5.0** | 7.0 | −2.0 | ↓↓↓ |
| Sizing | **4.3** | 6.7 | −2.4 | ↓↓↓ |
| Cost Waterfall | **4.3** | 4.7 | −0.4 | ↓ |
| Assembly Shortlist | **4.0** | 5.3 | −1.3 | ↓↓ |
| **OVERALL** | **5.9** | **6.9** | **−1.0** | **↓** |

**VFarm V1 is 1.0 below BESS V5 overall.** Only 1 section reaches ≥8 (vs BESS V5's 3). Three sections fall below 5 (vs BESS V5's 1).

---

## Cross-Product Observations

1. **Brief capture is product-agnostic** (both 8.3) — PA Stage 1/3 brief parsing and research synthesis work equally well across product classes.

2. **Sizing is a product-specific weakness** — BESS had mass/cost ceiling violations; VFarm has wrong container dimensions (10×10×5m vs actual ~12×2.4×2.6m). The sizing engine is not validating against real-world container specs for this product class.

3. **Cost Waterfall is a cross-product weakness** — both products score ~4.3–4.7 on this section. This is an architecture-level gap, not product-specific.

4. **BOM hygiene degrades for CEA** — BESS BOM had zero-price LFP cells (P0 fix in V5); VFarm BOM has wrong module allocation (HVAC in Structural Frame, LED bars missing). Different root causes, same BOM quality gap.

5. **Nightshift corpus density does NOT produce Assembly Shortlist quality uplift** — despite 467 vertical_farm_systems corpus hits (highest of all product classes), S09 Assembly Shortlist scored 4.0 — worse than BESS (5.3). Corpus density alone does not guarantee supplier data quality.

6. **Feasibility gate is domain-naive for CEA** — BESS feasibility checks capacity and cost; VFarm feasibility fails to check energy-per-kg and water-per-kg — the primary CEA performance metrics. The gate needs product-class-aware checks.

---

## Decision Tree

**avg ≥ 7.0 + no section < 5:** Dispatch all 8 remaining baselines  
**avg ≥ 6.0 with 1–2 sections < 5:** Dispatch drone + heat pump only  
**avg < 6.0 OR 3+ sections < 5:** Surface to Tristan

**VFarm V1 result: avg 5.9 (<6.0) AND 3 sections below 5 (S04=4.3, S08=4.3, S09=4.0)**

→ **SURFACE TO TRISTAN.** Do not dispatch remaining baselines automatically.

---

## P0 / P1 Issues Found

| Priority | Issue | Section | Root Cause |
|----------|-------|---------|-----------|
| P0 | Container envelope dimensions wrong (10×10×5m not 12.2×2.4×2.6m) | S04 Sizing | Layout engine not constraining to actual 40-ft ISO container dimensions for VFarm class |
| P0 | LED light bars absent from BOM — primary cost driver missing | S07 BOM | BOM generator not identifying LED bars as a separate line item for Horticultural Lighting module |
| P0 | HVAC Fan Coil allocated to Structural Frame module at £3 — wrong module, wrong cost | S06, S07 | Module allocation logic misrouting HVAC component |
| P1 | Energy/water efficiency (kWh/kg, L/kg) not checked in feasibility gate | S05 | Feasibility gate lacks CEA-specific checks |
| P1 | NRE arithmetic error — items summing to £50k+ shown as £6,980 | S08 | NRE summation bug |
| P1 | BRCGS standard present in brief but missing from regulatory breakdown | S03 | Regulatory extractor not mapping BRCGS |
| P2 | Assembly Shortlist supplier cells mostly blank | S09 | Supplier matching not populating data for CEA components |
| P2 | AI Audit Log lacks token counts and stage timings | S12 | Log format incomplete |

---

## Gemini Vision Failure Note

`google/gemini-2.5-pro-preview` failed all 3 vision attempts with JSON truncation errors (positions 413, 351, 795). Root cause: Gemini 2.5 Pro's extended thinking traces consume most of the 4,096 `max_tokens` budget before JSON output begins. Switching to text-based call (PDF text extraction, 16K `max_tokens`) succeeded on first attempt and produced the most critical findings (dimensional error, missing LED bars, HVAC misallocation). For future councils: call Gemini with `max_tokens ≥ 8192` OR use text-based fallback immediately after 1 vision failure.
