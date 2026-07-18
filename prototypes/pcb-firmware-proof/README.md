# PCB Firmware Proof — Isolated Draft

This prototype tests the idea that a PCB must support minimal executable bring-up software before it can be called functional.

It is intentionally **not wired into the ForgeOS chain**. It does not import or modify production PCB code.

## What it does

1. Validates a `pcb-firmware-proof-spec/v1` contract.
2. Rejects an unfit PCB design before software generation.
3. Checks bus bindings and duplicate I²C addresses.
4. Checks required vs implemented channel counts.
5. Checks safe-off defaults and bounded actuation limits.
6. Generates a dependency-free C11 smoke harness.
7. Compiles it with the local system C compiler.
8. Runs it natively and captures a deterministic proof transcript.
9. Writes a `pcb-firmware-proof-result/v1` evidence file.

## What it does not prove

- Actual MCU compilation
- Register-level peripheral behavior
- Physical signal levels
- Hardware-in-the-loop behavior
- Product firmware functionality

Those are later tiers described in:

`docs/plans/YURI-PCB-FIRMWARE-PROOF-PLAN-2026-07-18.md`

## Run

```bash
python3 prototypes/pcb-firmware-proof/firmware_proof.py \
  validate prototypes/pcb-firmware-proof/fixtures/good-motion-board.json

python3 prototypes/pcb-firmware-proof/firmware_proof.py \
  prove prototypes/pcb-firmware-proof/fixtures/good-motion-board.json \
  --out /tmp/pcb-firmware-proof-good
```

Expected bad fixture:

```bash
python3 prototypes/pcb-firmware-proof/firmware_proof.py \
  validate prototypes/pcb-firmware-proof/fixtures/bad-one-of-four-channels.json
```

It must fail with `channel_count_mismatch`.

## Tests

```bash
python3 -m unittest discover \
  -s prototypes/pcb-firmware-proof/tests \
  -p 'test_*.py'
```

## Integration boundary

The future engine version should consume:

- `pcb-architecture/v1`
- verified component pinouts
- schematic/netlist truth

and add firmware proof as a third readiness axis:

```text
FAB_READY =
  fabricationExportHygieneOk
  AND pcbDesignFitnessOk
  AND firmwareProofOk
```
