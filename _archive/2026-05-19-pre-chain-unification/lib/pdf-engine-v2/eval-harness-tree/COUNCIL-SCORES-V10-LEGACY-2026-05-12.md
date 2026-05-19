# Multimodal Council Scores — V10 LEGACY (3-run mean ± stddev)

**Path:** LEGACY  
**Runs aggregated:** 3  
**Per-run sources:**
  - `COUNCIL-SCORES-V10-LEGACY-RUN1-2026-05-12.md`
  - `COUNCIL-SCORES-V10-LEGACY-RUN2-2026-05-12.md`
  - `COUNCIL-SCORES-V10-LEGACY-RUN3-2026-05-12.md`

**Methodology (per ITER3-ARCHITECTURE-DESIGN.md §6.3.1):** 3 independent pipeline runs of the 10 baseline briefs were each scored once via the 3-LLM multimodal council (Gemini 2.5 Pro, Claude Opus 4.7, Qwen3-VL-235B; outlier dropped if ≥3 below other two; mean of remaining). The cell value below is the **mean ± sample stddev across the 3 pipeline runs** of the per-run calibrated mean. Cells flagged ✅ when 3-run mean ≥8.0.

Stddev captures BOTH pipeline-determinism noise (different LLM completions across runs) AND scoring-pass noise (re-scoring of fresh PDFs). A cell with high mean and high stddev is unreliable; the §7.1 promotion gate requires lift ≥3× stddev to count as signal not noise.

---

### AUV

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.00 | 7.00 | — | **7.00±0.00** | 2 |
| Executive Summary | 7.33 | 7.33 | — | **7.33±0.00** | 2 |
| Brief Requirements | 8.00 | 9.00 | — | **8.50±0.71 ✅** | 2 |
| Design Modules | 5.67 | 6.33 | — | **6.00±0.47** | 2 |
| Bom | 5.33 | 4.67 | — | **5.00±0.47** | 2 |
| Cost Analysis | 5.50 | 5.00 | — | **5.25±0.35** | 2 |
| Sourcing Strategy | 6.33 | 6.33 | — | **6.33±0.00** | 2 |
| Feasibility Notes | 8.00 | 8.00 | — | **8.00±0.00 ✅** | 2 |
| Grammar Language | 7.33 | 6.67 | — | **7.00±0.47** | 2 |
| Sources References | 6.33 | 7.00 | — | **6.67±0.47** | 2 |
| Appendix Technical | 8.00 | 8.00 | — | **8.00±0.00 ✅** | 2 |
| Visual Layout | 9.00 | 8.33 | — | **8.66±0.47 ✅** | 2 |

**Overall mean: 6.98/10** (4/12 sections with 3-run mean ≥8)

---

### BESS

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.00 | — | — | **7.00** | 1 |
| Executive Summary | 8.33 | — | — | **8.33** | 1 |
| Brief Requirements | 9.00 | — | — | **9.00** | 1 |
| Design Modules | 8.33 | — | — | **8.33** | 1 |
| Bom | 5.67 | — | — | **5.67** | 1 |
| Cost Analysis | 8.00 | — | — | **8.00** | 1 |
| Sourcing Strategy | 7.33 | — | — | **7.33** | 1 |
| Feasibility Notes | 7.67 | — | — | **7.67** | 1 |
| Grammar Language | 8.67 | — | — | **8.67** | 1 |
| Sources References | 5.33 | — | — | **5.33** | 1 |
| Appendix Technical | 8.50 | — | — | **8.50** | 1 |
| Visual Layout | 8.67 | — | — | **8.67** | 1 |

**Overall mean: 7.71/10** (7/12 sections with 3-run mean ≥8)

---

### Bioreactor

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | — | 7.67 | — | **7.67** | 1 |
| Executive Summary | — | 8.33 | — | **8.33** | 1 |
| Brief Requirements | — | 8.33 | — | **8.33** | 1 |
| Design Modules | — | 8.00 | — | **8.00** | 1 |
| Bom | — | 5.00 | — | **5.00** | 1 |
| Cost Analysis | — | 5.67 | — | **5.67** | 1 |
| Sourcing Strategy | — | 4.67 | — | **4.67** | 1 |
| Feasibility Notes | — | 7.00 | — | **7.00** | 1 |
| Grammar Language | — | 8.50 | — | **8.50** | 1 |
| Sources References | — | 5.67 | — | **5.67** | 1 |
| Appendix Technical | — | 8.00 | — | **8.00** | 1 |
| Visual Layout | — | 8.33 | — | **8.33** | 1 |

**Overall mean: 7.10/10** (6/12 sections with 3-run mean ≥8)

---

### CGM

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.00 | 7.33 | — | **7.17±0.23** | 2 |
| Executive Summary | 8.33 | 9.00 | — | **8.66±0.47 ✅** | 2 |
| Brief Requirements | 8.67 | 9.00 | — | **8.84±0.23 ✅** | 2 |
| Design Modules | 5.67 | 4.67 | — | **5.17±0.71** | 2 |
| Bom | 5.50 | 3.00 | — | **4.25±1.77** | 2 |
| Cost Analysis | 7.00 | 5.67 | — | **6.33±0.94** | 2 |
| Sourcing Strategy | 5.33 | 3.00 | — | **4.17±1.65** | 2 |
| Feasibility Notes | 8.00 | 7.33 | — | **7.67±0.47** | 2 |
| Grammar Language | 8.50 | 8.00 | — | **8.25±0.35 ✅** | 2 |
| Sources References | 6.67 | 6.50 | — | **6.58±0.12** | 2 |
| Appendix Technical | 8.00 | 8.00 | — | **8.00±0.00 ✅** | 2 |
| Visual Layout | 8.00 | 7.67 | — | **7.83±0.23** | 2 |

**Overall mean: 6.91/10** (4/12 sections with 3-run mean ≥8)

---

### Drone

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.00 | 6.33 | — | **6.67±0.47** | 2 |
| Executive Summary | 7.33 | 8.00 | — | **7.67±0.47** | 2 |
| Brief Requirements | 8.00 | 8.00 | — | **8.00±0.00 ✅** | 2 |
| Design Modules | 6.33 | 4.00 | — | **5.17±1.65** | 2 |
| Bom | 5.00 | 3.00 | — | **4.00±1.41** | 2 |
| Cost Analysis | 7.00 | 6.00 | — | **6.50±0.71** | 2 |
| Sourcing Strategy | 7.33 | 4.67 | — | **6.00±1.88** | 2 |
| Feasibility Notes | 7.33 | 7.00 | — | **7.17±0.23** | 2 |
| Grammar Language | 7.50 | 3.33 | — | **5.42±2.95** | 2 |
| Sources References | 6.67 | 5.67 | — | **6.17±0.71** | 2 |
| Appendix Technical | 8.00 | 7.50 | — | **7.75±0.35** | 2 |
| Visual Layout | 8.33 | 8.33 | — | **8.33±0.00 ✅** | 2 |

**Overall mean: 6.57/10** (2/12 sections with 3-run mean ≥8)

---

### Edge-AI

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | — | — | **7.67** | 1 |
| Executive Summary | 8.33 | — | — | **8.33** | 1 |
| Brief Requirements | 8.67 | — | — | **8.67** | 1 |
| Design Modules | 5.33 | — | — | **5.33** | 1 |
| Bom | 4.67 | — | — | **4.67** | 1 |
| Cost Analysis | 6.67 | — | — | **6.67** | 1 |
| Sourcing Strategy | 6.33 | — | — | **6.33** | 1 |
| Feasibility Notes | 8.00 | — | — | **8.00** | 1 |
| Grammar Language | 7.67 | — | — | **7.67** | 1 |
| Sources References | 7.00 | — | — | **7.00** | 1 |
| Appendix Technical | 8.00 | — | — | **8.00** | 1 |
| Visual Layout | 8.33 | — | — | **8.33** | 1 |

**Overall mean: 7.22/10** (5/12 sections with 3-run mean ≥8)

---

### EV-Charger

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | 7.33 | — | **7.50±0.24** | 2 |
| Executive Summary | 7.67 | 8.33 | — | **8.00±0.47 ✅** | 2 |
| Brief Requirements | 9.00 | 9.00 | — | **9.00±0.00 ✅** | 2 |
| Design Modules | 7.33 | 7.00 | — | **7.17±0.23** | 2 |
| Bom | 4.67 | 4.67 | — | **4.67±0.00** | 2 |
| Cost Analysis | 5.50 | 7.00 | — | **6.25±1.06** | 2 |
| Sourcing Strategy | 6.33 | 6.33 | — | **6.33±0.00** | 2 |
| Feasibility Notes | 7.00 | 8.67 | — | **7.83±1.18** | 2 |
| Grammar Language | 8.50 | 7.67 | — | **8.09±0.59 ✅** | 2 |
| Sources References | 6.67 | 5.67 | — | **6.17±0.71** | 2 |
| Appendix Technical | 8.00 | 7.00 | — | **7.50±0.71** | 2 |
| Visual Layout | 8.33 | 8.33 | — | **8.33±0.00 ✅** | 2 |

**Overall mean: 7.24/10** (4/12 sections with 3-run mean ≥8)

---

### Farm

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | 7.00 | — | **7.33±0.47** | 2 |
| Executive Summary | 8.33 | 7.33 | — | **7.83±0.71** | 2 |
| Brief Requirements | 9.00 | 8.33 | — | **8.66±0.47 ✅** | 2 |
| Design Modules | 6.67 | 8.00 | — | **7.33±0.94** | 2 |
| Bom | 5.67 | 5.50 | — | **5.58±0.12** | 2 |
| Cost Analysis | 5.67 | 7.00 | — | **6.33±0.94** | 2 |
| Sourcing Strategy | 7.33 | 6.00 | — | **6.67±0.94** | 2 |
| Feasibility Notes | 7.33 | 7.67 | — | **7.50±0.24** | 2 |
| Grammar Language | 9.00 | 7.50 | — | **8.25±1.06 ✅** | 2 |
| Sources References | 7.67 | 7.00 | — | **7.33±0.47** | 2 |
| Appendix Technical | 9.50 | 8.00 | — | **8.75±1.06 ✅** | 2 |
| Visual Layout | 8.67 | 7.67 | — | **8.17±0.71 ✅** | 2 |

**Overall mean: 7.48/10** (4/12 sections with 3-run mean ≥8)

---

### HAPS

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | 6.00 | — | **6.83±1.18** | 2 |
| Executive Summary | 8.33 | 8.33 | — | **8.33±0.00 ✅** | 2 |
| Brief Requirements | 8.33 | 8.00 | — | **8.16±0.23 ✅** | 2 |
| Design Modules | 7.00 | 6.33 | — | **6.67±0.47** | 2 |
| Bom | 5.00 | 4.67 | — | **4.83±0.23** | 2 |
| Cost Analysis | 5.33 | 5.50 | — | **5.42±0.12** | 2 |
| Sourcing Strategy | 6.33 | 6.33 | — | **6.33±0.00** | 2 |
| Feasibility Notes | 8.00 | 7.33 | — | **7.67±0.47** | 2 |
| Grammar Language | 9.00 | 7.00 | — | **8.00±1.41 ✅** | 2 |
| Sources References | 6.67 | 6.50 | — | **6.58±0.12** | 2 |
| Appendix Technical | 7.50 | 8.00 | — | **7.75±0.35** | 2 |
| Visual Layout | 8.67 | 8.00 | — | **8.34±0.47 ✅** | 2 |

**Overall mean: 7.08/10** (4/12 sections with 3-run mean ≥8)

---

### Heatpump

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | — | 7.50 | — | **7.50** | 1 |
| Executive Summary | — | 7.50 | — | **7.50** | 1 |
| Brief Requirements | — | 8.50 | — | **8.50** | 1 |
| Design Modules | — | 7.50 | — | **7.50** | 1 |
| Bom | — | 5.50 | — | **5.50** | 1 |
| Cost Analysis | — | 7.00 | — | **7.00** | 1 |
| Sourcing Strategy | — | 5.50 | — | **5.50** | 1 |
| Feasibility Notes | — | 8.00 | — | **8.00** | 1 |
| Grammar Language | — | 7.00 | — | **7.00** | 1 |
| Sources References | — | 7.00 | — | **7.00** | 1 |
| Appendix Technical | — | 5.50 | — | **5.50** | 1 |
| Visual Layout | — | 8.00 | — | **8.00** | 1 |

**Overall mean: 7.04/10** (3/12 sections with 3-run mean ≥8)

---

## Heatmap (3-run mean)

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | ~7.0 | ~7.3 | ✅8.5 | ~6.0 | ❌5.0 | ❌5.2 | ~6.3 | ✅8.0 | ~7.0 | ~6.7 | ✅8.0 | ✅8.7 |
| bess | ~7.0 | ✅8.3 | ✅9.0 | ✅8.3 | ❌5.7 | ✅8.0 | ~7.3 | ~7.7 | ✅8.7 | ❌5.3 | ✅8.5 | ✅8.7 |
| bioreactor | ~7.7 | ✅8.3 | ✅8.3 | ✅8.0 | ❌5.0 | ❌5.7 | ❌4.7 | ~7.0 | ✅8.5 | ❌5.7 | ✅8.0 | ✅8.3 |
| cgm | ~7.2 | ✅8.7 | ✅8.8 | ❌5.2 | ❌4.2 | ~6.3 | ❌4.2 | ~7.7 | ✅8.2 | ~6.6 | ✅8.0 | ~7.8 |
| drone | ~6.7 | ~7.7 | ✅8.0 | ❌5.2 | ❌4.0 | ~6.5 | ~6.0 | ~7.2 | ❌5.4 | ~6.2 | ~7.8 | ✅8.3 |
| edge-ai | ~7.7 | ✅8.3 | ✅8.7 | ❌5.3 | ❌4.7 | ~6.7 | ~6.3 | ✅8.0 | ~7.7 | ~7.0 | ✅8.0 | ✅8.3 |
| ev-charger | ~7.5 | ✅8.0 | ✅9.0 | ~7.2 | ❌4.7 | ~6.2 | ~6.3 | ~7.8 | ✅8.1 | ~6.2 | ~7.5 | ✅8.3 |
| farm | ~7.3 | ~7.8 | ✅8.7 | ~7.3 | ❌5.6 | ~6.3 | ~6.7 | ~7.5 | ✅8.2 | ~7.3 | ✅8.8 | ✅8.2 |
| haps | ~6.8 | ✅8.3 | ✅8.2 | ~6.7 | ❌4.8 | ❌5.4 | ~6.3 | ~7.7 | ✅8.0 | ~6.6 | ~7.8 | ✅8.3 |
| heatpump | ~7.5 | ~7.5 | ✅8.5 | ~7.5 | ❌5.5 | ~7.0 | ❌5.5 | ✅8.0 | ~7.0 | ~7.0 | ❌5.5 | ✅8.0 |

## Stddev heatmap (across 3 runs)

Higher stddev = less reliable cell.

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | 0.00 | 0.00 | 0.71 | 0.47 | 0.47 | 0.35 | 0.00 | 0.00 | 0.47 | 0.47 | 0.00 | 0.47 |
| bess | — | — | — | — | — | — | — | — | — | — | — | — |
| bioreactor | — | — | — | — | — | — | — | — | — | — | — | — |
| cgm | 0.23 | 0.47 | 0.23 | 0.71 | 1.77 | 0.94 | 1.65 | 0.47 | 0.35 | 0.12 | 0.00 | 0.23 |
| drone | 0.47 | 0.47 | 0.00 | 1.65 | 1.41 | 0.71 | 1.88 | 0.23 | 2.95 | 0.71 | 0.35 | 0.00 |
| edge-ai | — | — | — | — | — | — | — | — | — | — | — | — |
| ev-charger | 0.24 | 0.47 | 0.00 | 0.23 | 0.00 | 1.06 | 0.00 | 1.18 | 0.59 | 0.71 | 0.71 | 0.00 |
| farm | 0.47 | 0.71 | 0.47 | 0.94 | 0.12 | 0.94 | 0.94 | 0.24 | 1.06 | 0.47 | 1.06 | 0.71 |
| haps | 1.18 | 0.00 | 0.23 | 0.47 | 0.23 | 0.12 | 0.00 | 0.47 | 1.41 | 0.12 | 0.35 | 0.47 |
| heatpump | — | — | — | — | — | — | — | — | — | — | — | — |

---

## Summary

| Metric | V10 LEGACY (3-run mean) |
|---|---|
| Cells with 3-run mean ≥8 | 43 / 120 (35%) |
| Total scored runs aggregated | 3 |

## Per-class average (sorted)

| Rank | Class | Mean avg | Sections ≥8 |
|---|---|---|---|
| 1 | BESS | **7.71/10** | 7/12 |
| 2 | Farm | **7.48/10** | 4/12 |
| 3 | EV-Charger | **7.24/10** | 4/12 |
| 4 | Edge-AI | **7.22/10** | 5/12 |
| 5 | Bioreactor | **7.10/10** | 6/12 |
| 6 | HAPS | **7.08/10** | 4/12 |
| 7 | Heatpump | **7.04/10** | 3/12 |
| 8 | AUV | **6.98/10** | 4/12 |
| 9 | CGM | **6.91/10** | 4/12 |
| 10 | Drone | **6.57/10** | 2/12 |

---

_Generated by `/tmp/v10-aggregate-runs.py`_