# Continuous Culture Bioreactor — Yuri Wet-Lab Benchmark 05 (Pioreactor class)

We are designing a **compact continuous-culture bioreactor** for microbial growth experiments: a benchtop open-hardware instrument with stirred culture vial, optical density / growth sensing, temperature control, dosing pumps for media/acid/base or inducer, and a networked experiment API. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation, **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against compact bioreactor / turbidostat engineering practice.

Target user: teaching labs, DIY bio labs, and small R&D groups who need reproducible continuous culture and OD-controlled experiments without a commercial bioreactor budget.

## System description

- A **culture vessel** (≈20 ml class working volume) with sterile-compatible interfaces for sampling and dosing.
- **Agitation** sized for the vessel (magnetic stir or equivalent) with stated RPM band and mixing justification.
- **Optical density / growth sensing** with calibration path, temperature compensation, and stated dynamic range.
- **Temperature control** of the culture (heater and/or Peltier) with closed-loop stability characterisation.
- **Peristaltic or syringe dosing** for media / waste / acid / base / inducer as justified by the control modes offered (batch, turbidostat, chemostat — state which are baseline).
- A **documented network API and browser / host UI** separating sensing, actuation, and experiment recipes.
- Prefer **catalogue pumps, sensors, MCU/SBC, and printable structural parts**; buildable without precision machining.
- Mechanically and biologically **safe for bench use** (spill containment, electrical isolation, no plant-scale CIP skids).

## Key constraints (state these as the brief's hard targets)

- **Form:** benchtop continuous-culture bioreactor; printable / fabricated structural parts.
- **Working volume:** state target (≈20 ml class) and why.
- **Sensing:** OD / growth metric with calibration + temperature compensation.
- **Actuation:** agitation + thermal + dosing (baseline set stated).
- **Control modes:** at least turbidostat OR chemostat with recipe API (state baseline vs optional).
- **Software:** network API + host UI; experiment recipe separation.
- **Manufacturability:** no precision machining; second-engineer assembly.
- **Cost:** honest prototype **bill of materials within £220–£298** (gold open bioreactor kit band; midpoint ≈ £259 materials). Prefer catalogue parts the engine can price. Do not ship plant-scale industrial assemblies.
- **Positioning:** research-use engineering hardware — not clinical / IVD.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **thermal / mixing / optical calculations**, **parametric CAD**, **electronics**, **firmware / software**, **API**, **exact bill of materials**, **assembly guide**, **calibration procedures**, and a **growth-curve / turbidostat benchmark** protocol.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with PCB outlines and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability with an honestly priced design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components.
