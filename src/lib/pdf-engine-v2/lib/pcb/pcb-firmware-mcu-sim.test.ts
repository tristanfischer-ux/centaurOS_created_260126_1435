import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { probeTier3McuSim } from './pcb-firmware-proof-runner'
import { emitTier1McuProject } from './pcb-firmware-tier1-project'

describe('probeTier3McuSim', () => {
  it('proveCatch: QEMU firmware probes virt_i2c devices (not canned gpio_pad PASS)', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier3-mcu-'))
    try {
      const buses = [
        {
          bus_id: 'i2c0',
          protocol: 'i2c' as const,
          pins: { sda: 'PA22', scl: 'PA23', gnd: 'GND' },
          expected_devices: [],
        },
      ]
      const simDevices = [
        { address: 0x48, mpn: 'TMP1075', word_id: 'temp_sensor' },
        { address: 0x49, mpn: 'ADS1114', word_id: 'adc' },
      ]
      const result = probeTier3McuSim({
        outDir: path.join(outDir, 'sim-out'),
        proofTargetId: 'wet_lab_hat',
        mcuMpn: 'ATSAMD21G18A-AU',
        buses,
        simDevices,
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
      expect(result.transcript ?? '').toContain('CHECK i2c_read PASS')
      expect(result.transcript ?? '').toContain('addr=0x48')
      expect(result.transcript ?? '').toContain('addr=0x49')
      expect(result.transcript ?? '').not.toMatch(/CHECK gpio_pad PASS/)
      expect(fs.existsSync(result.simElfPath ?? '')).toBe(true)

      const projectDir = result.simElfPath
        ? path.dirname(result.simElfPath)
        : ''
      if (projectDir) {
        const mainC = fs.readFileSync(path.join(projectDir, 'main.c'), 'utf8')
        expect(mainC).toContain('virt_i2c_read8')
      }
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('proveCatch: empty virtual I²C bus fails closed under QEMU', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier3-empty-'))
    try {
      const result = probeTier3McuSim({
        outDir: path.join(outDir, 'sim-out'),
        proofTargetId: 'empty_bus',
        mcuMpn: 'ATSAMD21G18A-AU',
        buses: [
          {
            bus_id: 'i2c0',
            protocol: 'i2c',
            pins: { sda: 'PA22', scl: 'PA23', gnd: 'GND' },
            expected_devices: [],
          },
        ],
        simDevices: [],
      })
      if (result.skipped) {
        expect(result.ok).toBe(false)
        expect(result.reason).toMatch(/qemu/i)
        return
      }
      expect(result.ok).toBe(false)
      expect(result.transcript ?? '').toMatch(/CHECK i2c_bus FAIL|CHECK i2c_read FAIL/)
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

  it('emit includes virt_i2c when simDevices present', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-emit-'))
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
        simDevices: [{ address: 0x48, mpn: 'TMP1075', word_id: 'temp' }],
      })
      const mainC = fs.readFileSync(path.join(emitted.projectDir, 'main.c'), 'utf8')
      const virtInc = fs.readFileSync(
        path.join(emitted.projectDir, 'virt_i2c_board.inc'),
        'utf8',
      )
      expect(mainC).toContain('virt_i2c_read8')
      expect(mainC).toContain('firmware/pcb-bringup')
      expect(virtInc).toContain('0x48')
      expect(emitted.sourceTree).toMatch(/firmware[/\\]pcb-bringup/)
      expect(mainC).not.toMatch(/forge_sh_write0\("CHECK gpio_pad PASS/)
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  })
})
