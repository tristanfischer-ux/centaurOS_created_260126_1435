# PCB bring-up firmware (Tier-1 compile + Tier-3 QEMU virt I²C)

Freestanding Cortex-M project used to prove pinmap link + virtual-board I²C
probes before fab. Board-specific data is injected as `.inc` / `pinmap.h` at
emit time by `pcb-firmware-tier1-project.ts`.

## Build (on a machine with `arm-none-eabi-gcc`)

```bash
# After emit into a run dir, or with stub includes checked in:
make          # tier1_proof.elf — pinmap compile
make sim      # tier1_proof_sim.elf — QEMU semihosting target
qemu-system-arm -M mps2-an385 -cpu cortex-m3 -nographic \
  -semihosting-config enable=on,target=native \
  -kernel tier1_proof_sim.elf
```

## Files

| File | Source of truth |
|---|---|
| `main.c`, `virt_i2c.c`, `virt_i2c.h`, `startup.S`, `link.ld`, `Makefile` | This tree (edit here) |
| `pinmap.h`, `pin_asserts.inc`, `board_probes.inc`, `board_identity.inc`, `virt_i2c_board.inc` | Generated per board at emit (stubs checked in for structure) |

## Not HIL

`virt_i2c_*` models expected devices in RAM under QEMU. Physical boards still
require hardware-in-the-loop before **FUNCTIONALLY VERIFIED**.
