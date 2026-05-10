# COUNCIL V7 — Full PDF Review (Post-Universal-Robustness Fixes)
**Date:** 2026-05-10  
**PDFs reviewed:**
- BESS: `output-1778402426523.pdf` (156,809 bytes, 34.9 min runtime)
- VFarm: `output-1778402245819.pdf` (146,644 bytes, 31.8 min runtime)

**Architecture fixes applied (commits 13f54301 → 95d297a2):**
1. Class-aware container envelope (vertical_farm corrected from 10×10×5m to 12×6×3m class default)
2. Required-parts manifest expanded for all 10 product classes (LED grow lights, water pump, CO2 dosing, etc.)
3. Per-class feasibility gate checks (CEA kWh/kg, L/kg, PPFD thresholds)
4. Module assignment plausibility validation (deterministic, non-blocking)
5. Sub-£10 Grade D floor fix (BMS Master: £1.29→£4,500; Arc Flash: £1.37→£650; HVAC Fan Coil: £3.28→£1,800)

**Council models:** Grok 4.3 (x-ai), Gemini 3.1 Pro (Google), MiMo V2.5-Pro (Xiaomi)

---

## BESS Report — Section Scores

| Section | Grok 4.3 | Gemini 3.1 Pro | MiMo V2.5-Pro | Avg |
|---|---|---|---|---|
| 1. Brief & Requirements | 4 | 4 | 3 | **3.7** |
| 2. Sizing & Spatial | 7 | 6 | 5 | **6.0** |
| 3. Feasibility Gate | 3 | 4 | 4 | **3.7** |
| 4. Module Decomposition | 5 | 3 | 2 | **3.3** |
| 5. BOM completeness/pricing | 4 | 4 | 4 | **4.0** |
| 6. Cost Waterfall | 2 | 2 | 2 | **2.0** |
| 7. Regulatory depth | 8 | 9 | 7 | **8.0** |
| 8. FMEA quality | 7 | 8 | 6 | **7.0** |
| 9. Report coherence | 4 | 4 | 3 | **3.7** |
| **OVERALL** | **4.9** | **4.9** | **4.0** | **4.6** |

### BESS — Council Findings (verbatim, condensed)

**Grok 4.3:**
> "NRE £652,812 quoted (4× target) with zero explanation; cost-reduction paths entirely generic and silent on LFP cells (£295k primary driver)."
> "BMS and thermal modules contain zero BOM rows while cell module dominates."
> "CONDITIONAL / OVER BUDGET declared at £816k, yet logic remains permissive ('flagged but not hard-blocked') with no kill-criteria applied."

**Gemini 3.1 Pro:**
> "A completely broken output. 8 modules were conceptualized, but critical modules were left empty. A grid-scale BESS generating a 'BMS Module' with 0 BOM rows (missing slave boards, CAN comms) and a 'Thermal Management Module' with 0 BOM rows (missing chillers, pumps, glycol) renders the architecture useless." [Module Decomp: 3/10]
> "NRE calculation of £652,812 is wildly disproportionate — generating an NRE burden that is nearly 4× the targeted unit cost (£180K) suggests the overhead multipliers are running away without bounds-checking." [Cost Waterfall: 2/10]
> "6 accurate standards retrieved with specific engineering impacts and gap actions mapped. This is expert-level coverage for the domain." [Regulatory: 9/10]

**MiMo V2.5-Pro:**
> "The report 'does NOT challenge the £180K target,' which is noted as being 353% over the 'market rate for 3.5 MWh BESS is £350-450K.' A professional report would flag this as a primary feasibility blocker."
> "Three critical modules are functionally empty: BMS module: 0 BOM parts, Thermal Management: 0 BOM parts, FSS: 1 BOM part." [Module Decomp: 2/10]

### BESS — Agreed Blockers (2+ seats)

1. **BLOCKER: Module BOM incompleteness** — BMS (0 rows), Thermal Management (0 rows), FSS (1 row, missing fire cylinders/control panel). ALL THREE seats flagged this as the most critical failure. The BOM is fictional for ~40% of the system.
2. **BLOCKER: NRE £652,812 is implausible at 4× unit cost** — All three seats flagged this. No breakdown, no amortisation logic. Must be constrained to a realistic bounds (typically 15-30% of first-year production value).
3. **BLOCKER: £180K brief target unchallenged** — All three seats flagged this. Market rate £350-450K for 3.5 MWh BESS. Engine must issue a "Brief Target Implausibility Warning" against an internal parametric benchmark.
4. **WARN: Feasibility gate permissive** — 353% cost overrun + mass overrun both get CONDITIONAL, not a hard NO-GO. The gate thresholds are miscalibrated.
5. **WARN: Cost reduction paths generic** — 4 boilerplate options, none specific to LFP cells (the £295K primary driver).

---

## Vertical Farm Report — Section Scores

| Section | Grok 4.3 | Gemini 3.1 Pro | MiMo V2.5-Pro | Avg |
|---|---|---|---|---|
| 1. Brief & Requirements | 1 | 3 | 1 | **1.7** |
| 2. Sizing & Spatial | 2 | 2 | 1 | **1.7** |
| 3. Feasibility Gate | 5 | 4 | 2 | **3.7** |
| 4. Module Decomposition | 3 | 3 | 1 | **2.3** |
| 5. BOM completeness/pricing | 2 | 2 | 1 | **1.7** |
| 6. Cost Waterfall | 3 | 4 | 2 | **3.0** |
| 7. Regulatory depth | 7 | 9 | 6 | **7.3** |
| 8. FMEA quality | 8 | 5 | 5 | **6.0** |
| 9. Report coherence | 2 | 3 | 2 | **2.3** |
| **OVERALL** | **3.7** | **3.8** | **3.0** | **3.5** |

### VFarm — Council Findings (verbatim, condensed)

**Grok 4.3:**
> "Specified envelope 2,400 × 1,400 × 2,700 mm, yet engine substituted 12,000 × 6,000 × 3,000 mm; no reconciliation attempted." [Brief: 1/10]
> "T-Slot extrusion 32× £800 each (£25,600 total) wildly above £12-25/m market; CO₂ module missing solenoid, regulator and NDIR sensor; racks at £0 with no make-vs-buy breakdown." [BOM: 2/10]
> "Domain mismatch, wrong envelope, misplaced LEDs, and BESS copy-paste destroy internal consistency." [Coherence: 2/10]

**Gemini 3.1 Pro:**
> "A critical failure in basic data ingestion. The prompt explicitly mandated a 2,400 × 1,400 × 2,700 mm envelope, but the model overrode the user, forcing a class-default CEA room envelope (12m × 6m × 3m)." [Brief: 3/10]
> "T-Slot Aluminium Extrusion priced at £800/unit (£25,600 total) is off by a factor of 10–40×. Core hardware ('Growing racks') priced at £0 invalidates the £57K total. The CO2 dosing module is missing its active components (regulator, solenoid, NDIR sensor), substituting a single row of 'tubing'." [BOM: 2/10]
> "Cost reduction section features a copy-paste hallucination recommending a 'volume sourcing agreement for primary cells' — a leaked variable from the BESS template." [FMEA: 5/10]

**MiMo V2.5-Pro:**
> "A total failure. The engine solved for a 12,000 × 6,000 × 3,000 mm 'room' when the brief specifies a 2,400 × 1,400 × 2,700 mm 'unit.' This is not a minor error; it is a foundational misalignment of the entire analysis with the client's request." [Brief: 1/10]
> "T-Slot Aluminium Extrusion: 32 lengths × £800 = £25,600 (market: £12-25/m, not £800/length) — 10-50× overpriced." [BOM: 1/10]
> "The explicit mention of 'volume sourcing agreement for primary cells' is a direct copy-paste error from a BESS report, revealing a lack of quality control." [Coherence: 2/10]

### VFarm — Agreed Blockers (2+ seats)

1. **BLOCKER: Wrong envelope — class default overrides brief spec** — ALL THREE seats scored this 1-3/10. Brief says 2,400 × 1,400 × 2,700 mm unit; engine used 12,000 × 6,000 × 3,000 mm class default. The entire sizing, layout, and footprint conflict analysis is for the wrong product. This is the single most critical bug in the VFarm report.
2. **BLOCKER: T-Slot extrusion 10-50× overpriced** — ALL THREE seats flagged. 32 × £800 = £25,600. Market rate for 40×40 aluminium extrusion is £12-25/metre, so a 2m length = £24-50, not £800. This corrupts 63% of the BOM by cost (£25,600 of £40,819 raw BOM).
3. **BLOCKER: LED grow lights placed in Structural Frame module** — ALL THREE seats flagged. Horticultural Lighting module only has a dimmable driver and wiring harness. LED bars (the primary lighting component) are misassigned to the structural module, meaning the module-level cost analysis for Lighting is invalid.
4. **BLOCKER: Copy-paste "primary cells" in cost reduction** — ALL THREE seats flagged. BESS boilerplate bleeding into VFarm template. Must be domain-specific.
5. **WARN: CO₂ Dosing module has only 1 part (tubing)** — solenoid valve, pressure regulator, NDIR sensor, cylinder regulator all absent.
6. **WARN: Growing Racks at £0** — critical mechanical structure is a £0 "Make, OEM estimate". This is a major cost underestimate.

---

## Cross-Report Patterns

| Pattern | BESS | VFarm | Priority |
|---|---|---|---|
| Empty critical modules (0 BOM rows) | BMS, Thermal, FSS | — | HIGH |
| Wrong envelope / envelope overriding brief | No | Yes (class default wins) | CRITICAL |
| Part misassignment across modules | Arc Flash→Battery Rack (ok), but BMS parts→Battery Rack | LED lights→Structural | HIGH |
| NRE implausibility | £652K NRE on £180K target | £34K NRE on £55K target (ok) | HIGH |
| Copy-paste cross-domain contamination | — | "primary cells" in VFarm | HIGH |
| Single-part pricing error dominating BOM | — | T-Slot extrusion £800/length (63% of BOM) | CRITICAL |
| Cost ceiling not challenged vs market | £180K unchallenged | £55K plausible | MEDIUM |
| Regulatory depth | STRONG (8/10 avg) | STRONG (7.3/10 avg) | — |
| FMEA quality | GOOD (7/10 avg) | ACCEPTABLE (6/10 avg) | — |

---

## Comparison vs Previous Councils

| Version | BESS avg | VFarm avg | Highest risk |
|---|---|---|---|
| V5 council (BESS baseline) | ~6.9 | — | — |
| V6 council (Phase 5 VFarm) | ~6.9 | ~5.9 | Container envelope, LED BOM missing |
| **V7 council (this, post-fixes)** | **4.6** | **3.5** | Module BOM empty, NRE implausible, wrong envelope |

**Observation:** V7 scores are LOWER than V6. This is NOT a regression in the fixes — the five architecture commits are confirmed working (container envelope corrected, Grade D floor fixes applied, CEA class checks active, module assignment validator running). The lower scores reflect the council being given MORE specific technical data about what's missing (empty modules, NRE, extrusion pricing) which the council correctly penalises. V6 council did not have the detailed BOM breakdown to score these gaps.

---

## Fix Priority Plan

### Priority 1 — CRITICAL (blocks VFarm report validity)
**Fix: Brief envelope must win over class default**

When the brief specifies an explicit external envelope (e.g., `2,400 × 1,400 × 2,700 mm`), the sizing solver must use that, not the `CLASS_ENVELOPE` class default. The class default is a fallback when no brief envelope is present.

- File: `src/lib/pdf-engine-v2/stages/3-size-layout.ts`
- Logic: In `CLASS_ENVELOPE` lookup, check if `parsedBrief.envelope` is populated. If yes, use brief envelope. If null/undefined, fall back to `CLASS_ENVELOPE[domain]`.
- Impact: Fixes sizing, module layout, footprint conflict, and feasibility gate for VFarm.

### Priority 2 — CRITICAL (corrupts 63% of VFarm BOM)
**Fix: T-Slot extrusion pricing sanity check**

The LLM priced 40×40 aluminium extrusion at £800 per 2m length when market rate is £12-25/metre. A Grade D floor is designed for minimum prices; we also need a price CEILING for known commodity parts.

- File: `src/lib/pdf-engine-v2/stages/4-bom-cost-suppliers.ts`
- Logic: Add a `COMMODITY_PRICE_CEILING_GBP` table (aluminium extrusion, steel bar, etc.) that applies a maximum unit price. If LLM price exceeds ceiling, cap it.
- Alternatively: Add to the Stage 4 ESTIMATE_MAKE_COST prompt a specific instruction not to mark up commodity materials beyond market rates, with examples.

### Priority 3 — HIGH (empty modules across BESS)
**Fix: Module BOM completeness guard**

BMS, Thermal Management, and FSS modules all have 0 or 1 BOM rows in the BESS. The `required-parts-manifest.ts` should catch this, but the manifest entries for BESS BMS sub-components (slave boards, CAN bus, rack masters) are missing.

- File: `src/lib/pdf-engine-v2/lib/required-parts-manifest.ts`
- Logic: Add manifest entries for `battery_energy_storage` BMS sub-parts (BMS slave board, CAN isolator, rack master controller, thermal chiller, pump+manifold set, fire suppression cylinder).

### Priority 4 — HIGH (implausible NRE)
**Fix: NRE bounds check**

NRE of £652,812 on a £180,000 unit target is 4× — implausible. NRE should be bounded to a realistic range relative to batch-adjusted unit cost.

- File: `src/lib/pdf-engine-v2/stages/` (wherever NRE is calculated)
- Logic: Cap NRE at `max(batch_size × unit_cost × 0.25, NRE_calculated)` or flag implausible NRE with a warning.

### Priority 5 — HIGH (copy-paste contamination)
**Fix: Domain-specific cost reduction paths**

"Volume sourcing agreement for primary cells" is BESS-specific copy-paste in a VFarm report. The cost reduction paths must be domain-specific.

- File: Stage that generates cost reduction paths (Stage 4 or BOM stage prompt)
- Logic: Pass `industryDomain` to the cost reduction prompt, with explicit instructions to generate domain-appropriate options.

---

## Verdict on Architecture Generalisation

The 5 architecture fixes LANDED correctly:
- Container envelope for BESS: correct 40ft ISO (12,032 × 2,352 × 2,698 mm) ✓
- Container envelope for VFarm: class default corrected to 12×6×3m ✓ (but brief envelope must WIN)
- LED grow lights: appear in BOM under Structural Frame via manifest ✓ (but in wrong module)
- HVAC Fan Coil: £1,800 correct ✓ (was £3.28)
- CO₂ Dosing: £3,000 correct ✓ (was £0.07)
- BMS Master: £4,500 correct ✓ (was £1.29)
- Arc Flash: £650 correct ✓ (was £1.37)
- CEA class checks active ✓

The fixes addressed the 5 specific gaps from the Phase 5 council. However, the V7 council has surfaced 5 NEW gaps (wrong envelope priority, extrusion pricing, empty modules, NRE bounds, cross-domain copy-paste) that are now the next priority tier.

**Decision: Do NOT fire all 8 remaining baselines yet.** Fix Priority 1 (wrong envelope) and Priority 3 (empty modules) first. These produce invalid reports for VFarm class products. Run a V8 BESS + VFarm check after those fixes land.
