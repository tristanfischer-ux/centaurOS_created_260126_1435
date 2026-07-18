import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PCB_VERIFIED_CANDIDATES } from '../../../../../scripts/ingest/ingest-pcb-verified-candidates'
import { resolveCuratedManufacturerIdentity } from './pcb-manufacturer-pinouts'
import { resolveVerifiedComponentIdentity } from './pcb-verified-candidates'

import type { DbCascadeResult } from '../distributors/db-only-cascade'

interface RodeostatDisposition {
  status:
    | 'resolved_exact_mpn'
    | 'reclassified_off_board_module'
    | 'rejected_not_fitted'
    | 'procurement_required'
  manufacturer: string | null
  partNumber: string | null
  blocker: string | null
}

interface ProcurementRequirement {
  punchlistId: string
  packageConstraints: string
  interface: string
  evidence: string[]
  disposition: RodeostatDisposition
}

interface ProcurementMatrix {
  residualProcurementCount: number
  requirements: ProcurementRequirement[]
}

const MATRIX_PATH = resolve(__dirname, 'pcb-residual-procurement-requirements.json')
const RODEOSTAT_IDS = [
  'rodeostat-analog_afe-esd_protection_network_word',
  'rodeostat-analog_afe-ferrite_emc_bead_word',
  'rodeostat-analog_afe-power_indicator_led_word',
  'rodeostat-analog_afe-adc_input_stage_word',
  'rodeostat-analog_afe-status_indicator_word',
] as const

const CACHE_HIT: DbCascadeResult = {
  found: true,
  result: {
    source: 'lcsc',
    mpn: 'BAS70-04',
    manufacturer: 'Slkor',
    description: 'Dual series Schottky clamp 70 V SOT-23',
    priceGBP: [],
    stockUK: null,
    datasheetUrl: 'https://www.lcsc.com/datasheet/C609810.pdf',
    productUrl: 'https://www.lcsc.com/product-detail/C609810.html',
    leadWeeks: null,
    fetchedAt: '2026-07-19T00:00:00.000Z',
  },
  source: 'cache_hit',
  ageHours: 1,
}

describe('Rodeostat residual procurement closure', () => {
  it('closes all five matrix requirements without inventing fitted parts', () => {
    const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as ProcurementMatrix
    const rodeostat = matrix.requirements.filter((item) =>
      RODEOSTAT_IDS.includes(item.punchlistId as typeof RODEOSTAT_IDS[number]))

    expect(rodeostat).toHaveLength(5)
    expect(Object.fromEntries(rodeostat.map((item) => [
      item.punchlistId,
      item.disposition.status,
    ]))).toEqual({
      'rodeostat-analog_afe-esd_protection_network_word': 'resolved_exact_mpn',
      'rodeostat-analog_afe-ferrite_emc_bead_word': 'rejected_not_fitted',
      'rodeostat-analog_afe-power_indicator_led_word': 'reclassified_off_board_module',
      'rodeostat-analog_afe-adc_input_stage_word': 'reclassified_off_board_module',
      'rodeostat-analog_afe-status_indicator_word': 'reclassified_off_board_module',
    })
    expect(matrix.residualProcurementCount).toBeLessThanOrEqual(22)
    for (const item of rodeostat) {
      expect(item.packageConstraints.trim()).not.toBe('')
      expect(item.interface.trim()).not.toBe('')
      expect(item.evidence.join(' ')).toMatch(/86e4708f|frozen Rodeostat/i)
      expect(item.disposition.blocker).toBeNull()
    }
  })

  it('records exact fitted clamp and host-module procurement evidence only', () => {
    const candidates = PCB_VERIFIED_CANDIDATES.filter((candidate) =>
      candidate.sourceCommit === '86e4708fea84f8fc33bcbfc9a706b06f4b770efd')
    const keyed = new Map(candidates.map((candidate) => [candidate.partNumber, candidate]))

    expect(keyed.get('BAS70-04')).toMatchObject({
      manufacturer: 'Slkor',
      componentClass: 'diode_protection',
      package: expect.stringMatching(/SOT-23/i),
      ratings: expect.objectContaining({
        reverseVoltageV: 70,
        forwardCurrentA: 0.07,
        reverseLeakageAAt50V: 1e-7,
        capacitancePf: 2,
      }),
    })
    expect(keyed.get('3800')).toMatchObject({
      manufacturer: 'Adafruit Industries',
      componentClass: 'compute_module',
      package: expect.stringMatching(/35\.9 x 17\.8 x 4\.2 mm.*33/i),
      ratings: expect.objectContaining({
        logicVoltageV: 3.3,
        adcResolutionBits: 12,
        adcSampleRateSps: 1_000_000,
      }),
    })
  })

  it('promotes the frozen low-leakage clamp with exact pinout and package parity', () => {
    const resolved = resolveVerifiedComponentIdentity({
      wordId: 'esd_protection_network_word',
      nameHuman: 'BAS70-04 low-leakage electrochemical rail clamp',
      characterId: 'electrochemical_input_clamp',
      functionClass: 'diode_protection',
      requiredRatings: { voltageV: 15, currentA: 0.001 },
    }, () => CACHE_HIT, {
      symbolsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols',
      footprintsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints',
    })

    expect(resolved).toMatchObject({
      manufacturer: 'Slkor',
      partNumber: 'BAS70-04',
      symbolId: 'Forge_Manufacturer:BAS70-04',
      pins: [
        { number: '1', name: 'A1', kind: 'passive' },
        { number: '2', name: 'K2', kind: 'passive' },
        { number: '3', name: 'K1/A2', kind: 'passive' },
      ],
      footprint: {
        library: 'Package_TO_SOT_SMD',
        footprint: 'SOT-23',
        electricalPadCount: 3,
      },
    })
  })

  it('does not relabel BAS70-04 as a generic certified TVS', () => {
    expect(resolveVerifiedComponentIdentity({
      wordId: 'esd_protection_network_word',
      nameHuman: 'IEC 61000-4-2 interface TVS',
      characterId: 'esd_protection_network',
      functionClass: 'diode_protection',
      requiredRatings: { voltageV: 15 },
    }, () => CACHE_HIT, {
      symbolsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols',
      footprintsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints',
    })).toMatchObject({ status: 'unresolved' })
  })

  it('exposes the exact BAS70-04 manufacturer pinout', () => {
    const resolved = resolveCuratedManufacturerIdentity(
      'Slkor',
      'BAS70-04',
      '/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints',
    )
    expect(resolved).toMatchObject({
      status: 'verified',
      symbolId: 'Forge_Manufacturer:BAS70-04',
      footprint: { electricalPadCount: 3 },
    })
  })
})
