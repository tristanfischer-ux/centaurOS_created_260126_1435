# Multimodal Council Scores — V3 CORRECTED Radical Phase 5 PDFs

**Date:** 2026-05-11  
**Shadow batch:** `radical-shadow-20260510T2316`  
**Council models:** `google/gemini-2.5-pro-preview` · `anthropic/claude-opus-4-7` · `qwen/qwen3-vl-235b-a22b-instruct`  
**Methodology:** 150 DPI PNG conversion via `pdftoppm`; 3-LLM multimodal scoring per PDF; outlier calibration (drop score ≥3 below other two); mean of calibrated valid scores per cell.  
**Changes scored:** Fix A sources_references restored + Fix B CGM contamination correct word routing.  
**Correction note:** Original V3 run (commit `c78d2b1b`) had ANTHROPIC_API_KEY missing from the process environment, causing all 120 Claude cells to silently return `—`. This corrected run re-scores the same 10 PDFs with all 3 judges active.

---

### AUV

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | — |
| Executive Summary | 4 | 5 | 8 | **5.67** | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 4 | 4 | 6 | **4.67** | — |
| Cost Analysis | 4 | 6 | 8 | **7.00** | — |
| Sourcing Strategy | — | 3 | 4 | **3.50** | — |
| Feasibility Notes | 6 | 6 | 8 | **6.67** | — |
| Grammar Language | 2 | 3 | 2 | **2.33** | — |
| Sources References | 4 | 5 | 6 | **5.00** | — |
| Appendix Technical | — | 4 | — | **4.00** | — |
| Visual Layout | 8 | 7 | 8 | **7.67** | — |

**Overall average: 4.88/10** (0/12 sections ≥8)

---

### BESS

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | — |
| Executive Summary | 8 | 5 | 8 | **8.00** ✅ | — |
| Brief Requirements | 0 | 3 | 4 | **3.50** | — |
| Design Modules | 6 | 8 | 8 | **7.33** | — |
| Bom | 4 | 6 | 6 | **5.33** | — |
| Cost Analysis | 2 | 8 | 8 | **8.00** ✅ | — |
| Sourcing Strategy | 0 | 4 | 4 | **4.00** | — |
| Feasibility Notes | 6 | 7 | 6 | **6.33** | — |
| Grammar Language | 10 | 8 | 8 | **8.67** ✅ | — |
| Sources References | 8 | 7 | 2 | **7.50** | — |
| Appendix Technical | 4 | 7 | 2 | **5.50** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 6.65/10** (4/12 sections ≥8)

---

### Bioreactor

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 7 | 8 | **7.67** | — |
| Executive Summary | 2 | 5 | 6 | **5.50** | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 2 | 4 | 6 | **5.00** | — |
| Cost Analysis | 2 | 6 | 8 | **7.00** | — |
| Sourcing Strategy | 2 | 3 | 6 | **3.67** | — |
| Feasibility Notes | 4 | 6 | 8 | **7.00** | — |
| Grammar Language | 2 | 3 | 2 | **2.33** | — |
| Sources References | 2 | 6 | 6 | **6.00** | — |
| Appendix Technical | 2 | 4 | 0 | **3.00** | — |
| Visual Layout | 8 | 7 | 8 | **7.67** | — |

**Overall average: 5.01/10** (0/12 sections ≥8)

---

### CGM

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | — |
| Executive Summary | 8 | 5 | 8 | **8.00** ✅ | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 2 | 2 | **2.00** | — |
| Bom | 2 | 3 | 6 | **3.67** | — |
| Cost Analysis | 4 | 4 | 8 | **5.33** | — |
| Sourcing Strategy | 4 | 3 | 6 | **4.33** | — |
| Feasibility Notes | 6 | 5 | 8 | **6.33** | — |
| Grammar Language | 2 | 2 | 2 | **2.00** | — |
| Sources References | 2 | 5 | 6 | **5.50** | — |
| Appendix Technical | 2 | 4 | 0 | **3.00** | — |
| Visual Layout | 8 | 6 | 8 | **7.33** | — |

**Overall average: 4.76/10** (1/12 sections ≥8)

---

### Drone

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | — |
| Executive Summary | 8 | 5 | 8 | **8.00** ✅ | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 4 | 3 | 6 | **4.33** | — |
| Cost Analysis | 4 | 6 | 8 | **7.00** | — |
| Sourcing Strategy | 2 | 3 | 4 | **3.00** | — |
| Feasibility Notes | 6 | 5 | 6 | **5.67** | — |
| Grammar Language | 2 | 2 | 2 | **2.00** | — |
| Sources References | 2 | 5 | 6 | **5.50** | — |
| Appendix Technical | 2 | 4 | — | **3.00** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 4.96/10** (2/12 sections ≥8)

---

### Edge-AI

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | — |
| Executive Summary | 4 | 4 | 8 | **5.33** | — |
| Brief Requirements | 2 | 2 | 4 | **2.67** | — |
| Design Modules | 2 | 3 | 4 | **3.00** | — |
| Bom | 2 | 3 | 6 | **3.67** | — |
| Cost Analysis | 2 | 5 | 8 | **6.50** | — |
| Sourcing Strategy | 0 | 3 | 6 | **4.50** | — |
| Feasibility Notes | 4 | 6 | 8 | **7.00** | — |
| Grammar Language | 2 | 5 | 6 | **5.50** | — |
| Sources References | 8 | 6 | 6 | **6.67** | — |
| Appendix Technical | 0 | 5 | 4 | **4.50** | — |
| Visual Layout | 8 | 6 | 8 | **7.33** | — |

**Overall average: 5.28/10** (0/12 sections ≥8)

---

### EV-Charger

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 6 | 8 | **6.67** | — |
| Executive Summary | 8 | 5 | 8 | **8.00** ✅ | — |
| Brief Requirements | 0 | 3 | 6 | **4.50** | — |
| Design Modules | 4 | 6 | 4 | **4.67** | — |
| Bom | 2 | 4 | 4 | **3.33** | — |
| Cost Analysis | 2 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | 2 | 3 | 6 | **3.67** | — |
| Feasibility Notes | 4 | 7 | 8 | **7.50** | — |
| Grammar Language | 6 | 6 | 4 | **5.33** | — |
| Sources References | 2 | 6 | 6 | **6.00** | — |
| Appendix Technical | — | 5 | 2 | **3.50** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 5.75/10** (2/12 sections ≥8)

---

### Farm

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 8 | 6 | 8 | **7.33** | — |
| Executive Summary | 6 | 5 | 7 | **6.00** | — |
| Brief Requirements | 0 | 3 | 4 | **3.50** | — |
| Design Modules | 6 | 6 | 5 | **5.67** | — |
| Bom | 2 | 6 | 6 | **6.00** | — |
| Cost Analysis | 2 | 7 | 8 | **7.50** | — |
| Sourcing Strategy | — | 4 | 5 | **4.50** | — |
| Feasibility Notes | 4 | 6 | 7 | **5.67** | — |
| Grammar Language | 4 | 7 | 6 | **5.67** | — |
| Sources References | 8 | 6 | 7 | **7.00** | — |
| Appendix Technical | 2 | 5 | 3 | **3.33** | — |
| Visual Layout | 10 | 7 | 8 | **8.33** ✅ | — |

**Overall average: 5.88/10** (1/12 sections ≥8)

---

### HAPS

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 5 | 6 | **5.67** | — |
| Executive Summary | 4 | 4 | 8 | **5.33** | — |
| Brief Requirements | — | 2 | 4 | **3.00** | — |
| Design Modules | 2 | 3 | 2 | **2.33** | — |
| Bom | 2 | 3 | 6 | **3.67** | — |
| Cost Analysis | 2 | 4 | 8 | **6.00** | — |
| Sourcing Strategy | 2 | 3 | 4 | **3.00** | — |
| Feasibility Notes | 4 | 5 | 8 | **5.67** | — |
| Grammar Language | 2 | 2 | 2 | **2.00** | — |
| Sources References | 2 | 5 | 6 | **5.50** | — |
| Appendix Technical | 2 | 4 | — | **3.00** | — |
| Visual Layout | 8 | 6 | 8 | **7.33** | — |

**Overall average: 4.38/10** (0/12 sections ≥8)

---

### Heatpump

| Section | Gemini | Claude | Qwen | **Mean** | **V1→V2** |
|---|---|---|---|---|---|
| Cover | 6 | 7 | 8 | **7.00** | — |
| Executive Summary | 4 | 5 | 8 | **5.67** | — |
| Brief Requirements | 0 | 3 | 6 | **4.50** | — |
| Design Modules | 4 | 7 | 8 | **7.50** | — |
| Bom | 2 | 6 | 6 | **6.00** | — |
| Cost Analysis | 4 | 8 | 8 | **8.00** ✅ | — |
| Sourcing Strategy | 0 | 4 | 6 | **5.00** | — |
| Feasibility Notes | 6 | 7 | 8 | **7.00** | — |
| Grammar Language | 6 | 8 | 8 | **7.33** | — |
| Sources References | 2 | 7 | 7 | **7.00** | — |
| Appendix Technical | 0 | 6 | 4 | **5.00** | — |
| Visual Layout | 8 | 8 | 8 | **8.00** ✅ | — |

**Overall average: 6.50/10** (2/12 sections ≥8)

---

## Overall V3 heatmap

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | ~6.7 | ❌5.7 | ❌3.0 | ❌2.3 | ❌4.7 | ~7.0 | ❌3.5 | ~6.7 | ❌2.3 | ❌5.0 | ❌4.0 | ~7.7 |
| bess | ~7.3 | ✅8.0 | ❌3.5 | ~7.3 | ❌5.3 | ✅8.0 | ❌4.0 | ~6.3 | ✅8.7 | ~7.5 | ❌5.5 | ✅8.3 |
| bioreactor | ~7.7 | ❌5.5 | ❌3.0 | ❌2.3 | ❌5.0 | ~7.0 | ❌3.7 | ~7.0 | ❌2.3 | ~6.0 | ❌3.0 | ~7.7 |
| cgm | ~6.7 | ✅8.0 | ❌3.0 | ❌2.0 | ❌3.7 | ❌5.3 | ❌4.3 | ~6.3 | ❌2.0 | ❌5.5 | ❌3.0 | ~7.3 |
| drone | ~7.3 | ✅8.0 | ❌3.0 | ❌2.3 | ❌4.3 | ~7.0 | ❌3.0 | ❌5.7 | ❌2.0 | ❌5.5 | ❌3.0 | ✅8.3 |
| edge-ai | ~6.7 | ❌5.3 | ❌2.7 | ❌3.0 | ❌3.7 | ~6.5 | ❌4.5 | ~7.0 | ❌5.5 | ~6.7 | ❌4.5 | ~7.3 |
| ev-charger | ~6.7 | ✅8.0 | ❌4.5 | ❌4.7 | ❌3.3 | ~7.5 | ❌3.7 | ~7.5 | ❌5.3 | ~6.0 | ❌3.5 | ✅8.3 |
| farm | ~7.3 | ~6.0 | ❌3.5 | ❌5.7 | ~6.0 | ~7.5 | ❌4.5 | ❌5.7 | ❌5.7 | ~7.0 | ❌3.3 | ✅8.3 |
| haps | ❌5.7 | ❌5.3 | ❌3.0 | ❌2.3 | ❌3.7 | ~6.0 | ❌3.0 | ❌5.7 | ❌2.0 | ❌5.5 | ❌3.0 | ~7.3 |
| heatpump | ~7.0 | ❌5.7 | ❌4.5 | ~7.5 | ~6.0 | ✅8.0 | ❌5.0 | ~7.0 | ~7.3 | ~7.0 | ❌5.0 | ✅8.0 |

---

## V1 → V3 Progress Summary

| Metric | V1 (commit `6d013046`) | V3 corrected (commit `7b36203c`) | Delta |
|---|---|---|---|
| Cells ≥8/10 | 41/113 (36%) | 12/120 (10%) | -29 cells |
| Target (≥65/113) | ❌ | ❌ | — |
| Note | 2-judge run | 3-judge run (Claude restored) | — |

## Per-class average (V3, sorted highest to lowest)

| Rank | Product class | V3 avg | V1 avg | Delta | Sections ≥8 |
|---|---|---|---|---|---|
| 1 | BESS | **6.65/10** | — | — | 4/12 |
| 2 | Heatpump | **6.50/10** | — | — | 2/12 |
| 3 | Farm | **5.88/10** | — | — | 1/12 |
| 4 | EV-Charger | **5.75/10** | — | — | 2/12 |
| 5 | Edge-AI | **5.28/10** | — | — | 0/12 |
| 6 | Bioreactor | **5.01/10** | — | — | 0/12 |
| 7 | Drone | **4.96/10** | — | — | 2/12 |
| 8 | AUV | **4.88/10** | — | — | 0/12 |
| 9 | CGM | **4.76/10** | — | — | 1/12 |
| 10 | HAPS | **4.38/10** | — | — | 0/12 |

---

_Generated by `scripts/score-radical-pdfs-multimodal.py`_