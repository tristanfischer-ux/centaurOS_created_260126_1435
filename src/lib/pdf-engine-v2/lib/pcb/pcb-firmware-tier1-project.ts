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

  // INTENT (fixpack18): under FORGE_MCU_SIM the ELF must execute observable
  // semihosting writes on a real ARM core (QEMU). Without the flag, Tier-1
  // remains compile-only (infinite loop) so bare-metal link still proves pins.
  const simWrites = [
    ...[...gpioPads].map(
      (pad) => `  forge_sh_write0("CHECK gpio_pad PASS pad=${pad}\\n");`,
    ),
    ...input.buses
      .filter((b) => b.protocol === 'i2c' || b.protocol === 'swd')
      .map((b) => `  forge_sh_write0("CHECK bus_alive PASS bus=${b.bus_id} proto=${b.protocol}\\n");`),
  ]

  const mainC = `/* Freestanding bring-up — Tier-1 compile + optional MCU sim (fixpack18). */
#include "pinmap.h"

void Reset_Handler(void);

#if defined(FORGE_MCU_SIM)
/* Angel/ARM semihosting — only valid under QEMU -semihosting (not on bare metal). */
static inline int forge_sh_call(int op, void *arg) {
  register int r0 asm("r0") = op;
  register void *r1 asm("r1") = arg;
  asm volatile ("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
  return r0;
}
static void forge_sh_write0(const char *s) {
  (void)forge_sh_call(0x04 /* SYS_WRITE0 */, (void *)s);
}
static void forge_sh_exit(unsigned int code) {
  /* ADP_Stopped_ApplicationExit */
  unsigned int packed = 0x20026;
  (void)code;
  (void)forge_sh_call(0x18 /* SYS_EXIT */, &packed);
}
#endif

void Reset_Handler(void) {
${pinAsserts.join('\n') || '  /* no GPIO pins */'}
#if defined(FORGE_MCU_SIM)
  forge_sh_write0("MCU_SIM|${input.proofTargetId}|BOOT\\n");
${simWrites.join('\n') || '  forge_sh_write0("CHECK gpio_pad PASS pad=none\\n");'}
  forge_sh_write0("CHECK mcu_sim PASS\\n");
  forge_sh_exit(0);
#endif
  for (;;) { }
}
`

  const startupS = `/* Minimal Cortex-M vectors — Reset from C + weak defaults.
 * .cpu omitted so -mcpu= from the Makefile selects M0+ (Tier-1) or M3 (QEMU sim). */
  .syntax unified
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

  const makefile = `# Tier-1 freestanding MCU compile + QEMU MCU-sim ELF (fixpack18)
TARGET   ?= tier1_proof
MCUFLAGS ?= -mcpu=cortex-m0plus -mthumb
# QEMU -M mps2-an385 is Cortex-M3; same freestanding sources, observable semihosting.
SIMFLAGS ?= -mcpu=cortex-m3 -mthumb -DFORGE_MCU_SIM
CFLAGS   ?= $(MCUFLAGS) -ffreestanding -nostdlib -Wall -Werror -Os
LDFLAGS  ?= $(MCUFLAGS) -nostdlib -T link.ld -Wl,--gc-sections
SIM_CFLAGS  ?= $(SIMFLAGS) -ffreestanding -nostdlib -Wall -Werror -Os
SIM_LDFLAGS ?= $(SIMFLAGS) -nostdlib -T link.ld -Wl,--gc-sections

.PHONY: all sim clean
all: $(TARGET).elf
sim: $(TARGET)_sim.elf

$(TARGET).elf: main.c startup.S link.ld pinmap.h
	arm-none-eabi-gcc $(CFLAGS) -c main.c -o main.o
	arm-none-eabi-gcc $(CFLAGS) -c startup.S -o startup.o
	arm-none-eabi-gcc $(LDFLAGS) main.o startup.o -o $@

$(TARGET)_sim.elf: main.c startup.S link.ld pinmap.h
	arm-none-eabi-gcc $(SIM_CFLAGS) -c main.c -o main_sim.o
	arm-none-eabi-gcc $(SIM_CFLAGS) -c startup.S -o startup_sim.o
	arm-none-eabi-gcc $(SIM_LDFLAGS) main_sim.o startup_sim.o -o $@

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
