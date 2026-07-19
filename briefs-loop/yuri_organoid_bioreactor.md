# Benchtop Organoid Culture Bioreactor — Yuri Wet-Lab Benchmark (Organoid Bioreactor class)

We are designing a **compact benchtop organoid-culture bioreactor** for growing and maintaining scaffold-free organoids/spheroids: an open-hardware benchtop instrument with a stirred/gently-agitated culture vessel, optical density / growth sensing, closed-loop temperature control, perfusion/dosing pumps for media exchange, and a networked experiment API. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation (Pioreactor-class continuous-culture bioreactors) and organoid-culture practice, **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against compact bioreactor / organoid-culture engineering practice.

This is a **benchtop laboratory instrument** in the class of an open-hardware bioreactor / cell-culture appliance (Pioreactor / rotating-wall-vessel scale), NOT a process plant. **Do NOT specify industrial process equipment**: no industrial heat exchangers or chillers, no bulk reservoirs, no industrial/HVAC pumps, no CIP skids. Every part is a **catalogue laboratory or electronics component** a benchtop instrument would use (small stepper/BLDC motors, micro peristaltic/diaphragm pumps, PTC/Peltier heaters, MCU/SBC, small optics), buildable without precision machining.

Target user: pharma/academic organoid labs, contract research organisations, and DIY-bio / teaching labs who need reproducible scaffold-free organoid culture with continuous growth monitoring, without a commercial bioreactor budget.

## System description

- A **culture vessel** (≈2–20 ml class working volume) with sterile-compatible interfaces for sampling, perfusion and dosing, suited to scaffold-free organoid/spheroid suspension culture.
- **Gentle agitation** sized for the vessel (magnetic stir or slow orbital) with a stated RPM band and a low-shear mixing justification (organoids are shear-sensitive).
- **Optical density / growth sensing** with a calibration path, temperature compensation, and stated dynamic range, to track organoid growth non-destructively.
- **Closed-loop temperature control** of the culture at **37 °C** (heater and/or Peltier) with stated stability, CO₂-independent (HEPES-buffered media) so no gas bottle is required.
- **Micro peristaltic or diaphragm perfusion/dosing** for media / waste / reagent exchange, as justified by the control modes offered (batch, perfusion, fed-batch — state which are baseline).
- A **documented network API and browser / host UI** separating sensing, actuation, and experiment recipes.
- Prefer **catalogue pumps, sensors, MCU/SBC, micro-optics and printable structural parts**; buildable without precision machining.
- Mechanically and biologically **safe for bench use** (spill containment, electrical isolation, no plant-scale CIP skids).

## Key constraints (state these as the brief's hard targets)

- **Form:** benchtop organoid-culture bioreactor; printable / fabricated structural parts.
- **Working volume:** ≈2–20 ml class (ml-scale organoid suspension), state the target and why.
- **Culture temperature:** 37 °C set-point with stated closed-loop stability (a hard performance metric — the design MUST hold and report this).
- **Sensing:** OD / growth metric with calibration + temperature compensation.
- **Actuation:** low-shear agitation + thermal + perfusion/dosing (baseline set stated).
- **Control modes:** at least perfusion OR fed-batch with a recipe API (state baseline vs optional).
- **Software:** network API + host UI; experiment-recipe separation.
- **Electronics:** a bespoke control board is expected (MCU + sensor front-ends + motor/heater drivers + connectivity) — design and specify the PCB.
- **Manufacturability:** no precision machining; second-engineer assembly; design-for-manufacture toward a contract manufacturer.
- **Cost:** honest prototype **bill of materials within £250–£400** (benchtop organoid-bioreactor kit band; midpoint ≈ £320 materials) using **catalogue laboratory/electronics parts only**. Do NOT ship plant-scale industrial assemblies — an industrial heat exchanger or bulk pump on this instrument is a scale error.
- **Positioning:** research-use engineering hardware — not clinical / IVD; benchtop lab-instrument scale.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **thermal / mixing / optical calculations**, **parametric CAD**, **electronics (bespoke control PCB)**, **firmware / software**, **API**, **exact bill of materials**, **assembly guide**, **calibration procedures**, and a **growth-curve / perfusion benchmark** protocol.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with PCB outlines and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements (including the 37 °C culture-temperature target).

## Objective

Balanced: meet every stated capability with an honestly priced design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components.
