# USB Potentiostat — Yuri Wet-Lab Benchmark 06 (Rodeostat class)

We are designing a **USB benchtop potentiostat** for electrochemical experiments: a compact open-hardware instrument supporting voltammetry and related techniques with a three-electrode cell interface, current ranges suitable for teaching / research electrodes, and a host GUI with documented protocol. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation, **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against open potentiostat engineering practice.

Target user: teaching labs and small electrochemistry groups who need cyclic voltammetry / chronamperometry without a commercial potentiostat budget.

## System description

- A **three-electrode interface** (working / reference / counter) with stated compliance voltage and current ranges.
- **Techniques:** at least cyclic voltammetry and chronoamperometry (state optional extras).
- **ADC / DAC / TIA** chain sized for the current ranges with noise / bandwidth justification.
- **USB-powered** (or USB + light auxiliary) with galvanic / safety notes for wet-bench use.
- A **host GUI** plus documented serial / USB protocol; calibration and range switching explained.
- Prefer **catalogue ICs, connectors, and a compact PCB**; printable enclosure acceptable.
- No plant-scale industrial I/O racks or DIN-rail PLC assemblies.

## Key constraints (state these as the brief's hard targets)

- **Form:** USB benchtop potentiostat / galvanostat-capable as justified.
- **Electrodes:** WE / RE / CE interface; compliance voltage + current ranges stated.
- **Techniques:** CV + chronoamperometry minimum.
- **Host:** GUI + documented protocol; calibration path.
- **Manufacturability:** catalogue electronics + second-engineer assembly.
- **Cost:** honest prototype **bill of materials within £161–£217** (gold open potentiostat kit band; midpoint ≈ £189 materials). Prefer catalogue parts. Do not ship plant-scale industrial assemblies.
- **Positioning:** research-use engineering hardware — not clinical / IVD.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **analog front-end calculations**, **PCB**, **firmware**, **host software**, **exact bill of materials**, **assembly / calibration**, and a **CV benchmark** protocol on a known redox couple.

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with PCB outlines and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability with an honestly priced design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components.
