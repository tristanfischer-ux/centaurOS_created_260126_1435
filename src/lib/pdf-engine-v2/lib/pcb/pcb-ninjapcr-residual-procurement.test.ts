import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PCB_VERIFIED_CANDIDATES } from '../../../../../scripts/ingest/ingest-pcb-verified-candidates'
import {
  resolveVerifiedComponentIdentity,
  resolveVerifiedFunctionCandidate,
} from './pcb-verified-candidates'

import type { DbCascadeResult } from '../distributors/db-only-cascade'
import type { VerifiedCandidateRequest } from './pcb-verified-candidates'

interface ProcurementRequirement {
  punchlistId: string
  disposition: {
    status:
      | 'resolved_exact_mpn'
      | 'rejected_not_fitted'
      | 'reclassified_off_board_module'
      | 'procurement_required'
    manufacturer: string | null
    partNumber: string | null
    blocker: string | null
  }
}

interface ProcurementMatrix {
  residualProcurementCount: number
  requirements: ProcurementRequirement[]
}

const MATRIX_PATH = resolve(__dirname, 'pcb-residual-procurement-requirements.json')

const CLOSED_PARTS = [
  'ACTP212',
  'CJT1117B-3.3-G',
  'CS1E102M-CRI13',
  'GS012S-3.5-02P-11',
  'IRLB3813PBF',
  'TSW-104-07-T-S',
] as const

const REFERENCE_CASES: ReadonlyArray<{
  request: VerifiedCandidateRequest
  manufacturer: string
  partNumber: string
  expectedSymbol: string
  expectedFootprint: string
  expectedPins: readonly string[]
}> = [
  {
    request: {
      wordId: 'bulk_capacitor_word',
      nameHuman: '1000 uF 25 V bulk capacitor',
      characterId: 'bulk_capacitor',
      functionClass: 'passive_c',
      requiredRatings: { voltageV: 25 },
    },
    manufacturer: 'ST (Xianke / 先科)',
    partNumber: 'CS1E102M-CRI13',
    expectedSymbol: 'Forge_Manufacturer:CS1E102M-CRI13',
    expectedFootprint: 'Panasonic_EEVFK1E102Q',
    expectedPins: ['+', '-'],
  },
  {
    request: {
      wordId: 'terminal_block_word',
      nameHuman: 'Thermal terminal block',
      characterId: 'terminal_block',
      functionClass: 'connector',
      requiredRatings: { voltageV: 12, currentA: 2.23 },
    },
    manufacturer: 'GOOSVN (Ningbo Gosun Technology)',
    partNumber: 'GS012S-3.5-02P-11',
    expectedSymbol: 'Forge_Manufacturer:GS012S-3.5-02P-11',
    expectedFootprint: 'GOOSVN_GS012S_3.5_02P',
    expectedPins: ['A', 'B'],
  },
  {
    request: {
      wordId: 'h_bridge_tec_driver_word',
      nameHuman: 'TEC heater power stage',
      characterId: 'h_bridge_tec_driver',
      functionClass: 'relay',
      requiredRatings: { voltageV: 14, currentA: 5.6 },
    },
    manufacturer: 'Panasonic Industry',
    partNumber: 'ACTP212',
    expectedSymbol: 'Forge_Manufacturer:ACTP212',
    expectedFootprint: 'Panasonic_ACTP212',
    expectedPins: [
      'COM1',
      'COM2',
      'NC1+NC2',
      'NO1+NO2',
      'COIL1+',
      'COIL1-',
      'COIL2+',
      'COIL2-',
    ],
  },
  {
    request: {
      wordId: 'dc_dc_regulator_word',
      nameHuman: '12 V to 3.3 V CJT1117 LDO',
      characterId: 'dc_dc_regulator',
      functionClass: 'regulator',
      requiredRatings: { voltageV: 12, currentA: 0.17 },
    },
    manufacturer: 'Jiangsu Changjing Electronics Technology',
    partNumber: 'CJT1117B-3.3-G',
    expectedSymbol: 'Forge_Manufacturer:CJT1117B-3.3-G',
    expectedFootprint: 'SOT-223-3_TabPin2',
    expectedPins: ['GND', 'OUTPUT', 'INPUT'],
  },
]

function cachedIdentity(manufacturer: string, partNumber: string): DbCascadeResult {
  return {
    found: true,
    result: {
      source: 'digikey',
      mpn: partNumber,
      manufacturer,
      description: partNumber,
      priceGBP: [],
      stockUK: null,
      datasheetUrl: null,
      productUrl: '',
      leadWeeks: null,
      fetchedAt: '2026-07-19T00:00:00.000Z',
    },
    source: 'cache_hit',
    ageHours: 1,
  }
}

describe('NinjaPCR residual procurement closure', () => {
  it('closes all nine matrix requirements without inventing unsupported fitted parts', () => {
    const matrix = JSON.parse(
      readFileSync(MATRIX_PATH, 'utf8'),
    ) as ProcurementMatrix
    const ninjaRequirements = matrix.requirements.filter((item) =>
      item.punchlistId.startsWith('ninjapcr-'))

    expect(ninjaRequirements).toHaveLength(9)
    expect(Object.fromEntries(ninjaRequirements.map((item) => [
      item.punchlistId,
      item.disposition.status,
    ]))).toEqual({
      'ninjapcr-thermal_controller-terminal_block_word': 'resolved_exact_mpn',
      'ninjapcr-thermal_controller-bulk_capacitor_word': 'resolved_exact_mpn',
      'ninjapcr-thermal_controller-status_led_word': 'rejected_not_fitted',
      'ninjapcr-thermal_controller-h_bridge_tec_driver_word': 'resolved_exact_mpn',
      'ninjapcr-thermal_controller-dc_dc_regulator_word': 'resolved_exact_mpn',
      'ninjapcr-thermal_controller-current_sense_shunt_word': 'rejected_not_fitted',
      'ninjapcr-thermal_controller-debug_uart_word': 'resolved_exact_mpn',
      'ninjapcr-thermal_controller-thermal_fuse_safety_word': 'rejected_not_fitted',
      'ninjapcr-thermal_controller-estop_or_power_kill_word': 'rejected_not_fitted',
    })
    expect(matrix.residualProcurementCount).toBe(0)
    for (const item of ninjaRequirements) {
      expect(item.disposition.blocker).toBeNull()
    }
  })

  it('ingests the closed NinjaPCR identities with explicit pinout metadata', () => {
    const candidates = PCB_VERIFIED_CANDIDATES.filter((candidate) =>
      CLOSED_PARTS.includes(
        candidate.partNumber as typeof CLOSED_PARTS[number],
      ))

    expect(candidates.map((candidate) => candidate.partNumber).sort())
      .toEqual([...CLOSED_PARTS].sort())
    expect(candidates.every((candidate) => candidate.pinout?.trim())).toBe(true)
  })

  it.each(REFERENCE_CASES)(
    'maps closed role $partNumber with pin/pad parity',
    ({
      request,
      manufacturer,
      partNumber,
      expectedSymbol,
      expectedFootprint,
      expectedPins,
    }) => {
      const resolved = resolveVerifiedComponentIdentity(
        request,
        () => cachedIdentity(manufacturer, partNumber),
        {
          symbolsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols',
          footprintsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints',
        },
      )

      expect(resolved).toMatchObject({
        manufacturer,
        partNumber,
        symbolId: expectedSymbol,
        footprint: expect.objectContaining({
          footprint: expectedFootprint,
        }),
      })
      expect('pins' in resolved).toBe(true)
      if (!('pins' in resolved)) {
        throw new Error(`expected verified identity for ${partNumber}`)
      }
      expect(resolved.pins.map((pin) => pin.name)).toEqual([...expectedPins])
      expect(
        resolveVerifiedFunctionCandidate(
          request,
          () => cachedIdentity(manufacturer, partNumber),
        )?.partNumber,
      ).toBe(partNumber)
    },
  )
})
