import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PCB_VERIFIED_CANDIDATES } from '../../../../../scripts/ingest/ingest-pcb-verified-candidates'
import {
  resolveVerifiedComponentIdentity,
  resolveVerifiedFunctionCandidate,
} from './pcb-verified-candidates'

import type { DbCascadeResult } from '../distributors/db-only-cascade'
import type { VerifiedCandidateRequest } from './pcb-verified-candidates'

interface CandidateAssessment {
  manufacturer: string
  partNumber: string
  ratings: string
  package: string
  pinout: string
  source: string
  decision: string
  reason: string
}

interface ProcurementRequirement {
  punchlistId: string
  candidateAssessments?: CandidateAssessment[]
  disposition: {
    status: 'resolved_exact_mpn' | 'rejected_not_fitted' | 'procurement_required'
  }
}

interface ProcurementMatrix {
  requirements: ProcurementRequirement[]
}

const MATRIX_PATH = resolve(__dirname, 'pcb-residual-procurement-requirements.json')
const EXACT_REFERENCE_PARTS = [
  'ACTP212',
  'CJT1117B-3.3-G',
  'EEVFK1E102Q',
  'IRLB3813PBF',
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
      wordId: 'reference_1000uf_25v_bulk_capacitor_candidate',
      nameHuman: 'Reference 1000 uF 25 V bulk capacitor candidate',
      characterId: 'reference_bulk_capacitor_candidate',
      functionClass: 'passive_c',
      requiredRatings: { voltageV: 25 },
    },
    manufacturer: 'Panasonic Industry',
    partNumber: 'EEVFK1E102Q',
    expectedSymbol: 'Forge_Manufacturer:EEVFK1E102Q',
    expectedFootprint: 'Panasonic_EEVFK1E102Q',
    expectedPins: ['+', '-'],
  },
  {
    request: {
      wordId: 'tec_direction_relay_constituent',
      nameHuman: 'TEC direction relay constituent',
      characterId: 'tec_direction_relay_constituent',
      functionClass: 'relay',
      requiredRatings: { voltageV: 14, currentA: 20 },
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
      wordId: 'tec_power_mosfet_constituent',
      nameHuman: 'TEC power MOSFET constituent',
      characterId: 'tec_power_mosfet_constituent',
      functionClass: 'power_mosfet',
      requiredRatings: { voltageV: 30, currentA: 10 },
    },
    manufacturer: 'Infineon Technologies',
    partNumber: 'IRLB3813PBF',
    expectedSymbol: 'Forge_Manufacturer:IRLB3813PBF',
    expectedFootprint: 'TO-220-3_Vertical',
    expectedPins: ['G', 'D', 'S'],
  },
  {
    request: {
      wordId: 'reference_cjt1117_3.3_ldo_constituent',
      nameHuman: 'Reference CJT1117 3.3 LDO constituent',
      characterId: 'reference_cjt1117_ldo_constituent',
      functionClass: 'regulator',
      requiredRatings: { voltageV: 12, currentA: 0.5 },
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

describe('NinjaPCR residual procurement evidence', () => {
  it('records exact candidate ratings, package and pinout without false closure', () => {
    const matrix = JSON.parse(
      readFileSync(MATRIX_PATH, 'utf8'),
    ) as ProcurementMatrix
    const ninjaRequirements = matrix.requirements.filter((item) =>
      item.punchlistId.startsWith('ninjapcr-'))
    const assessments = ninjaRequirements.flatMap((item) =>
      item.candidateAssessments ?? [])

    // INTENT: Exact gold/manufacturer identities are useful procurement inputs,
    // but none may become a fabrication claim before its role-level load closes.
    expect(ninjaRequirements).toHaveLength(9)
    expect(ninjaRequirements.every((item) =>
      item.disposition.status === 'procurement_required')).toBe(true)
    expect(assessments.map((candidate) => candidate.partNumber).sort())
      .toEqual([...EXACT_REFERENCE_PARTS].sort())
    for (const candidate of assessments) {
      expect(candidate.manufacturer.trim()).not.toBe('')
      expect(candidate.ratings.trim()).not.toBe('')
      expect(candidate.package.trim()).not.toBe('')
      expect(candidate.pinout.trim()).not.toBe('')
      expect(candidate.source).toMatch(/^https:\/\//)
      expect(candidate.decision).toMatch(/^rejected_/)
      expect(candidate.reason.trim()).not.toBe('')
    }
  })

  it('ingests all exact candidates with explicit pinout metadata', () => {
    const candidates = PCB_VERIFIED_CANDIDATES.filter((candidate) =>
      EXACT_REFERENCE_PARTS.includes(
        candidate.partNumber as typeof EXACT_REFERENCE_PARTS[number],
      ))

    expect(candidates.map((candidate) => candidate.partNumber).sort())
      .toEqual([...EXACT_REFERENCE_PARTS].sort())
    expect(candidates.every((candidate) => candidate.pinout?.trim())).toBe(true)
  })

  it.each(REFERENCE_CASES)(
    'maps exact reference constituent $partNumber with pin/pad parity',
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
        footprint: { footprint: expectedFootprint },
        resolutionTier: 'mpn_symbol_footprint',
      })
      expect('pins' in resolved ? resolved.pins.map((pin) => pin.name) : [])
        .toEqual(expectedPins)
    },
  )

  it('does not promote exact constituents as any complete residual role', () => {
    const exactReferenceParts = new Set<string>(EXACT_REFERENCE_PARTS)
    const residualRequests = [
      ['terminal_block_word', 'connector'],
      ['bulk_capacitor_word', 'passive_c'],
      ['status_led_word', 'led'],
      ['h_bridge_tec_driver_word', 'gate_driver_ic'],
      ['dc_dc_regulator_word', 'regulator'],
      ['current_sense_shunt_word', 'passive_r'],
      ['debug_uart_word', 'connector'],
      ['thermal_fuse_safety_word', 'fuse_protection'],
      ['estop_or_power_kill_word', 'switch'],
    ] as const

    for (const [role, functionClass] of residualRequests) {
      const resolved = resolveVerifiedFunctionCandidate({
        wordId: role,
        nameHuman: role,
        characterId: role,
        functionClass,
      }, (manufacturer, partNumber) =>
        cachedIdentity(manufacturer ?? '', partNumber))
      expect(exactReferenceParts.has(resolved?.partNumber ?? '')).toBe(false)
    }
  })
})
