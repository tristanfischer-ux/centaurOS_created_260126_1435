# Radical Library Depth Audit — 2026-05-11 (Phase B Iter 2)

## Methodology

For each of the 32 sentences in `character-hierarchy.ts`, count words and
characters per word. Flag any sentence with only 1 word, OR any word with only
1 character, as **under-decomposed**.

A real BoM should have **150-300 line items for a BESS**, **75-150 for a heat
pump**, etc. Iter 0/1 ended at ~21 leaves for BESS — the depth ratio gap is
the dominant cause of BoM ❌ in 10/10 classes (V6 multimodal).

## Audit table

Legend:  * = under-decomposed (≤1 word OR ≤1 char/word).
Counts are **before** Iter 2 expansion.

### BESS class (8 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| battery_rack_assembly | 2 | 1,1 (2) | * cells single-char only |
| battery_management_system_bms | 2 | 1,1 (2) | * BMS as 1 character is a fiction |
| power_conversion_system_pcs | 2 | 1,1 (2) | * |
| dc_distribution_switchgear | 3 | 1,3,1 (5) | OK-ish |
| thermal_management_system | 2 | 1,2 (3) | * |
| fire_detection_and_suppression_system_fss | 2 | 2,2 (4) | * thin |
| energy_management_system_ems_scada | 2 | 1,2 (3) | * |
| container_enclosure_fit_out | 2 | 1,3 (4) | * |
| **TOTAL BESS** | **17** | **25** | — |

### Heat pump class (4 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| refrigerant_circuit | 7 | 1,2,2,2,3,2,2 (14) | OK from Iter 0 |
| hydronic_circuit | 2 | 1,3 (4) | * |
| heat_pump_controls | 1 | 1 (1) | * single word |
| heat_pump_enclosure | 1 | 4 (4) | * single word |
| **TOTAL HP** | **11** | **23** | — |

### Vfarm class (4 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| growing_rack_system | 1 | 2 (2) | * |
| lighting_system | 1 | 2 (2) | * |
| fertigation_loop | 1 | 3 (3) | * |
| hvac_co2_system | 2 | 2,2 (4) | * |
| **TOTAL VFARM** | **5** | **11** | — |

### Drone class (3 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| airframe_structure | 1 | 3 (3) | * single word |
| propulsion_system | 1 | 2 (2) | * single word |
| flight_computer | 1 | 2 (2) | * single word |
| **TOTAL DRONE** | **3** | **7** | — |

### EV charger class (2 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| charger_power_conversion | 1 | 3 (3) | * single word |
| charger_enclosure | 1 | 2 (2) | * single word |
| **TOTAL EV-C** | **2** | **5** | — |

### Bioreactor class (3 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| bioreactor_vessel | 1 | 3 (3) | * single word |
| bioreactor_controls | 1 | 3 (3) | * single word |
| bioprocess_vessel (Iter 1) | 4 | 2,3,2,2 (9) | OK from Iter 1 |
| **TOTAL BIO** | **6** | **15** | — |

### Edge AI class (1 sentence)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| edge_compute_system | 1 | 3 (3) | * single word |
| **TOTAL EDGE** | **1** | **3** | — |

### AUV class (2 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| hull_and_buoyancy | 1 | 3 (3) | * single word |
| subsea_pressure_vessel (Iter 1) | 2 | 4,4 (8) | OK from Iter 1 |
| **TOTAL AUV** | **3** | **11** | — |

### CGM class (2 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| biosensor_system | 1 | 2 (2) | * single word |
| medical_wearable_enclosure | 2 | 1,1 (2) | * |
| **TOTAL CGM** | **3** | **4** | — |

### HAPS class (2 sentences)

| Sentence | # words | chars/word (sum) | Flag |
|---|---|---|---|
| haps_airframe | 1 | 3 (3) | * single word |
| solar_electric_airframe (Iter 1) | 3 | 3,3,2 (8) | OK from Iter 1 |
| **TOTAL HAPS** | **4** | **11** | — |

### Cross-class shared

- thermal_management_system, container_enclosure_fit_out, fss, propulsion_system,
  flight_computer, edge_compute_system are tagged for multiple classes via
  `allowed_classes` — they will be reused.

## Summary

- 32 sentences, 56 words, 110 character mappings (PRE-Iter 2).
- **27 of 32 sentences** are flagged as under-decomposed.
- BESS — the showcase class — has 8 sentences but only 25 character mappings.
  A real 3.5 MWh BESS BoM has 150-300 line items.
- The expansion target for Iter 2 is "looks like a real BoM, not a sketch".

## Iter 2 expansion plan (priority order)

1. **BESS depth** — battery_management_system_bms (split master+slave+comm with
   real ICs), battery_rack_assembly (cell-string ancillaries: tap leads, cell
   monitor, busbars, spacers), dc_distribution_switchgear (full breaker stack +
   surge + earthing), energy_management_system_ems_scada (gateway + PSU +
   protection + monitoring relays), container_enclosure_fit_out (HVAC, lighting,
   convenience power, CCTV, access control, earthing).
2. **Heat pump depth** — hydronic_circuit (pump, expansion vessel, PRV, PRH,
   isolation valves, manifolds), hp_controls_compute (HMI, sensor stack, PSU,
   safety relay, defrost timer), hp_enclosure_structure (mounts, vibration
   isolators, drip tray, condensate, drainage).
3. **EV charger depth** — charger_pcs (rectifier + DC-DC + filters + inrush +
   contactors), charger_enclosure_structure (HMI, payment, RCD, RFID, ELV
   safety circuit, cable management, lock).
4. **CGM depth** — biosensor_hardware (electrode, AFE IC, BLE SoC, antenna,
   crystal, battery, accelerometer); wearable_housing (overmould, adhesive
   patch, applicator interface).
5. **Drone depth** — airframe_body (carbon spar, motor mount, landing skid,
   battery tray, payload bay, fasteners); propulsion_motors (motor, ESC,
   propeller, retention, current sensor); avionics_compute (FCU, GPS, IMU,
   compass, telemetry, receiver, OSD).
6. **Bioreactor depth** — bioreactor_sensing (pH, DO, temp, pressure, level,
   foam, OD), bioreactor_vessel_body (jacketed shell, CIP/SIP ports, sight
   glass, top plate, sample port, harvest valve).
7. **AUV depth** — hull_structure (frame, fairing, syntactic foam mast); the
   subsea_pressure_vessel sentence already has good Iter 1 depth.
8. **HAPS depth** — haps_airframe (spar, ribs, skin, control surfaces, mass
   balance, mounting hardware); solar_electric_airframe is OK from Iter 1.
9. **Vfarm + edge_ai** — minor expansion for completeness.

## Constraints

- Use ONLY the 22 commissioned radicals (no new radical design).
- Each new character: ≥1 radical assigned, realistic name, MPN hint where
  knowable, fall through to Grade-D otherwise.
- Each new word/character must have its sentence's `allowed_classes` correct.
- The `derive*MandatoryCharacters()` lists in `structural-builder.ts` MUST be
  extended in lock-step with each new character — otherwise the builder filters
  the new character out at Step 0 (the LLM-or-mandatory dual-track.)
- `MPN_HINTS_BY_CHARACTER` and (if class-specific) `CLASS_AWARE_MPN_HINTS` in
  `4b-radical-resolution.ts` get the new MPNs.

## Expected post-Iter 2 totals (target)

| Class | Pre-Iter2 leaves | Target |
|---|---|---|
| BESS | ~21 | 80-120 |
| Heat pump | ~11 | 30-50 |
| EV charger | ~5 | 20-30 |
| CGM | ~4 | 15-25 |
| Drone | ~7 | 20-30 |
| Bioreactor | ~13 | 25-40 |
| AUV | ~11 | 20-30 |
| HAPS | ~11 | 20-30 |
| Edge AI | ~3 | 10-15 |
| Vertical farm | ~7 | 15-25 |
