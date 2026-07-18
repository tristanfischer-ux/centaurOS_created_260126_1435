# NinjaPCR PCB Software Worked Example

Isolated benchmark connecting a real Yuri gold schematic to real firmware pin definitions and a minimal executable bring-up proof.

Not wired into the ForgeOS chain.

## What passed

- Gold KiCad schematic required nets extracted.
- Gold firmware pin defines extracted.
- Lid heater, Peltier and fan channel contracts closed.
- NAU7802 I²C binding represented.
- Native proof generated, compiled and executed.
- Minimal proof sketch compiled for the real ESP8266 target.
- Seven unit tests pass.

## Important findings

- Raw gold header aliases GPIO16 across several roles.
- Frozen full product firmware does not compile against current ESP8266 core 3.1.2 without a broader modernization:
  - legacy `min`/`max` macro collisions;
  - missing returns;
  - legacy ESP8266 HTTP update API.
- The minimal proof image compiles successfully and remains safe-off.
- No populated-board HIL has run, so status is:

```text
FAB-READY SOFTWARE PROOF — UNPROVEN IN HARDWARE
```

## Run Tier 0

```bash
python3 prototypes/ninjapcr-pcb-software-benchmark/benchmark.py \
  --schematic out/_gold-ninjapcr-repo/kicad/NinjaPCR/NinjaPCB_ver2.3.sch \
  --header out/_gold-ninjapcr-repo/arduino/NinjaPCR/board_conf_ninjapcrwifi.h \
  --out /tmp/ninjapcr-pcb-software-benchmark
```

## Compile real ESP8266 proof target

Prerequisites:

- Arduino CLI 1.5.1
- ESP8266 core 3.1.2

```bash
arduino-cli compile \
  --fqbn esp8266:esp8266:generic \
  --warnings all \
  --export-binaries \
  --build-path /tmp/ninjapcr-arduino/build-proof \
  /tmp/ninjapcr-pcb-software-benchmark/NinjaPcrProof
```

## Tests

```bash
python3 -m unittest discover \
  -s prototypes/ninjapcr-pcb-software-benchmark/tests \
  -p 'test_*.py'
```

## Next proof tier

Populate/obtain the board, flash the generated proof image, then capture:

- boot banner;
- NAU7802 acknowledgement;
- safe-off outputs before arm;
- bounded dummy-load pulses;
- hash-bound HIL transcript.

Only that can change the status to `FUNCTIONALLY VERIFIED`.
