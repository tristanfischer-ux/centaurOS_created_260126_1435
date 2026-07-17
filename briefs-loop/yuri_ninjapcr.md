# Compact PCR Thermocycler — Yuri Wet-Lab Benchmark 02 (NinjaPCR class)

We are designing a **compact PCR thermocycler** for standard **0.2 mL PCR tubes**: a benchtop research instrument that executes user-programmable thermal-cycling protocols (denaturation, annealing, extension, final hold) with closed-loop temperature control, active heating and active cooling, and a browser-based run interface. This is a **research-use engineering hardware** design study for Fractional Forge / ForgeOS — an original design informed by open-source wet-science instrumentation, **not** a clinical diagnostic device, **not** IVD-certified medical equipment. Score the delivered dossier against the black-box brief below and against compact PCR thermocycler engineering practice.

Target user: molecular-biology education labs, maker / open-hardware labs, and small R&D groups running endpoint or simple qPCR-adjacent protocols who need a local, programmable 8+ tube block without a commercial thermal-cycler budget.

## System description

- A **metal sample block** that holds **at least eight** standard **0.2 mL** PCR tubes with intimate thermal contact and low well-to-well temperature gradient.
- **Active heating** (resistive / cartridge / thick-film class — state the chosen technology) sized for the thermal mass and the requested ramp rates.
- **Active cooling** (forced-air / Peltier / hybrid — state the chosen technology) so the block can return toward the low end of the operating range without relying on ambient soak alone.
- **Closed-loop temperature control** with a documented strategy (PID or equivalent), sensor placement justified against the sample (not only the heater), and stability across the full temperature range.
- **User-programmable protocols**: denaturation, annealing, extension and final-hold stages with setpoints, ramp/hold times, and cycle counts retained through a temporary power interruption where safe.
- **Fault detection and safe shutdown**: sensor failure, fan failure, over-temperature, and uncontrolled heating — each fails to a defined safe state (heaters off, alarm / status visible).
- A **browser-based interface** exposing configuration, run status, and temperature logging (setpoint + measured) throughout the run.
- An enclosure and electronics package designed for a **20-unit engineering build** from catalogue parts plus fabricated / printed mechanicals.

## Key constraints (state these as the brief's hard targets)

- **Capacity:** ≥ **8** standard **0.2 mL** PCR tubes.
- **Temperature range:** nominal sample temperatures from **4 °C to 99 °C** (state what is achieved vs ambient-limited if the low end needs active refrigeration).
- **Control:** closed-loop control with a named strategy; state sensor type, placement, and calibration method.
- **Uniformity:** minimise well-to-well temperature differences; state the design target (°C) and how it will be measured (not assumed).
- **Heating & cooling:** both **active**; state heater and cooler selection with thermal-mass / heat-flow calculations that support the claimed ramp rates.
- **Safety:** independent thermal fuse or hardware shutdown path in addition to firmware limits; detect sensor failure, fan failure, over-temperature, uncontrolled heating.
- **UI / logging:** browser-based configuration and run status; log setpoint and measured temperature for the whole run; retain active protocol across a temporary power interruption where safe.
- **Manufacturability:** reproducible in a **20-unit** engineering build.
- **Cost:** target a prototype **bill of materials within £408–£552** for a compact 8-tube research thermocycler (gold open-PCR kit band; midpoint ≈ £480 materials). Prefer catalogue-available heaters, sensors, MOSFETs/SSRs, fans, MCU/SBC, and power supplies the engine can price. Do not ship plant-scale industrial assemblies.
- **Positioning:** research-use engineering hardware. Do **not** present it as a clinical diagnostic device or certified medical / IVD equipment unless a separate regulatory programme is specified.

## Required outputs

Deliver a complete, internally consistent engineering package: **requirements traceability**, **thermal model** (block mass, heater power, cooling capacity, ramp-rate predictions, uniformity argument), **heater and cooler selection**, **sample-block drawings**, **schematic**, **PCB**, **firmware** (protocol engine + PID/control + fault handling), **web interface**, an **exact bill of materials**, **calibration method**, **safety analysis**, **assembly plan**, and a **validation protocol** (including well-to-well uniformity measurement).

## Common delivery rule

The submission must be internally consistent: dimensions in the CAD must agree with the PCB outline and components; firmware pin assignments must agree with the schematic; the BOM must agree with both; and the test procedures must measure the stated performance requirements.

## Objective

Balanced: meet every stated capability (≥8×0.2 mL tubes, 4–99 °C nominal, closed-loop control, active heat + cool, fault detection, browser UI, temperature logging, protocol retention, 20-unit build) with an honestly priced BOM and a design a second engineer could assemble and calibrate. Prefer real, catalogue-available parts over invented components. The hard engineering problems are rapid bidirectional thermal control, sample-block uniformity, safe high-current heater switching, and robust control-loop tuning.
