# Excel Dossier Quality Tracker — RAS £5M review (2026-06-20) — COMPLETE

> Tristan's review of `ras-5m-v24/dossier.xlsx`. **Every fix UNIVERSAL** (no RAS-specific cheating, no metric-gaming; harness-verified BESS/CO₂ no-op). Re-run → `out/ras-5m-v25` (open Excel).

## ✅ Bucket A — Exporter (`build-excel-export.py`), commit 9eed8cadf
| # | Issue | Status |
|---|-------|--------|
| 175 | Charts: varyColors rainbow + per-point legends + gridlines → `style_chart` (verified XML varyColors=0) | ✅ |
| 176 | Schedule Service column truncated → auto-fit row heights + widen | ✅ |
| 177 | Panel/Process PDF-image tabs → native sortable sheets only | ✅ |
| 178 | Diagrams crushed to 1400px → 2600px (~1.9× sharper) | ✅ |
| 179 | Calc "[static]" unchecked → 72 live self-checking recomputations | ✅ |

## ✅ Bucket B/C — Engine + drawings, commits 9ca963a42 + (draw_pid)
| # | Issue | Result (v25) |
|---|-------|--------------|
| 181 | cost_sanity=5 / £5.37M over | **£4.47M ≤ £5M, cost_sanity 10/10** (calc_ phantom removal, no tonnage drop) ✅ |
| 182 | physics: blower motors + biofilter | blower motor margin in; Calc Biofilter phantom gone ✅ |
| 183 | brief_compliance 5 unverified | **6 → 8** (METRIC_MAP) ✅ |
| 174 | duplicate Degassing Blower | calc_ dedup removed it ✅ |
| 184 | coverage P&ID 19.6% / BFD 33% | **P&ID 100% / BFD 100%** (ISA-credit matcher + draw control/ESD valves) ✅ |
| 185 | connectivity: blower orphan + 87m | orphan FIXED (ledger ⚠ gone); blower hosted to Biofilter; ⚠ checks 2→1 ✅ (length ⚠ remains, see below) |

**Scorecard floor 5 → 8, quality loop COMPLETE — all gating sections ≥8.**

## ⏸ Remaining — need Tristan's steer (genuine trade-offs, not bugs)
| # | Issue | Why it needs a decision |
|---|-------|--------------------------|
| 180 + 185-length | Longest run 110m (1 deterministic ⚠) + stick-like isometrics | Shared root = the *placement* spreads equipment out. Fix = built layout optimiser `LAYOUT_OPTIMISE=1` (−32% pipe run) — needs a **Blender re-render**; gated as "Tristan's call" for +17% footprint (a non-issue on the 18-acre site → I recommend enabling). Known limitation: qty-N tank farm = 1 mega-node. |
| physics_fidelity advisory | 2× 1702 m³/h recirc pumps labelled "duty/standby" but both run for full flow | Real finding, advisory (floor holds). True duty+standby = 2× full-flow OR N+1 third pump — a **design-interpretation** of the brief, not a silent fix. |

**Constraint (Tristan):** all fixes universal; no RAS-only cheating; no metric-gaming.
**Branch:** worktree on `oxccu-efuel`; reconcile to `main` (one-engine rule) at push/deploy.
