# Front powertrain kit — what we can show Jack (assumption-based design)

**Date:** 2026-07-31  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Audience:** Jack / JLR Formula E technology review  
**How to read this:** We **froze educated design assumptions** where team/supplier data is missing, ran the physics and packaging stack on that basis, and report **results under those assumptions**. This is a serious concept pack — **not** a homologated race unit. When JLR supplies the real inputs (see ask list / email draft), we re-run and replace the assumed rows.

**Live machine-readable twin file:**  
`out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.json`  
**Email ask draft:** [`JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md`](./JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md)

---

## One-sentence pitch

Under a frozen set of packaging and duty assumptions consistent with the public Formula E front-kit envelope, we have a concentric motor–inverter–planetary–diff layout that **fits the bay**, **screens torque and gear strength for 250 kW front regen**, and **keeps thermal margins at 60 °C / 12 L/min** — ready for JLR to overwrite assumptions with interface, module, and dyno truth.

---

## Status labels (so “PARTIAL” does not look like chaos)

| Label | Meaning for Jack |
|---|---|
| **RESULT UNDER ASSUMPTIONS** | We made an educated guess, named it, and computed numbers. Usable in a design review. |
| **FROZEN ASSUMPTION** | Input we chose so the model can run; replace when you have the real value. |
| **NEEDS JLR / SUPPLIER INPUT** | We deliberately did not invent this (e.g. chassis XYZ, supplier module MPN). |
| **NEEDS HARDWARE** | Software is done as far as it can; dyno / HIL / flow bench required to correlate. |
| **NOT RACE-RELEASED** | `ship_ok = false` — we will not claim homologation. |

The old “PARTIAL / OPEN” language in the engineering stamp still exists for honesty gates. **This document is the review narrative.**

---

## A. Frozen assumptions (educated guesses)

| ID | Assumption | Value we froze | Why this guess | Replace with |
|---|---|---|---|---|
| A-DUTY | Continuous front regen electrical duty | **250 kW** | FIA front-kit class / DEC-002 | Team race software / energy tool CSV (DEC-007) |
| A-BAY | Package envelope | **343 × 259 × 267 mm**, ~**32 kg** dry aspiration | Public / press bay class | Chassis ICD STEP + weighed BoM |
| A-BUS | DC bus | **750 V** nominal | Common FE HV window seed | Exact bus window + ripple limits |
| A-COOL | Coolant | **60 °C** inlet, **12 L/min** | Manufacturer-perimeter band / DEC-004 | Team coolant loop ICD (fluid, flow, ΔT budget) |
| A-SPEED | Max rotor speed | **19,500 rpm** | Kit class seed | Team max used speed + overspeed policy |
| A-RATIO | Overall reduction | **8.0** (2 into bevel nest × 4 post-diff) | Packaging / torque map seed / DEC-003 | Final ratio from vehicle model |
| A-SIC | SiC module class | **3× half-bridge**, analytical loss ~**4.3 kW** at duty; ESL seed **~6.4 nH** | Topology + loss model — **not** a frozen MPN | Supplier module datasheet + STEP (DEC-001) |
| A-MAG | Magnet / EM seed | N42UH-class; pole-pitch magnets after bore enlarge | Screening grade | Supplier BH curves + stack length freeze |
| A-GEAR | Tooth systems | Planetary m=1 face=58; post-diff 24:96 m_n=1.4 face=46 helix=25° | Strength-driven resize to FoS≥1.2 | KISSsoft / release microgeometry |
| A-IFACE | Vehicle ports | Types only (HV, coolant×2, LV/CAN, halfshafts, mounts) — **XYZ not invented** | Cannot fake chassis millimetres | ICD coordinates from JLR chassis |

---

## B. Results under those assumptions (what to put on the table)

### Packaging and architecture

| Result | Under assumptions | Label |
|---|---|---|
| Concentric cassette fits bay | Housing Ø **251.8 × L 140.5 mm**; rotor ID **130.5** / OD **197.1**; planetary nest fits bore | RESULT UNDER ASSUMPTIONS |
| Diff nest torque budget | Cut torque at open bevel (`ratio_into_diff=2`); bevel FoS≈**1.22** | RESULT UNDER ASSUMPTIONS |
| Post-diff final drive | 24:96 helical stage; FoS≈**1.20**; bay fit; interface gaps **0 mm** | RESULT UNDER ASSUMPTIONS |
| Architecture blockers | **0 OPEN** at software-screening level | RESULT UNDER ASSUMPTIONS |
| Blender / CAD | Physics-linked renders; **9** parametric CadQuery families | RESULT UNDER ASSUMPTIONS |
| Release / supplier STEP | **0 / 14** principals | NEEDS JLR / SUPPLIER INPUT |

### Electromagnetic / thermal / gears (screening)

| Result | Under assumptions | Label |
|---|---|---|
| Shaft torque vs 250 kW duty | FEMM loaded point ~**207 N·m** vs ~**125 N·m** required (≥75% duty screen) | RESULT UNDER ASSUMPTIONS |
| Denser EM evidence | MTPA 35 FEMM pts + hybrid map **620** pts (angle-interp, speed×current loss/FW); voltage/FW screen at 19,500 rpm | RESULT UNDER ASSUMPTIONS |
| Cooling network @ 60 °C / 12 L/min | Δp≈**43 kPa**; T_winding≈**67 °C**; T_module≈**71 °C**; coupled screen OK | RESULT UNDER ASSUMPTIONS |
| Planetary strength | FoS≈**1.21**, nest fits rotor | RESULT UNDER ASSUMPTIONS |
| Dyno / HIL / flow / overspeed / double-pulse | Predicted models ready; **no measured correlation yet** | NEEDS HARDWARE |

### Honesty footer (say this out loud)

> These numbers are **design-screening results on frozen assumptions**, not measured race hardware. We are happy to replace every assumed row the day interface drawings, module identity, or dyno data arrive.

---

## C. What Jack can walk away with today

1. **A coherent package story** — concentric hollow-rotor planetary + post-diff ×4 that clears the published bay under named assumptions.  
2. **Physics screens with numbers** — torque, gear FoS, coolant Δp and temperatures — not empty slides.  
3. **A short ask list** — exactly what JLR/suppliers must send to turn assumptions into correlated evidence (email draft linked above).  
4. **Renders** — Blender heroes driven by the same millimetres the solvers use (`00-hero`, product views in the twin folder).

---

## D. What we are *not* claiming

- Homologation / `ship_ok`  
- Supplier-released CAD or Gerbers  
- Dyno-correlated efficiency maps  
- Chassis-true connector XYZ  
- “FUNCTIONALLY VERIFIED” firmware on hardware  

---

## E. Next software density (already in flight)

Deeper assumption-based models (still not hardware PASS): fuller electromagnetic maps, conjugate heat-transfer-style cooling, oil delivery, denser structure — same assumption register, tighter results.
