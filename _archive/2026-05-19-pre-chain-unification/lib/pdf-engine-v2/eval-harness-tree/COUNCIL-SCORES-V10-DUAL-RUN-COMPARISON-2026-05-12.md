# V10 Dual-Run Comparison — Iter 3 vs Legacy (3-run mean ± stddev)

**Date:** 2026-05-12  
**Iter 3 source:** `COUNCIL-SCORES-V10-ITER3-2026-05-12.json`  
**Legacy source:** `COUNCIL-SCORES-V10-LEGACY-2026-05-12.json`  
**Methodology:** Each path ran 10 baselines × 3 independent pipeline runs (60 total pipeline runs). Each pipeline run scored once via 3-LLM multimodal council (Gemini 2.5 Pro · Claude Opus 4.7 · Qwen3-VL-235B), uncapped (no `pngs[:12]` truncation per Fork B fix). Per-cell value = mean ± sample stddev across the 3 pipeline runs of the per-run calibrated mean.

**Promotion gate (§7.1, ITER3-ARCHITECTURE-DESIGN.md):**
1. **Cell-≥8 lift ≥+10** on baselines (3-run mean), AND lift ≥3× combined stddev.
2. **No >2 regressions** on previously-passing (≥8 in legacy) cells.
3. **≥4/5 universality probes** pass (separate V11 dispatch — not evaluated here).

---

## Headline

| Path | Cells ≥8 (3-run mean) | Cells present |
|---|---|---|
| V10-iter3 | **42** | 120 |
| V10-legacy | **43** | 120 |
| **Lift** | **-1** | — |

## Per-cell delta (iter3 mean − legacy mean)

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | +0.61 | ✅+0.95 | =+0.22 | +1.17 | +0.17 | +0.92 | +0.00 | ❌-0.44 | -0.05 | +0.28 | ❌-0.67 | =-0.44 |
| bess | +0.61 | =-0.28 | =+0.11 | =+0.11 | +0.22 | ❌-0.83 | -0.11 | ✅+1.22 | =+0.33 | +2.34 | =+0.00 | =-0.22 |
| bioreactor | -0.45 | =+0.00 | =+0.11 | ❌-1.11 | +0.17 | +0.66 | +1.05 | +0.56 | =-0.28 | +1.00 | ❌-0.83 | =-0.22 |
| cgm | +0.00 | =-0.61 | =-0.39 | +0.66 | +1.25 | -0.17 | -0.05 | +0.12 | ❌-0.58 | -0.30 | =+0.67 | +0.11 |
| drone | +0.33 | ✅+0.67 | =+0.66 | +0.67 | +1.00 | +0.25 | +0.17 | +0.50 | ✅+2.67 | +0.50 | ✅+1.00 | =-0.17 |
| edge-ai | -0.28 | ❌-0.50 | =-0.45 | -0.05 | -0.11 | +0.27 | -0.44 | =+0.00 | -1.34 | -0.22 | ❌-1.00 | =-0.16 |
| ev-charger | -0.05 | ❌-0.11 | =-0.56 | -0.28 | -0.45 | +0.92 | +0.00 | ✅+0.61 | =+0.58 | +0.39 | +0.33 | =+0.11 |
| farm | -0.22 | ✅+0.22 | =-0.22 | -0.67 | -0.80 | +0.67 | -0.06 | ✅+0.50 | ❌-0.97 | -1.05 | ❌-1.08 | =-0.00 |
| haps | -0.50 | ❌-0.44 | =+0.61 | +0.33 | +0.28 | +1.03 | +0.33 | ✅+0.56 | ❌-0.28 | +0.81 | ✅+0.92 | =-0.34 |
| heatpump | -0.33 | ✅+0.50 | =+0.34 | +0.00 | -0.67 | -0.17 | +1.00 | =+0.00 | ✅+1.75 | +0.17 | +2.25 | =+0.50 |

Legend: ✅ = newly ≥8 in iter3, ❌ = regression below 8, = = stayed ≥8 in both, plain = sub-8 both sides

---

## Per-class winners

| Class | Iter3 cells ≥8 | Legacy cells ≥8 | Delta | Iter3 avg | Legacy avg | Verdict |
|---|---|---|---|---|---|---|
| AUV | 3/12 | 4/12 | -1 | 7.20 | 6.98 | LEGACY win |
| BESS | 7/12 | 7/12 | +0 | 8.00 | 7.71 | tie |
| Bioreactor | 4/12 | 6/12 | -2 | 7.15 | 7.10 | LEGACY win |
| CGM | 3/12 | 4/12 | -1 | 6.97 | 6.91 | LEGACY win |
| Drone | 5/12 | 2/12 | +3 | 7.26 | 6.57 | ITER3 win |
| Edge-AI | 3/12 | 5/12 | -2 | 6.87 | 7.22 | LEGACY win |
| EV-Charger | 4/12 | 4/12 | +0 | 7.36 | 7.24 | tie |
| Farm | 4/12 | 4/12 | +0 | 7.17 | 7.48 | tie |
| HAPS | 4/12 | 4/12 | +0 | 7.35 | 7.08 | tie |
| Heatpump | 5/12 | 3/12 | +2 | 7.49 | 7.04 | ITER3 win |

---

## Regressions (cells previously ≥8 in legacy that fell below 8 in iter3)

| Class | Section | Legacy mean | Iter3 mean | Drop |
|---|---|---|---|---|
| AUV | Feasibility Notes | 8.00 | 7.56 | -0.44 |
| AUV | Appendix Technical | 8.00 | 7.33 | -0.67 |
| BESS | Cost Analysis | 8.00 | 7.17 | -0.83 |
| Bioreactor | Design Modules | 8.00 | 6.89 | -1.11 |
| Bioreactor | Appendix Technical | 8.00 | 7.17 | -0.83 |
| CGM | Grammar Language | 8.25 | 7.67 | -0.58 |
| Edge-AI | Executive Summary | 8.33 | 7.83 | -0.50 |
| Edge-AI | Appendix Technical | 8.00 | 7.00 | -1.00 |
| EV-Charger | Executive Summary | 8.00 | 7.89 | -0.11 |
| Farm | Grammar Language | 8.25 | 7.28 | -0.97 |
| Farm | Appendix Technical | 8.75 | 7.67 | -1.08 |
| HAPS | Executive Summary | 8.33 | 7.89 | -0.44 |
| HAPS | Grammar Language | 8.00 | 7.72 | -0.28 |

**Total regressions: 13** (gate threshold: ≤2)

---

## New passes (cells lifted from <8 in legacy to ≥8 in iter3)

| Class | Section | Legacy mean | Iter3 mean | Lift |
|---|---|---|---|---|
| AUV | Executive Summary | 7.33 | 8.28 | +0.95 |
| BESS | Feasibility Notes | 7.67 | 8.89 | +1.22 |
| Drone | Executive Summary | 7.67 | 8.34 | +0.67 |
| Drone | Grammar Language | 5.42 | 8.09 | +2.67 |
| Drone | Appendix Technical | 7.75 | 8.75 | +1.00 |
| EV-Charger | Feasibility Notes | 7.83 | 8.44 | +0.61 |
| Farm | Executive Summary | 7.83 | 8.05 | +0.22 |
| Farm | Feasibility Notes | 7.50 | 8.00 | +0.50 |
| HAPS | Feasibility Notes | 7.67 | 8.22 | +0.56 |
| HAPS | Appendix Technical | 7.75 | 8.67 | +0.92 |
| Heatpump | Executive Summary | 7.50 | 8.00 | +0.50 |
| Heatpump | Grammar Language | 7.00 | 8.75 | +1.75 |

**Total new passes: 12**

---

## Lift / stddev signal check (§7.1 condition 1b)

- **Cell-count lift:** -1
- **Median per-cell stddev (combined iter3+legacy):** 0.58
- **Lift in cell-count units / 3:** -0.33
- **Aggregate combined-variance stddev (sqrt sum of per-cell variances):** 9.83

- **Lift / median-stddev ratio:** -1.73 (gate: ≥3)

---

## Promotion gate verdict

| Condition | Required | Actual | Met |
|---|---|---|---|
| 1. Cell-≥8 lift on baselines | ≥+10 | -1 | ❌ |
| 1b. Lift ≥3× per-cell median stddev | lift/median_sd ≥3 | -1.73 | ❌ |
| 2. ≤2 regressions on previously-passing cells | ≤2 | 13 | ❌ |
| 3. ≥4/5 universality probes pass | ≥4/5 | (V11 — separate dispatch) | ⏳ |

### Final verdict

**KILL** — Iter 3 regressed on baselines or broke too many previously-passing cells. Per design doc kill criteria, revert to Iter 2 default and re-plan.

---

_Generated by `/tmp/v10-comparison.py`_