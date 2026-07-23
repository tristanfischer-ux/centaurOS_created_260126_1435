/**
 * @file MCU project emitter — copies first-class firmware/pcb-bringup + board binds.
 * @description SOURCE OF TRUTH for C is firmware/pcb-bringup/ in the git tree.
 * This module copies that tree into the run outDir, then writes only board-specific
 * includes (pinmap, virt I²C device table, probes). Tier-3 QEMU must virt_i2c_read8()
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
  /** Override repo root (tests). Default: walk up from cwd / this file. */
  repoRoot?: string
}

export type Tier1ProjectEmitResult = {
  projectDir: string
  files: string[]
  mcuFamily: 'cortex-m0plus' | 'unknown'
  /** Absolute path of the first-class tree that was copied. */
  sourceTree: string
}

/** Relative path of the checked-in bring-up firmware (must exist in git). */
export const FIRMWARE_PCB_BRINGUP_REL = path.join('firmware', 'pcb-bringup')

const COPY_FILES = [
  'main.c',
  'virt_i2c.c',
  'virt_i2c.h',
  'startup.S',
  'link.ld',
  'Makefile',
  'README.md',
] as const

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
 * @description Resolve the checked-in firmware/pcb-bringup directory.
 * Fail closed if missing — firmware must live in the main git tree.
 */
export function resolveFirmwarePcbBringupRoot(repoRoot?: string): string {
  const candidates: string[] = []
  if (repoRoot) candidates.push(path.join(repoRoot, FIRMWARE_PCB_BRINGUP_REL))
  candidates.push(path.join(process.cwd(), FIRMWARE_PCB_BRINGUP_REL))
  // From src/lib/pdf-engine-v2/lib/pcb/ → repo root is 5 levels up
  candidates.push(path.resolve(__dirname, '../../../../..', FIRMWARE_PCB_BRINGUP_REL))
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'main.c')) && fs.existsSync(path.join(c, 'Makefile'))) {
      return c
    }
  }
  throw new Error(
    `firmware/pcb-bringup not found in git tree (looked under cwd + repo). ` +
      `Firmware must be a first-class directory — not only generated under out/.`,
  )
}

/**
 * @description Emit a freestanding Tier-1 MCU project by copying firmware/pcb-bringup
 * and binding pinmap + virtual I²C devices for this board.
 */
export function emitTier1McuProject(input: Tier1ProjectEmitInput): Tier1ProjectEmitResult {
  const sourceTree = resolveFirmwarePcbBringupRoot(input.repoRoot)
  const projectDir = path.join(input.outDir, 'mcu-project')
  fs.mkdirSync(projectDir, { recursive: true })
  const mcuFamily = inferMcuFamily(input.mcuMpn)
  const simDevices = input.simDevices ?? []

  // INTENT: C logic lives in firmware/pcb-bringup — copy, don't re-embed.
  for (const name of COPY_FILES) {
    const src = path.join(sourceTree, name)
    if (!fs.existsSync(src)) {
      throw new Error(`firmware/pcb-bringup missing required file: ${name}`)
    }
    fs.copyFileSync(src, path.join(projectDir, name))
  }

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
 * source_tree=firmware/pcb-bringup
 */
#ifndef FORGE_TIER1_PINMAP_H
#define FORGE_TIER1_PINMAP_H

${pinDefines.join('\n') || '/* no bus pins — interconnect-only board */'}

/* GPIO pad tokens as empty structs — illegal identifiers fail the compile. */
${[...gpioPads].map((pad) => `typedef struct { char _; } ${pad};`).join('\n')}

#endif /* FORGE_TIER1_PINMAP_H */
`

  const deviceInits = simDevices.map((d) => {
    const addr = d.address & 0xff
    const regs = Array.from({ length: 16 }, () => 0)
    regs[0] = FORGE_VIRT_I2C_MAGIC
    regs[1] = addr
    return `  { .addr = 0x${addr.toString(16).padStart(2, '0')}, .present = 1, .regs = { ${regs.map((v) => `0x${v.toString(16)}`).join(', ')} } }, /* ${d.mpn} ${d.word_id} */`
  })

  const virtI2cBoardInc =
    deviceInits.length > 0
      ? `/* Generated from board-sim expected_devices — do not edit. */\n${deviceInits.join('\n')}\n`
      : `/* Generated empty bus — present=0 stub so count==0. */\n  { .addr = 0x00, .present = 0, .regs = {0} },\n`

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

  const pinAssertsInc =
    (pinAsserts.join('\n') || '  /* no GPIO pins */') + '\n'
  const boardProbesInc =
    (probeLoops.join('\n') ||
      '  forge_sh_write0("CHECK i2c_read FAIL no_devices_emitted\\n");\n  forge_sh_exit(1);') +
    '\n'
  const boardIdentityInc =
    `/* Generated proof target — do not edit. */\n#define FORGE_PROOF_TARGET "${input.proofTargetId.replace(/"/g, '')}"\n`

  const generated: Array<[string, string]> = [
    ['pinmap.h', pinmapH],
    ['virt_i2c_board.inc', virtI2cBoardInc],
    ['pin_asserts.inc', pinAssertsInc],
    ['board_probes.inc', boardProbesInc],
    ['board_identity.inc', boardIdentityInc],
  ]
  for (const [name, body] of generated) {
    fs.writeFileSync(path.join(projectDir, name), body)
  }

  const files = [...COPY_FILES, ...generated.map(([n]) => n)]
  return {
    projectDir,
    files,
    mcuFamily,
    sourceTree,
  }
}
