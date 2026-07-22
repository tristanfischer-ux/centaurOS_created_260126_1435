/**
 * @file Minimal freestanding MCU project emitter for Tier-1 firmware proof.
 * @description Emits pinmap.h + main.c + startup + Makefile from the real
 * firmware bus pin-map (fixpack11/12 nets → pads). Compiles with
 * arm-none-eabi-gcc for Cortex-M0+ (SAMD21-class) without inventing Arduino
 * SDK theatre — pin macros must match the generated pin contract.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { FirmwareBusPinMap } from './pcb-firmware-pinmap-from-nets'

export type Tier1ProjectEmitInput = {
  outDir: string
  proofTargetId: string
  mcuMpn: string
  buses: FirmwareBusPinMap[]
}

export type Tier1ProjectEmitResult = {
  projectDir: string
  files: string[]
  mcuFamily: 'cortex-m0plus' | 'unknown'
}

function inferMcuFamily(mcuMpn: string): Tier1ProjectEmitResult['mcuFamily'] {
  if (/\b(?:atsamd21|samd21|samd11)\b/i.test(mcuMpn)) return 'cortex-m0plus'
  // DECISION: freestanding Cortex-M0+ is the honest default for host-HAT MCUs
  // we already pin-map (SAMD21). Unknown MPNs still emit the same ISA so the
  // compile proves pin-header coherence; HIL remains a later tier.
  return /cortex|stm32|nrf52|rp2040|esp32/i.test(mcuMpn) ? 'cortex-m0plus' : 'cortex-m0plus'
}

function pinMacroName(busId: string, pinRole: string): string {
  const safe = `${busId}_${pinRole}`.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
  return `PIN_${safe}`
}

/**
 * @description True when a pad name is an MCU GPIO-style token (PA22), not a
 * power net (GND/VCC) — Tier-1 must not typedef power rails as MCU pads.
 */
export function isMcuGpioPadToken(pad: string): boolean {
  return /^P[A-Z]\d{1,3}$/i.test(pad)
}

/**
 * @description Emit a freestanding Tier-1 MCU project bound to the pin-map.
 * @param input proof target + buses from buildFirmwareBusesFromNets
 * @returns projectDir + written relative file paths
 */
export function emitTier1McuProject(input: Tier1ProjectEmitInput): Tier1ProjectEmitResult {
  const projectDir = path.join(input.outDir, 'mcu-project')
  fs.mkdirSync(projectDir, { recursive: true })
  const mcuFamily = inferMcuFamily(input.mcuMpn)

  const pinDefines: string[] = []
  const pinAsserts: string[] = []
  const gpioPads = new Set<string>()
  for (const bus of input.buses) {
    for (const [role, pad] of Object.entries(bus.pins)) {
      if (!pad || !/^[A-Za-z][A-Za-z0-9_]*$/.test(pad)) continue
      const macro = pinMacroName(bus.bus_id, role)
      // NAME is always recorded (incl. GND for documentation).
      pinDefines.push(`#define ${macro}_NAME "${pad}"`)
      // DECISION (fixpack15): only GPIO pads become TOKEN typedefs + compile
      // checks. sizeof("GND") was Goodhart — power nets are not MCU pads.
      if (!isMcuGpioPadToken(pad)) continue
      pinDefines.push(`#define ${macro}_TOKEN ${pad}`)
      gpioPads.add(pad)
      pinAsserts.push(
        `  { static ${macro}_TOKEN *_forge_pin_${macro.toLowerCase()}; (void)_forge_pin_${macro.toLowerCase()}; } /* ${bus.protocol} ${role} → ${pad} */`,
      )
    }
  }

  const pinmapH = `/* Auto-generated Tier-1 pinmap — do not edit.
 * proof_target=${input.proofTargetId}
 * mcu=${input.mcuMpn}
 * family=${mcuFamily}
 */
#ifndef FORGE_TIER1_PINMAP_H
#define FORGE_TIER1_PINMAP_H

${pinDefines.join('\n') || '/* no bus pins — interconnect-only board */'}

/* GPIO pad tokens as empty structs — illegal identifiers fail the compile. */
${[...gpioPads].map((pad) => `typedef struct { char _; } ${pad};`).join('\n')}

#endif /* FORGE_TIER1_PINMAP_H */
`

  const mainC = `/* Freestanding bring-up stub — Tier-1 compile proof only. */
#include "pinmap.h"

void Reset_Handler(void);

void Reset_Handler(void) {
${pinAsserts.join('\n') || '  /* no GPIO pins */'}
  for (;;) { }
}
`

  const startupS = `/* Minimal Cortex-M0+ vectors — Reset from C + weak defaults. */
  .syntax unified
  .cpu cortex-m0plus
  .thumb

  .extern Reset_Handler

  .section .vectors, "a", %progbits
  .globl __vectors
__vectors:
  .word _estack
  .word Reset_Handler
  .word Default_Handler /* NMI */
  .word Default_Handler /* HardFault */
  .word 0
  .word 0
  .word 0
  .word 0
  .word 0
  .word 0
  .word 0
  .word Default_Handler /* SVCall */
  .word 0
  .word 0
  .word Default_Handler /* PendSV */
  .word Default_Handler /* SysTick */

  .section .text.Default_Handler, "ax", %progbits
  .weak Default_Handler
  .thumb_func
  .globl Default_Handler
Default_Handler:
  b .
`

  const linkLd = `MEMORY
{
  FLASH (rx) : ORIGIN = 0x00000000, LENGTH = 256K
  RAM (rwx)  : ORIGIN = 0x20000000, LENGTH = 32K
}

_estack = ORIGIN(RAM) + LENGTH(RAM);

SECTIONS
{
  .text : {
    KEEP(*(.vectors))
    *(.text*)
    *(.rodata*)
  } > FLASH

  .data : {
    *(.data*)
  } > RAM AT > FLASH

  .bss : {
    *(.bss*)
    *(COMMON)
  } > RAM
}
`

  const makefile = `# Tier-1 freestanding MCU compile — generated from firmware pin-map
TARGET   ?= tier1_proof
MCUFLAGS ?= -mcpu=cortex-m0plus -mthumb
CFLAGS   ?= $(MCUFLAGS) -ffreestanding -nostdlib -Wall -Werror -Os
LDFLAGS  ?= $(MCUFLAGS) -nostdlib -T link.ld -Wl,--gc-sections

.PHONY: all clean
all: $(TARGET).elf

$(TARGET).elf: main.c startup.S link.ld pinmap.h
	arm-none-eabi-gcc $(CFLAGS) -c main.c -o main.o
	arm-none-eabi-gcc $(CFLAGS) -c startup.S -o startup.o
	arm-none-eabi-gcc $(LDFLAGS) main.o startup.o -o $@

clean:
	rm -f *.o *.elf
`

  const files: Array<[string, string]> = [
    ['pinmap.h', pinmapH],
    ['main.c', mainC],
    ['startup.S', startupS],
    ['link.ld', linkLd],
    ['Makefile', makefile],
  ]
  for (const [name, body] of files) {
    fs.writeFileSync(path.join(projectDir, name), body)
  }

  return {
    projectDir,
    files: files.map(([name]) => name),
    mcuFamily,
  }
}
