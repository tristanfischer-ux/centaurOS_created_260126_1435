# NinjaPCR PCB Software Proof — Worked Example Plan

**Date:** 2026-07-18  
**Status:** Isolated benchmark; not wired into the chain  
**Prototype:** `prototypes/ninjapcr-pcb-software-benchmark/`

## Why NinjaPCR

NinjaPCR is the strongest first worked example because its frozen gold repository contains:

- a matched custom thermocycler PCB/schematic;
- substantial ESP8266/Arduino firmware;
- temperature sensing;
- Peltier direction/PWM control;
- lid heater control;
- fan control;
- Wi-Fi/serial communications;
- explicit safe-state code.

It exercises sensing, power actuation and communications without the multi-board complexity of Pioreactor/OpenDrop or the “no custom PCB” architecture of Poseidon/OpenFlexure.

Gold evidence:

```text
out/_gold-ninjapcr-repo/kicad/NinjaPCR/NinjaPCB_ver2.3.sch
out/_gold-ninjapcr-repo/arduino/NinjaPCR/board_conf_ninjapcrwifi.h
out/_gold-ninjapcr-repo/arduino/NinjaPCR/thermocycler.cpp
out/_gold-ninjapcr-repo/arduino/NinjaPCR/NinjaPCR.ino
```

## Proof objective

Create a minimal bring-up image—not product firmware—that proves:

1. firmware pin roles map to real schematic nets;
2. NAU7802 I²C bus is bound;
3. lid heater, Peltier A/B/PWM and fan channels all exist;
4. all power outputs default safe;
5. a communications banner is available;
6. the proof contract is hash-bound to the frozen schematic/header;
7. mutations (missing net, missing channel, unsafe output) fail.

## Gold contract

| Firmware role | Firmware pin | Schematic net |
|---|---:|---|
| Lid heater PWM | GPIO15 | `HEATER` |
| Peltier PWM | GPIO4 | `PEL_PWM` |
| Peltier direction A | GPIO12 | `PEL_SWA` |
| Peltier direction B | GPIO13 | `PEL_SWB` |
| Fan | GPIO0 | `FAN` |
| NAU7802 SCL | GPIO14 | `SCLK` |
| NAU7802 SDA | GPIO2 | `SDIO` |
| NAU7802 ready | GPIO5 | `DRDY` |
| Well temperature | ADC/NAU7802 | `WELL_TEMP` |
| Lid temperature | ADC | `HEATER_TEMP` |
| Serial host | UART | `TXD` / `RXD` |

## Important gold finding

The raw Wi-Fi header assigns GPIO16 to several roles:

- thermistor range switch;
- Wi-Fi mode;
- well high-temperature control;
- disabled LCD role.

The worked example must report this collision. The minimal bring-up proof deliberately excludes the disputed GPIO16 roles until their multiplexing/compile-time exclusivity is proven. That keeps the benchmark honest rather than copying a conflict into the reference.

## Learning loop

### Loop 1 — static extraction

- parse legacy KiCad labels;
- parse firmware `#define PIN_*`;
- check required nets and pins;
- detect collisions;
- emit a normalized proof spec.

### Loop 2 — native executable proof

- feed the normalized spec into `prototypes/pcb-firmware-proof/`;
- generate C11;
- compile and run;
- require boot, I²C, identity, channel, communications and safe-actuation PASS.

### Loop 3 — adversarial mutations

- remove `PEL_PWM` from schematic labels;
- reduce required actuator count;
- make Peltier safe default on;
- duplicate I²C address;
- change schematic after proof hash.

Every mutation must fail for the expected reason.

### Loop 4 — real ESP8266 compile

In an isolated tool directory:

1. install/pin Arduino CLI or PlatformIO;
2. install/pin ESP8266 core and required libraries;
3. compile the unmodified gold firmware to establish baseline;
4. compile the minimal proof sketch;
5. record FQBN, versions, binary size and source hash.

Until this succeeds, status is `ENGINEERING DRAFT`.

### Loop 5 — populated-board HIL

When hardware exists:

- flash proof image;
- require boot banner within 2 seconds;
- scan NAU7802;
- verify heaters/Peltier default off;
- use a hash-derived arm token;
- pulse outputs only under safe dummy loads;
- capture current-revision transcript.

Only HIL can produce `FUNCTIONALLY VERIFIED`.

## Acceptance

The isolated worked example is complete when:

- static gold extraction passes required net/pin checks;
- raw GPIO16 collision is surfaced;
- normalized minimal proof compiles/runs;
- all adversarial tests pass;
- real MCU compile is attempted and honestly recorded;
- no production chain files are modified.

