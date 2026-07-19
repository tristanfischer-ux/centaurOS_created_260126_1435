# OpenDrop PCB Software Worked Example

Isolated Tier-0 benchmark: gold OpenDrop V4 schematic nets + `hardware_def.h`
pin contract → native `pcb-firmware-proof` bring-up with HV safe-off.

Not wired into the ForgeOS chain. No Gate 40. No HIL.

## Status when green

```text
FAB-READY SOFTWARE PROOF — UNPROVEN IN HARDWARE
```

## What it proves

- Main-board GLabels include `V_HV` / `V_HV_C` / `V_USB` / electrode bus (`CLK`/`DI`/`LE`/`BL`).
- Firmware header exposes `BOOST_pin` + `ENABLE_*` + bus pins.
- Proof spec domain is `high_voltage` with `safe_default: off` and two-step arm.
- Native prove compiles and runs.

## What it does not claim

- Not FUNCTIONALLY VERIFIED on populated hardware.
- Not a full 64-GPIO electrode map (gold uses a shift-register bus).
- Not IEC creepage certification (see TS creepage proveCatch separately).

## Run

```bash
python3 -m unittest discover -s prototypes/opendrop-pcb-software-benchmark/tests

python3 prototypes/opendrop-pcb-software-benchmark/benchmark.py \
  --out /tmp/opendrop-pcb-software-benchmark
```
