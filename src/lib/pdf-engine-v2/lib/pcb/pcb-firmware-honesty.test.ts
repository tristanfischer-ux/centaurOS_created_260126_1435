import fs from 'node:fs'
import path from 'node:path'

import {
  PCB_FAB_READY_BANNER,
  PCB_FORBIDDEN_FUNCTIONAL_CLAIM,
  PCB_FIRMWARE_HONESTY_CONTRACT,
  FIRMWARE_PCB_BRINGUP_REL_POSIX,
  FIRMWARE_PACK_README_BODY,
  buildFirmwareHonestyRecord,
  claimsFunctionalVerificationIllegally,
  firmwareReadinessWhyFragment,
  firmwareStatusString,
  isHardcodedMcuSimTheatre,
  writeFirmwareHonestyArtefacts,
} from './pcb-firmware-honesty'

describe('pcb-firmware-honesty doctrine', () => {
  it('proveCatch: tier≥3 status is VIRTUAL BRING-UP — never FUNCTIONALLY VERIFIED', () => {
    const s = firmwareStatusString(3, true)
    expect(s).toBe(
      'VIRTUAL BRING-UP PASS (QEMU + modelled I²C) — UNPROVEN IN HARDWARE',
    )
    expect(s).toContain('UNPROVEN IN HARDWARE')
    expect(s).not.toContain(PCB_FORBIDDEN_FUNCTIONAL_CLAIM)
    expect(PCB_FAB_READY_BANNER).toContain('UNPROVEN IN HARDWARE')
  })

  it('proveCatch: Excel string contract matches Terminal _pcb_firmware_status_string', () => {
    // Lockstep with scripts/build-excel-export.py::_pcb_firmware_status_string
    expect(firmwareStatusString(null, null)).toBe('NOT RUN')
    expect(firmwareStatusString(1, false)).toBe('FAIL')
    expect(firmwareStatusString(0, true)).toBe(
      'CONTRACT ONLY — UNPROVEN IN HARDWARE',
    )
    expect(firmwareStatusString(1, true)).toBe(
      'COMPILE / CONTRACT ONLY — UNPROVEN IN HARDWARE',
    )
    expect(firmwareStatusString(2, true)).toBe(
      'HOST BIND / CONTRACT PASS — UNPROVEN IN HARDWARE',
    )
    expect(firmwareStatusString(3, true)).toContain('VIRTUAL BRING-UP PASS')
  })

  it('proveCatch: readiness_why for tier 3 names virt_i2c and forbids HIL claim', () => {
    const why = firmwareReadinessWhyFragment(3)
    expect(why).toContain('virt_i2c_read8')
    expect(why).toContain('VIRTUAL BOARD ONLY')
    expect(why).toContain('NOT FUNCTIONALLY VERIFIED')
  })

  it('proveCatch: pack README body is legal (NEVER guards FUNCTIONALLY VERIFIED)', () => {
    expect(FIRMWARE_PACK_README_BODY).toContain('VIRTUAL BRING-UP')
    expect(FIRMWARE_PACK_README_BODY).toContain('UNPROVEN IN HARDWARE')
    expect(claimsFunctionalVerificationIllegally(FIRMWARE_PACK_README_BODY)).toBe(
      false,
    )
    expect(
      claimsFunctionalVerificationIllegally(
        'Board is FUNCTIONALLY VERIFIED after QEMU',
      ),
    ).toBe(true)
  })

  it('proveCatch: hardcoded CHECK PASS without virt_i2c_read8 is theatre', () => {
    expect(
      isHardcodedMcuSimTheatre(
        'forge_sh_write0("CHECK gpio_pad PASS");\nforge_sh_exit(0);',
      ),
    ).toBe(true)
    expect(
      isHardcodedMcuSimTheatre(
        'int v = virt_i2c_read8(0x48, 0);\nforge_sh_write0("CHECK i2c_read PASS");',
      ),
    ).toBe(false)
  })

  it('proveCatch: first-class firmware/pcb-bringup tree exists and is not theatre', () => {
    const root = path.join(process.cwd(), FIRMWARE_PCB_BRINGUP_REL_POSIX)
    expect(fs.existsSync(path.join(root, 'main.c'))).toBe(true)
    const main = fs.readFileSync(path.join(root, 'main.c'), 'utf8')
    expect(main).toContain('virt_i2c_read8')
    expect(isHardcodedMcuSimTheatre(main)).toBe(false)
  })

  it('proveCatch: buildFirmwareHonestyRecord is Anvil state shape (not docs-only)', () => {
    const h = buildFirmwareHonestyRecord(3, true)
    expect(h.schema).toBe('pcb-firmware-honesty/v1')
    expect(h.isHil).toBe(false)
    expect(h.claimsFunctionalVerification).toBe(false)
    expect(h.statusLabel).toBe(PCB_FIRMWARE_HONESTY_CONTRACT.status.tier3)
    expect(h.statusLabel).not.toContain(PCB_FORBIDDEN_FUNCTIONAL_CLAIM)
    expect(h.readinessWhyFragment).toContain('virt_i2c_read8')
  })

  it('proveCatch: writeFirmwareHonestyArtefacts persists contract + honesty.json', () => {
    const outBase = path.join(process.cwd(), 'out')
    fs.mkdirSync(outBase, { recursive: true })
    const dir = fs.mkdtempSync(path.join(outBase, 'honesty-artefacts-'))
    try {
      const h = buildFirmwareHonestyRecord(3, true)
      const paths = writeFirmwareHonestyArtefacts(dir, h)
      expect(fs.existsSync(paths.contractPath)).toBe(true)
      expect(fs.existsSync(paths.honestyPath)).toBe(true)
      const written = JSON.parse(fs.readFileSync(paths.honestyPath, 'utf8')) as {
        statusLabel: string
        isHil: boolean
      }
      expect(written.statusLabel).toBe(h.statusLabel)
      expect(written.isHil).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
