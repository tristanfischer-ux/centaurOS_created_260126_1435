# NinjaPCR PCB Software Proof — Worked Result

## Verdict

**Real target compile: PASS**  
**Native contract execution: PASS**  
**Physical hardware HIL: NOT RUN**

Current honest status:

> `FAB-READY SOFTWARE PROOF — UNPROVEN IN HARDWARE`

## Evidence

- Native proof:
  - boot/link PASS;
  - NAU7802 I²C binding PASS;
  - component identity contract PASS;
  - lid heater channel 1/1 PASS;
  - Peltier channel 1/1 PASS;
  - fan channel 1/1 PASS;
  - all actuation safe defaults PASS;
  - communications smoke PASS.
- ESP8266 compile:
  - FQBN `esp8266:esp8266:generic`;
  - Arduino CLI 1.5.1;
  - ESP8266 core 3.1.2;
  - RAM 28,920 / 80,192 bytes;
  - IRAM 60,931 / 65,536 bytes;
  - flash 238,996 / 1,048,576 bytes.
- Machine-readable compile evidence:
  - `evidence/real-target-compile-result.json`

## Learning-loop findings

1. The gold schematic contains the required thermal-control nets.
2. The gold firmware header exposes the necessary pins.
3. The raw gold header also contains GPIO aliases, especially GPIO16.
4. The frozen full firmware is not source-compatible with the modern ESP8266 core without modernization.
5. A minimal proof image can compile cleanly while keeping all actuation safe.
6. Firmware proof therefore catches both PCB/firmware contract problems and software-ecosystem rot.

## What remains

The proof is not ultimate until flashed onto the populated PCB:

1. verify boot banner;
2. verify NAU7802 acknowledgement;
3. verify heater/Peltier/fan outputs are safe before arm;
4. exercise only against safe dummy loads;
5. capture transcript with current design/proof hash.

