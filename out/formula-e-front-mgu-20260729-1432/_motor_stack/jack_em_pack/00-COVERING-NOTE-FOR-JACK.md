# Formula E front powertrain kit — covering note for the design pack

**Tristan Fischer · 5 August 2026 (draft for next pack send)**  
**Status:** concept under named assumptions · **not homologated** · `ship_ok = false`

This note is the map of the zip. It is not a substitute for the figures and JSON inside.

---

## What this pack is

A clean-sheet **concept model** of a Gen3-class front unit (motor, inverter story, reduction, thermal screens) with electromagnetic FE, structural screens, PCB drafts, and now **multiphysics thermal fields**. Every green or red number is meant to be **falsifiable** — and several remain deliberately open until dyno / partner data arrive.

---

## How to read the numbers (one paragraph)

We publish **two torque bars**, not one. At the DEC-009 freeze (**24,000 rpm / 130 mm stack**): Path B kit-case mean torque is about **122.1 N·m**. That **clears** the architecture duty bar (~**104.1 N·m**, ~1.17×) and **fails** the conservative binding bar (~**125.2 N·m**, ~0.975×). Torque is **not** marked dyno-reliable. Treat Path B as a sign-stable FE SIGHT-candidate under frozen assumptions, not a homologation result.

---

## What is in the zip (previews)

| Area | What to open first | What it shows |
|---|---|---|
| Verdict | `em-honesty/00-verdict-one-pager.png` | Architecture, dual bars, ship_ok false |
| Dual bars | `01-dual-torque-bars.png` | 104.1 vs 125.2 vs Path B mean |
| EM field | `fieldplot/` + `30–37` | |B| maps (Tony-style + 3D) |
| EM grade | `40-em-grade-card.png` | Toolchain / kit / map / voltage / viz / readiness |
| Voltage / FW | `39` / `41-em-fw-envelope.png` | Bus vs back-EMF envelope |
| Map spine | `42-em-map-spine-card.png` | Kit-case headline vs dense locus |
| Thermal multiphysics | `45-multiphysics-thermal-field.png` | Radial temperature field (screening) |
| Capability index | `46-multiphysics-capability-index.png` | **What the system can analyse** |
| Bar B asks | `44-bar-b-executable-asks-one-pager.md` | Partner artefacts that close holds |
| PCB | board-routed KiCad + honesty sheet | Draft boards; **not fabrication ready** |
| Workbook | engineering workbook xlsx | 31-tab audit trail |

---

## Tools behind the scenes (comfort, not magic)

| Domain | Tooling we actually run |
|---|---|
| Magnetics | FEMM via `femmcli` (weighted-stress torque, field plots) |
| Thermal network | CoolProp + analytical LPTN / cooling network |
| Thermal **field** | **FEMM heat-flow** (R1 known-answer pass; R2 stator field) + FD cross-check |
| FEMM heat API | Works with **6-arg** `setsegmentprop(..., "<None>")` — 5-arg form segfaults |
| Visualisation | PyVista (headless) · ParaView installed for interactive use |
| Structure | CalculiX (Docker) centrifugal FoS; thermal stress OOM screen |
| Mesh / CFD scripts | gmsh installed; OpenFOAM case scripts exist (not full CHT) |
| Rotordynamics | **ROSS ran**: first critical ≈22,922 rpm vs 24,000 (margin ×0.96 at base K). **Stiffness sweep**: ~**2×** assumed bearing k clears the 1.2× subcritical screen (~32.5k rpm). Bearings still OPEN. |
| Structure (dense) | CalculiX **765-node** quarter ring: centrif ≈218 MPa; +T-gradient ≈241 MPa (Δ≈**22.6 MPa**). Coarse ring was ~+25 MPa — mesh-stable screening. |
| PCB | KiCad + freerouting · draft readiness only |

---

## What we are asking of you / the team

1. **Duty / lap data** — confirm intermittent regen vignette (DEC-008) or reverse it with data.  
2. **Dyno map** with calorimetric loss split at stated coolant conditions.  
3. **Chassis ICD XYZ** and **supplier Gerbers** when available — we will not invent them.  
4. Any ruling that retires the conservative **125.2 N·m** binding bar in favour of architecture-only reading.

---

## Hard honesty lines

- Homologation readiness is low until partners replace seeds.  
- PCB max claim: **DRAFT — NOT FABRICATION READY — UNPROVEN IN HARDWARE**.  
- Thermal field is **not** conjugate heat transfer and **not** a flow-bench calibration.  
- Iron loss remains a **screening estimate** with a stated two-sided error band; yoke is the dominant volumetric source at ~2.1 T.
- Twin deterministic checks: **161 pass / 0 fail** (ampacity / ledger / brief targets closed at source). Tab scorecard may still lag until full Excel rebuild.

---

_End of covering note draft. Final send will stamp pack version (target V1.296+) and SHA of workbook._
