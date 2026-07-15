# Gold WHY → universal instrument rules

**Training artefact:** IO Rodeo Open Colorimeter (`out/_gold-colorimeter-showcase/`, `/tmp/open_colorimeter_gold_b7f37ae`).  
**Not a cheat sheet:** no gold MPNs in emitters. Rules key on `isInstrumentDevice` + optical/photometric signals.

## Why the gold kit is structured this way

| Gold choice | Engineering WHY | Universal rule |
|---|---|---|
| One PyBadge-class compute/UI kit (MCU+LCD+buttons+USB+battery) | Handheld already needs a complete human interface + host MCU; a bespoke motherboard duplicates cost and design | Optical instrument with local readout → **one COTS `compute_ui_module`**, not discrete MCU/display/buttons/USB/battery motherboard |
| Separate tiny LED PCB (LED+R+JST) | Only the wavelength path must be swappable; keep custom electronics minimal | Optical source board = **window-scale daughterboard**; host power/USB stay with COTS MCU |
| COTS detector breakout (TSL2591-class) | Proven I²C light sensor; no custom AFE at kit scale | Detector → **off-board COTS module** + short STEMMA/Qwiic cable |
| 3D-printed cuvette tower + enclosure | Optical alignment + light-tightness + batch-of-20 AM | Fabricated structure: cuvette holder, enclosure, ambient cap, fasteners |
| Cylindrical light cap | Beer–Lambert I₀ needs ambient rejection without a shutter | Ambient light cap as fabricated accessory on circular rim |
| Short JST/STEMMA/Qwiic | Maker interconnect, not plant signal ladder | `mechanism=signal` → device SIGNAL_BUNDLE (already) |
| ~£100–150 materials / £200 brief | Education/lab kit price; COTS absorbs most electronics | Handheld instrument cost archetype + no site install; BoM consolidation |

## Coded surfaces

1. `derive-skeleton.ts` — optical floors (COTS spine)
2. `atopile-generator.ts` — off-board COTS + LED daughterboard size
3. `emitter-completion.ts` — industrial PV scrub + USB-serial reject
4. `build_universal_scene.py` / `instrument_form_grammar.py` — L-step, HMI, tower, cap, cuvette
5. `photometry__beer_lambert_range.py` — calibration curve series for Calculations
6. `class-cost-structure.ts` — ARCH_HANDHELD_BENCHTOP_INSTRUMENT (install=0)

## Acceptance (gold twinship, not dossier floor)

Hero/exterior pass kit glance vs showcase 01–02; BoM ~tens–low-hundreds £; LED PCB ≤40 mm; no industrial mis-pins; calibration curve present; residuals honest.
