# Anvil cross-pack comparison — FE front MGU vs benchtop bioreactor

**Date:** 2026-08-06  
**Packs compared:**

| | Formula E front MGU | Benchtop bioreactor |
|---|---|---|
| Twin | `formula-e-front-mgu-20260729-1432` | `organoid-9drive-r11-allfixes` |
| Pack | `…/20260805-2049-V1.299-…-design-pack` | `…/20260806-0632-V1.16-…-design-pack` |
| Zip size | ~279 MB | ~112 MB |
| Files (approx) | ~141 | ~165 |
| Tab floor (scorecard) | **0** (fails: Exec, Calc, Q&A, Checks, Drawings) | **9** all scored tabs pass |
| ship_ok | false (honest dual-bar fail) | false on cover; engine gate can show PASS while PCB fab axis still open |

Different **outcomes** are expected: FE is a traction power unit with Path-B EM failure against a binding duty bar; bioreactor is a ml-scale instrument after manufacturer adversarial clean-up. The question is which **pack features** should be universal for the next project.

---

## 1. Side-by-side feature inventory

| Feature | FE | Bioreactor | Who wins |
|---|---|---|---|
| Live `dossier.xlsx` | Yes (~51 MB) | Yes (~21 MB) | Draw (FE heavier evidence) |
| Cover PDF + HTML + click index | Yes | Yes | Draw |
| **Illustrated cover** (embedded figures, multi-MB HTML) | **Yes** (~13 MB illustrated HTML, ~8.7 MB PDF) | Thin PDF (~12 KB text) | **FE** |
| **Numeric gate story on cover** (dual torque bars, what fails) | **Yes** | Soft product story only | **FE** |
| **Torque / physics legend** (terms defined for non-specialists) | **Yes** | Partial (physics paragraph) | **FE** |
| **Partner / next-evidence asks** on cover | **Yes** (dyno, planetary, Gerbers) | Open items list | **FE** (more operational) |
| README-FIRST / FOLDER-GUIDE | **Yes** | No | **FE** |
| Scorecards in pack (`tab-scorecard`, `quality-scorecard`) | **Yes** | No (live in workbook only) | **FE** |
| Domain evidence folder | **`electromagnetics/`** (50+ one-pagers, fieldplots, PDFs) | Correctly **absent** | **FE** for motors; **Bio** for honesty of omission |
| **Multiphysics/** screens | **Yes** (thermal, stress, Ross) | No | **FE** for machines with screens |
| Renders hero + service | Yes | Yes | Draw |
| **Multi-angle ghost shell** | Sparse (hero/ghost/exploded) | **Rich** (front/side/back/top/front ghosts) | **Bioreactor** |
| **Exploded product render** | **Yes** (`13-product-exploded`) | No | **FE** |
| GA + interconnect drawings | Yes | Yes | Draw |
| **GA detail sections / interfaces** | **Yes** | No | **FE** |
| **Single-line electrical drawing** | **Yes** (plant/power path) | N/A instrument | Conditional |
| PCB multi-board + fab zip | Yes | Yes (3 boards) | Draw |
| **PCB grade card + fab package index** | **Yes** | Boards only | **FE** |
| **3d-model/** GLB+USDZ+view.html | No | **Yes** | **Bioreactor** |
| **Firmware bring-up folder** | No in pack | **Yes** (honest virtual-only ceiling) | **Bioreactor** |
| **Manufacturer adversarial review in pack** | No | **Yes** | **Bioreactor** |
| Council synthesis JSON in pack | No | **Yes** | **Bioreactor** |
| Cost honesty (materials vs mark-up) | Weak on cover | **Strong** on cover | **Bioreactor** |
| Catalogue identity discipline | Mixed | **Post-adversarial cleaned** | **Bioreactor** (process) |
| Tab floor 9 | **No** | **Yes** | **Bioreactor** |

---

## 2. Best features — should / could the other pack have them?

### From Formula E → should bioreactor (and every pack) have?

| Feature | Should bio have it? | Could it? | Notes |
|---|---|---|---|
| Illustrated cover with key figures inlined | **Yes** | **Yes** | Hero, ghost, GA, one physics card — not FE torque bars |
| **Domain physics one-pagers** folder | **Yes, under another name** | **Yes** | Not EM — e.g. `physics/` or `instrument-physics/`: thermal loop, OD path, agitation shear, sterile barrier map |
| Dual-bar / **gate outcome** on cover | **Yes** | **Yes** | e.g. materials band vs ceiling; 37 °C band; tab floor — one binding fail named |
| Term legend for non-specialists | **Yes** | **Yes** | OD600, HEPES, kla, working volume, ship_ok |
| Partner / executable next evidence | **Yes** | **Yes** | Already open items; promote to ranked partner asks |
| README-FIRST + FOLDER-GUIDE | **Yes** | **Yes** | Trivial universal pack stage |
| Scorecards shipped in pack | **Yes** | **Yes** | Copy tab + quality scorecard JSON |
| Exploded render | **Yes** | **Yes** if Blender pass exists | Capability-conditional |
| GA detail / section / interfaces | **Yes** | **Yes** | Share FE drawing detail stage |
| PCB grade card + fab index | **Yes** | **Yes** | Same PCB readiness contract |
| Multiphysics folder | **Only if screens exist** | Conditional | Thermal TEC stack, not Ross rotordynamics |
| Single-line electrical | **No** (fluid-less instrument) | N/A | Verified out-of-scope is correct |

### From bioreactor → should FE (and every pack) have?

| Feature | Should FE have it? | Could it? | Notes |
|---|---|---|---|
| Tab floor ≥9 before send | **Yes** | **Yes** | FE currently ships with floor 0 — **must** close or stay DRAFT-named |
| Manufacturer / domain expert adversarial review in pack | **Yes** | **Yes** | e.g. traction OEM / dyno house red-team, not only EM one-pagers |
| Council synthesis artefact in pack | **Yes** | **Yes** | Already run for FE discipline; ship a customer-safe summary |
| Cost story: materials vs mark-up | **Yes** | **Yes** | FE BoM vs kit cost ceilings need same clarity as bio |
| 3d-model GLB/USDZ + viewer | **Yes** | **Yes** | FE has Blender; missing from pack layout |
| Multi-view ghost set | **Yes** | **Yes** | FE has fewer product views than bio |
| Firmware folder when MCU boards exist | **Yes** | **Yes** | FE has traction control / gate drive — virtual bring-up belongs in pack |
| Honest `ship_ok=false` on cover with binding reason | Already has | Keep | Bio should not drift back to ship_ok theatre |
| Catalogue function-class audit | **Yes** | **Yes** | Universal module already landed |

---

## 3. Capability matrix (what is universal vs conditional)

```
ALWAYS (every Anvil send pack)
  dossier.xlsx
  MANIFEST.txt + README-FIRST.txt + FOLDER-GUIDE.txt
  00-COVER-NARRATIVE.{md,html,pdf} + CLICK-INDEX  (illustrated when renders exist)
  Cover: config block, decision summary, gate outcome, open items, term legend, ten-minute route
  tab-scorecard.json + quality-scorecard.json (customer copy)
  renders/ (hero + required product views)
  drawings/ (GA minimum)
  adversarial-or-council summary when a review was run

WHEN capability electromagnetics
  electromagnetics/ (one-pagers + fieldplots + verdict)

WHEN capability multiphysics_screens
  multiphysics/

WHEN capability pcb
  pcb/ + grade card + fab package index + (optional) firmware/

WHEN capability instrument_or_product_shell
  multi-ghost views; optional 3d-model/

WHEN capability plant_electrical_tree
  single-line drawing

NEVER invent
  EM fieldplots for non-motor products
  plant LCOE on instruments
  ship_ok=true over binding fail or empty HIL
```

---

## 4. Implementation plan (universal — next project benefits)

### P0 — Pack navigation parity (1–2 days)

1. **`build_pack_cover` stage always emits**  
   `README-FIRST.txt`, `FOLDER-GUIDE.txt`, copy of scorecards into pack root.  
2. **Cover contract v2** (both packs):  
   - config block  
   - **gate outcome** (binding metric + pass/fail)  
   - **term legend** (class-specific terms injected from a registry)  
   - open items / partner asks  
   - illustrated HTML when hero + 2–4 key figures exist  
3. **Dual-class smoke** asserts presence of README-FIRST + scorecards + cover set.

*FE gains:* nothing new structurally (already strong); *Bio gains:* FE-level navigability.  
*Next project:* free.

### P1 — Domain physics pack interface (3–5 days)

4. Generalise FE “jack EM one-pagers” into **`domain_evidence/` capability**:  
   - Motors → `electromagnetics/` (current)  
   - Instruments → `instrument-physics/` (thermal, optics, fluid barrier, agitation)  
   - Plants → `process-physics/` (optional later)  
5. Shared **one-pager renderer API**: title, claim, number, assumption, non-claim, next evidence.  
6. Bioreactor: generate 4–6 instrument-physics one-pagers from existing tools (thermal, OD path, stir, sterile vent).  
7. FE: keep electromagnetics; add **adversarial/council one-pager** like bio.

### P2 — Visual & drawing parity (3–5 days)

8. **Render view contract**: require exploded when `has_assembly_stack`; multi-ghost for sealed instruments; FE already has exploded — bio add when Blender supports.  
9. **GA detail stage** (FE `ga-detail-*`) invoked for all product-scale packs.  
10. **3d-model export** into pack for any twin with shell meshes (FE missing today).  
11. **Firmware folder** for any PCB-bearing pack with MCU (FE missing today).

### P3 — Quality bar parity (ongoing)

12. **`ANVIL_TAB_FLOOR=9`** for send packs (bio already there; **FE must remediate or stay DRAFT-named**).  
13. **Mandatory domain-expert adversarial pass** before customer zip (template from bio manufacturer review).  
14. Catalogue function-class + instrument topology rules already universal — keep green on both packs.

### P4 — Cross-pollination sprints (concrete)

| Sprint | Target | Work |
|---|---|---|
| A | Bio pack | P0 navigation + illustrated cover + scorecards + instrument-physics one-pagers |
| B | FE pack | Tab floor → ≥9 or honest DRAFT; 3d-model + firmware in zip; adversarial summary; fix cover paths still saying `em-honesty/` in prose |
| C | Pipeline | Single `scripts/lib/build_send_pack.py` orchestrating layout schema + cover v2 + capability folders |
| D | Next project | Only capability flags + brief — pack features come free |

---

## 5. Risks if we do nothing

- Next instrument pack will look “thin” next to FE (no physics one-pagers, weak cover PDF).  
- Next motor pack may again ship **floor 0** with a beautiful EM folder — impresses then fails audit.  
- Two house styles forever: FE = evidence theatre, Bio = honesty + tab floor — customers get inconsistent Anvil.

---

## 6. Success criteria for “universal great packs”

For **any** new twin after this plan:

1. Unzip → `README-FIRST` → cover PDF with **gate outcome + legend + open items**.  
2. Folder layout matches `pack_layout` schema; no forbidden path names.  
3. Domain evidence present **iff** capability true; never invented.  
4. Tab floor ≥9 **or** filename contains DRAFT and cover says why.  
5. PCB / firmware / multiphysics / 3d-model appear by capability, not by project nickname.  
6. Dual-class smoke (motor fixture + instrument fixture) green in CI.

---

## 7. Recommended first move

Implement **P0 + FE cover prose fix (`electromagnetics/` not `em-honesty/`)** immediately, then **Sprint A (bio instrument-physics one-pagers)** and **Sprint B (FE floor-9 or DRAFT + 3d/firmware in pack)** in parallel.

---

## 8. Execution status (2026-08-06)

| Item | Status |
|---|---|
| P0 `build_send_pack.py` (README-FIRST, FOLDER-GUIDE, scorecards, 3d, firmware, em-honesty rewrite) | **Done** — hooked into excel bundle |
| P0 FE cover prose → electromagnetics/ | **Done** (8 files rewritten on FE pack) |
| Sprint A instrument-physics one-pagers | **Done** on bio pack (`instrument-physics/`) |
| Sprint B FE 3d-model + firmware in pack | **Done** |
| Sprint B FE DRAFT tab-floor note | **Done** (removed once floor ≥9) |
| Dual-class chrome smoke | **Done** |
| FE full tab floor ≥9 remediation | **Done** — V1.300 pack, min tab 9.0, all_pass; ship_ok still false (PCB/HIL/homologation) |
| Illustrated multi-MB cover for bio | **Done** — `00-COVER-NARRATIVE-illustrated.html` + figure PDF via universal `build_pack_cover` v2 |
| `ANVIL_TAB_FLOOR=9` send-pack gate | **Done** — `build_send_pack` default floor 9; DRAFT note when below; `ANVIL_TAB_FLOOR_ENFORCE=1` hard block |
| FE domain adversarial in pack | **Done** — `ADVERSARIAL-DOMAIN-REVIEW.md` + council synthesis |

*End of plan.*
