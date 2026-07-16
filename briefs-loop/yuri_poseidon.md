# Four-Channel Programmable Syringe-Pump Platform — Yuri Wet-Lab Benchmark 03 (Poseidon class)

We are designing a **four-channel programmable syringe-pump platform** for wet-laboratory and microfluidic experiments, optionally paired with a compact observation / microscope path for concurrent imaging. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation, **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against open syringe-pump / microfluidic dosing engineering practice.

Target user: academic and maker wet labs running microfluidic or reagent-dosing experiments who need independently timed multi-channel infusion/withdrawal without a commercial pump rack budget.

## System description

- A **mechanical drive** that independently **infuses or withdraws** from **four** standard syringes (catalogue barrel sizes via a configurable syringe library).
- **Lead-screw (or equivalent) linear motion** with displacement calculated from syringe geometry and screw pitch / microstepping — finite-volume moves and continuous flow both supported.
- Flow rates covering **microfluidics through reagent dosing** (state the achieved range vs syringe diameter and microstepping).
- **Repeatable direction changes** with **quantified backlash** (measured or bounded by design, not assumed zero).
- **Force / pressure limiting or stall detection** so a blocked line fails safely before structural or syringe rupture.
- **Simultaneous, independently timed channels** under a documented serial (or equivalent) protocol plus a **desktop host GUI**.
- **Calibration retained** by pump channel and syringe type.
- Prefer **readily sourced mechanical parts** and **printable / fabricated custom parts** sized for a small engineering build.
- Optional but valued: a **compact microscope / observation path** that can run alongside the pumps for microfluidic visualisation (state whether integrated or peer system).

## Key constraints (state these as the brief's hard targets)

- **Channels:** **4** independent syringe drives (infuse + withdraw).
- **Syringe library:** multiple catalogue diameters; displacement from geometry × lead-screw motion (show the equations).
- **Motion modes:** finite-volume moves and continuous flow.
- **Backlash:** characterised (design bound + measurement method).
- **Safety:** limit force or otherwise fail safe on blocked line; state the trip mechanism (current limit, stall detect, mechanical stop, pressure sensor — justify).
- **Concurrency:** channels independently timed; no missed-step regimes left undocumented.
- **Host:** desktop control + documented serial (or equivalent) protocol; calibration persisted per pump and syringe type.
- **Manufacturability:** catalogue + printable custom parts; assembly executable by a second engineer.
- **Cost:** honest prototype BOM for a four-channel research pump platform (state the figure); prefer parts the engine can price.
- **Positioning:** research-use engineering hardware. Do **not** present it as a clinical diagnostic or certified medical / IVD device unless a separate regulatory programme is specified.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **linear-travel / syringe-volume equations**, **motor / lead-screw / force calculations** (with margin), **CAD** (carriage guidance, syringe retention for infusion and withdrawal), **motor/driver selection**, **firmware** (channel independence, protocol), **host GUI**, **protocol definition**, **exact bill of materials**, **calibration fixture / method**, **accuracy / repeatability tests** (preferably gravimetric across rates), **blockage-risk analysis**, and **assembly documentation**. Include microscope / observation path design if claimed as part of the system.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with PCB outlines and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability (4 independent channels, syringe library, finite + continuous flow, backlash characterisation, blocked-line safety, concurrent timing, desktop GUI + protocol, retained calibration, manufacturable BOM) with an honestly priced design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components. The hard engineering problems are backlash and structural compliance, blocked-line pressure/force limiting, variable syringe geometry, and reliable concurrent stepper control without missed steps.
