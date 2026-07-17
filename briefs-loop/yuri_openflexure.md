# Motorised Flexure-Stage Microscope — Yuri Wet-Lab Benchmark 04 (OpenFlexure class)

We are designing a **low-cost motorised inverted microscope** for automated imaging of biological samples: a benchtop research instrument with additive-manufactured structural parts, geared stepper-driven X/Y/focus motion, webcam-grade and RMS optics options, transmitted brightfield illumination, and a documented network API plus browser interface. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation, **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against compact flexure-stage microscope engineering practice.

Target user: education labs, maker / open-hardware labs, and small R&D groups who need automated brightfield imaging, tiled acquisition, and time-lapse without a commercial inverted-microscope budget.

## System description

- An **optical path** that accepts **interchangeable webcam-grade cameras** and **RMS-threaded microscope objectives**, with sampling justified against objective NA and camera pixel size.
- **Motorised X, Y, and focus** stages sized for biological slides / culture vessels; motion architecture that manages friction, backlash, and stick-slip (flexure / printed-stage class is acceptable when justified).
- **Repeatable sub-micron focus** adjustment (state resolution, travel, and how it is verified).
- **Transmitted brightfield illumination** with uniformity and heat management addressed.
- **Automated focus, tiled acquisition, and time-lapse** workflows with objective autofocus metrics and failure handling.
- A **documented network API and browser interface** cleanly separating camera, stage, and experiment control.
- Prefer **additive-manufactured structural parts** and **low-cost geared stepper motors**; buildable **without precision machining**.
- Mechanically **stable over multi-day experiments** (state drift / repeatability measurement).
- Allow an **optional fluorescence / filter-cube upgrade** path (state what is in baseline vs optional).

## Key constraints (state these as the brief's hard targets)

- **Form:** benchtop inverted (or equivalently sample-accessible) research microscope; printable / fabricated structural parts.
- **Optics:** webcam-grade + RMS objective interchange; optical sampling calculations (NA × pixel size) documented.
- **Motion:** motorised X, Y, focus; sub-micron focus resolution claimed with a measurement method.
- **Illumination:** transmitted brightfield; uniformity and thermal load addressed.
- **Automation:** autofocus with a defined metric + failure handling; tiled + time-lapse acquisition.
- **Software:** network API + browser UI; camera / stage / experiment control separation.
- **Stability:** multi-day drift / repeatability characterised (method + acceptance).
- **Upgrade path:** optional fluorescence / filter cube (baseline remains brightfield).
- **Manufacturability:** no precision machining required; assembly executable by a second engineer.
- **Cost:** honest prototype **bill of materials within £146–£240** (gold open flexure-stage kit band; midpoint ≈ £198 materials). Prefer catalogue motors, optics, cameras, MCU/SBC, and illumination the engine can price. Do not ship industrial plant-scale parts.
- **Positioning:** research-use engineering hardware. Do **not** present it as a clinical diagnostic or certified medical / IVD device unless a separate regulatory programme is specified.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **optical path / resolution / sampling calculations**, **parametric CAD** (stage, body, optics mounts), **motor and control electronics**, **firmware / software**, **API**, **exact bill of materials**, **assembly guide**, **calibration procedure**, **stability testing**, and an **imaging benchmark** protocol.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with PCB outlines and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability (interchangeable optics, motorised XYZ/focus, sub-micron focus, brightfield, autofocus + tile + time-lapse, API + browser UI, printable structure, multi-day stability, optional fluorescence path) with an honestly priced design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components. The hard engineering problems are nanometre-to-micron positioning from printed parts, optical alignment, thermal/mechanical drift, and reliable autofocus.
