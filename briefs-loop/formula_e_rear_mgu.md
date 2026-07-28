# Formula E GEN4 Rear Motor-Generator Unit (MGU) + MCU — Anvil Trial Brief

**Product class (Anvil):** `formula_e_rear_mgu` — the deliverable is the **rear MGU + MCU (SiC motor control unit / inverter)** product pair plus gear and cooling interfaces. This is **not** a full Formula E race car, chassis, battery pack, or front-MGU design.

We are designing a **manufacturer-perimeter rear motor-generator unit and its motor control unit (inverter)** for a Formula E GEN4-class race car. The MGU is one element of an integrated **rear powertrain**: MGU, MCU/inverter, gearbox, differential interface, driveshafts, cooling, and controls. It must convert battery DC power into mechanical torque at the rear axle in propulsion, and convert mechanical braking energy back into electrical energy in regeneration — under FIA electrical power-flow limits, packaging, and homologation rules.

This brief is for an **Anvil Design Dossier trial**. It uses **public FIA GEN4 outer-box constraints** plus **explicit engineering assumptions** where Jaguar / TCS Racing proprietary data are not available. The credible workflow is: build a requirements and missing-data report → size a parameterized radial-flux permanent-magnet machine + SiC MCU → couple gear ratio, thermal and rotor integrity → evaluate against a representative duty cycle → return a Pareto of options with full consequence chains. **Do not invent a race-winning motor from a blank sheet and claim it is homologation-ready.**

Target customer / programme context: Formula E manufacturer team operating the rear powertrain perimeter (e.g. Jaguar TCS Racing class of problem). Front MGU remains common hardware; this brief covers **rear only**.

---

## System description

- One rear MGU (motoring + generating), liquid-cooled, high-speed permanent-magnet synchronous architecture (baseline: radial-flux IPMSM; topology remains a trade variable)
- One rear MCU (SiC three-phase inverter / motor control unit), homologated with the MGU as a pair
- Reduction gear stage(s) between MGU shaft and rear driveshaft / differential interface (ratio is a co-design variable; only one ratio set homologated per cycle)
- Shared rear-powertrain cooling loop interfaces (coolant inlet temperature and flow are boundary conditions)
- Rotor-position and temperature sensing; field-weakening and MTPA control under DC-bus voltage and phase-current limits
- Packaging inside the rear main structure / sprung mass per FIA manufacturer volumes (Drawing 13 class interfaces — CAD volume TBD when supplied)
- Design must close electromagnetically, thermally, and mechanically on a **race duty cycle**, not only at a single peak-power point

---

## Key constraints (public FIA + trial assumptions)

### Hard regulatory outer box (public GEN4-class)

State these as hard constraints. Electrical power is **DC-bus power flow**, not shaft mechanical power.

| Constraint | Value | Notes |
|---|---|---|
| Number of rear MGUs | 1 | Manufacturer rear perimeter |
| Max battery power through rear powertrain | 350 kW | Electrical power flow |
| Max regeneration into battery through rear | 350 kW | Electrical power flow |
| Max rotor speed | 100,000 rpm | Ceiling, not the design target |
| Min electrical-steel lamination thickness | 0.05 mm | |
| Max vehicle system voltage | 1,000 V | Except MGU phases |
| Location | Sprung mass; survival cell or rear main structure | |
| Homologation | One rear MGU/MCU specification per homologation cycle | |
| Cooling | Manufacturer-developed rear-powertrain cooling | Phase-change generally prohibited in manufacturer perimeter |
| Car-level battery power (context) | Up to 600 kW | ≤350 kW rear / ≤250 kW front |
| Car-level regen (context) | Up to 700 kW | ≤350 kW per axle |

### Trial design targets (assumptions — replace with JLR data when available)

These numbers let Anvil close a first dossier. Mark every derived result that depends on them as **assumption-anchored**, not measured.

- **Baseline architecture:** liquid-cooled radial-flux interior permanent-magnet synchronous machine (IPMSM), three-phase, SiC MCU
- **Illustrative continuous / race-mean rear electrical throughput:** design for sustained operation around **150–250 kW** electrical with peaks to the **350 kW** axle cap
- **Illustrative shaft torque band at useful speed:** on the order of **40–120 Nm** depending on chosen base speed and gear ratio (from \(P = T\omega\); account for inverter + MGU + gear losses)
- **Illustrative base / corner speed for sizing:** start trades near **30,000–50,000 rpm** MGU shaft (not 100,000 rpm unless rotor integrity and gearing close honestly)
- **Gear ratio:** co-design variable; trial seed **6:1 to 12:1** reduction to road-wheel speed class — state the chosen ratio and wheel-side torque
- **DC bus operating window (assumption):** **600–900 V** usable under race SoC/temperature (absolute vehicle max 1,000 V)
- **Phase current ceiling (assumption):** size MCU and winding for peak phase current consistent with 350 kW at the low end of the Vdc window — state \(I_{ph,max}\)
- **MCU switching frequency (assumption seed):** **10–40 kHz** SiC — trade efficiency vs thermal vs control bandwidth
- **Coolant (assumption):** water/glycol; inlet **50–65 °C**; flow **10–20 L/min** to the MGU/MCU cold plates (replace with measured loop data)
- **Winding limit:** ≤180 °C hotspot; **magnet limit:** ≤150 °C (or grade-specific — state grade)
- **Rotor integrity:** stress margin ≥1.5 on rim/sleeve at max used speed; tip-speed and retention called out explicitly
- **Efficiency objective:** minimise **net race electrical energy** and mass for a stated duty cycle — not peak dyno efficiency alone
- **Mass target (assumption):** MGU + MCU combined dry mass **≤35 kg** as a trial aspiration (replace with team target)
- **Unit cost ceiling (programme study):** not a production consumer product — cost the BoM honestly for a low-volume motorsport run (state £/unit and tooling separately); no false catalogue mass-market pricing
- **Annual volume (study):** 10–40 units per homologation cycle class of volume
- **Primary objective order:** (1) regulatory compliance, (2) duty-cycle energy + thermal closure, (3) rotor integrity at speed, (4) mass, (5) manufacturability / supply risk

### Brief metrics (exact keys for compliance)

| key_metric | value | unit |
|---|---:|---|
| `rear_electrical_power_cap_kw` | 350 | kW |
| `rear_regen_electrical_cap_kw` | 350 | kW |
| `max_rotor_speed_rpm` | 100000 | rpm |
| `min_lamination_thickness_mm` | 0.05 | mm |
| `max_system_voltage_v` | 1000 | V |
| `assumed_vdc_min_v` | 600 | V |
| `assumed_vdc_max_v` | 900 | V |
| `assumed_mgu_mcu_mass_cap_kg` | 35 | kg |
| `assumed_coolant_inlet_c` | 60 | °C |
| `winding_temp_limit_c` | 180 | °C |
| `magnet_temp_limit_c` | 150 | °C |
| `rotor_stress_margin_min` | 1.5 | — |

Emit matching delivered quantities in the contract where derived (e.g. `mgu_shaft_torque_nm`, `mgu_base_speed_rpm`, `gear_ratio`, `inverter_efficiency`, `mgu_efficiency`, `tip_speed_m_s`, `phase_current_max_a`).

---

## Representative duty cycle (trial histogram — replace with track logs)

Until lap time-series are supplied, evaluate designs against this **illustrative histogram** (bins of MGU shaft speed, torque, duration). Positive torque = motoring; negative = regen. Use tool `powertrain:duty-cycle-energy` and couple `inverter:sic-loss` + `motor:loss-point` at bin centres where possible.

| speed_rpm | torque_nm | duration_s | mode |
|---:|---:|---:|---|
| 15000 | 80 | 8 | accelerate |
| 25000 | 55 | 12 | accelerate |
| 35000 | 35 | 20 | cruise / partial |
| 45000 | 20 | 25 | high-speed partial |
| 40000 | -40 | 10 | regen |
| 30000 | -60 | 8 | regen |
| 20000 | -30 | 6 | regen |
| 10000 | 10 | 11 | low-speed |

Total ≈ 100 s vignette. Scale or replace with full-lap / full-race logs when available. Report net electrical energy (kWh), loss energy, motoring vs regen time, and peak |P_elec|.

---

## Safety, regulatory and homologation

- FIA Formula E technical regulations for the applicable GEN4 / Season homologation cycle (rear MGU/MCU, packaging, sensors, materials)
- FIA manufacturer packaging volumes and Drawing 13 interface constraints (when documents are supplied)
- Homologation: **one** rear MGU/MCU specification per cycle — design for freezeability and evidence pack
- Electrical safety / HV practices appropriate to a ≤1,000 V traction system
- EMC of the MCU and harness appropriate to a race car (state assumptions; do not invent passing tests)
- Magnet retention / rotor burst margin documented; no undocumented sleeve or bandage
- Cooling: no phase-change materials in the manufacturer perimeter unless an allowed electronics exception is explicitly cited

---

## Sub-modules expected

1. **MGU electromagnetic machine** — stator (laminations, winding), rotor (magnets, bridges/barriers, retention), shaft, bearings, sensors  
2. **MCU / inverter** — SiC power stage, DC link, gate drive, current/voltage sensing, control (MTPA / field-weakening / regen)  
3. **Gear reduction** — ratio set, efficiency, lubrication / mesh speed limits  
4. **Thermal management** — cold plates / jackets, coolant interfaces, derating map  
5. **Mechanical structure / packaging** — casing, mounts, CoG contribution, Drawing 13 compliance (when CAD volume known)  
6. **Harness and interfaces** — HV DC, phase leads, sensors, coolant  
7. **Controls & protection** — over-current, over-speed, demagnetisation margin, thermal protection  
8. **Manufacturing & inspection** — lamination stack, magnet insert, balancing, end-of-line tests  

Anvil tools expected to contribute (registered pack): `inverter:sic-loss`, `inverter:current-voltage-envelope`, `inverter:field-weakening-mtpa`, `motor:ipmsm-analytical-sizing`, `motor:loss-point`, `motor:rotor-centrifugal-stress`, `motor:thermal-lumped`, `gear:traction-ratio`, `powertrain:duty-cycle-energy`.

---

## Explicit non-goals

- Not the common **front** MGU (FIA-supplied / common hardware)
- Not a road-car EV drive unit or e-bike motor
- Not a claim of dyno correlation without JLR measured maps
- Not a claim of FIA homologation approval — only a compliance **matrix** and evidence list
- Not optimising peak efficiency at one dyno point while ignoring race energy, cooling, inverter loss, or rotor stress

---

## Missing proprietary inputs (must appear as Holds / Questions)

Anvil must list these as open items; do not silently invent them as facts:

1. Existing / reference rear MGU CAD, materials, winding and magnet grade  
2. Dyno torque–speed, efficiency and loss maps; thermal test data  
3. Inverter voltage/current/switching limits and measured loss maps  
4. Gearbox ratio(s) and mesh efficiency; differential / driveshaft limits  
5. Battery V vs SoC/temperature; peak current envelopes  
6. Coolant Tin, flow, pressure drop budget for the rear loop  
7. FIA Drawing 13 / packaging volume CAD and mass / CoG targets  
8. Full-lap and full-race duty-cycle time-series (speed, torque, Iph, Vdc, coolant)  
9. Reliability / life / inspection requirements  
10. Approved suppliers and manufacturing process constraints  

---

## Success for this Anvil run

A Design Dossier that a powertrain engineer would take seriously as a **trial**:

1. **Requirements & compliance matrix** against the FIA outer box + this brief’s assumptions  
2. **Parameterized baseline IPMSM + SiC MCU** with torque–speed envelope, current/voltage ceilings, and loss breakdown  
3. **Coupled** gear ratio, thermal, and rotor-stress closure (or honest fail with the lever that recovers)  
4. **Duty-cycle energy** result on the histogram above (or on supplied logs)  
5. **Holds list** naming every proprietary input still required before a credibility-gate correlation  
6. Every number carrying provenance; no claim of “FUNCTIONALLY VERIFIED in hardware” without dyno/HIL evidence  

First deliverable priority: **requirements + missing-data report + analytical baseline**, not a production-ready homologation pack.
