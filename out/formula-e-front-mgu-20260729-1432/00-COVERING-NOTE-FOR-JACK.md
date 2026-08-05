# Formula E front powertrain kit — covering note for the design pack

**Tristan Fischer · 5 August 2026 · pack V1.298**  
**Status:** concept under named assumptions · **not homologated** · `ship_ok = false`

This note is the map of the zip. It is not a substitute for the figures and JSON inside.

---

## What this pack is

A clean-sheet **concept model** of a Gen3-class front unit (motor, inverter story, reduction, thermal screens) with electromagnetic FE, multiphysics thermal/structural screens, PCB drafts, and a live Excel engineering dossier. Every green or red number is meant to be **falsifiable** — several remain deliberately open until dyno / partner data arrive.

---

## How to read the numbers (one paragraph)

We publish **two torque bars**, not one. At the DEC-009 freeze (**24,000 rpm / 130 mm stack**): Path B kit-case mean torque is about **122.1 N·m**. That **clears** the architecture duty bar (~**104.1 N·m**, ~1.17×) and **fails** the conservative binding bar (~**125.2 N·m**, ~0.975×). Torque is **not** marked dyno-reliable. Treat Path B as a sign-stable FE SIGHT-candidate under frozen assumptions, not a homologation result.

---

## What changed in V1.298 (vs V1.297)

| Surface | V1.298 status |
|---|---|
| **Calculations provenance** | sourceless **0** / calc-coverage **100%** (superseded continuous archive shown; magnet-temp lineage edges fixed) |
| **Excel tab scorecard** | Calculations **9.8/10 PASS** (was 6); dossier floor still **4** from honest release_readiness / not homologated |
| **Live formulas** | ~3534 formula cells; ship_ok **false** by design |
| **PCB** | draft-review **A-** · fitness **8.01** · fab **PROTOTYPE_PACKAGE** (not supplier / not HIL) |
| **Blender** | cycle-3 + film-cap morphology; heroes in `renders/` — still schematic PE region, not production STEP |
| **Multiphysics** | FEMM heat R1/R2, dense CalculiX T-gradient, ROSS bearing-K — **screens**, not CHT / not dyno-calibrated |
| **Workbook SHA256 (16)** | `197ffbc657e8c114` · path `dossier.xlsx` on twin |

---

## What to open first

| Area | What to open | What it shows |
|---|---|---|
| Verdict | `em-honesty/00-verdict-one-pager.png` | Architecture, dual bars, ship_ok false |
| Dual bars | `em-honesty/01-dual-torque-bars.png` | 104.1 vs 125.2 vs Path B mean |
| Multiphysics | `multiphysics/multiphysics_run_summary.json` | R1–R6 + dense CCX + ROSS |
| PCB | `pcb/pcb_grade_card.json` + fab notes | A- draft · PROTOTYPE package |
| Renders | `renders/00-hero.png` + ghost/exploded | Race-kit viz under assumptions |
| Workbook | twin `dossier.xlsx` (not always in slim zip) | 30-tab audit trail |

---

## Tools behind the scenes

| Domain | Tooling we actually run |
|---|---|
| Magnetics | FEMM via `femmcli` (weighted-stress torque, field plots) |
| Thermal field | FEMM heat-flow (6-arg setsegmentprop); LPTN/analytical cooling |
| Structure | CalculiX Docker — centrifugal + radial T-gradient stress screens |
| Rotordynamics | ROSS first critical ≈22,922 rpm @ base K; stiffness sweep for 1.2× subcritical |
| PCB | KiCad + freerouting · draft readiness only |
| Excel | `build-excel-export.py` live formulas + LibreOffice recalc |

---

## What we are asking of you / the team

1. **Duty / lap data** — confirm intermittent regen vignette (DEC-008) or reverse it with data.  
2. **Dyno map** with calorimetric loss split at stated coolant conditions.  
3. **Chassis ICD XYZ** and **supplier Gerbers** when available — we will not invent them.  
4. Any ruling that retires the conservative **125.2 N·m** binding bar in favour of architecture-only reading.

---

## Hard honesty lines

- Homologation readiness is low until partners replace seeds (`release_readiness` floors the dossier at 4).  
- PCB max claim: **PROTOTYPE FAB PACKAGE — NOT SUPPLIER-RELEASED — NOT HIL-PROVEN**.  
- Architecture blockers remain OPEN (planetary vs rotor bore / EM torque identity) — `ship_ok` stays false.  
- Thermal field is **not** conjugate heat transfer and **not** a flow-bench calibration.  
- Iron loss remains a **screening estimate** with a stated two-sided error band.  
- Do **not** use `continuous_power_kw_superseded_continuous_screen` for thermal or architecture — archive only.

---

_End of covering note · pack V1.298 · 2026-08-05 14:41 UTC_
