# BESS iter-6 Council — 4 of 4 usable

**Brief ID:** 4927444a-5916-4c70-90bd-64bd19fd6fad
**Product class:** BESS (500 kWh / 250 kW, 20ft ISO container)
**Chain time:** 28.8 min (04:17 → 04:46 UTC 2026-05-20)
**PDF size:** 381 KB
**Project class auto-detected by chain:** bess (confirmed via worker log)

## Model panel + cost

| Model | Findings | Cost | Notes |
|---|---|---|---|
| Grok 4.3 | 7 | $0.056 | Content-first as always |
| Opus 4.7 | 8 | $0.834 | One arithmetic error (£496 "29% below" £350 — actually 41% over) |
| Gemini 3.5 Flash | 16K → 14K content | $0.177 | Worked at 16K confirming the iter-1 gotcha; rich findings |
| GPT-5.5 (retry) | 24 | $0.217 | Highest yield — caught 20ft↔40ft container mismatch + cost stack unit bug |
| **Total** | **~30 unique** | **$1.28** | |

## Highest-conviction HIGH findings (cross-validated)

### Capacity arithmetic gate failure
- 512 cells × 280 Ah × 3.2 V = 458.75 kWh ≠ 500 kWh nameplate (off 8.25%)
- Phase 2 `cells_ah_voltage_capacity` gate threshold loose OR fields missing
- Section 0 (operational headline) says "1,376 cells"; Module 4 says "512 cells"; BoM says ×512 (3-way contradiction)

### Container envelope mismatch (chain-internal contradiction)
- Section 1: "20-foot ISO container"
- Section 2 Module 1: "Deployment envelope 40-ft ISO Hi-Cube Container (1AAA)"
- Brief was 20ft — chain emitted 40ft AND 20ft simultaneously

### Cost stack unit bug (renderer)
- Cover: "£1.2 per kWh installed — 99% below typical"
- Actual: £595,485 / 500 kWh = £1,191/kWh (NOT £1.2/kWh)
- "Cell Voltage Sense Wire £134,896.64" — single line mis-priced by 1000× via Engine B

### Electrical sizing wrong
- 30A 500V cell fuses on 819V/300A bus (would blow instantly)
- LEV200A4ANA 200A contactor on 300A bus
- FF600R12ME4 is a half-bridge module — NOT a 3-phase 250 kW inverter
- "4700 µF 1200 V film capacitor" — physically impossible (real B32778 1.5 µF)

### Hydraulic inconsistency
- 32 plates × 0.3 L/min = 9.6 L/min — pump rated 40 L/min (4× mismatch)
- 19mm hose with 1/4 in NPT fittings (1.6× smaller orifice)
- Coolant ΔT per plate ~20K (too high for cell uniformity)

### Physics critic gated incorrectly (M-stage promotion)
- Physics critic reported 2/10 plausibility + 8 HIGH issues
- Chain still emitted as "acceptable_with_decisions"
- Manual-review badge displayed but NOT blocking

### G5 fake-part rate
- 88 fabricated SKUs in BoM despite "stripped" Appendix A
- Counts contradict between cover (96), Section 6 (88), Appendix A (88+8)

### Compliance: shallow citation, not demonstration
- "G99 compliant" labelled on IGBT (G99 applies to interface protection only)
- "NFPA 855" cited (US code, not UK mandatory)
- "UL 9540A" claimed but Novec 1230 doesn't arrest cell thermal runaway
- BS EN 62619 marked Mandatory but G1b WARN "IEC 62619 missing"

### Thermal management ambiguity (reviewer disagreement — needs eyeball)
- Opus: 32 cold plates × 400W = 12.8 kW (matches 12 kW need) — components present
- Grok: physics critic flagged "no thermal management module or components" — false negative
- Resolution: components ARE in BoM, physics critic regex pattern fails to detect them

### PDF artefact thin
- 381 KB vs heat pump 7+ MB — no schematics, no P&ID, no single-line diagrams
- Renderer not producing engineering-dossier output for BESS class

## What the chain DID right

- R454B refrigerant (correct A2L low-GWP choice for BESS class)
- BS EN 62619 + UN 38.3 + IEC 62933 cited (right standard universe)
- Container, BMS, EMS, PCS modules all decomposed correctly
- Engine B classified cells correctly (didn't misclassify as oem_subsystem)
