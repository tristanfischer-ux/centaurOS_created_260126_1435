# Overnight plan — Open Colorimeter replica via target-aided rule fixes

**Mode:** `TRAINING/REFERENCE-AIDED` (gold is **open**; do **not** claim a black-box Yuri score)  
**Owner:** Claude Code terminal (execution) · Cursor harness (advice only)  
**Input brief (unchanged):** `briefs-loop/yuri_open_colorimeter.md`  
**Baseline to beat:** `out/colorimeter-20260712-2048` (latest complete dossier + PCB) / also study `1954` for known industrial leftovers  
**Success:** morning dossier a skeptical engineer would call **Open Colorimeter-class**, not “plant cabinet + photodiode noun”

---

## 0) What “next step” means (one sentence)

**Diff the engine’s latest dossier against the frozen IO Rodeo Open Colorimeter, then change universal source rules until a clean `PCB_STAGE=1` brief-driven run produces that product shape** — COTS MCU + detector + small LED PCB + 3D enclosure + short interconnect — not a single industrial panel board.

---

## 1) Open the target first (30–45 min, before any code)

Do this **once**, write the gap list into the run dir as `TRAINING-gap-list.md` (commit with the first fix).

### 1.1 Visual / mechanical (must open)

| # | Open | Ask |
|---|---|---|
| V1 | `out/_gold-colorimeter-showcase/01`–`06` | What are the **5 visible subsystems**? |
| V2 | `out/_gold-colorimeter-repo/design_files/enclosure/` | Handheld light-tight box + PyBadge cover — not a skid |
| V3 | `…/cuvette_holder/` | Positive 10 mm path + ambient exclusion |
| V4 | `…/basic_led_pcb/` + showcase `06` | **Small swappable LED board**, not 80×80 plant PCB |

### 1.2 BoM shape (study structure — **do not paste MPNs into emitters**)

Gold `design_files/BOM.xlsx` spine (this is the **architecture**, not a cheat sheet to hardcode):

| Role | Gold pattern |
|---|---|
| Optical fixture | 3D-printed **cuvette holder** |
| Housing | 3D-printed **enclosure** (+ cover for MCU) |
| Source | **LED board** (wavelength module) |
| Detector | **Adafruit TSL2591** (COTS breakout) |
| Compute / UI | **Adafruit PyBadge LC** (COTS MCU+display+buttons) |
| Interconnect | JST-PH / STEMMA / Qwiic short cables |
| Consumable / HW | Cuvettes + McMaster fasteners |

**Implied board architecture:** ≥2 electronic assemblies (LED PCB + COTS boards), **not** one custom 80×80 `function_class` board pretending to be the whole instrument.

### 1.3 Eval hard bars (must become true of **engine** dossier)

From `~/Downloads/Yuri_Wet_Science_Benchmark_Library/evaluation/01_open_colorimeter_evaluation.md`:

1. Beer–Lambert / zero / overrange handling (narrative + calcs)  
2. Repeatable **10 mm** geometry + positive cuvette seat  
3. Ambient / stray-light exclusion  
4. LED current stability + wavelength / module ID  
5. Detector gain / saturation handling  
6. Blanking + calibration persistence  
7. Manufacturable enclosure + **serviceable LED module**  
8. Mech CAD ↔ PCB ↔ firmware pin story coherent  
9. BoM with **real MPNs** (catalogue/rules — not gold dump)

### 1.4 Diff against baseline run

Open side-by-side:

- Engine: `out/colorimeter-20260712-2048/dossier.xlsx` + `pcb/` + product renders  
- Gold: showcase + BOM + LED PCB README  

Fill this table in `TRAINING-gap-list.md` (every row = one source-rule ticket):

| Gap ID | Gold truth | Engine today (2048/1954) | Suspected source rule | Severity |
|---|---|---|---|---|
| G1 | Handheld polymer enclosure | ? | skeleton / enclosure emitter / Blender class | P0 |
| G2 | Cuvette tower 10 mm path | ? | optical skeleton / GA / dims | P0 |
| G3 | Small LED PCB module | Single plant-like board / `function_class` | PCB generator + disposition | P0 |
| G4 | COTS MCU+UI (PyBadge-class) | ? | pins / modules / COTS disposition | P0 |
| G5 | COTS detector (TSL2591-class) | Photodiode noun / wrong pins | optical_instrument suppliers + pin map | P0 |
| G6 | Short JST/Qwiic interconnect | Plant signal edges / DN80 leftovers | topology / Electrical tree | P0 |
| G7 | £ tens–low hundreds | £k Banner / PV / safety | cost band + pin allowlist | P0 |
| G8 | Electrical DC tree present | Electrical often skipped | connection diagram gate for optical_instrument | P0 |
| G9 | No membrane→filtration skid | Still births skid children | membrane birth / WDC | P0 |
| G10 | PCB fitness MPN-heavy | fitness ~3 / placeholders | PCB stage pin→footprint resolution | P1 |
| G11 | Pad-overlap honesty | DRC CLEAN vs errors[] | DRC aggregation | P1 |
| G12 | Blanking / cal narrative | ? | brief compliance / test plan emitter | P1 |

---

## 2) Fix order (do in this sequence — do not jump to Excel chrome)

**Rule:** every fix = **universal** source change + `proveCatch` / harness invariant.  
**Forbidden:** `if class == colorimeter: emit <gold MPN list>`.

### Wave A — kill wrong product birth (must pass before PCB work matters)

| Step | Fix | Where to look first | Guard |
|---|---|---|---|
| A1 | Membrane / filtration vocab must **not** birth skid children on `optical_instrument` | Blender scene rules, requirements BoM classifiers, WDC birth paths | proveCatch: optical brief → zero membrane-skid modules |
| A2 | `optical_instrument` contract complete: shared quantities for path length mm, LED current, detector type, enclosure mass/dims | engineering-contract / lock-gate HARD slots | lock-gate + class harness |
| A3 | Cost / supplier band for optical instruments = bench instrument £, not process plant | class cost bands / INDUSTRY bands / pin allowlists | cost-sanity proveCatch on planted Banner/PV line |
| A4 | Ban industrial leftovers at pin/emitter level: Banner interlock, PV fuse, main breaker, E-stop, DN80 water, PCIe-as-USB | pin maps + topology + charge-mgmt wiring | proveCatch adversarial BoM lines |

**Exit criterion Wave A:** frozen state from a short run (or harness on last state) has **photometer spine only** — no skid/membrane/Banner/DN80.

### Wave B — force Open Colorimeter **product topology**

| Step | Fix | Target shape |
|---|---|---|
| B1 | Mechanical skeleton: enclosure + cuvette holder + optical axis (10 mm) as first-class nodes | Matches showcase 03–05 |
| B2 | Electronics disposition: **COTS modules off-board** (MCU/UI, detector breakout) + **one small LED source PCB** on-board (or two small boards) | Matches gold BOM roles 3–5 |
| B3 | Interconnect: short cable / STEMMA-class edges, not plant signal bus | Electrical sheet renders |
| B4 | Electrical sheet **must run** for `optical_instrument` (device DC + signal tree) — not skipped | Tab not blank |
| B5 | Renders / GA: handheld instrument layout (not plant floor) | Compare to showcase 01–02 |

**Exit criterion Wave B:** SIGHT of GA + Electrical + BoM roles would pass a 10-second “is this a colorimeter?” glance.

### Wave C — PCB content (after B2 disposition is correct)

| Step | Fix | Target |
|---|---|---|
| C1 | PCB generator emits **small LED-board-class** geometry + real LED/driver footprints when disposition says LED module | Not 80×80 function_class soup |
| C2 | Off-board COTS: triage list with **library candidates**, not fake on-board placeholders | PyBadge/TSL2591-class as COTS, not `function_class` pads |
| C3 | Fitness axis: MPN/package majority; refuse “DRC-clean but fitness 3” as success | fitness ≥7.5 when claiming LIVE fab |
| C4 | Honesty: pad-overlap in `errors[]` must flip DRC summary off CLEAN | proveCatch planted overlap |
| C5 | PnP Value ← MPN join; unresolved → candidates | usable fab pack |

**Exit criterion Wave C:** PCB tab tells a fabricator what to make for the **LED board**, and honestly lists COTS bought assemblies.

### Wave D — eval narrative bars (can parallel after B)

Blanking, calibration persistence, Beer–Lambert worked calcs, stray-light control, linearity/drift test plan — emitter / compliance rows so eval checklist items appear in dossier, not only in engineer’s head.

---

## 3) Run loop (how to spend the night)

```text
1. Write TRAINING-gap-list.md from §1 (mandatory first artefact)
2. Wave A fixes + proveCatch  →  optional fast harness on frozen state
3. ONE clean full chain:
     PCB_STAGE=1
     single PID tree under one out/colorimeter-<timestamp>/
     no nested second chain
4. SIGHT: open dossier.xlsx + pcb/ + renders vs showcase + gap list
5. Tick gaps closed / reopen with new source tickets
6. Prefer fast Excel/drawing/PCB harness when only export changed
7. Full chain again when contract / skeleton / PCB generator / pins change
8. Stop when morning bar met OR best effort + punchlist (no score inflation)
```

**Chain hygiene (non-negotiable):**

- One process tree per `out/`  
- Tag commits: `TRAINING/REFERENCE-AIDED` + which gold paths informed the fix  
- Never hand-edit `state.json` to “look right”

---

## 4) Morning definition of done (checklist)

Hand back in `docs/plans/CURSOR-HARNESS-INBOX.md` → Terminal reply:

- [ ] Best `out/colorimeter-…` path  
- [ ] How gold was used (files opened; **no MPN paste**)  
- [ ] Gap list path + which G-IDs closed  
- [ ] Honest tab floor (≥8 every tab, or truthfully lower + why)  
- [ ] Remaining gaps vs eval checklist (numbered)  
- [ ] Explicit: **REFERENCE-AIDED — not a black-box Yuri score**

**Replica bar (pass/fail for “next step succeeded”):**

| Check | Pass looks like |
|---|---|
| Product glance | Showcase-like handheld + cuvette + LED module story |
| BoM spine | Enclosure, cuvette path, LED module, detector, MCU/UI, cables — £-scale |
| PCB | Small source board + COTS disposition; fitness not stuck ~3 on placeholders |
| Electrical | Present DC/signal tree |
| No plant ghosts | Zero membrane skid / Banner / DN80 / PCIe-USB |

---

## 5) Explicitly NOT this overnight’s job

- Black-box freeze with gold **hidden** (that’s the **following** session)  
- Climbing the Yuri ladder to NinjaPCR  
- Competing Cursor edits on the same checkout  
- Polishing PCB Excel chrome further while BoM still looks like a plant  

---

## 6) Immediate first action (right now)

1. Create `out/colorimeter-<new>/TRAINING-gap-list.md` **or** put it under `docs/plans/` if no new run yet — fill §1.4 table using **2048** vs gold.  
2. Start Wave **A1** (membrane birth) — highest leverage wrong-product killer.  
3. Only after A exits: Wave B topology, then one clean `PCB_STAGE=1` chain.

That is the next step. Everything else is supporting detail.
