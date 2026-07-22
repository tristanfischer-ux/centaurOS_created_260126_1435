import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { probeTier3McuSim } from './pcb-firmware-proof-runner'
import { emitTier1McuProject } from './pcb-firmware-tier1-project'

describe('probeTier3McuSim', () => {
  it('proveCatch: QEMU runs Cortex-M sim ELF and prints MCU_SIM banner', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier3-mcu-'))
    try {
      const emitted = emitTier1McuProject({
        outDir,
        proofTargetId: 'wet_lab_hat',
        mcuMpn: 'ATSAMD21G18A-AU',
        buses: [
          {
            bus_id: 'i2c0',
            protocol: 'i2c',
            pins: { sda: 'PA22', scl: 'PA23', gnd: 'GND' },
            expected_devices: [],
          },
        ],
      })
      const result = probeTier3McuSim({
        outDir: path.join(outDir, 'sim-out'),
        projectDir: emitted.projectDir,
        proofTargetId: 'wet_lab_hat',
      })
      if (result.skipped) {
        // CI without qemu — skip is honest, not PASS
        expect(result.ok).toBe(false)
        expect(result.reason).toMatch(/qemu/i)
        return
      }
      expect(result.ok).toBe(true)
      expect(result.transcript ?? '').toContain('MCU_SIM|wet_lab_hat|BOOT')
      expect(result.transcript ?? '').toContain('CHECK mcu_sim PASS')
      expect(result.transcript ?? '').toContain('CHECK gpio_pad PASS pad=PA22')
      expect(fs.existsSync(result.simElfPath ?? '')).toBe(true)
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('proveCatch: missing project fails closed (skipped, not ok)', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier3-miss-'))
    try {
      const result = probeTier3McuSim({ outDir, projectDir: undefined })
      expect(result.ok).toBe(false)
      expect(result.skipped).toBe(true)
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  })
})
