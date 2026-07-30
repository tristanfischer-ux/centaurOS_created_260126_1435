# Formula E Front Powertrain Kit — Half-Done Closure Plan (plain language)

**Twin folder:** `out/formula-e-front-mgu-20260729-1432/`  
**Latest workbook:** `20260730-0952-V1.80-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx`  
**Rule:** Prefer full words over abbreviations. When a short form is unavoidable, expand it on first use.  
**Standing practice:** Parallel sub-agents with **Grok 4.5** (morphology / continuity) and **GPT-5.6 Sol** (PCB / council); keep extract loops alive via `fe-front-autonomous-ensure.sh`.

---

## 0. Status update — 2026-07-30 ~09:55 UTC+1

### Verdict

**Bar A concept floor is working:** Executive Summary **9**, Quality & Audit score **9** with ship **FAIL**, Verification **4 FAIL** (six HARD OPEN race holds — honest). PCB channel counts now **match required** (gate 6/6, desat 6/6, phase 3/3, bucks 3/3, isolation 1/1) as draft topology — still **NOT_FAB**, supplier Gerbers OPEN, placement overlap residual (U2 vs U6). Blender Phase N2 densified vs public EDU benchmarks (routes **0→4**; exterior detail **3→5**). **`ship_ok` false. Homologation NOT_HOMOLOGATED.**

**Council v5 (OpenRouter live):** unanimous **REJECT** — but its PCB channel fatals were **stale** (ran before `ccd35d2b8`). Re-attack should cite post-channel state + placement overlap + Bar B holds.

### What landed this block

| Work | Result | Commit / path |
|---|---|---|
| Bar A concept floor | ES/QA mirrors exclude race HARD opens | `d8f77c6c6` |
| PCB draft channels | All required counts implemented as draft; NOT_FAB | `ccd35d2b8` |
| Blender EDU Phase N2 | HV family, cast cues, PE density, 4 routes, ghost | `7f2eb943b` |
| Council v5 | OpenRouter OK; Sol/GLM/Kimi **REJECT** (stale PCB channels) | `_redteam_v5/` |
| Literature | Claims ~18k+; full-text pending ~51 and draining | loops alive |

### Live Excel (selected)

| Score | Tab |
|---|---|
| **4 FAIL** | Verification (HARD open 6 — Bar B) |
| **9 FAIL** | Quality & Audit (does not ship; concept floor 9) |
| **9 PASS** | ES, PCB draft, Drawings, GA, Renders |
| **10** | Overview, Brief, Calculations, Cost, Connection, … |

### Blender vs public EDU (after N2)

| Axis | Score |
|---|---|
| Packaging concept | **7/10** |
| Exterior detail | **5/10** |
| Interior cutaway | **5/10** |
| Fab / STEP | **1/10** |
| `route-audit.routes` | **4** |

Write-up: `_sight/blender-vs-public-edu-benchmark-2026-07-30.md`

---

## 0.1 Bar B = hardware only (unchanged)

Cannot close in software: HIL, supplier Gerbers, dyno, CFD/bench cold-plate, FIA port XYZ. Do not mint `ship_ok`.

---

## 1. Glossary

| Short form | Full meaning |
|---|---|
| **Bar A** | Concept dossier quality closable without race hardware |
| **Bar B** | Race / homologation — hardware or supplier artefacts |
| **Open-access papers** | Legal free full text — not piracy |
| **Hardware-in-the-loop** | Real control board vs simulated plant |

---

## 2. Literature

| Step | Status | Verdict |
|---|---|---|
| Open full-text downloads pending | 0 | **Good** |
| Full texts still missing claims | ~51 (draining) | **In progress** |
| Abstract extract | loop alive | **In progress** |
| Leaves wired | 207/207 | **Good** |
| Claims in DB | ~18k+ | **Good volume** |

---

## 3. Formulas / engines

| Thing | Have | Verdict |
|---|---|---|
| Calculator packs | 16/16 | **Good** |
| CoolProp / fluids / ht | live | **Good** |
| Literature snippets runnable | selective only | **Policy OK** |

---

## 4. Geometry / BoM / Blender / PCB

| Layer | Have | Verdict |
|---|---|---|
| Bill concept lines | ~147 | **Good concept band** |
| Topology named | 17/17 | **Good checklist** |
| Blender routes drawn | **4** | **Improved; not full harness** |
| PCB channels vs required | **match (draft)** | **Good draft / Bad fab** |
| PCB placement | U2 vs U6 overlap residual | **Weak** |
| Supplier Gerbers / HIL | OPEN / absent | **Bar B OPEN** |

---

## 5. Scoreboard

| Area | Have | Bar A | Bar B | Verdict |
|---|---|---|---|---|
| Concept floor / ES | 9 | ≥9 | n/a | **Good** |
| Verification | 4 FAIL | disclose | holds closed | **Honest** |
| PCB draft tab | 9 | ≥9 draft | fab+HIL | **Draft OK** |
| PCB channels | matched | match | HIL | **Draft matched** |
| Blender detail vs EDU photos | 5 | honest | photoreal CAD | **Better; still sculpture** |
| Ship / homologation | false / NOT_HOMOLOGATED | false | true only w/ hardware | **Correct** |

---

## 6. Work packages

| Package | Status | Residual |
|---|---|---|
| WP1 Literature | Mostly done | Drain ~51 full texts + abstracts |
| WP2 Physics engines | Done | Guard re-stamp |
| WP3 Calcs / Overview | Done | — |
| WP4 BoM concept | Done | Optional real MPNs |
| WP5 PCB | **Channels matched as draft** | Fix U2/U6 overlap; MPNs; keep NOT_FAB |
| WP6 Drawings / GA | Done | — |
| WP7 Honesty / Bar A floor | Done | Verification stays FAIL until Bar B |
| WP8 Council | v5 REJECT (stale PCB) | **v6 re-attack on V1.80** |
| WP9 Blender EDU | Phase N2 done | Optional denser LV connector + more routes |

---

## 7. Next steps (ordered)

1. **PCB placement** — clear U2 vs U6 body overlap; keep NOT_FAB.  
2. **Council v6** — fresh Sol/GLM/Kimi on post-channel + Phase N2 Blender twin.  
3. **Literature drain** — keep loops; re-wire if needed.  
4. **Optional Blender N3** — denser LV connector family; more phase-bus cues; Zoe-depth cutaway.  
5. **Bar B** — still hardware-only (HIL / Gerbers / dyno / CFD / FIA XYZ).

---

## 8. Stop conditions

| Goal | Stop when |
|---|---|
| **Bar A** | Concept tabs ≥9; ship false; Verification may FAIL on HARD race opens |
| **Bar B** | Only with real hardware/supplier artefacts |

---

## 9. Non-goals

- No piracy; no Lucid CAD paste; no `ship_ok` without hardware proofs.  
- No treating Excel Renders 9 or Gemini checklist as photoreal EDU.  
- No claiming FAB-READY while placement overlaps or supplier Gerbers absent.

---

## 10. Success metrics (live ~09:55)

| Metric | Target | Live |
|---|---|---|
| Concept floor / ES | ≥9 | **9** |
| Verification | honest HARD opens | **4 FAIL** |
| PCB channels | match required | **matched (draft)** |
| Blender exterior vs EDU | rising | **5/10** |
| Routes | >0 principal | **4** |
| Ship | false | **false** |

Executor: `scripts/fe-front-half-done-closure-loop.py`  
Ensure: `scripts/fe-front-autonomous-ensure.sh`  
Blender benchmark: `_sight/blender-vs-public-edu-benchmark-2026-07-30.md`  
Council: `_redteam_v5/merged.md` (stale on channels — schedule v6)
