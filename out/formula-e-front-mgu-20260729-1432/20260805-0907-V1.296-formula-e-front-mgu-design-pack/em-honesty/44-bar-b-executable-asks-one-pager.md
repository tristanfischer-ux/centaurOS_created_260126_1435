# Bar B executable partner asks — one-pager

**Twin:** `formula-e-front-mgu-20260729-1432` · **ship_ok: false** · **NOT_HOMOLOGATED**

Path B dual-bar reality (software screen, not dyno): mean |T| **122.1 N·m** · architecture duty **104.1 N·m** · conservative binding **125.2 N·m**. `duty_torque_screen_ok=false`, `torque_reliable=false`.

Bar B closes only on **measured** evidence. This page is the ask list — not a clearance.

| Pri | Hold | Artefact | Format (summary) | Conditions (summary) | Unblocks |
|---:|---|---|---|---|---|
| 1 | **BARB-DUTY-CYCLE** | Team lap / stint telemetry or FIA energy-tool export | CSV: `time_s`, speed, front regen power **or** HV V+I, `brake_pressure_bar` + 1-page session PDF | ≥20 Hz (100 Hz preferred); ≥10 flying laps or 1 race stint; confirms or reverses DEC-008 24 s/100 s from **data only** | DEC-007 E_net; DEC-008/009 hang on this |
| 2 | **BARB-DYNO** | Calibrated MGU+inverter map **with calorimetric loss split** | CSV torque/η/temps/loss + cal certs | A-COOL 60 °C / 12 L/min; speed ≤1000 rpm steps to 24k class; torque grid to ≥104.1 N·m ≤25 N·m steps | DEC-010; collapses iron-loss 3.9–8.5 kW band |
| 3 | **BARB-FLOW-BENCH** | Jacket + cold-plate Δp/flow **and** wall temps | CSV per article + rig PDF | 3–20 L/min incl. 12 L/min; iron/slot/jacket/module/land taps (Δp alone not enough) | Calibrates Rth seeds 0.006 / 0.0077 |
| 4 | **BARB-ICD-XYZ** | Chassis / FIA port XYZ ICD | STEP + CSV mm + Euler + tolerance | HV, coolant×2, LV/CAN, halfshafts, 4 mounts — **mm mandatory** | Machine datums / harness / mount FEA |
| 5 | **BARB-GERBERS** | Supplier-release Gerbers + pinout ICD | RS-274X/ODB++ + Excellon + PnP + stack-up | SUPPLIER RELEASE label; mates frozen SiC MPN — **not** Forge drafts | Fab intent; production HIL bare boards |
| 6 | **BARB-SIC-MODULE** | Frozen SiC MPN + thermal package | Datasheet PDF + package STEP + Rth/SOA tables | At A-COOL convertible ratings; rev-matched BOM | Heater-plate + double-pulse geometry |
| 7 | **BARB-ROTOR-RETENTION** | Instrumented overspeed on as-built rotor | CSV speed/vib/strain + signed PDF + NDT | Guarded spin to ≥ screen 19500 rpm (24k if release article) | DEC-006; FoS≈2.635 is screening only |
| 8 | **BARB-HIL** | HIL pass on populated inverter | PDF matrix + CSV/MF4 traces | Safe-off/desat ≤10 µs class; sense ±5%; resolver/CAN/HVIL cases | Firmware functional claim |
| 9 | **BARB-HEATER-PLATE** | Module/TIM/plate thermal correlation | CSV power + interface temps + Rth | ~4.32 kW class steps @ 60 °C / 12 L/min | DEC-001 thermal; retunes module_to_coolant |
| 10 | **BARB-DOUBLE-PULSE** | Measured commutation-loop ESL | Scope CSV + derived ESL/Eon/Eoff table | 750 V class; band 3–15 nH (seed ~6.39 nH is not measured) | Switching loss / gate settings |

## Already have (do not re-ask)

- Path B FE mean |T|≈122.1 N·m; dual duty bars 104.1 / 125.2; DEC-008 vignette 24/100 s  
- OpenFOAM jacket/cold-plate + network Δp≈45.1 kPa, T_module≈77.6 °C (screening)  
- CalculiX rotor FoS≈2.635 @ 19500 rpm (not instrumented spin)  
- 2 Forge routed boards (gate-drive + control), DRC 0, **NOT_FABRICATION_READY**  
- Types-only ICD + bay envelope 343×259×267 mm — **no XYZ**  
- ESL analytical seed ~6.39 nH — **no measured loop**  
- Firmware bring-up contract SPEC — **hil_present=false**

## Hard stops

1. Do **not** invent dyno CSV, Gerbers, chassis XYZ, HIL PASS, or measured ESL.  
2. Do **not** mint `ship_ok`, `CLEARED`, or `homologated` from software.  
3. Do **not** set `torque_reliable=true` without map-correlation policy + measured map.  
4. If stuck: improve the **ask**, not the estimate.

Machine-readable pack: `_motor_stack/bar_b_executable_asks.json`  
Register: `JLR-FE-FRONT-FPK-BAR-B-READINESS.json`
