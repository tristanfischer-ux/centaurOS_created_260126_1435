import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveCuratedManufacturerIdentity } from './pcb-manufacturer-pinouts'

describe('manufacturer-backed local PCB pinouts', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function createFootprints(): string {
    const root = mkdtempSync(join(tmpdir(), 'pcb-manufacturer-pinouts-'))
    roots.push(root)
    const packageSo = join(root, 'Package_SO.pretty')
    const packageSot = join(root, 'Package_TO_SOT_SMD.pretty')
    mkdirSync(packageSo)
    mkdirSync(packageSot)
    writeFileSync(
      join(packageSot, 'SOT-23.kicad_mod'),
      '(footprint "SOT-23" (pad "1" smd rect) (pad "2" smd rect) (pad "3" smd rect))\n',
    )
    writeFileSync(
      join(packageSot, 'SOT-23-6.kicad_mod'),
      '(footprint "SOT-23-6" (pad "1" smd rect) (pad "2" smd rect) (pad "3" smd rect) (pad "4" smd rect) (pad "5" smd rect) (pad "6" smd rect))\n',
    )
    writeFileSync(
      join(packageSo, 'SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod'),
      `(footprint "SOIC-16_3.9x9.9mm_P1.27mm"
  ${Array.from({ length: 16 }, (_, index) => `(pad "${index + 1}" smd rect)`).join(' ')}
)\n`,
    )
    return root
  }

  it.each([
    {
      manufacturer: 'Microchip Technology',
      partNumber: 'MCP1700T-3302E/TT',
      symbolId: 'Forge_Manufacturer:MCP1700T-3302E-TT',
      footprint: 'SOT-23',
      pinCount: 3,
      pins: [
        { number: '1', name: 'GND', kind: 'power_in' },
        { number: '2', name: 'VOUT', kind: 'power_out' },
        { number: '3', name: 'VIN', kind: 'power_in' },
      ],
      source: '20001826F',
    },
    {
      manufacturer: 'Nuvoton Technology Corporation',
      partNumber: 'NAU7802SGI',
      symbolId: 'Forge_Manufacturer:NAU7802SGI',
      footprint: 'SOIC-16_3.9x9.9mm_P1.27mm',
      pinCount: 16,
      pins: [
        { number: '1', name: 'REFP', kind: 'input' },
        { number: '16', name: 'AVDD/LDO', kind: 'power_in' },
      ],
      source: 'Rev2.6',
    },
    {
      manufacturer: 'Texas Instruments',
      partNumber: 'OPA334AIDBVR',
      symbolId: 'Forge_Manufacturer:OPA334AIDBVR',
      footprint: 'SOT-23-6',
      pinCount: 6,
      pins: [
        { number: '1', name: 'OUT', kind: 'output' },
        { number: '2', name: 'V-', kind: 'power_in' },
        { number: '3', name: '+IN', kind: 'input' },
        { number: '4', name: '-IN', kind: 'input' },
        { number: '5', name: 'ENABLE', kind: 'input' },
        { number: '6', name: 'V+', kind: 'power_in' },
      ],
      source: 'SBOS213D',
    },
  ] as const)(
    'verifies $partNumber manufacturer pins against exact footprint parity',
    ({ manufacturer, partNumber, symbolId, footprint, pinCount, pins, source }) => {
      const resolved = resolveCuratedManufacturerIdentity(
        manufacturer,
        partNumber,
        createFootprints(),
      )

      expect(resolved).toMatchObject({
        status: 'verified',
        symbolId,
        footprint: {
          footprint,
          electricalPadCount: pinCount,
        },
      })
      if (resolved.status === 'verified') {
        expect(resolved.pins).toHaveLength(pinCount)
        for (const pin of pins) expect(resolved.pins).toContainEqual(pin)
        expect(resolved.provenance).toContain(source)
      }
    },
  )

  it('rejects the TE panel indicator because no PCB pin/package source is proven', () => {
    expect(resolveCuratedManufacturerIdentity(
      'TE Connectivity',
      '4-2489541-7',
      createFootprints(),
    )).toEqual({
      status: 'unsupported',
      reason: '4-2489541-7 is evidenced only as a 110 V DC panel indicator; no authoritative PCB package and terminal pin geometry were found',
    })
  })

  it('rejects a manufacturer mismatch and a footprint parity mismatch', () => {
    const footprintsRoot = createFootprints()
    expect(resolveCuratedManufacturerIdentity(
      'Texas Instruments',
      'NAU7802SGI',
      footprintsRoot,
    )).toEqual({
      status: 'unsupported',
      reason: 'NAU7802SGI manufacturer Texas Instruments does not match curated Nuvoton Technology Corporation evidence',
    })

    writeFileSync(
      join(footprintsRoot, 'Package_TO_SOT_SMD.pretty', 'SOT-23-6.kicad_mod'),
      '(footprint "SOT-23-6" (pad "1" smd rect) (pad "2" smd rect) (pad "3" smd rect) (pad "4" smd rect) (pad "5" smd rect))\n',
    )
    expect(resolveCuratedManufacturerIdentity(
      'Texas Instruments',
      'OPA334AIDBVR',
      footprintsRoot,
    )).toEqual({
      status: 'unsupported',
      reason: 'OPA334AIDBVR manufacturer pinout has 6 pins but Package_TO_SOT_SMD:SOT-23-6 has 5 electrical pads',
    })
  })
})
