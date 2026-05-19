# Multimodal Council Scores — V10 ITER3 (3-run mean ± stddev)

**Path:** ITER3  
**Runs aggregated:** 3  
**Per-run sources:**
  - `COUNCIL-SCORES-V10-ITER3-RUN1-2026-05-12.md`
  - `COUNCIL-SCORES-V10-ITER3-RUN2-2026-05-12.md`
  - `COUNCIL-SCORES-V10-ITER3-RUN3-2026-05-12.md`

**Methodology (per ITER3-ARCHITECTURE-DESIGN.md §6.3.1):** 3 independent pipeline runs of the 10 baseline briefs were each scored once via the 3-LLM multimodal council (Gemini 2.5 Pro, Claude Opus 4.7, Qwen3-VL-235B; outlier dropped if ≥3 below other two; mean of remaining). The cell value below is the **mean ± sample stddev across the 3 pipeline runs** of the per-run calibrated mean. Cells flagged ✅ when 3-run mean ≥8.0.

Stddev captures BOTH pipeline-determinism noise (different LLM completions across runs) AND scoring-pass noise (re-scoring of fresh PDFs). A cell with high mean and high stddev is unreliable; the §7.1 promotion gate requires lift ≥3× stddev to count as signal not noise.

---

### AUV

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.50 | 7.67 | 7.67 | **7.61±0.10** | 3 |
| Executive Summary | 7.50 | 8.33 | 9.00 | **8.28±0.75 ✅** | 3 |
| Brief Requirements | 8.50 | 9.00 | 8.67 | **8.72±0.25 ✅** | 3 |
| Design Modules | 6.50 | 7.00 | 8.00 | **7.17±0.76** | 3 |
| Bom | 5.50 | 4.67 | 5.33 | **5.17±0.44** | 3 |
| Cost Analysis | 6.50 | 6.00 | 6.00 | **6.17±0.29** | 3 |
| Sourcing Strategy | 7.00 | 6.00 | 6.00 | **6.33±0.58** | 3 |
| Feasibility Notes | 8.00 | 7.00 | 7.67 | **7.56±0.51** | 3 |
| Grammar Language | 6.50 | 6.67 | 7.67 | **6.95±0.63** | 3 |
| Sources References | 7.50 | 6.67 | 6.67 | **6.95±0.48** | 3 |
| Appendix Technical | 5.50 | 8.00 | 8.50 | **7.33±1.61** | 3 |
| Visual Layout | 8.00 | 8.33 | 8.33 | **8.22±0.19 ✅** | 3 |

**Overall mean: 7.20/10** (3/12 sections with 3-run mean ≥8)

---

### BESS

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.50 | 7.67 | 7.67 | **7.61±0.10** | 3 |
| Executive Summary | 7.50 | 8.33 | 8.33 | **8.05±0.48 ✅** | 3 |
| Brief Requirements | 9.00 | 9.33 | 9.00 | **9.11±0.19 ✅** | 3 |
| Design Modules | 9.00 | 7.33 | 9.00 | **8.44±0.96 ✅** | 3 |
| Bom | 7.00 | 5.00 | 5.67 | **5.89±1.02** | 3 |
| Cost Analysis | 7.50 | 7.00 | 7.00 | **7.17±0.29** | 3 |
| Sourcing Strategy | 7.00 | 7.33 | 7.33 | **7.22±0.19** | 3 |
| Feasibility Notes | 9.00 | 8.67 | 9.00 | **8.89±0.19 ✅** | 3 |
| Grammar Language | 9.00 | 9.00 | 9.00 | **9.00±0.00 ✅** | 3 |
| Sources References | 8.00 | 7.67 | 7.33 | **7.67±0.34** | 3 |
| Appendix Technical | 6.50 | 9.50 | 9.50 | **8.50±1.73 ✅** | 3 |
| Visual Layout | 8.00 | 8.67 | 8.67 | **8.45±0.39 ✅** | 3 |

**Overall mean: 8.00/10** (7/12 sections with 3-run mean ≥8)

---

### Bioreactor

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.00 | 7.00 | 7.67 | **7.22±0.39** | 3 |
| Executive Summary | 8.33 | 8.33 | 8.33 | **8.33±0.00 ✅** | 3 |
| Brief Requirements | 8.67 | 8.33 | 8.33 | **8.44±0.20 ✅** | 3 |
| Design Modules | 6.67 | 7.00 | 7.00 | **6.89±0.19** | 3 |
| Bom | 5.50 | 5.00 | 5.00 | **5.17±0.29** | 3 |
| Cost Analysis | 7.00 | 5.67 | 6.33 | **6.33±0.67** | 3 |
| Sourcing Strategy | 6.00 | 5.67 | 5.50 | **5.72±0.25** | 3 |
| Feasibility Notes | 8.00 | 7.00 | 7.67 | **7.56±0.51** | 3 |
| Grammar Language | 7.67 | 8.50 | 8.50 | **8.22±0.48 ✅** | 3 |
| Sources References | 7.00 | 6.50 | 6.50 | **6.67±0.29** | 3 |
| Appendix Technical | 7.50 | 7.00 | 7.00 | **7.17±0.29** | 3 |
| Visual Layout | 8.00 | 8.00 | 8.33 | **8.11±0.19 ✅** | 3 |

**Overall mean: 7.15/10** (4/12 sections with 3-run mean ≥8)

---

### CGM

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.00 | 7.50 | 7.00 | **7.17±0.29** | 3 |
| Executive Summary | 8.33 | 7.50 | 8.33 | **8.05±0.48 ✅** | 3 |
| Brief Requirements | 8.67 | 8.00 | 8.67 | **8.45±0.39 ✅** | 3 |
| Design Modules | 5.33 | 6.50 | 5.67 | **5.83±0.60** | 3 |
| Bom | 6.50 | 5.00 | 5.00 | **5.50±0.87** | 3 |
| Cost Analysis | 5.67 | 6.50 | 6.33 | **6.17±0.44** | 3 |
| Sourcing Strategy | 5.33 | 4.00 | 3.00 | **4.11±1.17** | 3 |
| Feasibility Notes | 7.67 | 8.00 | 7.67 | **7.78±0.19** | 3 |
| Grammar Language | 8.00 | 6.50 | 8.50 | **7.67±1.04** | 3 |
| Sources References | 6.67 | 6.50 | 5.67 | **6.28±0.54** | 3 |
| Appendix Technical | 9.00 | 8.00 | 9.00 | **8.67±0.58 ✅** | 3 |
| Visual Layout | 8.33 | 7.50 | 8.00 | **7.94±0.42** | 3 |

**Overall mean: 6.97/10** (3/12 sections with 3-run mean ≥8)

---

### Drone

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | — | 6.33 | **7.00±0.95** | 2 |
| Executive Summary | 9.00 | — | 7.67 | **8.34±0.94 ✅** | 2 |
| Brief Requirements | 8.33 | — | 9.00 | **8.66±0.47 ✅** | 2 |
| Design Modules | 6.33 | — | 5.33 | **5.83±0.71** | 2 |
| Bom | 5.00 | — | 5.00 | **5.00±0.00** | 2 |
| Cost Analysis | 7.00 | — | 6.50 | **6.75±0.35** | 2 |
| Sourcing Strategy | 6.67 | — | 5.67 | **6.17±0.71** | 2 |
| Feasibility Notes | 7.33 | — | 8.00 | **7.67±0.47** | 2 |
| Grammar Language | 7.67 | — | 8.50 | **8.09±0.59 ✅** | 2 |
| Sources References | 7.00 | — | 6.33 | **6.67±0.47** | 2 |
| Appendix Technical | 9.50 | — | 8.00 | **8.75±1.06 ✅** | 2 |
| Visual Layout | 8.33 | — | 8.00 | **8.16±0.23 ✅** | 2 |

**Overall mean: 7.26/10** (5/12 sections with 3-run mean ≥8)

---

### Edge-AI

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | 7.50 | 7.00 | **7.39±0.35** | 3 |
| Executive Summary | 8.33 | 7.50 | 7.67 | **7.83±0.44** | 3 |
| Brief Requirements | 8.67 | 8.00 | 8.00 | **8.22±0.39 ✅** | 3 |
| Design Modules | 5.67 | 4.50 | 5.67 | **5.28±0.68** | 3 |
| Bom | 5.00 | 4.00 | 4.67 | **4.56±0.51** | 3 |
| Cost Analysis | 6.33 | 6.50 | 8.00 | **6.94±0.92** | 3 |
| Sourcing Strategy | 6.33 | 5.00 | 6.33 | **5.89±0.77** | 3 |
| Feasibility Notes | 8.00 | 8.00 | 8.00 | **8.00±0.00 ✅** | 3 |
| Grammar Language | 7.33 | 5.00 | 6.67 | **6.33±1.20** | 3 |
| Sources References | 7.33 | 6.50 | 6.50 | **6.78±0.48** | 3 |
| Appendix Technical | 9.00 | 4.00 | 8.00 | **7.00±2.65** | 3 |
| Visual Layout | 8.67 | 7.50 | 8.33 | **8.17±0.60 ✅** | 3 |

**Overall mean: 6.87/10** (3/12 sections with 3-run mean ≥8)

---

### EV-Charger

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | 7.00 | 7.67 | **7.45±0.39** | 3 |
| Executive Summary | 8.33 | 7.67 | 7.67 | **7.89±0.38** | 3 |
| Brief Requirements | 8.33 | 8.67 | 8.33 | **8.44±0.20 ✅** | 3 |
| Design Modules | 7.33 | 6.33 | 7.00 | **6.89±0.51** | 3 |
| Bom | 4.67 | 4.67 | 3.33 | **4.22±0.77** | 3 |
| Cost Analysis | 7.50 | 7.00 | 7.00 | **7.17±0.29** | 3 |
| Sourcing Strategy | 6.67 | 7.00 | 5.33 | **6.33±0.88** | 3 |
| Feasibility Notes | 9.00 | 8.00 | 8.33 | **8.44±0.51 ✅** | 3 |
| Grammar Language | 9.00 | 9.00 | 8.00 | **8.67±0.58 ✅** | 3 |
| Sources References | 7.00 | 5.67 | 7.00 | **6.56±0.77** | 3 |
| Appendix Technical | 8.00 | 7.00 | 8.50 | **7.83±0.76** | 3 |
| Visual Layout | 8.67 | 8.33 | 8.33 | **8.44±0.20 ✅** | 3 |

**Overall mean: 7.36/10** (4/12 sections with 3-run mean ≥8)

---

### Farm

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.67 | 7.00 | 6.67 | **7.11±0.51** | 3 |
| Executive Summary | 8.33 | 7.50 | 8.33 | **8.05±0.48 ✅** | 3 |
| Brief Requirements | 8.67 | 8.00 | 8.67 | **8.45±0.39 ✅** | 3 |
| Design Modules | 6.67 | 7.00 | 6.33 | **6.67±0.34** | 3 |
| Bom | 4.67 | 5.00 | 4.67 | **4.78±0.19** | 3 |
| Cost Analysis | 7.00 | 7.00 | 7.00 | **7.00±0.00** | 3 |
| Sourcing Strategy | 7.00 | 6.50 | 6.33 | **6.61±0.35** | 3 |
| Feasibility Notes | 8.00 | 8.00 | 8.00 | **8.00±0.00 ✅** | 3 |
| Grammar Language | 7.67 | 6.50 | 7.67 | **7.28±0.68** | 3 |
| Sources References | 6.67 | 6.50 | 5.67 | **6.28±0.54** | 3 |
| Appendix Technical | 9.00 | 5.00 | 9.00 | **7.67±2.31** | 3 |
| Visual Layout | 8.67 | 7.50 | 8.33 | **8.17±0.60 ✅** | 3 |

**Overall mean: 7.17/10** (4/12 sections with 3-run mean ≥8)

---

### HAPS

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 6.67 | 6.00 | 6.33 | **6.33±0.34** | 3 |
| Executive Summary | 8.33 | 7.67 | 7.67 | **7.89±0.38** | 3 |
| Brief Requirements | 9.00 | 8.33 | 9.00 | **8.78±0.39 ✅** | 3 |
| Design Modules | 7.33 | 6.67 | 7.00 | **7.00±0.33** | 3 |
| Bom | 5.67 | 5.00 | 4.67 | **5.11±0.51** | 3 |
| Cost Analysis | 6.67 | 5.67 | 7.00 | **6.45±0.69** | 3 |
| Sourcing Strategy | 7.33 | 6.33 | 6.33 | **6.66±0.58** | 3 |
| Feasibility Notes | 8.67 | 8.00 | 8.00 | **8.22±0.39 ✅** | 3 |
| Grammar Language | 8.50 | 7.33 | 7.33 | **7.72±0.68** | 3 |
| Sources References | 9.50 | 7.00 | 5.67 | **7.39±1.94** | 3 |
| Appendix Technical | 9.50 | 8.00 | 8.50 | **8.67±0.76 ✅** | 3 |
| Visual Layout | 7.67 | 8.00 | 8.33 | **8.00±0.33 ✅** | 3 |

**Overall mean: 7.35/10** (4/12 sections with 3-run mean ≥8)

---

### Heatpump

| Section | Run1 | Run2 | Run3 | **Mean ± Stddev** | **n** |
|---|---|---|---|---|---|
| Cover | 7.33 | 7.00 | — | **7.17±0.23** | 2 |
| Executive Summary | 8.33 | 7.67 | — | **8.00±0.47 ✅** | 2 |
| Brief Requirements | 8.67 | 9.00 | — | **8.84±0.23 ✅** | 2 |
| Design Modules | 7.33 | 7.67 | — | **7.50±0.24** | 2 |
| Bom | 5.00 | 4.67 | — | **4.83±0.23** | 2 |
| Cost Analysis | 6.67 | 7.00 | — | **6.83±0.23** | 2 |
| Sourcing Strategy | 6.67 | 6.33 | — | **6.50±0.24** | 2 |
| Feasibility Notes | 8.00 | 8.00 | — | **8.00±0.00 ✅** | 2 |
| Grammar Language | 8.50 | 9.00 | — | **8.75±0.35 ✅** | 2 |
| Sources References | 7.33 | 7.00 | — | **7.17±0.23** | 2 |
| Appendix Technical | 8.00 | 7.50 | — | **7.75±0.35** | 2 |
| Visual Layout | 8.33 | 8.67 | — | **8.50±0.24 ✅** | 2 |

**Overall mean: 7.49/10** (5/12 sections with 3-run mean ≥8)

---

## Heatmap (3-run mean)

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | ~7.6 | ✅8.3 | ✅8.7 | ~7.2 | ❌5.2 | ~6.2 | ~6.3 | ~7.6 | ~6.9 | ~6.9 | ~7.3 | ✅8.2 |
| bess | ~7.6 | ✅8.1 | ✅9.1 | ✅8.4 | ❌5.9 | ~7.2 | ~7.2 | ✅8.9 | ✅9.0 | ~7.7 | ✅8.5 | ✅8.4 |
| bioreactor | ~7.2 | ✅8.3 | ✅8.4 | ~6.9 | ❌5.2 | ~6.3 | ❌5.7 | ~7.6 | ✅8.2 | ~6.7 | ~7.2 | ✅8.1 |
| cgm | ~7.2 | ✅8.1 | ✅8.4 | ❌5.8 | ❌5.5 | ~6.2 | ❌4.1 | ~7.8 | ~7.7 | ~6.3 | ✅8.7 | ~7.9 |
| drone | ~7.0 | ✅8.3 | ✅8.7 | ❌5.8 | ❌5.0 | ~6.8 | ~6.2 | ~7.7 | ✅8.1 | ~6.7 | ✅8.8 | ✅8.2 |
| edge-ai | ~7.4 | ~7.8 | ✅8.2 | ❌5.3 | ❌4.6 | ~6.9 | ❌5.9 | ✅8.0 | ~6.3 | ~6.8 | ~7.0 | ✅8.2 |
| ev-charger | ~7.4 | ~7.9 | ✅8.4 | ~6.9 | ❌4.2 | ~7.2 | ~6.3 | ✅8.4 | ✅8.7 | ~6.6 | ~7.8 | ✅8.4 |
| farm | ~7.1 | ✅8.1 | ✅8.4 | ~6.7 | ❌4.8 | ~7.0 | ~6.6 | ✅8.0 | ~7.3 | ~6.3 | ~7.7 | ✅8.2 |
| haps | ~6.3 | ~7.9 | ✅8.8 | ~7.0 | ❌5.1 | ~6.4 | ~6.7 | ✅8.2 | ~7.7 | ~7.4 | ✅8.7 | ✅8.0 |
| heatpump | ~7.2 | ✅8.0 | ✅8.8 | ~7.5 | ❌4.8 | ~6.8 | ~6.5 | ✅8.0 | ✅8.8 | ~7.2 | ~7.8 | ✅8.5 |

## Stddev heatmap (across 3 runs)

Higher stddev = less reliable cell.

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | 0.10 | 0.75 | 0.25 | 0.76 | 0.44 | 0.29 | 0.58 | 0.51 | 0.63 | 0.48 | 1.61 | 0.19 |
| bess | 0.10 | 0.48 | 0.19 | 0.96 | 1.02 | 0.29 | 0.19 | 0.19 | 0.00 | 0.34 | 1.73 | 0.39 |
| bioreactor | 0.39 | 0.00 | 0.20 | 0.19 | 0.29 | 0.67 | 0.25 | 0.51 | 0.48 | 0.29 | 0.29 | 0.19 |
| cgm | 0.29 | 0.48 | 0.39 | 0.60 | 0.87 | 0.44 | 1.17 | 0.19 | 1.04 | 0.54 | 0.58 | 0.42 |
| drone | 0.95 | 0.94 | 0.47 | 0.71 | 0.00 | 0.35 | 0.71 | 0.47 | 0.59 | 0.47 | 1.06 | 0.23 |
| edge-ai | 0.35 | 0.44 | 0.39 | 0.68 | 0.51 | 0.92 | 0.77 | 0.00 | 1.20 | 0.48 | 2.65 | 0.60 |
| ev-charger | 0.39 | 0.38 | 0.20 | 0.51 | 0.77 | 0.29 | 0.88 | 0.51 | 0.58 | 0.77 | 0.76 | 0.20 |
| farm | 0.51 | 0.48 | 0.39 | 0.34 | 0.19 | 0.00 | 0.35 | 0.00 | 0.68 | 0.54 | 2.31 | 0.60 |
| haps | 0.34 | 0.38 | 0.39 | 0.33 | 0.51 | 0.69 | 0.58 | 0.39 | 0.68 | 1.94 | 0.76 | 0.33 |
| heatpump | 0.23 | 0.47 | 0.23 | 0.24 | 0.23 | 0.23 | 0.24 | 0.00 | 0.35 | 0.23 | 0.35 | 0.24 |

---

## Summary

| Metric | V10 ITER3 (3-run mean) |
|---|---|
| Cells with 3-run mean ≥8 | 42 / 120 (35%) |
| Total scored runs aggregated | 3 |

## Per-class average (sorted)

| Rank | Class | Mean avg | Sections ≥8 |
|---|---|---|---|
| 1 | BESS | **8.00/10** | 7/12 |
| 2 | Heatpump | **7.49/10** | 5/12 |
| 3 | EV-Charger | **7.36/10** | 4/12 |
| 4 | HAPS | **7.35/10** | 4/12 |
| 5 | Drone | **7.26/10** | 5/12 |
| 6 | AUV | **7.20/10** | 3/12 |
| 7 | Farm | **7.17/10** | 4/12 |
| 8 | Bioreactor | **7.15/10** | 4/12 |
| 9 | CGM | **6.97/10** | 3/12 |
| 10 | Edge-AI | **6.87/10** | 3/12 |

---

_Generated by `/tmp/v10-aggregate-runs.py`_