# TRAINING gap list — Open Colorimeter vs engine `0819`

**Mode:** TRAINING/REFERENCE-AIDED (gold open for shape; no MPN paste into emitters)  
**Engine run:** `out/colorimeter-20260713-0819/`  
**Review workbook:** `~/Downloads/colorimeter-20260713-0819_dossier_2026-07-13_1118.xlsx`  
**Gold:** `/tmp/open_colorimeter_gold_b7f37ae` @ `b7f37ae` + `out/_gold-colorimeter-showcase/`  
**Brief:** `briefs-loop/yuri_open_colorimeter.md`

## Gold spine (architecture — not a cheat sheet)

| Role | Gold |
|---|---|
| Optical fixture | 3D-printed cuvette holder |
| Housing | 3D-printed enclosure (+ MCU cover) |
| Source | Small swappable LED PCB |
| Detector | Adafruit TSL2591-class COTS breakout |
| Compute / UI | Adafruit PyBadge LC-class (MCU+display+buttons+battery) |
| Interconnect | Short JST / STEMMA / Qwiic |
| BoM | ~16 catalogue lines, tens–low-hundreds £ |

## Gap table (0819)

| Gap ID | Gold truth | Engine 0819 | Suspected source rule | Severity | Status |
|---|---|---|---|---|---|
| G1 | Handheld stepped enclosure + UI | Grey box cutaway, no PyBadge-class form | Blender sealed enclosure / story meshes | P0 | OPEN |
| G2 | Cuvette tower 10 mm + light cap | Cuvette holder named; GA 1×1×3 m, 0 equipment | `draw_ga.py` empty-parts default envelope | P0 | **PARTIAL** (instrument envelope + “product envelope” copy) — needs new chain bake + real parts on GA |
| G3 | Small LED PCB module | No `pcb/` dir; no PCB tab on this run | PCB stage + disposition | P0 | OPEN |
| G4 | COTS MCU+UI | Microcontroller + Local Display + Buttons as discrete nouns | Electronics disposition / skeleton | P0 | OPEN |
| G5 | COTS detector | Photodiode + amp chain (OK-ish shape, not COTS module) | Optical pin / disposition | P1 | OPEN |
| G6 | Short device cables | Line & velocity ~£855 plant signal ladder | `connection_sizing.py` + orphan augment | P0 | **FIXED in source** (`mechanism=signal` → SIGNAL_BUNDLE) — needs new chain bake |
| G7 | £ tens–low hundreds materials | BoM £317; OEM £546; installed £818 | `resolveCostStack` → DEFAULT mid-volume + 20% install | P0 | **FIXED in source** (`optical_instrument` → ARCH_HANDHELD_BENCHTOP_INSTRUMENT, install 0) — needs new chain bake |
| G8 | Electrical DC tree present | Electrical NA’d | Excel NA-to-PCB + no device SLD | P0 | OPEN (Wave B) |
| G9 | No membrane→filtration | F-1 Interface Membrane £60; Exec “Filtration & membranes” | Skeleton HMI floor + `_equip_category` bare membrane | P0 | **FIXED in source** (OPTICAL_HMI_FLOOR + Excel HMI-before-filtration) — needs new chain bake |
| G10 | No industrial tower lights | Banner S22 as Power Indicator LED | `fillBlankWordMpns` / late pin without device context | P0 | **FIXED in source** (setInstrumentDeviceContext before late fills) — needs new chain bake |
| G11 | Brief metrics rich (blank/cal/battery/£200) | Exec only path + λmin/λmax | Compliance / exec metric emission | P1 | OPEN |
| G12 | Volume readable at device scale | Equip Volume/Footprint show 0.00 (m³ @ 2dp) | Excel number format for instruments | P2 | OPEN |
| G13 | Scores follow FAIL/WARN/holds | Checks FAIL + Sense WARN + Holds open still tab 10 | QA cell-contract Goodhart | P0 | OPEN |

## Wave map

- **Wave A (wrong product):** G7, G9, G10, G6 pricing — must exit before trusting a new chain  
- **Wave B (topology):** G1, G2, G4, G5, G8 — 10-second glance  
- **Wave C (PCB):** G3  
- **Wave D (eval narrative):** G11  
- **Scoring honesty:** G13 (last, not first)

## Replica bar (done when)

1. Hero/GA pass “is this a colorimeter?” vs showcase 01–02  
2. BoM spine = enclosure, cuvette, LED module, detector, MCU/UI, short cables — £-scale  
3. Electrical present (device DC/signal)  
4. Zero membrane-as-filtration / Banner / plant install markup as headline  
5. Named Downloads deliverable; residuals listed honestly — **no score inflation**
