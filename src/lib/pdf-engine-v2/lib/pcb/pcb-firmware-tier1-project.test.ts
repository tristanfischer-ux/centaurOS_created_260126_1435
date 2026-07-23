import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  emitTier1McuProject,
  resolveFirmwarePcbBringupRoot,
} from './pcb-firmware-tier1-project'

describe('emitTier1McuProject', () => {
  it('proveCatch: first-class firmware/pcb-bringup exists in the git tree', () => {
    const root = resolveFirmwarePcbBringupRoot()
    expect(fs.existsSync(path.join(root, 'main.c'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'virt_i2c.c'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'Makefile'))).toBe(true)
    const main = fs.readFileSync(path.join(root, 'main.c'), 'utf8')
    expect(main).toContain('virt_i2c_read8')
    expect(main).toContain('firmware/pcb-bringup')
  })

  it('proveCatch: emits pinmap macros from I2C/SWD buses (copies tree, no PA22__31 ghosts)', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-emit-'))
    try {
      const result = emitTier1McuProject({
        outDir,
        proofTargetId: 'wet_lab_hat',
        mcuMpn: 'ATSAMD21G18A',
        buses: [
          {
            bus_id: 'host_i2c',
            protocol: 'i2c',
            pins: { sda: 'PA22', scl: 'PA23', gnd: 'GND' },
            expected_devices: ['tmp1075'],
          },
          {
            bus_id: 'swd',
            protocol: 'swd',
            pins: { swdio: 'PA31', swclk: 'PA30', gnd: 'GND' },
            expected_devices: [],
          },
        ],
      })
      expect(result.sourceTree).toContain(path.join('firmware', 'pcb-bringup'))
      expect(result.files).toEqual(
        expect.arrayContaining([
          'pinmap.h',
          'main.c',
          'Makefile',
          'startup.S',
          'link.ld',
          'virt_i2c.c',
          'board_probes.inc',
        ]),
      )
      const pinmap = fs.readFileSync(path.join(result.projectDir, 'pinmap.h'), 'utf8')
      const main = fs.readFileSync(path.join(result.projectDir, 'main.c'), 'utf8')
      const asserts = fs.readFileSync(path.join(result.projectDir, 'pin_asserts.inc'), 'utf8')
      expect(pinmap).toContain('PIN_HOST_I2C_SDA_TOKEN PA22')
      expect(pinmap).toContain('PIN_HOST_I2C_SCL_TOKEN PA23')
      expect(pinmap).not.toMatch(/PA22__\d+/)
      // GOTCHA: GND must not become a TOKEN typedef (power ≠ MCU pad).
      expect(pinmap).not.toMatch(/GND_TOKEN|typedef struct \{ char _; \} GND/)
      expect(asserts).toMatch(/static PIN_HOST_I2C_SDA_TOKEN \*_forge_pin_/)
      expect(main).toContain('FORGE_MCU_SIM')
      expect(main).toContain('bkpt 0xAB')
      expect(main).toContain('#include "board_probes.inc"')
      const makefile = fs.readFileSync(path.join(result.projectDir, 'Makefile'), 'utf8')
      expect(makefile).toMatch(/^\s*sim:/m)
      expect(makefile).toContain('$(TARGET)_sim.elf')
      expect(fs.existsSync(path.join(result.projectDir, 'Makefile'))).toBe(true)
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  })
})
