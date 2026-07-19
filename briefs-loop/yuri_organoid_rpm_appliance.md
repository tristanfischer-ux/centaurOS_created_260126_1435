# Organoid Microgravity-Simulation Appliance — Yuri Wet-Lab Benchmark (RPM-appliance class)

We are designing a **benchtop organoid microgravity-simulation appliance** — a "microgravity incubator in a box": a sealed desktop instrument that applies random-positioning-machine (RPM) motion to a drop-in organoid cassette while incubating, perfusing, and imaging it, driven entirely by the consumable. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-hardware wet-science instrumentation and published microgravity-simulator practice (random positioning machines, rotating-wall vessels), **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against benchtop cell-biology instrument engineering practice.

Target user: pharma/academic organoid labs, contract research organisations, and the installed base of RPM users who want reproducible organoid culture results without building a rig — the ground, recurring-revenue flagship of a razor-and-blade product line (the appliance is the razor; the cassette is the blade).

## System description

- A **dual-axis random-positioning gimbal** that continuously reorients a docked cassette to time-average gravity toward zero, with a stated rotation band (**≈1–20 rpm class**, slow) and a mixing / time-averaged-gravity justification.
- A **cassette dock** with a keyed mechanical + fluidic + optical + data interface accepting an ANSI/SLAS-footprint organoid cassette (the consumable); state the registration and sealing approach.
- **CO₂-independent incubation** of the docked cassette (**≈15 litre chamber class**) at 37 ± 0.2 °C using HEPES-buffered media so no gas bottle is required; closed-loop thermal stability characterised.
- **Perfusion**: a micro positive-displacement or peristaltic pump plus solenoid microvalves circulating media through the cassette, with a bubble-trap strategy (bubbles are lethal in reduced-gravity culture); state flow band.
- **In-line live-cell imaging** (compact widefield / phase module, low-power) reading the cassette optical window, streaming images to the host.
- A **documented network API and browser / host UI** separating motion, incubation, perfusion, imaging, and experiment recipes.
- Prefer **catalogue motors, encoders, pumps, sensors, MCU/SBC, optics, and printable/fabricated structural parts**; buildable without precision machining.
- Mechanically and biologically **safe for bench use** (spill containment, electrical isolation, sealed enclosure, no plant-scale skids).

## Key constraints (state these as the brief's hard targets)

- **Form:** sealed benchtop appliance, approx 400 × 400 × 450 mm class; printable / fabricated structural parts.
- **Motion:** dual-axis RPM, ≈1–20 rpm band, with time-averaged-gravity rationale.
- **Incubation:** 37 ± 0.2 °C, CO₂-independent (HEPES media), ≈15 L chamber class.
- **Perfusion:** pump + valves + bubble trap; state flow band and dead volume.
- **Imaging:** in-line live-cell widefield/phase, < 5 W, reads the cassette window.
- **Consumable interface:** keyed ANSI/SLAS cassette dock (mech + fluidic + optical + data + ID).
- **Software:** network API + host UI; experiment-recipe separation.
- **Manufacturability:** no precision machining; second-engineer assembly; design-for-manufacture toward a contract manufacturer.
- **Cost:** honest prototype **bill of materials within £2,000–£4,000** (research-grade benchtop RPM-appliance band; midpoint ≈ £3,000 materials). Prefer catalogue parts the engine can price. Do not ship plant-scale industrial assemblies.
- **Positioning:** research-use engineering hardware — not clinical / IVD.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **motion / thermal / mixing / optical calculations**, **parametric CAD**, **electronics**, **firmware / software**, **API**, **exact bill of materials**, **assembly guide**, **calibration procedures**, and an **organoid culture / time-averaged-gravity benchmark** protocol.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with PCB outlines and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability with an honestly priced design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components.
