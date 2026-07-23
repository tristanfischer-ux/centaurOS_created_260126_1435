# Firmware (first-class tree)

This directory holds **product / bring-up firmware source** that ships with PCB
dossiers. It is part of the git tree — not only generated under `out/`.

| Path | Role |
|---|---|
| `pcb-bringup/` | Freestanding Cortex-M bring-up + QEMU virtual-I²C probe (Tier-1 / Tier-3) |
| `../prototypes/pcb-firmware-proof/` | Host Tier-0 contract harness (Python + native C) |

## Honesty

- **FAB-READY — UNPROVEN IN HARDWARE** is the max claim.
- QEMU + modelled I²C ≠ SAMD21 silicon ≠ HIL.
- Never label Excel **FUNCTIONALLY VERIFIED** from this tree alone.

## Emit path

`emitTier1McuProject()` copies `firmware/pcb-bringup/` into the run’s
`mcu-project/`, then writes board-specific includes (`pinmap.h`,
`virt_i2c_board.inc`, `board_probes.inc`, …). Edit C logic **here**; do not
re-embed large C blobs in TypeScript.
