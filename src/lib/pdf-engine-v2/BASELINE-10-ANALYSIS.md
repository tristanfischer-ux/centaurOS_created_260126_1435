# Baseline-10 experiment + Corpus-gap analysis

**Date:** 2026-05-07
**Question 1:** How does the engine perform across diverse project types?
**Question 2:** How much does brief quality matter?
**Question 3:** Where does the supplier corpus fall short for non-manufacturing projects?

---

## Experiment design

**10 projects, ranked by cost ceiling:**

| # | Project | Ceiling | Scale | Dominant physics |
|---|---|---|---|---|
| 1 | CGM wearable | £300 | Handheld | Electrochemical + medical |
| 2 | Prosumer drone | £2,000 | Handheld | Mechatronic + electronics |
| 3 | Edge AI server 1U | £5,000 | Rack | Electronics + compute |
| 4 | 30 kW heat pump monobloc | £7,500 | Wall-mount | Refrigerant + thermal |
| 5 | 150 kW DC fast EV charger | £35,000 | Cabinet | Power electronics |
| 6 | 200 L pharma bioreactor | £80,000 | Skid | Biotech + process |
| 7 | Container vertical farm | £55,000 | Container | Horticulture |
| 8 | 2 m AUV, 100 m depth | £250,000 | Vehicle | Maritime + pressure |
| 9 | 3.5 MWh BESS container | £180,000 | 40ft container | Electrochemical + power |
| 10 | 50 m HAPS | £5,000,000 | Aircraft | Aerospace + solar |

**Two rounds of 10:**
- Round 1 — detailed briefs (~25 lines each, full numeric constraints + regulatory + sub-modules expected)
- Round 2 — minimal briefs (~4-6 lines, naïve founder style)

Delta between rounds = engine's brief-quality sensitivity.

---

## Results

### Round 1 (detailed) — 5/10 produced scored PDFs

| # | Project | Status | Compound |
|---|---|---|---|
| 1 | CGM wearable | ✅ scored | 73/100 |
| 2 | Drone | ❌ BRIEF INCOMPLETE | — |
| 3 | Edge AI server | ❌ BRIEF INCOMPLETE | — |
| 4 | Heat pump | ✅ scored | 72/100 |
| 5 | EV charger | ❌ BRIEF INCOMPLETE | — |
| 6 | Pharma bioreactor | ✅ scored | 72/100 |
| 7 | Vertical farm | ✅ scored | 70/100 |
| 8 | AUV | ❌ BRIEF INCOMPLETE | — |
| 9 | BESS | ✅ scored | 69/100 |
| 10 | HAPS | ❌ BRIEF INCOMPLETE | — |

**Scores cluster tightly at 69-73/100** for the 5 that passed the validator.

### Round 2 (minimal) — 0/10 produced scored PDFs

All 10 rejected at `validateBrief` / `getRequiredFields`. Every minimal brief produced a short blocked report with no BOM, cost, or suppliers.

### Delta: the brief validator is a cliff, not a gradient

The engine doesn't degrade gracefully with brief quality. It fails binary. A naïve founder gets nothing useful; a well-prepared founder gets a 69-73/100 report.

This is the single biggest engine-quality dimension not addressed in this session's 50 shipped items.

---

## Finding 1 — the brief validator is over-aggressive

Evidence: **even well-written, 25-line detailed briefs** failed the validator for 5/10 projects in Round 1.

The failures were not random. All 5 rejected projects in R1 are **electronics-dominant or novel-regulatory**:
- Drone (CAA + radio + firmware)
- Edge AI server (pure electronics)
- EV charger (G99 + OCPP + power electronics)
- AUV (DNV/Lloyd's + maritime — not in current `product-classifier.ts`)
- HAPS (EASA SC-HAPS + stratospheric — not in `product-classifier.ts`)

The 5 that passed are all covered by the existing `product-classifier.ts` keywords: medical, heat pump, biotech, vertical farm, battery.

**Diagnosis:** the classifier + required-fields map is hand-curated for 3-5 product classes. When a brief doesn't match those, `validateBrief` returns the section as invalid and the pipeline short-circuits with a naked "BRIEF INCOMPLETE" banner.

**Fix:** BRIEF-Q2 (new) — widen `product-classifier.ts` coverage + relax `getRequiredFields()` to the minimum common field set rather than product-class-specific strict fields. Paired with BRIEF-Q1 (repair step from the quality-handover) this should move Round 2 from 0/10 passing to 7-9/10 passing.

---

## Finding 2 — the supplier corpus is precision-manufacturing-heavy

**Audit of 27,953 companies in nightshift.db:**

| Domain | Count | % of 28k | BOM coverage implication |
|---|---|---|---|
| Precision manufacturing (CNC / sheet / welding / coating) | ~18,000 | 64 % | Strong — BESS fasteners, brackets, enclosures, manifolds match |
| Horticulture / LED grow / hydroponic | 1,760 | 6.3 % | OK — vertical farm BOM covered |
| Aerospace / composite | 1,264 | 4.5 % | OK — HAPS airframe covered, HAPS avionics NOT |
| Battery / cell | 900 | 3.2 % | OK but loose — "battery" keyword matches retail |
| Refrigerant / HVAC / heat pump | 703 | 2.5 % | OK — HP compressors, BPHE, EEVs match |
| Medical device / pharma | 499 | 1.8 % | Weak — CGM biocompatibility parts miss |
| **Electronics / PCB / SMT** | **236** | **0.84 %** | **Very weak — drone, AI server, BESS BMS, HAPS avionics miss** |
| **Power electronics / inverter / PCS** | **210** | **0.75 %** | **Very weak — EV charger, BESS PCS, HAPS power train miss** |
| **Semiconductors / ASIC** | **198** | **0.71 %** | **Very weak — no ASIC foundry broker, no MCU distributor** |

**The critical missing seam**: PCB assembly, power electronics, and semiconductor distribution are 0.7-0.85% of the corpus each. For every BOM row in a drone / AI server / EV charger / BESS BMS / HAPS avionics, the semantic-search hit rate against the corpus is effectively noise. What the engine calls "supplier: TBD" in the PDF is honest — but masks a corpus coverage gap, not a supplier-doesn't-exist reality.

Worse: there's no UK-based electronics-distributor like Farnell / RS Components / Mouser / Digikey in the corpus at all. Those are the actual procurement sources for 90 % of electronics BOM lines, and they're precisely what a founder needs. The corpus captures UK contract manufacturers who assemble to the founder's spec — different problem, different database.

---

## Proposed new tracker items (CORPUS-*)

All local-only, no Supabase / Vercel changes. Ordered by leverage-to-effort.

| ID | Description | Effort | Expected lift |
|---|---|---|---|
| **CORPUS-Q1** | Import electronics distributor catalogues (Farnell, RS Components UK, Mouser UK, Digikey UK) into a sibling `~/.forge-capital/distributor-catalogue.db`. Keyed by manufacturer part number. ~500k SKUs + current UK prices. Legal: these are public-facing product catalogues; non-personal, non-restricted data. | 1-2 sessions | Closes the 236-company PCB gap for drone, AI server, BESS BMS |
| **CORPUS-Q2** | Add an `electronic` / `electrical` / `mechanical` / `biotech` tag to every BOM part at generation time (extending D3 domain-tagging to parts, not just companies). Feed this to Stage 5 so semantic search is gated: electronic parts search the distributor catalogue first, mechanical parts search nightshift.db first. | 0.5 session | Right corpus for right part, no false positives |
| **CORPUS-Q3** | Expand product-classifier.ts to cover: small-UAV, DC-fast-charger, AUV/subsea, HAPS/stratospheric, PCB-assembly, fermentation-equipment, wearable-medical. Each gets 4-8 keyword matches + required-fields set. | 0.5 session | Moves Round 1 failure rate 5/10 → 1-2/10 |
| **CORPUS-Q4** | Expose corpus-coverage diagnostics on the Supplier Shortlist page: "Your BOM has N parts; M matched the local corpus; K require external search; J remained unmatched (supplier: TBD)". Founder sees the confidence level honestly. | 0.25 session | Credibility — no silent gaps |
| **CORPUS-Q5** | Scrape-and-index UK semiconductor brokers (Avnet, Arrow, Mouser stocking lists) as a fourth catalogue layer. Narrower than distributors — for ASICs, MCUs, FPGAs where full distributor catalogues don't stock direct. | 1 session | Closes the 198-company ASIC gap |
| **CORPUS-Q6** | Per-project-class corpus coverage report. Run a synthetic BOM against the corpus for each of the 10 baseline projects; show % matched and which categories are thin. Archived with the scoring dashboard. | 0.5 session | Regression-protects future engine changes |

**Dependencies:** CORPUS-Q2 requires CORPUS-Q1 (different-corpus routing needs multiple corpora to exist). CORPUS-Q5 is only worth it after CORPUS-Q1+Q2 because the infrastructure is shared.

**Delivery order:**
1. CORPUS-Q3 (easy win, unblocks 5/10 Round-1 failures)
2. CORPUS-Q4 (diagnostic overhead — stop pretending coverage is fine)
3. CORPUS-Q1 (import distributors; biggest single lever)
4. CORPUS-Q2 (tag parts; routes queries correctly)
5. CORPUS-Q5 (semiconductor brokers; narrower tail)
6. CORPUS-Q6 (regression harness)

**Total delivery:** ~4 sessions, £10-20 OpenRouter budget.

---

## Paired with the quality-to-8/10 plan

These CORPUS-Q items stack with the quality-to-8/10 plan (`HANDOVER-quality-8-out-of-10.md`). Together:

- BRIEF-Q1 + BRIEF-Q2 (new) lift Round 2 from 0/10 passing to 8-9/10 passing
- CORPUS-Q1+Q2+Q3 lift BOM scores from 4/10 to 7-8/10 on electronics-dominant projects (drone, AI, charger, HAPS, BESS BMS)
- CORPUS-Q4 ensures the gain is HONEST (you see where it's still thin)
- COST-Q1+Q2 close the remaining Cost gap

Combined expected outcome: Round 2 (minimal briefs) lands at compound 65-70/100 consistently; Round 1 (detailed briefs) at compound 80-85/100 consistently. **All 10 project types run-to-completion.**

---

## Files generated

- PDFs: `~/Downloads/engine-evidence/baseline-experiment/r1-detailed/**/report.pdf` (5 scored, 5 short-report)
- PDFs: `~/Downloads/engine-evidence/baseline-experiment/r2-minimal/**/report.pdf` (all 10 short-report)
- Scoring history: all 20 runs appended to `~/Downloads/engine-evidence/scoring-history.jsonl`
- Dashboard: regenerated at `~/Downloads/engine-evidence/scoring-dashboard.html`

---

## Session cost accounting

- Detailed rounds: 10 runs × ~£1 = £10
- Minimal rounds: 10 runs, but most short-circuited at validateBrief = ~£3 total
- Council review for v4 plan earlier: ~£0.35
- **Total this session: ~£13 OpenRouter**
