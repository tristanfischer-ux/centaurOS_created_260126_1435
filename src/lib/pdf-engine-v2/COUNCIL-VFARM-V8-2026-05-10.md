# Multimodal Council — Vertical Farm V8 (Post-Brief-Envelope + Bulk-Bin Fixes)

**Date:** 2026-05-10  
**PDF:** `output-1778408103985.pdf` — Modular Indoor Vertical Farm Unit, 2.4m × 1.4m × 2.7m compact unit, leafy greens, £55,000 unit cost ceiling  
**PDF size:** 157,696 bytes (154 KB), 44 pages  
**Commits since V7:**
- `ab100327` — brief envelope precedence: vfarm sizing now reads 2.4×1.4×2.7m from brief, not 12×6×3m class default
- `a41706e7` — bulk-bin distributor pricing detection + sanity ceilings
- `5cdd3237` — council-scorer: removed z-ai/glm-5.1 from in-pipeline judges

**Previous baseline:** VFarm V7 avg **3.5** (post-robustness fixes but pre-envelope-precedence fix), VFarm V1 avg **5.9** (Phase 5 cross-product validation)

---

## Council Seats

| Seat | Model | Provider | Method | Cost |
|------|-------|----------|--------|------|
| A | `google/gemini-2.5-pro-preview` | OpenRouter / Google | Vision (44 pages, 150 DPI) | $0.0574 |
| B | `anthropic/claude-opus-4-5` | OpenRouter / Anthropic | Vision (44 pages, 150 DPI) | $0.3714 |
| C | `qwen/qwen3-vl-235b-a22b-instruct` | OpenRouter / Alibaba | Vision (44 pages, 150 DPI) | $0.0064 |

**Total council cost: $0.4352 USD (£0.34 GBP)**

---

## Parse-Miss Calibration

All 12 sections: Qwen delta vs Gemini+Opus mean was within ±1.5 on every section. No parse misses detected. All three judges returned clean JSON on first attempt.

---

## 12-Row Score Matrix — VFarm V1 / V7 / V8 Comparison

| # | Section | Phase 5 (V1) | V7 | Gemini | Opus | Qwen | **V8** | V7→V8 Delta | Verdict |
|---|---------|--------------|-----|--------|------|------|--------|-------------|---------|
| S02 | Executive Summary / Brief | 8.3 | 1.7 | 8 | 7 | 8 | **7.7** | +6.0 | GOOD |
| S01 | Cover Page | 7.3 | — | 7 | 7 | 7 | **7.0** | — | ACCEPTABLE |
| S10 | FMEA Risk Register | 7.0 | 6.0 | 7 | 7 | 7 | **7.0** | +1.0 | ACCEPTABLE |
| S11 | Source Attribution | 7.0 | — | 7 | 6 | 7 | **6.7** | — | ACCEPTABLE |
| S03 | Regulatory Compliance | 6.7 | 7.3 | 6 | 7 | 6 | **6.3** | −1.0 | ACCEPTABLE |
| S06 | Module Decomposition | 6.0 | 2.3 | 6 | 6 | 6 | **6.0** | +3.7 | ACCEPTABLE |
| S12 | AI Audit Log | 5.3 | — | 5 | 7 | 5 | **5.7** | — | WEAK |
| S05 | Feasibility Gate | 5.3 | 3.7 | 5 | 6 | 5 | **5.3** | +1.6 | WEAK |
| S04 | Sizing & Layout | 4.3 | 1.7 | 5 | 5 | 5 | **5.0** | +3.3 | WEAK |
| S08 | Cost Waterfall | 4.3 | 3.0 | 4 | 6 | 4 | **4.7** | +1.7 | CRITICAL |
| S09 | Assembly Shortlist | 4.0 | 2.3 | 4 | 5 | 4 | **4.3** | +2.0 | CRITICAL |
| S07 | BOM & Cost per Module | 5.0 | 1.7 | 3 | 4 | 5 | **4.0** | +2.3 | CRITICAL |

**V8 overall average: 5.81**  
**Sections ≥ 8.0: 0** (V1 had 1, V7 had 0)  
**Sections ≥ 7.0: 3** — S02 Brief (7.7), S01 Cover (7.0), S10 FMEA (7.0)  
**Sections < 5.0: 3** — S08 Cost Waterfall (4.7), S09 Assembly Shortlist (4.3), S07 BOM (4.0)

> Note: V7 used a different 9-section rubric (Brief/Requirements, Sizing, Feasibility, Modules, BOM, Cost Waterfall, Regulatory, FMEA, Coherence). V8 uses the V1 12-section rubric. Direct V7→V8 deltas are given where the section mapping is clear. Cells marked "—" indicate no V7 equivalent.

---

## Section-by-Section Analysis

### S01 — Cover Page (7.0) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 7 | FEASIBLE decision and cost summary on cover lack context such as batch size or key parameters | Replace economics table with top-level specs: envelope, yield/week, modules |
| Opus | 7 | Missing revision history, document control number, and approval signatures | Add document control block with revision table and approval matrix |
| Qwen | 7 | Lacks visual of unit or key metrics; title is generic | Add unit dimensions, target yield, and cost ceiling to header |

**Consensus:** All three judges agree at 7/10. Cover is functional. Missing document control / context-setting is the uniform gap. No regression, small improvement from V1 (7.3→7.0 within noise).

---

### S02 — Executive Summary / Brief (7.7) — GOOD

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 8 | Claimed 12 m² growing footprint is optimistic for a 3.36 m² envelope — not validated against 3D model | Validate growing area claim against spatial model or add clarifying note |
| Opus | 7 | Brief capture thorough but no explicit yield validation: 60 trays × 6 tiers yield calculations absent | Add calculated yield projection showing how configuration achieves stated weekly yield |
| Qwen | 8 | Mission statement lacks quantifiable KPIs for success | Add metrics: yield/kg, energy use, ROI timeline |

**Consensus:** Significant recovery vs V7 (1.7→7.7, +6.0). Brief envelope precedence fix clearly working — the brief is now being read correctly. Primary remaining gap is validation: the 12 m² growing area claim needs a spatial cross-check.

**V7→V8 delta: +6.0** — the single biggest lift in the entire document.

---

### S03 — Regulatory Compliance (6.3) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 6 | NRE cost estimates vague and duplicated — 'Safety testing' listed twice | Consolidate NRE costs and map each to a specific regulatory standard |
| Opus | 7 | Standards identified but all show 'not_started' status with no jurisdiction specified | Add BRCGS Global Standard for Agriculture; populate jurisdiction fields for UK |
| Qwen | 6 | Lists standards but no compliance evidence or test plan | Add test protocols and certification milestones per standard |

**Consensus:** Slight dip from V1 (6.7→6.3). Standards are identified; compliance mapping and jurisdiction specificity remain absent. NRE duplication is a new issue introduced in V8.

---

### S04 — Sizing & Layout (5.0) — WEAK

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 5 | Layout conflict flagged (3.4 m² modules vs 3.36 m² envelope) but the feasibility gate simultaneously shows PASS — inconsistency | Resolve layout conflict; gate logic must FAIL when a spatial conflict is detected |
| Opus | 5 | Envelope correctly stated as 2.4×1.4×2.7m but module footprint (3.4 m²) still exceeds envelope (3.36 m²) | Resize zone allocations to fit within 3.36 m² usable floor area |
| Qwen | 5 | Layout infeasible; module footprint exceeds envelope budget | Re-optimise module layout to fit 2.9 m² budget |

**Consensus:** V7→V8 delta: +3.3. The envelope precedence fix (bug `ab100327`) has clearly landed — all three judges confirmed the brief dimension 2.4×1.4×2.7m IS now being used, up from the catastrophic 12×6×3m class-default in V7. However, the layout solver is still generating a 3.4 m² total module footprint against a 3.36 m² available floor, leaving a small but unresolved spatial conflict. Score lifted from 1.7 to 5.0 — substantial progress but not yet clean.

**Critical note:** The brief-envelope fix worked. Sizing is no longer a write-off. But the layout solver needs a final constraint-tightening pass to close the 0.04 m² overage.

---

### S05 — Feasibility Gate (5.3) — WEAK

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 5 | Spatial envelope check shows PASS despite layout conflict — gate logic contradicts layout findings | Correct gate to FAIL on spatial conflict; only PASS when all module zones fit |
| Opus | 6 | Energy (2.5 kWh/kg) and water (1.5 L/kg) targets stated but not validated numerically | Add power budget summing LED, HVAC, pump loads divided by weekly yield |
| Qwen | 5 | Gate only checks cost; energy and water targets from brief not checked | Add checks for 2.5 kWh/kg and 1.5 L/kg against brief |

**Consensus:** V7→V8 delta: +1.6. CEA-specific gate logic is now present (energy/water targets present in the brief reading) but the validation calculations are absent. Gate shows PASS despite the unresolved layout conflict — this is a gate logic inconsistency.

---

### S06 — Module Decomposition (6.0) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 6 | CO2 Dosing module BOM has 0 rows — solenoid, regulator, NDIR sensor all missing | Populate CO2 module with solenoid valve, regulator, flow meter, NDIR sensor |
| Opus | 6 | CO2 Dosing module shows 0 BOM rows despite detailed technical spec in that section | Add solenoid, regulator, flow meter, NDIR sensor with Grade D estimates |
| Qwen | 6 | Only 7 modules; missing critical sub-modules like sensors or HMI | Decompose PLC/HMI, sensor stack, and safety interlocks as separate modules |

**Consensus:** V7→V8 delta: +3.7. All three judges agree the 7-module structure is now coherent, which is a clear improvement from V7's copy-paste BESS contamination. CO2 Dosing module remaining at 0 BOM rows is the uniform gap.

---

### S07 — BOM & Cost per Module (4.0) — CRITICAL

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 3 | BOM allocation critically flawed — Structural Frame module contains LED Grow Lights and other misassigned parts | Correctly allocate all BOM parts to parent modules; structural frame contains structure only |
| Opus | 4 | LED Grow Lights at £800 but no LED bars specified; Aluminium Extrusion at £800/unit (market: £12–25/m) | Add LED bar line items with wattage/tier; add extrusion breakdown at actual per-metre cost |
| Qwen | 5 | No BOM for CO2 system; T-slot cost not validated against £12–25/m market rate | Validate T-slot pricing and add CO2 system BOM with part numbers |

**Consensus:** V7→V8 delta: +2.3. The bulk-bin pricing sanity ceiling fix (`a41706e7`) partially landed — Qwen scores 5 vs V7's 1.7 mean — but Gemini and Opus (3 and 4 respectively) still flag LED/extrusion misallocation. The T-slot extrusion remains mispriced (£800/unit vs £12–25/m market) according to Opus, and LED bars are still absent or misallocated. The fix improved detection of bulk-bin pricing errors but has not fully corrected them in output.

**Important:** Gemini (3/10) flags LED Grow Lights appearing in the Structural Frame module — the same BOM allocation bug that appeared in V1 and V7. This specific misallocation was NOT fixed by the V8 commits.

---

### S08 — Cost Waterfall (4.7) — CRITICAL

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 4 | Cost waterfall misleading: structural frame shown as dominant cost driver due to BOM misallocation | Re-run after correcting module BOM allocations to show true cost distribution |
| Opus | 6 | NRE table has duplicate 'Safety testing' entries totalling £80,000 — appears to double-count | Deduplicate NRE line items and map each to a specific standard |
| Qwen | 4 | Lacks component-level breakdown; £34k headroom unexplained | Show cost allocation per module and justify headroom with supplier quotes |

**Consensus:** V7→V8 delta: +1.7. Meaningful but not structural recovery. Gemini and Qwen (both 4/10) note that the waterfall is distorted because BOM misallocation causes the structural frame to dominate cost. Opus (6/10) is more generous, noting the NRE duplication as primary issue. The section is still CRITICAL.

---

### S09 — Assembly Shortlist (4.3) — CRITICAL

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 4 | Mostly empty placeholders; key custom parts like Growing Racks have no supplier, no quote, no confidence upgrade | Research and list 2–3 suppliers per top-5 cost drivers with country and confidence |
| Opus | 5 | All supplier confidence ratings 'LOW'; no verified quotes; no country/tier classification | Obtain at least 2 verified quotes per critical component; upgrade confidence ratings |
| Qwen | 4 | No supplier names, lead times, or minimum order quantities; only API sources listed | List actual suppliers, part numbers, and lead times for critical components |

**Consensus:** V7→V8 delta: +2.0. Small improvement from V7's 2.3. Supplier data remains sparse. Assembly Shortlist is a persistent structural weakness across all VFarm versions. Not addressed by either V8 commit.

---

### S10 — FMEA Risk Register (7.0) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 7 | Occurrence and Detection scores not justified; appear arbitrary without explicit references | Add brief justification for each Occurrence/Detection rating referencing design controls |
| Opus | 7 | FMEA well-structured with 10 risks but all show 'Existing Controls: Pending' — no controls populated | Document current design controls for each risk before calculating residual RPN |
| Qwen | 7 | FMEA has 10 rows but no severity, occurrence, or RPN scores visible | Populate S/O/D/RPN columns with values and mitigation actions |

**Consensus:** Perfect inter-judge agreement at 7/10. FMEA is the most stable section in the document. V7→V8 delta: +1.0. Primary gap is controls not yet populated.

---

### S11 — Source Attribution (6.7) — ACCEPTABLE

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 7 | Heavy reliance on 'Grade D' (LLM/expert estimate) sources with no Grade B/C citations | Incorporate at least one Grade C (published data) or Grade B (analytical model) source per module |
| Opus | 6 | Most sources graded D with verification status 'not verified' — no human sign-off trail | Escalate Grade B/C sources via distributor quotes and published datasheets |
| Qwen | 7 | Sources are LLM-generated; no primary test data or vendor specifications | Replace LLM sources with vendor datasheets and test reports |

**Consensus:** 6.7 average. Slightly below V1 (7.0) but within noise. Grade D domination is the consistent gap.

---

### S12 — AI Audit Log (5.7) — WEAK

| Judge | Score | Weakness | Lift to 10 |
|-------|-------|----------|-----------|
| Gemini | 5 | 'size_layout' step logged at 0.0s — not credible for a spatial solver; likely a timing instrumentation bug | Fix pipeline instrumentation to record actual computation time per stage |
| Opus | 7 | Audit log shows pipeline steps but lacks model version, temperature, seed values, and prompt SHA-256 | Add model version, temperature, seed values, and hash of prompts for full reproducibility |
| Qwen | 5 | Audit log missing; no version history or change rationale visible | Add version control log with change descriptions and reviewer sign-offs |

**Consensus:** Slight improvement from V1 (5.3→5.7). Gemini flags a timing instrumentation bug (0.0s for size_layout). Opus/Qwen diverge somewhat — Opus can read the log more completely (7/10) vs Qwen finding it absent (5/10). The 0.0s duration for size_layout is a real pipeline instrumentation bug worth fixing.

---

## Overall Assessments

**Gemini 2.5 Pro:** "The AI fixed the critical V7 envelope bug but introduced severe BOM allocation errors and a layout conflict that shows PASS in the feasibility gate but FAIL in the layout section. The document is not self-consistent."

**Claude Opus 4.5:** "Significant improvement over V7 — envelope correctly captured at 2.4×1.4×2.7m and pricing more reasonable, but unresolved spatial allocation conflict where module footprint (3.4m²) still exceeds envelope. BOM quality gaps remain. Directional progress but not yet ship-ready."

**Qwen VL 235B:** "The specification is structurally sound but lacks critical technical validation and detailed component sourcing. Main blocker is the layout conflict."

---

## Three-Version Comparison Matrix

| Section | Phase 5 (V1) | V7 | **V8** | V7→V8 | V1→V8 | Direction |
|---------|--------------|-----|--------|-------|-------|-----------|
| S02 Brief | 8.3 | 1.7 | **7.7** | **+6.0** | −0.6 | ↑↑↑ |
| S01 Cover | 7.3 | — | **7.0** | — | −0.3 | → |
| S10 FMEA | 7.0 | 6.0 | **7.0** | +1.0 | +0.0 | → |
| S11 Source Attribution | 7.0 | — | **6.7** | — | −0.3 | → |
| S03 Regulatory | 6.7 | 7.3 | **6.3** | −1.0 | −0.4 | ↓ |
| S06 Modules | 6.0 | 2.3 | **6.0** | **+3.7** | +0.0 | ↑↑ |
| S05 Feasibility Gate | 5.3 | 3.7 | **5.3** | +1.6 | +0.0 | ↑ |
| S12 AI Audit Log | 5.3 | — | **5.7** | — | +0.4 | ↑ |
| S04 Sizing & Layout | 4.3 | 1.7 | **5.0** | **+3.3** | +0.7 | ↑↑ |
| S08 Cost Waterfall | 4.3 | 3.0 | **4.7** | +1.7 | +0.4 | ↑ |
| S09 Assembly Shortlist | 4.0 | 2.3 | **4.3** | +2.0 | +0.3 | ↑ |
| S07 BOM & Cost | 5.0 | 1.7 | **4.0** | +2.3 | −1.0 | ↑(vs V7) ↓(vs V1) |
| **OVERALL** | **5.9** | **3.5** | **5.81** | **+2.3** | −0.1 | ↑↑ |

**Summary:** V8 recovers from the V7 regression (3.5→5.81, +2.3 points) and is essentially back at the V1 Phase 5 baseline (5.9). The brief-envelope fix is the dominant contributor (+6.0 on S02, +3.3 on S04, +3.7 on S06). The BOM section is still slightly below V1 (4.0 vs 5.0) despite the V8 BOM fix — module allocation bugs persist.

---

## P0 / P1 Issues Found (V8)

| Priority | Issue | Section | Root Cause |
|----------|-------|---------|-----------|
| P0 | Layout conflict unresolved: 3.4 m² module footprint vs 3.36 m² envelope — gate shows PASS despite conflict | S04, S05 | Layout solver generates 0.04 m² overage; gate logic not reading layout outcome |
| P0 | LED Grow Lights still in Structural Frame module — BOM allocation bug persists | S07 | Module assignment validator not catching LED bar misrouting to structural module |
| P1 | T-slot extrusion still priced at £800/unit (Opus confirms) — sanity ceiling fix not fully effective | S07 | Commodity ceiling not applying to this specific part ID or the prompt is not respected |
| P1 | CO2 Dosing module has 0 BOM rows — solenoid, regulator, NDIR sensor absent | S06, S07 | Required-parts manifest for CO2 module not triggering part population |
| P1 | Feasibility gate spatial check shows PASS when layout shows CONFLICT | S05 | Gate reads its own stored flag, not the live layout result |
| P2 | 'Safety testing' NRE line item duplicated (double-counting in NRE totals) | S08 | NRE deduplication logic not active |
| P2 | size_layout pipeline step logged at 0.0s — instrumentation bug | S12 | Timing wrapper not covering the spatial solver call |
| P2 | Assembly Shortlist supplier data still mostly empty | S09 | Supplier matcher not populating CEA-specific components |

---

## Decision Verdict

**FOCUSED REWORK** — V8 is back at V1 baseline (5.81 vs 5.9) after the V7 regression, which confirms the brief-envelope and bulk-bin fixes were the correct priority. However:
- Zero sections ≥ 8/10 (target: all ≥ 8/10 for SHIP-READY)
- Three sections still below 5/10 (S08, S09, S07)
- One structural inconsistency (layout FAIL + gate PASS)
- BOM module allocation is still broken (LED bars in structural frame)

The document is coherent and directionally correct. It is not ready for production use without fixing the layout/gate inconsistency and BOM allocation.

---

## Top 3 Next-Most-Important Fixes (Ranked)

1. **Layout constraint tightening** — Close the 0.04 m² overage in zone allocations so the solver produces a layout that fits, and fix the gate to read the actual layout result (not a stored flag). This resolves S04 and S05 simultaneously. Estimated lift: S04 5.0→7.0+, S05 5.3→7.0+.

2. **BOM module allocation** — LED bars must route to Horticultural Lighting module, not Structural Frame. This one misallocation distorts S06 (Module Decomposition), S07 (BOM), and S08 (Cost Waterfall) all at once. Estimated lift: S07 4.0→6.0+.

3. **CO2 Dosing module parts** — Required-parts manifest must fire for CO2 module (solenoid valve, pressure regulator, NDIR sensor, flow meter). Currently shows 0 BOM rows. Estimated lift: S06 6.0→7.5+, S07 4.0→5.0+.

---

## Council Cost

| Model | Input tokens | Output tokens | Cost USD |
|-------|-------------|---------------|----------|
| google/gemini-2.5-pro-preview | 12,228 | 4,209 (incl. 3,017 reasoning) | $0.0574 |
| anthropic/claude-opus-4-5 | 69,270 | 1,001 | $0.3714 |
| qwen/qwen3-vl-235b-a22b-instruct | 18,024 | 685 | $0.0064 |
| **Total** | | | **$0.4352 / £0.34** |

---

## Notes

1. **All three vision calls succeeded on first attempt** — no fallbacks to text-based extraction needed. This is the first VFarm council with zero vision failures.

2. **Zero Qwen parse misses** — all 12 sections within ±1.5 delta of Gemini+Opus mean. Unusually tight inter-judge agreement (7.0 consensus on S01, S10; ≤1 spread on all sections except S08 where Opus diverges at 6 vs 4 for Gemini/Qwen).

3. **S08 inter-judge spread** — Opus scored Cost Waterfall 6/10 vs Gemini/Qwen 4/10. Opus appears to weight the "cost within ceiling" more heavily; Gemini/Qwen penalise the lack of a waterfall chart and module-level breakdown. The calibrated average (4.7) reflects this spread.

4. **The surprising finding** — The brief-envelope fix landed and lifted S02 Brief from 1.7 to 7.7 (+6.0), which is the biggest single-section recovery in any VFarm council. But it also revealed a second-order problem: the layout solver now correctly parses the compact 2.4×1.4×2.7m envelope but still generates 3.4 m² of modules for it (a 1% overage), suggesting the zone-allocation sub-solver did not receive the corrected dimensions. The fix solved the top-level parsing but not the downstream constraint propagation.
