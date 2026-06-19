# dossier.xlsx — 50 improvements + phased plan (2026-06-19)

Source: full-tab inspection of `out/ras-v26-verify/dossier.xlsx` (26 tabs) + `scripts/build-excel-export.py` + `state.json`. Legend — Effort S/M/L · Impact H/M/L · Type EXP (pure-exporter) / ENG (engine change). ⭐ = customer-facing Monday.

## Key findings that ground the list
- Live machinery works: ⚠Checks has real `=IF(ABS(Δ)<TOL…)` over a hidden data block; Calculations has 67 live chained formulas + a shared-constants block; freeze panes on the 6 data tabs.
- **Grundfos case is worse than thought + fully data-recoverable:** P-102 "Grundfos UP15-42" = IDENTIFIED, £67,900/unit ×8, but `partVerifications` carries `price_estimate_gbp=£1,951`, `distributor_price_gbp=0`, `cost_provenance=parametric`, `confidence=high` on the *identity* — a real ~50 W circulator MPN priced as a 97 kW pump. Duty-vs-class gap AND price split are both already in the data → catchable deterministically.
- Quantity provenance EXISTS but is dropped: 26/113 quantities carry `provenance.{tool_id,tool_source_url,invocation_output_field}`+`uncertainty_pct`; exporter shows only `source`. (The "0/370" gap is BoM-specific.)
- Schedules are already structured tables (`panel-schedule.md`, `process-schedules.md`, `connection-schedule.json` 104 rows with `within_spec` — 33 out-of-spec, 34 upsized; `parts-manifest.json` 106; `interconnect-census.json` 153).
- All number formats `General` (no £, no separators, no units row); no print areas / named ranges / autofilter / hyperlinks / data-validation / tab colours.
- Real exporter bug: Calculations `q_wall` (B45) and `q_roof` (B47) both ref `$B$30` because both = 4920 W — value-equality chaining grabs the wrong source cell.
- Cross-surface inconsistencies a customer will spot: BoM Σ £8.18M vs Cost rollup purchased £1.53M vs costStack raw £8.18M; 168/370 BoM rows show £0 (sub-components → look "free"); only 16/270 part-verifications high-confidence.

## THE 50

### A · Provenance & Trust (10)
1. Quantities — surface the existing `provenance` (Tool ID, source URL, output field, uncertainty %, condition) for the 26 tool-derived quantities. S/H/EXP
2. ⭐ BoM, Cost — confidence-tier colour column (green/amber/red) from `partVerifications.confidence` + `costBasis.defensible`. S/H/EXP
3. ⭐ BoM — part-identity-vs-duty check (flag duty ≫ part class, OR distributor_price=0 + parametric while IDENTIFIED) — catches Grundfos. M/H/EXP
4. ⭐ BoM — "Verified by" column (catalogue/live-distributor/parametric/LLM) from `source_method`+`cost_provenance`. S/H/EXP
5. BoM — source-URL hyperlink column (13 rows incl. the Grundfos page). S/M/EXP
6. Cost — estimate-class 1–5 legend + colour. S/M/EXP
7. ⭐ Quantities/Calc — "Origin" hyperlink: quantity → its producing calc block. M/H/EXP
8. new "Assumptions" — consolidate every `assumptions[]` + constants with the owning calc. M/H/EXP
9. BoM/Cost — machine-parsed structured `basis` (method, rate, band, grounded-flag). L/H/ENG
10. BoM — per-row `tool_id` provenance (the genuine 0/370 gap). L/M/ENG

### B · Verification — extend ⚠Checks (9)
11. ⭐ rating ≥ duty per principal (pump kW ≥ shaft·margin; cable ≥ sized; chiller ≥ load). M/H/EXP
12. ⭐ Σ sub-components == principal (the 168 £0 rows should foot to the parent £). M/H/EXP
13. ⭐ price-within-distributor-band (>5× from distributor/estimate) — the £67,900-vs-£1,951 gap, live. M/H/EXP
14. ⭐ cross-surface cost reconciliation row (BoM £8.18M vs costStack vs Cost-rollup £1.53M). S/H/EXP
15. ⭐ connectivity / out-of-spec roll-up (33/104 lines out-of-spec, e.g. DN300 @ 7.6 m/s). M/H/EXP
16. mass/energy/flow balance-closure rows (live equality where parseable). S/M/EXP
17. electrical load-balance (panel 2,865 kW vs Σ circuits vs contract 1,719). M/M/EXP
18. "every qty traces to a calc/brief" coverage row (26 with source=None). S/M/EXP
19. fix the value-equality chaining bug — chain by symbol+label, not numeric value. M/M/EXP

### C · Schedules-as-Tables (6)
20. ⭐ Panel schedule → real tab (Ckt/Desc/Ways/kW/A/Device/Cable/%Vdrop + Σ check). M/H/EXP
21. ⭐ Process schedules → Line list / Valve list / Instrument index tabs. M/H/EXP
22. ⭐ Line & velocity tab from `connection-schedule.json` (104 rows, `within_spec` red). M/H/EXP
23. SLD/P&ID/BFD companion feeder/line/block tables beside each picture. M/M/EXP
24. Cable/pipe take-off tab from `connection-schedule.totals`. S/M/EXP
25. Parts-manifest tab (106 rows; qty-N coverage). S/M/EXP

### D · Navigation & UX (6)
26. ⭐ Contents/index tab as sheet #1 (hyperlinks + per-tab issue counts). S/H/EXP
27. "↑ Contents" back-link on every tab. S/M/EXP
28. ⭐ Autofilter on every table header. S/H/EXP
29. Outline/grouping (collapse 168 sub-rows + per-tool calc blocks). M/M/EXP
30. Named ranges for headline quantities. M/M/EXP
31. Freeze title rows + zoom + gate-result caption on the 20 image tabs. S/M/EXP

### E · Interactivity & What-if (5)
32. ⭐ single "Inputs" tab gathering the true drivers (production/density/turnovers/rates). M/H/EXP
33. ⭐ scenario columns Low/Central/High (already 3.83/4.60/5.37 M) with install factor live. M/H/EXP
34. Sensitivity/tornado tab (±20% on top drivers). L/H/EXP
35. data-validation dropdowns on categorical inputs. S/M/EXP
36. goal-seek-friendly layout (capex ceiling target cell next to live capex). S/M/EXP

### F · Visual & Print (6)
37. ⭐ sane number formats (#,##0 / £#,##0 / 0.0). S/H/EXP
38. dedicated units row under each header. S/M/EXP
39. conditional formatting beyond STATUS (data bars, colour scales, within_spec red). M/M/EXP
40. ⭐ print areas + repeating headers + fit-to-width + footer (run id/SHA/page). M/H/EXP
41. tab colours by zone. S/M/EXP
42. Overview dashboard sparkline strip + de-dup the doubled physics_fidelity row. M/M/EXP

### G · Engineering Value (5)
43. ⭐ spec-sheet-per-principal (duty/sizing-ref/rating/qty/£/driving-calc/part). L/H/EXP
44. ⭐ cost waterfall (BoM → assembly → COGS → install → ASP, from costStack). M/H/EXP
45. ⭐ brief-compliance matrix (every target_performance metric vs achieved vs PASS/FAIL). M/H/EXP
46. surface scorecard defects as an action punch-list. S/M/EXP
47. energy/OPEX summary (connected load, annual kWh → indicative £/yr). M/M/EXP

### H · Sharing & Accessibility (3)
48. ⭐ README/how-to-read tab. S/H/EXP
49. glossary/units legend + colour-blind-safe palette (add PASS/FAIL text token). M/M/EXP
50. ⭐ locked-vs-editable protection + richer metadata block (version/SHA/disclaimer). M/H/EXP

## Counts: 48 pure-exporter, 2 engine (#9, #10). Everything else's data already exists in state.json.

## Phased plan
- **Phase 1 (~1.5–2 d) — quick high-impact exporter wins:** 1,2,4,5,6,14,18,26,27,28,37,38,40,41,46,48,50.
- **Phase 2 (~4–6 d) — schedules, spec sheets, scenarios, deeper checks:** 3,7,8,11,12,13,15,16,17,19,20,21,22,23,24,25,29,30,31,32,33,34,35,36,39,42,43,44,45,47,49.
- **Phase 3 (~2–4 d, engine):** 9 (structured basis), 10 (per-row tool_id).

## ⭐ The 7 that most impress a fish-farming prospect on Monday
1. #3/#13 part-vs-duty + price-band (live-flags Grundfos). 2. #22 line & velocity (33 out-of-spec). 3. #20/#21 panel + process schedules as tables. 4. #45 brief-compliance matrix. 5. #44 cost waterfall. 6. #26+#37+#40 Contents + formats + clean print. 7. #2/#4 confidence tiers + honest "Verified by".

## Caution
Several Phase-2 checks (#3,#13,#15,#17) will turn parts of the book RED because the run genuinely has defects (Grundfos, 33 over-velocity lines, floor=2). That's the point — but if Monday must look clean, either run to green first OR lean on the honest-punch-list framing (#46/#48/#50). Do not hide it.
