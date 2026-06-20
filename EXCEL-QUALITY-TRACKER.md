# Excel Dossier Quality Tracker — RAS £5M review (2026-06-20)

> Source: Tristan's review pass of `ras-5m-v24/dossier.xlsx`. **Every fix UNIVERSAL** (exporter + drawing generators run for all archetypes — no RAS-specific hardcoding). Fix in order; commit after each.

## Bucket A — Exporter (`scripts/build-excel-export.py`), no chain re-run, rebuild+reopen
| # | Issue | Status |
|---|-------|--------|
| 175 | Charts: rainbow lines + per-point legends (varyColors), heavy gridlines, no axis values, EBITDA invisible → `_clean_chart` helper | ☐ |
| 176 | Schedule tabs (Line/Valve/Instrument) Service column truncated (width 40, no wrap) → wrap_text + widths | ☐ |
| 177 | Panel schedule + Process schedules embedded as PDF IMAGES not native rows → drop from image list (native sheets exist) | ☐ |
| 178 | Diagrams blurry — exporter crushes 2160–6560px → 1400px (`downscale_png max_px` + display cap) → raise caps | ☐ |
| 179 | Calc tab "[static — no input map]" values unchecked (generic tool examples) → verify vs contract + ✓/⚠ | ☐ |

## Bucket B — Drawing renderer (`scripts/blender-universal/draw_*.py`)
| # | Issue | Status |
|---|-------|--------|
| 180 | 3 isometrics look wrong — `_draw_one_iso` over-compresses long runs into fixed panel; iso-index missing | ☐ |
| 184 | Drawing coverage thin (P&ID 19.6%, BFD 33.3%) — render ALL BoM parts | ☐ |

## Bucket C — Chain re-run (engine)
| # | Issue | Status |
|---|-------|--------|
| 181 | Scorecard cost_sanity=5 → re-budget to £5M (52→~46 t/yr) | ☐ |
| 182 | Scorecard physics_fidelity=7 → undersized blower motors + biofilter asymmetry | ☐ |
| 183 | Scorecard brief_compliance=6 → 5 unverified constraints render as rows | ☐ |
| 185 | Connectivity: Degassing Blower power orphan (#174) + 87m periphery run | ☐ |

**Constraint (Tristan, 2026-06-20):** all fixes universal, no cheating for RAS only.
