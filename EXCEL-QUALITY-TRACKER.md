# Excel Dossier Quality Tracker — RAS £5M review (2026-06-20)

> Source: Tristan's review pass of `ras-5m-v24/dossier.xlsx`. **Every fix UNIVERSAL** (exporter + drawing generators + engine run for all archetypes — no RAS-specific hardcoding, no metric-gaming). Fix in order; commit after each.

## ✅ Bucket A — Exporter (`scripts/build-excel-export.py`) — DONE, committed 9eed8cadf, Excel reopened
| # | Issue | Status |
|---|-------|--------|
| 175 | Charts: varyColors rainbow + per-point legends + heavy gridlines → `style_chart()` (varyColors=0, solid colours, no gridlines, data labels). Verified in chart XML. | ✅ |
| 176 | Schedule Service column truncated → auto-fit row heights + widen 40→54. | ✅ |
| 177 | Panel/Process embedded as PDF images → dropped; native sortable sheets only. | ✅ |
| 178 | Diagrams crushed 2160–6560px → 1400 → raised downscale 2600 + display 1700 (P&ID/single-line/BFD now ~1.9× sharper). | ✅ |
| 179 | Calc "[static]" values unchecked → recomputed LIVE from substitution + ✓/⚠ vs engine (72 live / 2 static; safe positive-only design cross-ref). | ✅ |

## Bucket B/C — diagnosed; need engine fix + ONE chain re-run (2 background agents mapping)
| # | Issue | Diagnosis | Status |
|---|-------|-----------|--------|
| 181 | cost_sanity=5 → re-budget to £5M | 52 t/yr → £5.37M (7.4% over). design-to-budget mechanism overshot the ceiling. Agent mapping the sizing trigger. | ⏳ map |
| 182 | physics_fidelity=7 → blower motors + biofilter | Aeration blower motor under-rated vs duty; MBBR biofilter twin asymmetry. Agent mapping universal-contract-sizing.ts. | ⏳ map |
| 183 | brief_compliance=6 → 5 unverified constraints | gate-9 family: 5 brief constraints don't render PASS/FAIL rows. Agent identifying the 5 + METRIC_MAP/alias fix. | ⏳ map |
| 185 | Connectivity: blower power orphan + 87m run | `u_degassing_blower_inst0/inst1` DUP (computed-twin, #174) → power orphan. 87m run = PLACEMENT spreads equipment far/tall. Agent mapping. | ⏳ map |
| 180 | Isometrics look wrong | NOT a drawing bug — routes are geometrically real (41.7m spans, degasser at 14.4m). Root = PLACEMENT (long runs/tall stacks), SAME as #185. Fold into placement fix + re-render. | ⏳ placement |
| 184 | Coverage P&ID 19.6% / BFD 33.3% | (a) BFD correctly shows blocks not instruments — metric over-expects; (b) P&ID matcher false-neg: parts drawn with ISA tags (PCV-208) not credited vs manifest names. REAL fix = denser P&ID (#123) + correct per-drawing-type expectation, NOT metric relaxation. | ⏳ |

**Plan:** implement engine fixes (181/182/183/185) + placement fix (185/180) + P&ID density (184) → ONE chain re-run (re-renders all drawings, re-budgets) → rebuild + reopen Excel → verify scorecard fails clear + coverage genuine.

**Constraint (Tristan, 2026-06-20):** all fixes universal; no RAS-only cheating; no metric-gaming.
**Branch note:** worktree on `oxccu-efuel`; reconcile to `main` (one-engine rule) at push/deploy time.
