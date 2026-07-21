import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lookupCached } from '../distributors/db-only-cascade'
import { generateAtopileProject } from './atopile-generator'

import type { DbCascadeResult } from '../distributors/db-only-cascade'

jest.mock('../distributors/db-only-cascade', () => ({
  lookupCached: jest.fn(),
}))

const mockedLookup = lookupCached as jest.MockedFunction<typeof lookupCached>

function cacheHit(manufacturer: string, mpn: string, description: string): DbCascadeResult {
  return {
    found: true,
    result: {
      source: 'digikey',
      manufacturer,
      mpn,
      description,
      priceGBP: [],
      stockUK: null,
      datasheetUrl: null,
      productUrl: '',
      leadWeeks: null,
      fetchedAt: '2026-07-18T00:00:00.000Z',
    },
    source: 'cache_hit',
    ageHours: 1,
  }
}

describe('Atopile verified identity integration', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    mockedLookup.mockReset()
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('promotes compatible cached roles and preserves an incompatible TEC blocker', () => {
    mockedLookup.mockImplementation((manufacturer, mpn) => {
      const hits: Record<string, DbCascadeResult> = {
        'ATSAMD21G18A-AU': cacheHit(
          'Microchip Technology',
          'ATSAMD21G18A-AU',
          'IC MCU 32BIT 256KB FLASH 48TQFP',
        ),
        'CC0603KRX7R9BB104': cacheHit(
          'YAGEO',
          'CC0603KRX7R9BB104',
          'CAP CER 0.1UF 50V X7R 0603',
        ),
        'BSS84-7-F': cacheHit(
          'Diodes Incorporated',
          'BSS84-7-F',
          'P-CHANNEL MOSFET 50V SOT-23-3',
        ),
      }
      return hits[mpn] ?? {
        found: false,
        result: null,
        source: 'unknown',
        ageHours: null,
      }
    })
    const state = {
      moduleDecomposition: {
        modules: [{
          module: 'control',
          sub_modules: [{
            id: 'control__board',
            words: [
              {
                id: 'main_controller_mcu_word',
                name_human: 'Main controller MCU',
                content_character: { character_id: 'main_controller_mcu' },
                modifier_characters: [{ kind: 'quantity', value: '×1' }],
              },
              {
                id: 'h_bridge_tec_driver_word',
                name_human: 'TEC H bridge driver',
                content_character: { character_id: 'h_bridge_tec_driver' },
                modifier_characters: [{ kind: 'quantity', value: '×1' }],
              },
              {
                id: 'reverse_polarity_protection_word',
                name_human: 'Reverse polarity protection',
                content_character: { character_id: 'reverse_polarity_protection' },
                modifier_characters: [{ kind: 'quantity', value: '×1' }],
              },
            ],
          }],
        }],
      },
    }
    const outDir = mkdtempSync(join(tmpdir(), 'atopile-verified-identity-'))
    tmpDirs.push(outDir)

    const result = generateAtopileProject(state, outDir)
    const mcu = result.components.find((component) =>
      component.wordId === 'main_controller_mcu_word')
    const tecDriver = result.components.find((component) =>
      component.wordId === 'h_bridge_tec_driver_word')
    const mcuDecoupling = result.components.find((component) =>
      component.wordId === 'main_controller_mcu_word__decouple')
    const reversePolarity = result.components.find((component) =>
      component.wordId === 'reverse_polarity_protection_word')

    expect(mcu).toMatchObject({
      partNumber: 'ATSAMD21G18A-AU',
      mpnVerified: true,
      identityVerified: true,
      symbolId: 'MCU_Microchip_SAMD:ATSAMD21G18A-A',
      resolutionTier: 'mpn_symbol_footprint',
      identityProvenance: expect.stringContaining('forge-truth:cache_hit'),
      roleCompatibility: expect.stringContaining('main_controller_mcu'),
      packageCompatibility: expect.stringContaining('48TQFP'),
    })
    expect(mcu?.pinSpecs).toHaveLength(48)
    expect(mcu?.pinPadMap).toEqual(expect.objectContaining({
      VDDANA__6: '6',
      GND__18: '18',
    }))
    expect(mcuDecoupling).toMatchObject({
      partNumber: 'CC0603KRX7R9BB104',
      mpnVerified: true,
      identityVerified: true,
      symbolId: 'Device:C',
      resolutionTier: 'mpn_symbol_footprint',
    })
    expect(tecDriver).toMatchObject({
      partNumber: null,
      mpnVerified: false,
      identityVerified: false,
      resolutionTier: 'package_family',
      identityBlocker: expect.stringContaining('no curated role-compatible candidate'),
    })
    expect(reversePolarity).toMatchObject({
      identityVerified: true,
      symbolId: 'Transistor_FET:Q_PMOS_GSD',
      pins: ['G__1', 'S__2', 'D__3'],
      powerPin: null,
      groundPin: null,
    })
  })

  it('P3: TE 4-2489541-7 never lands as mpn_package_only on an LED role', () => {
    mockedLookup.mockImplementation((_manufacturer, mpn) => {
      if (mpn === '4-2489541-7') {
        return cacheHit(
          'TE Connectivity',
          '4-2489541-7',
          'INDICATOR PANEL 110V DC GREEN LED_0603',
        )
      }
      return { found: false, result: null, source: 'unknown', ageHours: null }
    })

    const state = {
      moduleDecomposition: {
        modules: [{
          module: 'hmi',
          sub_modules: [{
            id: 'hmi__indicators',
            words: [{
              id: 'power_indicator_led_word',
              name_human: 'Power indicator LED',
              content_character: { character_id: 'power_indicator_led' },
              modifier_characters: [
                { kind: 'manufacturer', value: 'TE Connectivity' },
                { kind: 'part_number', value: '4-2489541-7' },
                { kind: 'form', value: 'LED_0603' },
              ],
            }],
          }],
        }],
      },
      orchestratorContract: { topology: [] },
    }
    const outDir = mkdtempSync(join(tmpdir(), 'atopile-p3-te-led-'))
    tmpDirs.push(outDir)

    const result = generateAtopileProject(state, outDir, {
      requiredWordIds: ['power_indicator_led_word'],
    })
    const led = result.components.find((c) => c.wordId === 'power_indicator_led_word')
    const unresolved = result.unresolved.find((u) => u.wordId === 'power_indicator_led_word')

    if (led) {
      expect(led.resolutionTier).not.toBe('mpn_package_only')
      expect(led.partNumber).not.toBe('4-2489541-7')
      expect(led.mpnVerified).toBe(false)
    } else {
      expect(unresolved?.reason).toMatch(/panel indicator|deny|4-2489541-7/i)
    }
  })

  // proveCatch (organoid rebake3): form prose "(12v/5v) distribution board" must
  // NOT floor USB/ESD/LED candidates — ratings come from structured modifiers only.
  it('does not let form-prose board-rail voltages block interface-critical candidates', () => {
    mockedLookup.mockImplementation((_manufacturer, mpn) => {
      const hits: Record<string, DbCascadeResult> = {
        '12401610E4#2A': cacheHit('Amphenol ICC', '12401610E4#2A', 'USB Type-C receptacle'),
        PESD5V0L5UY: cacheHit('Nexperia', 'PESD5V0L5UY', '5-line ESD array'),
        'KPT-1608CGCK': cacheHit('Kingbright', 'KPT-1608CGCK', '0603 green LED'),
        'CC0603KRX7R9BB104': cacheHit('YAGEO', 'CC0603KRX7R9BB104', '100nF 0603'),
      }
      return hits[mpn] ?? {
        found: false,
        result: null,
        source: 'unknown',
        ageHours: null,
      }
    })

    const boardRailForm =
      'representative low-voltage dc power distribution board (12v/5v) component'
    const state = {
      moduleDecomposition: {
        modules: [{
          module: 'hat',
          sub_modules: [{
            id: 'hat__power',
            words: [
              {
                id: 'usb_power_entry_word',
                name_human: 'Usb Power Entry',
                content_character: { character_id: 'usb_power_entry' },
                modifier_characters: [
                  { kind: 'form', value: `Usb Power Entry — ${boardRailForm}` },
                  { kind: 'part_number', value: 'TBD (detailed design)' },
                ],
              },
              {
                id: 'esd_protection_network_word',
                name_human: 'Esd Protection Network',
                content_character: { character_id: 'esd_protection_network' },
                modifier_characters: [
                  { kind: 'form', value: `Esd Protection Network — ${boardRailForm}` },
                  { kind: 'part_number', value: 'TBD (detailed design)' },
                ],
              },
              {
                id: 'power_indicator_led_word',
                name_human: 'Power Indicator LED',
                content_character: { character_id: 'power_indicator_led' },
                modifier_characters: [
                  { kind: 'form', value: `Power Indicator LED — ${boardRailForm}` },
                  { kind: 'manufacturer', value: 'TE Connectivity' },
                  { kind: 'part_number', value: '4-2489541-7' },
                ],
              },
            ],
          }],
        }],
      },
      orchestratorContract: { topology: [] },
    }
    const outDir = mkdtempSync(join(tmpdir(), 'atopile-form-rail-ratings-'))
    tmpDirs.push(outDir)

    const result = generateAtopileProject(state, outDir, {
      requiredWordIds: [
        'usb_power_entry_word',
        'esd_protection_network_word',
        'power_indicator_led_word',
      ],
    })

    const usb = result.components.find((c) => c.wordId === 'usb_power_entry_word')
    const esd = result.components.find((c) => c.wordId === 'esd_protection_network_word')
    const led = result.components.find((c) => c.wordId === 'power_indicator_led_word')

    expect(usb?.mpnVerified).toBe(true)
    expect(usb?.partNumber).toMatch(/12401610E4/i)
    expect(esd?.mpnVerified).toBe(true)
    expect(esd?.partNumber).toBe('PESD5V0L5UY')
    expect(led?.mpnVerified).toBe(true)
    expect(led?.partNumber).toBe('KPT-1608CGCK')
    expect(result.unresolved.map((u) => u.wordId)).toEqual([])
  })
})
