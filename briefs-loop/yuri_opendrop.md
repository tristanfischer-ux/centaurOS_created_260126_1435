# Digital Microfluidics Controller — Yuri Wet-Lab Benchmark 07 (OpenDrop class)

We are designing a **benchtop digital microfluidics (electrowetting) controller** for droplet experiments: an open-hardware instrument with an electrode array cartridge / PCB, high-voltage drive electronics, droplet sensing or camera observation path as justified, and a host UI for droplet routing recipes. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation, **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against open digital-microfluidics engineering practice.

Target user: teaching labs and microfluidic research groups exploring EWOD droplet protocols without a commercial DMF platform budget.

## System description

- An **electrode array** (PCB or cartridge) with stated electrode pitch / count and dielectric / hydrophobic stack assumptions.
- **High-voltage drive** electronics sized for electrowetting actuation with safety interlocks and stated max voltage / current.
- **Droplet control** (move / merge / split as justified) via sequenced electrode patterns.
- Optional but valued: **imaging or impedance sensing** for closed-loop droplet presence.
- A **host UI + documented protocol** for recipe authoring and execution.
- Prefer **catalogue HV drivers, MCU/SBC, and printable mechanics**; second-engineer assembly.
- Electrical safety for benchtop HV must be explicit (interlock, current limit, enclosure).

## Key constraints (state these as the brief's hard targets)

- **Form:** benchtop digital microfluidics controller + array interface.
- **Array:** electrode pitch / count stated; stack assumptions documented.
- **Drive:** HV actuation with safety interlocks; max V / I stated.
- **Operations:** droplet move (+ merge/split if claimed) with recipe UI.
- **Manufacturability:** catalogue + printable; second-engineer assembly.
- **Cost:** honest prototype **bill of materials within £201–£271** (gold open DMF DIY band; midpoint ≈ £236 materials). Prefer catalogue parts. Do not ship plant-scale industrial assemblies.
- **Positioning:** research-use engineering hardware — not clinical / IVD.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **EWOD / field calculations**, **array + HV electronics**, **firmware / software**, **exact bill of materials**, **assembly / safety checklist**, and a **droplet-routing benchmark** protocol.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with PCB outlines and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability with an honestly priced design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components.
