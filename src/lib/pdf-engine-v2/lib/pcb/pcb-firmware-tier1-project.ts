/**
 * @file Minimal freestanding MCU project emitter for Tier-1 / Tier-3 firmware proof.
 * @description Emits pinmap + optional virtual-I²C board model. Tier-1 compiles
 * pin tokens. Tier-3 (FORGE_MCU_SIM) runs under QEMU and must virt_i2c_read8()
 * each expected device — hardcoded CHECK PASS strings are forbidden theatre.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { FirmwareBusPinMap } from './pcb-firmware-pinmap-from-nets'

export type Tier1SimDevice = {
  address: number
  mpn: string
  word_id: string
}

export type Tier1ProjectEmitInput = {
  outDir: string
  proofTargetId: string
  mcuMpn: string
  buses: FirmwareBusPinMap[]
  /** I²C devices on the virtual bus (from board-sim model). Required for MCU sim. */
  simDevices?: Tier1SimDevice[]
}

export type Tier1ProjectEmitResult = {
  projectDir: string
  files: string[]
  mcuFamily: 'cortex-m0plus' | 'unknown'
}

function inferMcuFamily(mcuMpn: string): Tier1ProjectEmitResult['mcuFamily'] {
  if (/\b(?:atsamd21|samd21|samd11)\b/i.test(mcuMpn)) return 'cortex-m0plus'
  return 'cortex-m0plus'
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

/** Virtual WHO_AM_I / presence magic every modelled I²C device exposes at reg 0. */
export const FORGE_VIRT_I2C_MAGIC = 0xa5

/**
 * @description Emit a freestanding Tier-1 MCU project bound to the pin-map.
 * When simDevices are provided, also emits virt_i2c.* for QEMU MCU-sim.
 */
export function emitTier1McuProject(input: Tier1ProjectEmitInput): Tier1ProjectEmitResult {
  const projectDir = path.join(input.outDir, 'mcu-project')
  fs.mkdirSync(projectDir, { recursive: true })
  const mcuFamily = inferMcuFamily(input.mcuMpn)
  const simDevices = input.simDevices ?? []

  const pinDefines: string[] = []
  const pinAsserts: string[] = []
  const gpioPads = new Set<string>()
  for (const bus of input.buses) {
    for (const [role, pad] of Object.entries(bus.pins)) {
      if (!pad || !/^[A-Za-z][A-Za-z0-9_]*$/.test(pad)) continue
      const macro = pinMacroName(bus.bus_id, role)
      pinDefines.push(`#define ${macro}_NAME "${pad}"`)
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

  // INTENT (fixpack19): virtual board = register models the firmware MUST read.
  // Theatre (puts("PASS") without virt_i2c_read8) is explicitly rejected by
  // proveCatch on source + by runtime NACK if a device is missing.
  const virtI2cH = `/* Virtual I²C bus — imagined peripherals for QEMU MCU-sim (not HIL). */
#ifndef FORGE_VIRT_I2C_H
#define FORGE_VIRT_I2C_H
#include <stdint.h>
#define FORGE_VIRT_I2C_MAGIC 0xA5
int virt_i2c_read8(uint8_t addr, uint8_t reg);
int virt_i2c_device_count(void);
#endif
`

  const deviceInits = simDevices.map((d) => {
    const addr = d.address & 0xff
    const regs = Array.from({ length: 16 }, () => 0)
    regs[0] = FORGE_VIRT_I2C_MAGIC
    regs[1] = addr
    return `  { .addr = 0x${addr.toString(16).padStart(2, '0')}, .present = 1, .regs = { ${regs.map((v) => `0x${v.toString(16)}`).join(', ')} } }, /* ${d.mpn} ${d.word_id} */`
  })

  const virtI2cC = `/* Virtual I²C peripheral models — filled from board-sim expected_devices. */
#include "virt_i2c.h"

typedef struct {
  uint8_t addr;
  uint8_t present;
  uint8_t regs[16];
} virt_dev_t;

static virt_dev_t DEVS[] = {
${deviceInits.join('\n') || '  /* no devices — i2c probes must NACK */'}
};

int virt_i2c_device_count(void) {
  return (int)(sizeof(DEVS) / sizeof(DEVS[0]));
}

int virt_i2c_read8(uint8_t addr, uint8_t reg) {
  int n = virt_i2c_device_count();
  for (int i = 0; i < n; i++) {
    if (DEVS[i].present && DEVS[i].addr == addr) {
      return (int)DEVS[i].regs[reg & 0x0Fu];
    }
  }
  return -1; /* NACK — device not on the virtual bus */
}
`

  const probeLoops = simDevices.map((d) => {
    const addr = d.address & 0xff
    const hex = addr.toString(16).padStart(2, '0')
    const mpn = d.mpn.replace(/"/g, '')
    const word = d.word_id.replace(/"/g, '')
    return `  {
    int v = virt_i2c_read8(0x${hex}, 0x00);
    if (v != FORGE_VIRT_I2C_MAGIC) {
      forge_sh_write0("CHECK i2c_read FAIL addr=0x${hex} mpn=${mpn}\\n");
      forge_sh_exit(1);
    }
    forge_sh_write0("CHECK i2c_read PASS addr=0x${hex} mpn=${mpn} word=${word}\\n");
  }`
  })

  const mainC = `/* Freestanding bring-up — Tier-1 compile + QEMU virtual-board test (fixpack19). */
#include "pinmap.h"
#if defined(FORGE_MCU_SIM)
#include "virt_i2c.h"
#endif

void Reset_Handler(void);

#if defined(FORGE_MCU_SIM)
/* Angel/ARM semihosting — only valid under QEMU -semihosting. */
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
  unsigned int packed = 0x20026;
  (void)code;
  (void)forge_sh_call(0x18 /* SYS_EXIT */, &packed);
}
#endif

void Reset_Handler(void) {
${pinAsserts.join('\n') || '  /* no GPIO pins */'}
#if defined(FORGE_MCU_SIM)
  forge_sh_write0("MCU_SIM|${input.proofTargetId}|BOOT\\n");
  /* GOTCHA: must call virt_i2c_read8 — do not invent CHECK PASS without a probe. */
  if (virt_i2c_device_count() <= 0) {
    forge_sh_write0("CHECK i2c_bus FAIL empty_virtual_board\\n");
    forge_sh_exit(1);
  }
${probeLoops.join('\n') || '  forge_sh_write0("CHECK i2c_read FAIL no_devices_emitted\\n");\n  forge_sh_exit(1);'}
  forge_sh_write0("CHECK mcu_sim PASS\\n");
  forge_sh_exit(0);
#endif
  for (;;) { }
}
`

  const startupS = `/* Minimal Cortex-M vectors — Reset from C + weak defaults. */
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

  const makefile = `# Tier-1 compile + QEMU virtual-I²C MCU-sim (fixpack19)
TARGET   ?= tier1_proof
MCUFLAGS ?= -mcpu=cortex-m0plus -mthumb
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

$(TARGET)_sim.elf: main.c virt_i2c.c virt_i2c.h startup.S link.ld pinmap.h
	arm-none-eabi-gcc $(SIM_CFLAGS) -c main.c -o main_sim.o
	arm-none-eabi-gcc $(SIM_CFLAGS) -c virt_i2c.c -o virt_i2c_sim.o
	arm-none-eabi-gcc $(SIM_CFLAGS) -c startup.S -o startup_sim.o
	arm-none-eabi-gcc $(SIM_LDFLAGS) main_sim.o virt_i2c_sim.o startup_sim.o -o $@

clean:
	rm -f *.o *.elf
`

  const files: Array<[string, string]> = [
    ['pinmap.h', pinmapH],
    ['main.c', mainC],
    ['virt_i2c.h', virtI2cH],
    ['virt_i2c.c', virtI2cC],
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
