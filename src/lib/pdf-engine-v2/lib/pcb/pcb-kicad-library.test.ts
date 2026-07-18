import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  resolveKicadFootprint,
  resolveKicadSymbol,
} from './pcb-kicad-library'

describe('KiCad component identity library', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('inherits a complete pinout from the local KiCad base symbol', () => {
    const root = mkdtempSync(join(tmpdir(), 'pcb-kicad-symbol-'))
    roots.push(root)
    writeFileSync(join(root, 'MCU_Test.kicad_sym'), `(kicad_symbol_lib
  (symbol "BASE"
    (symbol "BASE_1_1"
      (pin power_in line (name "") (number "1"))
      (pin power_in line (name "GND") (number "2"))
      (pin bidirectional line (name "PA00") (number "3"))
    )
  )
  (symbol "PART-A"
    (extends "BASE")
    (property "Footprint" "Package_QFP:TQFP-3")
  )
)
`)

    expect(resolveKicadSymbol(root, {
      library: 'MCU_Test',
      symbol: 'PART-A',
    })).toEqual({
      symbolId: 'MCU_Test:PART-A',
      footprintId: 'Package_QFP:TQFP-3',
      pins: [
        { number: '1', name: '~', kind: 'power_in' },
        { number: '2', name: 'GND', kind: 'power_in' },
        { number: '3', name: 'PA00', kind: 'bidirectional' },
      ],
    })
  })

  it('counts electrical and non-electrical pads from the exact local footprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'pcb-kicad-footprint-'))
    roots.push(root)
    mkdirSync(join(root, 'Package_Test.pretty'))
    writeFileSync(join(root, 'Package_Test.pretty', 'PART.kicad_mod'), `(footprint "PART"
  (pad "1" smd rect)
  (pad "2" smd rect)
  (pad "3" smd rect)
  (pad "MP" smd rect)
  (pad "MP" smd rect)
  (pad "" np_thru_hole circle)
)
`)

    expect(resolveKicadFootprint(root, {
      library: 'Package_Test',
      footprint: 'PART',
    })).toEqual({
      library: 'Package_Test',
      footprint: 'PART',
      padCount: 6,
      nonElectricalPadCount: 3,
    })
  })

  it('returns null rather than synthesising a missing symbol or footprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'pcb-kicad-missing-'))
    roots.push(root)

    expect(resolveKicadSymbol(root, {
      library: 'Missing',
      symbol: 'PART',
    })).toBeNull()
    expect(resolveKicadFootprint(root, {
      library: 'Missing',
      footprint: 'PART',
    })).toBeNull()
  })
})
