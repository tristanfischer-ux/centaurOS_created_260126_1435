# Multimodal Council Scores — V2 Radical Phase 5 PDFs

**Date:** 2026-05-10  
**Shadow batch:** `radical-shadow-20260511T0632`  
**Council models:** `google/gemini-2.5-pro-preview` · `anthropic/claude-opus-4-7` · `qwen/qwen3-vl-235b-a22b-instruct`  
**Methodology:** 150 DPI PNG conversion via `pdftoppm`; 3-LLM multimodal scoring per PDF; outlier calibration (drop score ≥3 below other two); mean of calibrated valid scores per cell.  
**Changes scored:** P1 template cross-contamination fix, P2 Feasibility Assessment section, P3 Executive Summary section, DRC rename, BOM legend fix.

---

### AUV

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | -0.0 |
| Executive Summary | 8 | 5 | 8 | **8.00** ✅ | — |
| Brief Requirements | 8 | 8 | 8 | **8.00** ✅ | — |
| Design Modules | 2 | 2 | 4 | **2.67** | — |
| Bom | 2 | 3 | 6 | **3.67** | -1.3 |
| Cost Analysis | 2 | 5 | 8 | **6.50** | — |
| Sourcing Strategy | 4 | 4 | 6 | **4.67** | — |
| Feasibility Notes | 4 | 5 | 6 | **5.00** | — |
| Grammar Language | 2 | 2 | 4 | **2.67** | — |
| Sources References | 2 | 5 | 2 | **3.00** | — |
| Appendix Technical | 2 | 6 | 0 | **4.00** | — |
| Visual Layout | 10 | 6 | 8 | **9.00** ✅ | — |

**Overall average: 5.32/10** (3/12 sections ≥8)

---

### BESS

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 7 | 8 | **7.67** | -0.0 |
| Executive Summary | 10 | 7 | 8 | **8.33** ✅ | — |
| Brief Requirements | 10 | 9 | 9 | **9.33** ✅ | — |
| Design Modules | 6 | 9 | 7 | **7.33** | — |
| Bom | 2 | 7 | 6 | **6.50** | +1.2 |
| Cost Analysis | 0 | 8 | 7 | **7.50** | — |
| Sourcing Strategy | 8 | 8 | 5 | **8.00** ✅ | — |
| Feasibility Notes | 6 | 8 | 6 | **6.67** | — |
| Grammar Language | 10 | 8 | 6 | **9.00** ✅ | — |
| Sources References | 8 | 7 | 8 | **7.67** | — |
| Appendix Technical | 8 | 9 | 4 | **8.50** ✅ | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 7.90/10** (6/12 sections ≥8)

---

### Bioreactor

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | +0.0 |
| Executive Summary | 10 | 6 | 8 | **9.00** ✅ | — |
| Brief Requirements | 10 | 7 | 7 | **8.00** ✅ | — |
| Design Modules | 2 | 2 | 4 | **2.67** | — |
| Bom | 2 | 3 | 6 | **3.67** | -0.0 |
| Cost Analysis | 2 | 4 | 7 | **5.50** | — |
| Sourcing Strategy | 4 | 5 | 7 | **5.33** | — |
| Feasibility Notes | 4 | 5 | 6 | **5.00** | — |
| Grammar Language | 2 | 2 | 4 | **2.67** | — |
| Sources References | 2 | 5 | 6 | **5.50** | — |
| Appendix Technical | 2 | 5 | 0 | **3.50** | — |
| Visual Layout | 10 | 6 | 8 | **9.00** ✅ | — |

**Overall average: 5.60/10** (3/12 sections ≥8)

---

### CGM

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | -0.6 |
| Executive Summary | 8 | 7 | 8 | **7.67** | — |
| Brief Requirements | 10 | 8 | 9 | **9.00** ✅ | — |
| Design Modules | 2 | 2 | 2 | **2.00** | — |
| Bom | 4 | 3 | 6 | **4.33** | +0.0 |
| Cost Analysis | 4 | 5 | 8 | **5.67** | — |
| Sourcing Strategy | 2 | 4 | 6 | **5.00** | — |
| Feasibility Notes | 6 | 5 | 6 | **5.67** | — |
| Grammar Language | 2 | 2 | 2 | **2.00** | — |
| Sources References | 6 | 5 | 7 | **6.00** | — |
| Appendix Technical | 0 | 5 | 0 | **1.67** | — |
| Visual Layout | 10 | 6 | 8 | **9.00** ✅ | — |

**Overall average: 5.39/10** (2/12 sections ≥8)

---

### Drone

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | -1.0 |
| Executive Summary | 8 | 6 | 8 | **7.33** | — |
| Brief Requirements | 6 | 8 | 8 | **7.33** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 2 | 4 | 6 | **5.00** | 0 |
| Cost Analysis | 4 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | 8 | 6 | 8 | **7.33** | — |
| Feasibility Notes | 6 | 6 | 6 | **6.00** | — |
| Grammar Language | 2 | 3 | 2 | **2.33** | — |
| Sources References | 6 | 6 | 6 | **6.00** | — |
| Appendix Technical | 2 | 6 | — | **4.00** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 5.85/10** (1/12 sections ≥8)

---

### Edge-AI

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | — | 6 | 8 | **7.00** | -0.3 |
| Executive Summary | — | 6 | 8 | **7.00** | — |
| Brief Requirements | — | 8 | 8 | **8.00** ✅ | — |
| Design Modules | — | 3 | 4 | **3.50** | — |
| Bom | — | 3 | 6 | **4.50** | -0.5 |
| Cost Analysis | — | 5 | 8 | **6.50** | — |
| Sourcing Strategy | — | 4 | 6 | **5.00** | — |
| Feasibility Notes | — | 6 | 6 | **6.00** | — |
| Grammar Language | — | 4 | 4 | **4.00** | — |
| Sources References | — | 6 | 2 | **4.00** | — |
| Appendix Technical | — | 6 | 0 | **3.00** | — |
| Visual Layout | — | 6 | 8 | **7.00** | — |

**Overall average: 5.46/10** (1/12 sections ≥8)

---

### EV-Charger

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 7 | 8 | **7.00** | -0.7 |
| Executive Summary | 8 | 7 | 8 | **7.67** | — |
| Brief Requirements | 10 | 8 | 8 | **8.67** ✅ | — |
| Design Modules | 4 | 6 | 4 | **4.67** | — |
| Bom | 2 | 4 | 4 | **3.33** | +0.0 |
| Cost Analysis | 2 | 7 | 6 | **6.50** | — |
| Sourcing Strategy | 6 | 6 | 8 | **6.67** | — |
| Feasibility Notes | 8 | 8 | 6 | **7.33** | — |
| Grammar Language | 4 | 7 | 4 | **5.00** | — |
| Sources References | 2 | 6 | 2 | **3.33** | — |
| Appendix Technical | 2 | 7 | 0 | **4.50** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 6.08/10** (2/12 sections ≥8)

---

### Farm

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | +0.0 |
| Executive Summary | 10 | 6 | 8 | **9.00** ✅ | — |
| Brief Requirements | 8 | 8 | 8 | **8.00** ✅ | — |
| Design Modules | 6 | 4 | 4 | **4.67** | — |
| Bom | 2 | 5 | 6 | **5.50** | 0 |
| Cost Analysis | 4 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | 8 | 7 | 8 | **7.67** | — |
| Feasibility Notes | 6 | 7 | 6 | **6.33** | — |
| Grammar Language | 10 | 5 | 4 | **7.50** | — |
| Sources References | 2 | 6 | 6 | **6.00** | — |
| Appendix Technical | 2 | 7 | — | **4.50** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 6.86/10** (3/12 sections ≥8)

---

### HAPS

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 6 | **6.00** | 0 |
| Executive Summary | 8 | 6 | 8 | **7.33** | — |
| Brief Requirements | 10 | 7 | 8 | **8.33** ✅ | — |
| Design Modules | 2 | 2 | 2 | **2.00** | — |
| Bom | 4 | 3 | 6 | **4.33** | +0.0 |
| Cost Analysis | 2 | 4 | 8 | **6.00** | — |
| Sourcing Strategy | 6 | 5 | 8 | **6.33** | — |
| Feasibility Notes | 4 | 5 | 6 | **5.00** | — |
| Grammar Language | 2 | 2 | 2 | **2.00** | — |
| Sources References | 2 | 6 | 8 | **7.00** | — |
| Appendix Technical | 2 | 6 | 0 | **4.00** | — |
| Visual Layout | 10 | 6 | 8 | **9.00** ✅ | — |

**Overall average: 5.61/10** (2/12 sections ≥8)

---

### Heatpump

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | -1.0 |
| Executive Summary | 8 | 7 | 8 | **7.67** | — |
| Brief Requirements | 10 | 8 | 8 | **8.67** ✅ | — |
| Design Modules | 6 | 5 | 6 | **5.67** | — |
| Bom | 2 | 5 | 6 | **5.50** | -1.0 |
| Cost Analysis | 4 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | 6 | 7 | 8 | **7.00** | — |
| Feasibility Notes | 4 | 7 | 6 | **5.67** | — |
| Grammar Language | 8 | 5 | 6 | **6.33** | — |
| Sources References | 2 | 6 | 6 | **6.00** | — |
| Appendix Technical | 0 | 7 | 0 | **3.50** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 6.54/10** (2/12 sections ≥8)

---

## Overall V2 heatmap

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | ~6.7 | ✅8.0 | ✅8.0 | ❌2.7 | ❌3.7 | ~6.5 | ❌4.7 | ❌5.0 | ❌2.7 | ❌3.0 | ❌4.0 | ✅9.0 |
| bess | ~7.7 | ✅8.3 | ✅9.3 | ~7.3 | ~6.5 | ~7.5 | ✅8.0 | ~6.7 | ✅9.0 | ~7.7 | ✅8.5 | ✅8.3 |
| bioreactor | ~7.3 | ✅9.0 | ✅8.0 | ❌2.7 | ❌3.7 | ❌5.5 | ❌5.3 | ❌5.0 | ❌2.7 | ❌5.5 | ❌3.5 | ✅9.0 |
| cgm | ~6.7 | ~7.7 | ✅9.0 | ❌2.0 | ❌4.3 | ❌5.7 | ❌5.0 | ❌5.7 | ❌2.0 | ~6.0 | ❌1.7 | ✅9.0 |
| drone | ~6.7 | ~7.3 | ~7.3 | ❌2.3 | ❌5.0 | ~7.5 | ~7.3 | ~6.0 | ❌2.3 | ~6.0 | ❌4.0 | ✅8.3 |
| edge-ai | ~7.0 | ~7.0 | ✅8.0 | ❌3.5 | ❌4.5 | ~6.5 | ❌5.0 | ~6.0 | ❌4.0 | ❌4.0 | ❌3.0 | ~7.0 |
| ev-charger | ~7.0 | ~7.7 | ✅8.7 | ❌4.7 | ❌3.3 | ~6.5 | ~6.7 | ~7.3 | ❌5.0 | ❌3.3 | ❌4.5 | ✅8.3 |
| farm | ~7.3 | ✅9.0 | ✅8.0 | ❌4.7 | ❌5.5 | ~7.5 | ~7.7 | ~6.3 | ~7.5 | ~6.0 | ❌4.5 | ✅8.3 |
| haps | ~6.0 | ~7.3 | ✅8.3 | ❌2.0 | ❌4.3 | ~6.0 | ~6.3 | ❌5.0 | ❌2.0 | ~7.0 | ❌4.0 | ✅9.0 |
| heatpump | ~6.7 | ~7.7 | ✅8.7 | ❌5.7 | ❌5.5 | ~7.5 | ~7.0 | ❌5.7 | ~6.3 | ~6.0 | ❌3.5 | ✅8.3 |

---

## V1 → V2 Progress Summary

| Metric | V1 (commit `6d013046`) | V2 (commit `cfc877df`) | Delta |
|---|---|---|---|
| Cells ≥8/10 | 41/113 (36%) | 25/120 (20%) | -16 cells |
| Target (≥65/113) | ❌ | ❌ | — |

## Per-class average (V2, sorted highest to lowest)

| Rank | Product class | V2 avg | V1 avg | Delta | Sections ≥8 |
|---|---|---|---|---|---|
| 1 | BESS | **7.90/10** | — | — | 6/12 |
| 2 | Farm | **6.86/10** | — | — | 3/12 |
| 3 | Heatpump | **6.54/10** | — | — | 2/12 |
| 4 | EV-Charger | **6.08/10** | — | — | 2/12 |
| 5 | Drone | **5.85/10** | — | — | 1/12 |
| 6 | HAPS | **5.61/10** | — | — | 2/12 |
| 7 | Bioreactor | **5.60/10** | — | — | 3/12 |
| 8 | Edge-AI | **5.46/10** | — | — | 1/12 |
| 9 | CGM | **5.39/10** | — | — | 2/12 |
| 10 | AUV | **5.32/10** | — | — | 3/12 |

---

_Generated by `scripts/score-radical-pdfs-multimodal.py`_