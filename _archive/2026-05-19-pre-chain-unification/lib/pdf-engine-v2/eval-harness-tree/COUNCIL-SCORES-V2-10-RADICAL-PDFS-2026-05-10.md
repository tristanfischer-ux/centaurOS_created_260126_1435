# Multimodal Council Scores — V2 Radical Phase 5 PDFs

**Date:** 2026-05-10  
**Shadow batch:** `radical-shadow-20260510T2147`  
**Council models:** `google/gemini-2.5-pro-preview` · `anthropic/claude-opus-4-7` · `qwen/qwen3-vl-235b-a22b-instruct`  
**Methodology:** 150 DPI PNG conversion via `pdftoppm`; 3-LLM multimodal scoring per PDF; outlier calibration (drop score ≥3 below other two); mean of calibrated valid scores per cell.  
**Changes scored:** P1 template cross-contamination fix, P2 Feasibility Assessment section, P3 Executive Summary section, DRC rename, BOM legend fix.

---

### AUV

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 7 | 8 | **7.67** | +0.7 |
| Executive Summary | 4 | 5 | 6 | **5.00** | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 2 | 5 | 6 | **5.50** | -2.0 |
| Cost Analysis | 4 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | 2 | 3 | 4 | **3.00** | — |
| Feasibility Notes | 4 | 6 | 6 | **5.33** | — |
| Grammar Language | 2 | 3 | 2 | **2.33** | — |
| Sources References | — | 0 | 0 | **0.00** | — |
| Appendix Technical | 2 | 4 | 0 | **3.00** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 4.42/10** (1/12 sections ≥8)

---

### BESS

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 7 | 8 | **7.00** | -1.0 |
| Executive Summary | 4 | 6 | 8 | **7.00** | — |
| Brief Requirements | 2 | 4 | 4 | **3.33** | — |
| Design Modules | 6 | 8 | 8 | **7.33** | — |
| Bom | 4 | 6 | 6 | **5.33** | -3.7 |
| Cost Analysis | 2 | 8 | 8 | **8.00** ✅ | — |
| Sourcing Strategy | 4 | 4 | 4 | **4.00** | — |
| Feasibility Notes | 8 | 8 | 6 | **7.33** | — |
| Grammar Language | 10 | 8 | 8 | **8.67** ✅ | — |
| Sources References | 0 | — | 2 | **1.00** | — |
| Appendix Technical | 6 | 7 | 2 | **6.50** | — |
| Visual Layout | 10 | 8 | 8 | **8.67** ✅ | — |

**Overall average: 6.18/10** (3/12 sections ≥8)

---

### Bioreactor

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | +0.0 |
| Executive Summary | 2 | 5 | 6 | **5.50** | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 4 | 3 | 2 | **3.00** | — |
| Bom | 2 | 4 | 6 | **5.00** | -2.7 |
| Cost Analysis | 4 | 6 | 8 | **7.00** | — |
| Sourcing Strategy | 2 | 3 | 4 | **3.00** | — |
| Feasibility Notes | 4 | 5 | 6 | **5.00** | — |
| Grammar Language | 2 | 3 | 2 | **2.33** | — |
| Sources References | — | 0 | 0 | **0.00** | — |
| Appendix Technical | — | 4 | 0 | **2.00** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 4.29/10** (1/12 sections ≥8)

---

### CGM

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 7 | 8 | **7.67** | -0.3 |
| Executive Summary | 6 | 5 | 8 | **6.33** | — |
| Brief Requirements | 0 | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 1 | 2 | **1.67** | — |
| Bom | 4 | 3 | 6 | **4.33** | -2.7 |
| Cost Analysis | 4 | 6 | 8 | **7.00** | — |
| Sourcing Strategy | 0 | 3 | 4 | **3.50** | — |
| Feasibility Notes | 6 | 5 | 8 | **6.33** | — |
| Grammar Language | 2 | 2 | 2 | **2.00** | — |
| Sources References | 0 | 1 | 2 | **1.00** | — |
| Appendix Technical | 0 | 4 | 2 | **3.00** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 4.51/10** (1/12 sections ≥8)

---

### Drone

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | -1.0 |
| Executive Summary | 8 | 5 | 8 | **8.00** ✅ | — |
| Brief Requirements | — | 2 | 6 | **4.00** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 2 | 3 | 6 | **3.67** | -4.6 |
| Cost Analysis | 2 | 6 | 8 | **7.00** | — |
| Sourcing Strategy | 2 | 4 | 6 | **5.00** | — |
| Feasibility Notes | 4 | 5 | 8 | **5.67** | — |
| Grammar Language | 2 | 3 | 2 | **2.33** | — |
| Sources References | 0 | — | 4 | **2.00** | — |
| Appendix Technical | 2 | 4 | 4 | **3.33** | — |
| Visual Layout | 8 | 7 | 8 | **7.67** | — |

**Overall average: 4.81/10** (1/12 sections ≥8)

---

### Edge-AI

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | +0.0 |
| Executive Summary | 4 | 4 | 8 | **5.33** | — |
| Brief Requirements | 0 | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 3 | 4 | **3.00** | — |
| Bom | 2 | 4 | 6 | **5.00** | -3.0 |
| Cost Analysis | 4 | 6 | 8 | **7.00** | — |
| Sourcing Strategy | 0 | 3 | 6 | **4.50** | — |
| Feasibility Notes | 6 | 6 | 8 | **6.67** | — |
| Grammar Language | 2 | 4 | 6 | **5.00** | — |
| Sources References | 0 | — | 2 | **1.00** | — |
| Appendix Technical | 2 | 5 | 4 | **3.67** | — |
| Visual Layout | 8 | 7 | 8 | **7.67** | — |

**Overall average: 4.93/10** (0/12 sections ≥8)

---

### EV-Charger

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | -0.4 |
| Executive Summary | 8 | 5 | 8 | **8.00** ✅ | — |
| Brief Requirements | 2 | 3 | 6 | **3.67** | — |
| Design Modules | 4 | 6 | 6 | **5.33** | — |
| Bom | 2 | 4 | 4 | **3.33** | -4.7 |
| Cost Analysis | 2 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | 2 | 3 | 4 | **3.00** | — |
| Feasibility Notes | 6 | 7 | 8 | **7.00** | — |
| Grammar Language | 8 | 6 | 6 | **6.67** | — |
| Sources References | 0 | 1 | 2 | **1.00** | — |
| Appendix Technical | 2 | 4 | 2 | **2.67** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 5.32/10** (2/12 sections ≥8)

---

### Farm

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | +0.0 |
| Executive Summary | 6 | 6 | 8 | **6.67** | — |
| Brief Requirements | — | — | 4 | **4.00** | — |
| Design Modules | 6 | 6 | 4 | **5.33** | — |
| Bom | 6 | 6 | 6 | **6.00** | -1.3 |
| Cost Analysis | 4 | 8 | 8 | **8.00** ✅ | — |
| Sourcing Strategy | 2 | 4 | 6 | **5.00** | — |
| Feasibility Notes | 8 | 7 | 8 | **7.67** | — |
| Grammar Language | 8 | 7 | 4 | **7.50** | — |
| Sources References | 0 | — | 2 | **1.00** | — |
| Appendix Technical | 2 | 6 | 2 | **3.33** | — |
| Visual Layout | 8 | 7 | 8 | **7.67** | — |

**Overall average: 5.79/10** (1/12 sections ≥8)

---

### HAPS

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | -0.6 |
| Executive Summary | 4 | 4 | 8 | **5.33** | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 2 | 4 | 6 | **5.00** | -4.0 |
| Cost Analysis | 2 | 5 | 8 | **6.50** | — |
| Sourcing Strategy | 2 | 3 | 4 | **3.00** | — |
| Feasibility Notes | 4 | 5 | 6 | **5.00** | — |
| Grammar Language | 2 | 3 | 2 | **2.33** | — |
| Sources References | 0 | 0 | 0 | **0.00** | — |
| Appendix Technical | 2 | 3 | 0 | **1.67** | — |
| Visual Layout | 8 | 6 | 8 | **7.33** | — |

**Overall average: 4.01/10** (0/12 sections ≥8)

---

### Heatpump

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 7 | 8 | **7.67** | +0.4 |
| Executive Summary | 10 | 6 | 8 | **9.00** ✅ | — |
| Brief Requirements | 0 | 3 | 4 | **3.50** | — |
| Design Modules | 4 | 5 | 6 | **5.00** | — |
| Bom | 2 | 5 | 6 | **5.50** | -1.5 |
| Cost Analysis | 2 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | 4 | 4 | 6 | **4.67** | — |
| Feasibility Notes | 4 | 7 | 8 | **7.50** | — |
| Grammar Language | 10 | 5 | 8 | **9.00** ✅ | — |
| Sources References | 0 | 2 | 2 | **1.33** | — |
| Appendix Technical | 0 | 5 | 4 | **4.50** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 6.12/10** (3/12 sections ≥8)

---

## Overall V2 heatmap

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | ~7.7 | ❌5.0 | ❌3.0 | ❌2.3 | ❌5.5 | ~7.5 | ❌3.0 | ❌5.3 | ❌2.3 | ❌0.0 | ❌3.0 | ✅8.3 |
| bess | ~7.0 | ~7.0 | ❌3.3 | ~7.3 | ❌5.3 | ✅8.0 | ❌4.0 | ~7.3 | ✅8.7 | ❌1.0 | ~6.5 | ✅8.7 |
| bioreactor | ~7.3 | ❌5.5 | ❌3.0 | ❌3.0 | ❌5.0 | ~7.0 | ❌3.0 | ❌5.0 | ❌2.3 | ❌0.0 | ❌2.0 | ✅8.3 |
| cgm | ~7.7 | ~6.3 | ❌3.0 | ❌1.7 | ❌4.3 | ~7.0 | ❌3.5 | ~6.3 | ❌2.0 | ❌1.0 | ❌3.0 | ✅8.3 |
| drone | ~6.7 | ✅8.0 | ❌4.0 | ❌2.3 | ❌3.7 | ~7.0 | ❌5.0 | ❌5.7 | ❌2.3 | ❌2.0 | ❌3.3 | ~7.7 |
| edge-ai | ~7.3 | ❌5.3 | ❌3.0 | ❌3.0 | ❌5.0 | ~7.0 | ❌4.5 | ~6.7 | ❌5.0 | ❌1.0 | ❌3.7 | ~7.7 |
| ev-charger | ~7.3 | ✅8.0 | ❌3.7 | ❌5.3 | ❌3.3 | ~7.5 | ❌3.0 | ~7.0 | ~6.7 | ❌1.0 | ❌2.7 | ✅8.3 |
| farm | ~7.3 | ~6.7 | ❌4.0 | ❌5.3 | ~6.0 | ✅8.0 | ❌5.0 | ~7.7 | ~7.5 | ❌1.0 | ❌3.3 | ~7.7 |
| haps | ~6.7 | ❌5.3 | ❌3.0 | ❌2.3 | ❌5.0 | ~6.5 | ❌3.0 | ❌5.0 | ❌2.3 | ❌0.0 | ❌1.7 | ~7.3 |
| heatpump | ~7.7 | ✅9.0 | ❌3.5 | ❌5.0 | ❌5.5 | ~7.5 | ❌4.7 | ~7.5 | ✅9.0 | ❌1.3 | ❌4.5 | ✅8.3 |

---

## V1 → V2 Progress Summary

| Metric | V1 (commit `6d013046`) | V2 (commit `cfc877df`) | Delta |
|---|---|---|---|
| Cells ≥8/10 | 41/113 (36%) | 13/120 (10%) | -28 cells |
| Target (≥65/113) | ❌ | ❌ | — |

## Per-class average (V2, sorted highest to lowest)

| Rank | Product class | V2 avg | V1 avg | Delta | Sections ≥8 |
|---|---|---|---|---|---|
| 1 | BESS | **6.18/10** | — | — | 3/12 |
| 2 | Heatpump | **6.12/10** | — | — | 3/12 |
| 3 | Farm | **5.79/10** | — | — | 1/12 |
| 4 | EV-Charger | **5.32/10** | — | — | 2/12 |
| 5 | Edge-AI | **4.93/10** | — | — | 0/12 |
| 6 | Drone | **4.81/10** | — | — | 1/12 |
| 7 | CGM | **4.51/10** | — | — | 1/12 |
| 8 | AUV | **4.42/10** | — | — | 1/12 |
| 9 | Bioreactor | **4.29/10** | — | — | 1/12 |
| 10 | HAPS | **4.01/10** | — | — | 0/12 |

---

_Generated by `scripts/score-radical-pdfs-multimodal.py`_