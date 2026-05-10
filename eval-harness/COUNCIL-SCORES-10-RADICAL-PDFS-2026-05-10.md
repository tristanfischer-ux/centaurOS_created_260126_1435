# Multimodal Council Scores — 10 Radical Phase 5 PDFs

**Date:** 2026-05-10  
**Shadow batch:** `radical-shadow-20260510T1918`  
**Council models:** `google/gemini-2.5-pro-preview` · `anthropic/claude-opus-4-7` · `qwen/qwen3-vl-235b-a22b-instruct`  
**Methodology:** 150 DPI PNG conversion via `pdftoppm`; 3-LLM multimodal scoring per PDF; outlier calibration (drop score ≥3 below other two); mean of calibrated valid scores per cell.

---

## Per-class section scores matrix

Scores are calibrated means across up to 3 judges. `—` = section absent from PDF.

### AUV (6 pages, 11 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 6 | 7 | 8 | **7.00** |
| executive_summary | 4 | 6 | 7 | **5.67** |
| brief_requirements | — | — | 6 | **6.00** |
| design_modules | 4 | 6 | 9 | **7.50** |
| bom | 4 | 7 | 8 | **7.50** |
| cost_analysis | 8 | 8 | 9 | **8.33** ✅ |
| sourcing_strategy | — | — | 7 | **7.00** |
| feasibility_notes | 7 | 7 | 6 | **6.67** |
| grammar_language | 9 | 7 | 8 | **8.00** ✅ |
| sources_references | — | — | 7 | **7.00** |
| appendix_technical | — | — | — | **—** |
| visual_layout | 6 | 8 | 8 | **7.33** |

**Overall average: 7.09/10** (2/11 sections ≥8)

---

### BESS (10 pages, 12 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 9 | 7 | 8 | **8.00** ✅ |
| executive_summary | 6 | 6 | 7 | **6.33** |
| brief_requirements | 4 | — | 6 | **5.00** |
| design_modules | 8 | 7 | 9 | **8.00** ✅ |
| bom | 9 | 6 | 9 | **9.00** ✅ |
| cost_analysis | 10 | 7 | 8 | **8.33** ✅ |
| sourcing_strategy | 6 | — | 7 | **6.50** |
| feasibility_notes | 9 | 6 | 6 | **7.00** |
| grammar_language | 9 | 7 | 9 | **8.33** ✅ |
| sources_references | 5 | — | 8 | **8.00** ✅ |
| appendix_technical | 6 | 6 | — | **6.00** |
| visual_layout | 9 | 8 | 8 | **8.33** ✅ |

**Overall average: 7.40/10** (7/12 sections ≥8)

---

### Bioreactor (8 pages, 11 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 8 | 6 | 8 | **7.33** |
| executive_summary | 5 | — | 7 | **6.00** |
| brief_requirements | 2 | — | 6 | **6.00** |
| design_modules | 6 | 6 | 9 | **7.00** |
| bom | 8 | 6 | 9 | **7.67** |
| cost_analysis | 9 | 7 | 8 | **8.00** ✅ |
| sourcing_strategy | 6 | — | 7 | **6.50** |
| feasibility_notes | 2 | — | 6 | **6.00** |
| grammar_language | 8 | 7 | 10 | **8.33** ✅ |
| sources_references | — | — | 8 | **8.00** ✅ |
| appendix_technical | — | — | — | **—** |
| visual_layout | 9 | 8 | 8 | **8.33** ✅ |

**Overall average: 7.20/10** (4/11 sections ≥8)

---

### CGM (5 pages, 11 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 9 | 7 | 8 | **8.00** ✅ |
| executive_summary | 5 | 6 | 7 | **6.00** |
| brief_requirements | 2 | — | — | **2.00** |
| design_modules | 3 | 5 | 9 | **7.00** |
| bom | 6 | 6 | 9 | **7.00** |
| cost_analysis | 9 | 7 | 8 | **8.00** ✅ |
| sourcing_strategy | 5 | — | 7 | **6.00** |
| feasibility_notes | 4 | 5 | 6 | **5.00** |
| grammar_language | 3 | 7 | 10 | **8.50** ✅ |
| sources_references | — | — | 7 | **7.00** |
| appendix_technical | — | — | — | **—** |
| visual_layout | 9 | 7 | 8 | **8.00** ✅ |

**Overall average: 6.59/10** (4/11 sections ≥8)

---

### Drone (7 pages, 12 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 8 | 7 | 8 | **7.67** |
| executive_summary | 6 | 6 | 7 | **6.33** |
| brief_requirements | 5 | 4 | 9 | **7.00** |
| design_modules | 7 | 6 | 8 | **7.00** |
| bom | 9 | 7 | 9 | **8.33** ✅ |
| cost_analysis | 9 | 7 | 9 | **8.33** ✅ |
| sourcing_strategy | 6 | — | 7 | **6.50** |
| feasibility_notes | — | 5 | 6 | **5.50** |
| grammar_language | 7 | 8 | 10 | **8.33** ✅ |
| sources_references | — | 6 | 8 | **7.00** |
| appendix_technical | — | — | 5 | **5.00** |
| visual_layout | 9 | 8 | 8 | **8.33** ✅ |

**Overall average: 7.11/10** (4/12 sections ≥8)

---

### Edge-AI (6 pages, 12 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 7 | 7 | 8 | **7.33** |
| executive_summary | — | 6 | 9 | **9.00** ✅ |
| brief_requirements | — | — | 7 | **7.00** |
| design_modules | 5 | 6 | 9 | **6.67** |
| bom | 4 | 6 | 10 | **8.00** ✅ |
| cost_analysis | 7 | 7 | 10 | **8.00** ✅ |
| sourcing_strategy | — | — | 8 | **8.00** ✅ |
| feasibility_notes | — | — | 7 | **7.00** |
| grammar_language | 6 | 7 | 10 | **7.67** |
| sources_references | — | — | 9 | **9.00** ✅ |
| appendix_technical | — | — | 6 | **6.00** |
| visual_layout | 9 | 7 | 8 | **8.00** ✅ |

**Overall average: 7.64/10** (6/12 sections ≥8)

---

### EV-Charger (9 pages, 11 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 8 | 7 | 8 | **7.67** |
| executive_summary | 7 | 6 | 9 | **7.33** |
| brief_requirements | — | — | 7 | **7.00** |
| design_modules | 6 | 7 | 8 | **7.00** |
| bom | 5 | 7 | 9 | **8.00** ✅ |
| cost_analysis | 6 | 8 | 10 | **9.00** ✅ |
| sourcing_strategy | 4 | — | 7 | **7.00** |
| feasibility_notes | 4 | 6 | 6 | **5.33** |
| grammar_language | 9 | 7 | 10 | **8.67** ✅ |
| sources_references | — | — | 8 | **8.00** ✅ |
| appendix_technical | — | — | — | **—** |
| visual_layout | 9 | 7 | 8 | **8.00** ✅ |

**Overall average: 7.55/10** (5/11 sections ≥8)

---

### Farm (9 pages, 10 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 8 | 6 | 8 | **7.33** |
| executive_summary | 7 | 6 | 7 | **6.67** |
| brief_requirements | — | — | — | **—** |
| design_modules | 6 | 7 | 9 | **7.33** |
| bom | 6 | 7 | 9 | **7.33** |
| cost_analysis | 8 | 7 | 10 | **8.33** ✅ |
| sourcing_strategy | 4 | — | 7 | **7.00** |
| feasibility_notes | 3 | 5 | 6 | **4.67** |
| grammar_language | 7 | 7 | 10 | **8.00** ✅ |
| sources_references | — | 6 | 8 | **7.00** |
| appendix_technical | — | — | — | **—** |
| visual_layout | 7 | 7 | 9 | **7.67** |

**Overall average: 7.13/10** (2/10 sections ≥8)

---

### HAPS (6 pages, 11 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 8 | 6 | 8 | **7.33** |
| executive_summary | 6 | 5 | 9 | **6.67** |
| brief_requirements | 3 | — | 7 | **7.00** |
| design_modules | 7 | 5 | 8 | **6.67** |
| bom | 9 | 5 | 9 | **9.00** ✅ |
| cost_analysis | 9 | 6 | 9 | **9.00** ✅ |
| sourcing_strategy | 7 | — | 7 | **7.00** |
| feasibility_notes | 6 | 6 | 6 | **6.00** |
| grammar_language | 8 | 7 | 10 | **8.33** ✅ |
| sources_references | — | — | 8 | **8.00** ✅ |
| appendix_technical | — | — | — | **—** |
| visual_layout | 9 | 7 | 8 | **8.00** ✅ |

**Overall average: 7.55/10** (5/11 sections ≥8)

---

### Heatpump (9 pages, 12 sections)

| Section | Gemini | Claude | Qwen | **Mean** |
|---|---|---|---|---|
| cover | 8 | 6 | 8 | **7.33** |
| executive_summary | 6 | 6 | 7 | **6.33** |
| brief_requirements | — | — | 6 | **6.00** |
| design_modules | 7 | 7 | 9 | **7.67** |
| bom | 6 | 6 | 9 | **7.00** |
| cost_analysis | 8 | 7 | 8 | **7.67** |
| sourcing_strategy | — | — | 7 | **7.00** |
| feasibility_notes | 8 | 5 | 6 | **6.33** |
| grammar_language | 9 | 7 | 9 | **8.33** ✅ |
| sources_references | — | — | 8 | **8.00** ✅ |
| appendix_technical | — | 6 | — | **6.00** |
| visual_layout | 6 | 7 | 8 | **7.00** |

**Overall average: 7.05/10** (2/12 sections ≥8)

---

## Overall 120-cell heatmap

Rows = product class · Columns = 12 canonical sections · Cell = mean score (calibrated).  
**✅ ≥8** · **~ 6–7.9** · **❌ <6** · **—** = section absent.

| Class | cover | exec_sum | brief_req | design_mod | bom | cost | sourcing | feasibility | grammar | sources | appendix | visual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| auv | ~7.0 | ❌5.7 | ~6.0 | ~7.5 | ~7.5 | ✅8.3 | ~7.0 | ~6.7 | ✅8.0 | ~7.0 | — | ~7.3 |
| bess | ✅8.0 | ~6.3 | ❌5.0 | ✅8.0 | ✅9.0 | ✅8.3 | ~6.5 | ~7.0 | ✅8.3 | ✅8.0 | ~6.0 | ✅8.3 |
| bioreactor | ~7.3 | ~6.0 | ~6.0 | ~7.0 | ~7.7 | ✅8.0 | ~6.5 | ~6.0 | ✅8.3 | ✅8.0 | — | ✅8.3 |
| cgm | ✅8.0 | ~6.0 | ❌2.0 | ~7.0 | ~7.0 | ✅8.0 | ~6.0 | ❌5.0 | ✅8.5 | ~7.0 | — | ✅8.0 |
| drone | ~7.7 | ~6.3 | ~7.0 | ~7.0 | ✅8.3 | ✅8.3 | ~6.5 | ❌5.5 | ✅8.3 | ~7.0 | ❌5.0 | ✅8.3 |
| edge-ai | ~7.3 | ✅9.0 | ~7.0 | ~6.7 | ✅8.0 | ✅8.0 | ✅8.0 | ~7.0 | ~7.7 | ✅9.0 | ~6.0 | ✅8.0 |
| ev-charger | ~7.7 | ~7.3 | ~7.0 | ~7.0 | ✅8.0 | ✅9.0 | ~7.0 | ❌5.3 | ✅8.7 | ✅8.0 | — | ✅8.0 |
| farm | ~7.3 | ~6.7 | — | ~7.3 | ~7.3 | ✅8.3 | ~7.0 | ❌4.7 | ✅8.0 | ~7.0 | — | ~7.7 |
| haps | ~7.3 | ~6.7 | ~7.0 | ~6.7 | ✅9.0 | ✅9.0 | ~7.0 | ~6.0 | ✅8.3 | ✅8.0 | — | ✅8.0 |
| heatpump | ~7.3 | ~6.3 | ~6.0 | ~7.7 | ~7.0 | ~7.7 | ~7.0 | ~6.3 | ✅8.3 | ✅8.0 | ~6.0 | ~7.0 |

---

## Sections that need targeted fixes

Sorted by greatest opportunity (most cells <8):

### 1. `feasibility_notes` — 10/10 classes score <8 (avg ~5.9)

Universally the weakest section. Every PDF's feasibility section reduces to either "BOM over budget" or automated grammar-engine rule outputs. No PDF contains a genuine risk register, technical feasibility assessment, regulatory check, or mitigation plan.

**Common weakness across all classes:** The feasibility section is a pass-through of automated checks ("Voltage Derating: Not Applicable"), not an engineering assessment. It provides no actionable intelligence.

**Recommended fix:** Add a structured Feasibility Assessment template with mandatory fields: (1) cost-vs-ceiling status + reduction path, (2) top 3 technical risks with severity/likelihood, (3) regulatory flags (CE, FCC, UL, etc.), (4) manufacturing feasibility (tooling, MOQ, lead time risks). Fill these from the engineering modules already generated — no new LLM call needed.

---

### 2. `executive_summary` — 9/10 classes score <8 (avg ~6.4)

Every executive summary is a metadata table or a single sentence. No PDF produces a narrative paragraph that synthesises what the product is, what the brief found, and what the key risks are. Models consistently flag "no risk or timeline summary" and "no narrative context".

**Common weakness:** Summary = cost table only. Decision-maker has no context for what the product does or why it matters.

**Recommended fix:** Enforce a 3-paragraph executive summary template: (1) product description + target market, (2) design outcome (budget verdict, key BOM gaps, top risk), (3) next-step recommendation. Write this last in the pipeline, after all sections exist. Use the brief + cost analysis + feasibility outputs as inputs.

---

### 3. `brief_requirements` — 9/10 classes score <8 (avg ~6.1)

Present in most PDFs but either: (a) a single subtitle line, (b) generic statements without measurable KPIs, or (c) completely absent (Farm). CGM scored 2.0 — subsystems like "Heat Pump" and "Hydronic Circuit" appeared for a glucose monitor, indicating a cross-contamination or hallucination bug.

**Common weakness:** No quantified performance targets, no regulatory standards cited, no traceability to test cases.

**Recommended fix:** (1) Fix the subsystem hallucination bug (CGM/Drone both got heat pump subsystems — wrong template or brief confusion). (2) Add a requirements table enforcing: functional spec, performance KPI, environmental standard, regulatory standard, for each top-level requirement.

---

### 4. `design_modules` — 9/10 classes score <8 (avg ~7.1)

All PDFs list subsystems as bullet points only. No PDF contains a block diagram, functional description, or interface definition. Judges flagged implausible subsystem choices: CGM and Drone both received "Heat Pump / Hydronic Circuit" modules — a likely template bleed.

**Common weakness:** Subsystem list = names only. No architecture diagram, no functional decomposition, no interface matrix.

**Recommended fix:** (1) Fix template/brief bleed bug (CGM/Drone getting heat pump modules). (2) Add a system block diagram (even a simple ASCII or Mermaid diagram would lift scores). (3) Add one-sentence functional description per module.

---

### 5. `sourcing_strategy` — 9/10 classes score <8 (avg ~6.9)

Present in all PDFs but consistently thin: supplier names listed inline in the BOM, no narrative, no lead time data, no dual-sourcing plan, no supply chain risk discussion.

**Common weakness:** "Strategy" = BOM source column only. No risk mitigation, no backup suppliers, no MOQ/lead time discussion.

**Recommended fix:** Add a Sourcing Strategy section that auto-generates from the BOM: top 3 suppliers by spend, any single-source risks, lead time estimates from distributor data, Grade D vs verified source split. A half-page structured table would lift this from 6.5→8+.

---

### 6. `cover` — 8/10 classes score <8 (avg ~7.5)

Close to 8 already — the gap is visual. All covers are text/metadata tables with no product image, render, or branding element. All judges flagged "no product image or visual identity".

**Common weakness:** Cover = title + metadata table. No product visual, no company branding, no visual hierarchy.

**Recommended fix:** Add a product hero image or render (even a placeholder AI-generated image or schematic sketch) to every cover. Add author/revision metadata. This is a quick win — one image per PDF, no new engineering content needed.

---

## Per-class average (sorted highest to lowest)

| Rank | Product class | Overall avg | Sections present | Sections ≥8 |
|---|---|---|---|---|
| 1 | Edge-AI | **7.64/10** | 12 | 6/12 |
| 2 | HAPS | **7.55/10** | 11 | 5/11 |
| 2 | EV-Charger | **7.55/10** | 11 | 5/11 |
| 4 | BESS | **7.40/10** | 12 | 7/12 |
| 5 | Bioreactor | **7.20/10** | 11 | 4/11 |
| 6 | Farm | **7.13/10** | 10 | 2/10 |
| 7 | Drone | **7.11/10** | 12 | 4/12 |
| 8 | AUV | **7.09/10** | 11 | 2/11 |
| 9 | Heatpump | **7.05/10** | 12 | 2/12 |
| 10 | CGM | **6.59/10** | 11 | 4/11 |

**Best:** Edge-AI at 7.64 — strongest because sourcing, executive summary, and sources sections scored well (Qwen consistently rated these higher). 12/12 sections present.

**Worst:** CGM at 6.59 — pulled down by the brief_requirements section scoring 2.0 (only 1 judge gave a score, flagging "Critical requirements like accuracy, biocompatibility, and regulatory standards are completely missing") and the implausible subsystem choices (heat pump for a glucose monitor).

---

## Verdict

**41 cells at ≥8 / 113 total present cells = 36%**

7 cells are missing entirely (appendix_technical or brief_requirements absent in several classes).

The 120-cell theoretical maximum reduces to 113 observable cells (7 missing sections across 10 PDFs). Of those 113, only 41 (36%) reach the 8/10 target.

The 8/10 target is **not yet reached in any product class**. BESS comes closest with 7/12 sections at ≥8. The structural floor is that `feasibility_notes`, `executive_summary`, `brief_requirements`, `design_modules`, and `sourcing_strategy` are weak across all classes — together these 5 sections account for 47 of the 72 under-8 cells (65%).

---

## Common weaknesses across all 10 classes

1. **No diagrams anywhere** — all 10 PDFs are text and tables only. Judges consistently flagged the absence of block diagrams, schematics, renders, or product images across every section that could use them.
2. **Feasibility is automated check pass-through** — not engineering analysis. Ten for ten.
3. **Executive summary is a metadata table** — not a narrative. Nine for ten.
4. **BOM incompleteness** — TBD entries, Grade D estimates, and implausible or missing components in every PDF. The BOM is the upstream driver of both cost credibility and sourcing quality.
5. **Template cross-contamination** — CGM and Drone received "Heat Pump / Hydronic Circuit" subsystems, which are clearly from another product class. This is likely a bug in the brief→module mapping step.
6. **Text overlap artefact** — all judges noted overlapping legend text on the BOM page. Cosmetic but consistent.
7. **Grammar section naming confusion** — calling the design rule checker "Grammar Engine" is flagged by every judge as jargon. Rename to "Design Rule Check" or "Engineering Validation".

---

## What to fix FIRST in the next iteration

**Priority 1 — fix the template cross-contamination bug.** CGM and Drone receiving heat pump/hydronic subsystems is a correctness failure, not a quality issue. It pulls CGM to 6.59 (worst class) and masks real drone architecture quality. Locate and fix the brief→subsystem mapping logic before running another iteration.

**Priority 2 — add a real Feasibility Assessment section.** 10/10 classes fail this. This is the highest-leverage single section fix. It requires no new LLM calls — synthesise from brief + BOM + cost sections already generated. A structured 4-field template (cost verdict, top 3 risks, regulatory flags, manufacturing flags) would likely lift all 10 classes from ~5.5→7.5+ on this section.

**Priority 3 — add a 3-paragraph Executive Summary.** 9/10 classes fail this. Write it last in the pipeline using the completed sections as input. Template: product description / design outcome / next-step recommendation.

**Priority 4 — fix BOM completeness.** The BOM is the upstream driver of cost_analysis, sourcing_strategy, and feasibility credibility. More complete BOMs (fewer TBD entries, real MPNs, Grade A/B over Grade D) would lift at least 5 downstream section scores.

Fixing Priority 1–3 alone — without touching the BOM — would plausibly push cells at ≥8 from 41/113 (36%) to approximately 65–70/113 (58–62%), based on the pattern that feasibility + executive_summary alone account for 19 of the 72 under-8 cells.
