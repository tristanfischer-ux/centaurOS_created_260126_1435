# JLR FE Front FPK — Status reflection + updated next steps

**Date:** 2026-07-29 (evening, post P0–P3)  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Latest pack:** `20260729-1736-V1.11-DRAFT` — **DRAFT**, `ship_ok=false` (6 race OPEN by design)  
**Bar:** JLR Formula E Head of Technology — adversarial, not decorative  
**Geometry bar:** Hooley Phantom / PHANTM — params → derived mm → named meshes (not pretty blobs)

---

## 1. Where we are (honest)

| Layer | Status | Reality |
|---|---|---|
| Product class / front twin | **Done** | Cold front twin; bay envelope in brief |
| P0 identities | **Done this session** | One IPMSM, one SiC MCU; synth twins killed; planetary + mini-diff; AC busbar pierce |
| P1 geometry | **Done (concept)** | `fpk_concentric_geometry.py` drives Blender (Ø177×L141 housing; planet×3; nest fits); not FEA |
| Homologation honesty | **Locked** | NOT_HOMOLOGATED; DEC-008/009/010 OPEN; SHIPS blocked |
| Interface ICD | **Types only** | `interfaceIcd` + `JLR-FE-FRONT-FPK-INTERFACE-ICD.md` — XYZ OPEN |
| PCB | **Draft only** | Forge Gerbers; fitness FAIL; supplier Gerbers OPEN |
| Topology routing | **Still FAIL** | 0/17 routed |
| ship_ok / tab ≥8 | **FAIL** | DRAFT by design while race holds OPEN |
| Red-team v2 | **Done** | SOL + GLM + Kimi all **REJECT** (salvage-parsed where truncated) |
| Rear MGU | **Deferred** | Do not resume |

**Verdict:** Engineering identity + nested mechanism geometry are now coherent at concept level (PHANTM pattern). Pack is still rightly DRAFT. Red-team still REJECT — PCB/HIL/dyno/traceability/topology remain fatal for a HoT stamp.

---

## 2. What landed (P0–P3)

### P0 — One coherent identity
- Dropped `traction_motor_synth` / `traction_inverter_synth`
- Renamed `reduction_gear_stage` → `planetary_reduction_in_rotor`
- Renamed `open_bevel_differential` → `mini_diff_in_rotor`
- Renamed `phase_cable_set` → `ac_phase_busbar_pierce`
- Nested BoM dims from geometry module
- Stamped `interfaceIcd` (no fake XYZ)
- SOURCE: `derive-skeleton.ts`, `engineering-contract.ts`, synth suppress in `universal-contract-sizing.ts`

### P1 — Hooley-class geometry
- New `scripts/lib/fpk_concentric_geometry.py` (params → stator/rotor/planetary/MCU mm + `--selftest`)
- Blender `_place_traction_drive_pack_layout` reads geometry (log: `FPK geometry: housing Ø176.7×L140.5 … ok=True`)
- Re-rendered 04 / 00 / 08; `form-meshes.json` concentric bay-fill (81 meshes)

### P2 — Dossier
- Excel `20260729-1736-V1.11-DRAFT` — SHIPS blocked (tab floor + PCB + 6 race OPEN)
- Interface ICD markdown in twin

### P3 — Red-team v2
- Artefacts: `out/.../_redteam/{sol,glm52,kimi}.json`, `merged-findings.json`, `PUNCHLIST.md`
- All three: **REJECT**
- Council parser hardened for `content=null` + truncated JSON

---

## 3. Remaining punch (from red-team v2 — do not greenwash)

1. **PCB / HIL / supplier Gerbers** — stay OPEN; never claim fab-ready  
2. **Dyno / DEC-001/006/010** — stay OPEN  
3. **Topology 0/17** — route HV/coolant/signal edges  
4. **Excel provenance** — more LIVE formulas vs literals on power chain  
5. **Coolant ΔT vs full loss story** — reconcile continuous loss vs 12 L/min narrative  
6. **Morphology** — still concept cylinders; next bar is CadQuery/family authenticity where families exist  

---

## 4. Explicit non-goals

- No Lucid CAD paste  
- No inventing FIA port millimetres  
- No SHIPS / FIA homologated while HIL/supplier Gerbers/dyno OPEN  
- No rear MGU  

### 4b. Standing process — multi-model challenge (Tristan 2026-07-29)

**Use Sol + Kimi K3 + GLM regularly** to challenge and deepen FPK work — not only at pack close. Cadence: after each physics / PCB / literature / checklist milestone. Rule: `.cursor/rules/multi-model-challenge-council.mdc`. Merge → fix at SOURCE → re-challenge.

### 4c. Deterministic form-follows-function (Tristan 2026-07-29)

**Every sub-sub-component** has FFF characteristics. **Nothing is random** — all geometry / material / count / size is **deterministically calculated** from duty, bay, and physics budgets (with OPEN until FEA/supplier). Rule: `.cursor/rules/fpk-deterministic-fff.mdc`. Optimisation only after the calculated skeleton.

---

## 5. Part explosion + first-principles (Tristan 2026-07-29 evening)

**Bar clarified:** not MCU-shelf silhouette — full FPK with covers on everything and physics per part.

| Assembly | Examples that must exist | Physics seed examples |
|---|---|---|
| MCU / inverter | cover, housing, control PCB, gate drive, DC-link caps, HV/AC busbars, SiC stack, cold plate, HV+LV connectors, coolant ports | C_dc≈I/(8·f_sw·ΔV); busbar from I_ph |
| Motor | outer casing, cover, jacket, laminations, **windings**, **magnets**, hollow rotor, shaft, bearings, end bells, resolver, encoder, terminals | slots, turns/phase, Cu mass, magnet segments/grade |
| Transmission | gearbox housing+cover, sun/planet/ring, carrier, pinion, intermediate shaft, diff carrier, side/output gears, output shafts, bearings, seals, oil | S/P/R teeth from gear_ratio; oil volume |

**Landed (flat):** `scripts/lib/fpk_first_principles.py` → **48/48** ontology; see `JLR-FE-FRONT-FPK-PARTS-PHYSICS.md`.

### 5b. Recursive bottom-up physics tree (Tristan 2026-07-29 late)

**Bar raised:** every part → sub-part → material/process leaf with electrical / magnetic / thermal / fluid / mechanical / material / manufacturing physics. Materials include density, σ_Cu, Br, process (CNC, sinter, vacuum impregnate…).

| Artefact | Result |
|---|---|
| Plan | `docs/plans/JLR-FE-FRONT-FPK-PHYSICS-BOTTOM-UP-2026-07-29.md` |
| SOURCE | `scripts/lib/fpk_physics_tree.py` (154 nodes, 105 leaves, 100% physics keys) |
| Stamp | `scripts/fe-front-stamp-fpk-physics-tree.py` → `state.fpkPhysicsTree` |
| Report | `out/.../JLR-FE-FRONT-FPK-PHYSICS-TREE.md` |

Examples now in-tree (still analytical seeds):

- **Windings:** coils → turns → strand → Cu OFHC (σ=5.8e7 S/m) + polyimide enamel; turns/phase, wire section, R_ph, Cu mass, I²R vs tool loss  
- **DC-link:** C≈I/(8·f_sw·ΔV), per-cap ripple share, ESR/ESL seeds  
- **Cold plate:** Q from inverter loss → channel W×H @ 1.5 m/s → Re/Nu/h_conv + TIM R_th + ports  
- **SiC stack:** module → HS/LS die → AlN substrate → baseplate  
- **Gate drive PCB:** **6** gate + desat channels + isolated DC-DC each (required; forge still implements 0)  
- **Control PCB:** MCU, 3× current sense, resolver, CAN-FD, HV/LV isolation, LV bucks  
- **Gears/magnets/shafts:** teeth/module, Br/HcJ, tip speed, shear stress seeds + material densities  

**Still not done:** FEA, CFD, HIL, supplier datasheets, channel-true KiCad, mesh-per-leaf CAD, Excel LIVE from tree. Seeds ≠ designed. DRAFT + REJECT remain correct.

### 5c. Sol + GLM + Kimi comprehensive checklist (2026-07-29)

Council scripts: `fe-front-physics-checklist-council.py` + `…-pass2.py`.

| Artefact | Result |
|---|---|
| Index | `out/.../JLR-FE-FRONT-FPK-CHECKLIST-INDEX.md` |
| Full merged list | `out/.../JLR-FE-FRONT-FPK-COMPREHENSIVE-CHECKLIST.md` |
| JSON | `out/.../_physics_checklist_council/merged.json` |

**Merged unique paths: ~337** (MCU-heavy + pass-2 TX/fasteners/sensors). Approx assembly counts: MCU ~121, transmission ~90, motor ~38, fasteners ~32, sensors ~17, cooling ~16, … Kimi contributed (pass-2) after pass-1 reasoning-only failure.

Use this list as the backlog to deepen `fpk_physics_tree.py` until every council path has engine physics.

### 5d. FPK literature corpus (Anvil expert rail — 2026-07-29)

| Item | Result |
|---|---|
| Topics | **66/66 ≥10 papers** (OpenAlex+Crossref) |
| Documents | **~1237** in `pretraining_spec_documents` (`fpk_literature`) |
| Components ≥10 papers | **108** (floor met) |
| Seed classics | 56 Crossref-verified DOIs |
| Extract/embed | `fpk_extracted_claims` + `fpk:*` specs (batch running) |
| Search | `fpk-literature-search.ts` — lookup by `component_id` |
| Docs | `scripts/ingest/FPK-LITERATURE-README.md`, twin `JLR-FE-FRONT-FPK-LITERATURE-CORPUS.md` |

Agents expanded MCU + motor/TX topics; harvest continues to deepen OA PDFs + claim extraction.

## 6. One-line programme status

> **Literature corpus live: 66 topics × ≥10 papers, ~1237 docs, 108 components ≥10. Checklist 337 paths; physics tree 154. Next: claim extract batches + OA PDFs + deepen physics tree from literature + WP4 PCB.**
