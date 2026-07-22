import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { emitTier1McuProject } from './pcb-firmware-tier1-project'

describe('emitTier1McuProject', () => {
  it('proveCatch: emits pinmap macros from I2C/SWD buses (no PA22__31 ghosts)', () => {
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
      expect(result.files).toEqual(
        expect.arrayContaining(['pinmap.h', 'main.c', 'Makefile', 'startup.S', 'link.ld']),
      )
      const pinmap = fs.readFileSync(path.join(result.projectDir, 'pinmap.h'), 'utf8')
      const main = fs.readFileSync(path.join(result.projectDir, 'main.c'), 'utf8')
      expect(pinmap).toContain('PIN_HOST_I2C_SDA_TOKEN PA22')
      expect(pinmap).toContain('PIN_HOST_I2C_SCL_TOKEN PA23')
      expect(pinmap).not.toMatch(/PA22__\d+/)
      // GOTCHA: GND must not become a TOKEN typedef (power ≠ MCU pad).
      expect(pinmap).not.toMatch(/GND_TOKEN|typedef struct \{ char _; \} GND/)
      expect(main).toMatch(/static PIN_HOST_I2C_SDA_TOKEN \*_forge_pin_/)
      expect(fs.existsSync(path.join(result.projectDir, 'Makefile'))).toBe(true)
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  })
})
