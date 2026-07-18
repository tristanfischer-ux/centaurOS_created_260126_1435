import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  resolveVerifiedComponentIdentity,
  resolveVerifiedFunctionCandidate,
} from './pcb-verified-candidates'

import type { DbCascadeResult } from '../distributors/db-only-cascade'

const CACHE_HIT: DbCascadeResult = {
  found: true,
  result: {
    source: 'digikey',
    mpn: 'ATSAMD21G18A-AU',
    manufacturer: 'Microchip Technology',
    description: 'IC MCU 32BIT 256KB FLASH 48TQFP',
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

const UNKNOWN: DbCascadeResult = {
  found: false,
  result: null,
  source: 'unknown',
  ageHours: null,
}

describe('verified function-keyed PCB candidates', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('resolves a generic MCU role only after DB-only identity verification', () => {
    const resolved = resolveVerifiedFunctionCandidate(
      {
        wordId: 'main_controller_mcu_word',
        nameHuman: 'Main controller MCU',
        characterId: 'main_controller_mcu',
        functionClass: 'microcontroller',
      },
      () => CACHE_HIT,
    )

    expect(resolved).toMatchObject({
      manufacturer: 'Microchip Technology',
      partNumber: 'ATSAMD21G18A-AU',
      compatibleFunctionClass: 'microcontroller',
      footprint: {
        library: 'Package_QFP',
        footprint: 'TQFP-48_7x7mm_P0.5mm',
      },
      cacheSource: 'cache_hit',
    })
    expect(resolved?.provenance).toContain('934a44db3ed41c24ae4dddb5b805a22e4166284b')
    expect(resolved?.roleCompatibility).toContain('main_controller_mcu')
    expect(resolved?.packageCompatibility).toContain('48TQFP')
  })

  it('preserves an explicit blocker when the candidate is absent from the DB cache', () => {
    const resolved = resolveVerifiedFunctionCandidate(
      {
        wordId: 'microcontroller_mcu_word',
        nameHuman: 'Microcontroller',
        characterId: 'microcontroller_mcu',
        functionClass: 'microcontroller',
      },
      () => UNKNOWN,
    )

    expect(resolved).toBeNull()
  })

  it('does not use a low-current motor driver for a TEC or heater role', () => {
    const lookup = (): DbCascadeResult => ({
      ...CACHE_HIT,
      result: {
        ...CACHE_HIT.result!,
        mpn: 'DRV8876PWPR',
        manufacturer: 'Texas Instruments',
        description: 'IC MOTOR DRIVER DC 5.5V 16HTSSOP',
      },
    })

    expect(resolveVerifiedFunctionCandidate(
      {
        wordId: 'h_bridge_tec_driver_word',
        nameHuman: 'TEC H bridge',
        characterId: 'h_bridge_tec_driver',
        functionClass: 'gate_driver_ic',
      },
      lookup,
    )).toBeNull()

    expect(resolveVerifiedFunctionCandidate(
      {
        wordId: 'required_pump_channel_word',
        nameHuman: 'Pump channel',
        characterId: 'pump_channel_driver',
        functionClass: 'gate_driver_ic',
      },
      lookup,
    )).toMatchObject({
      partNumber: 'DRV8876PWPR',
      compatibleFunctionClass: 'gate_driver_ic',
    })
  })

  it('resolves the fixed 100 nF decoupling role but not an unspecified bulk capacitor', () => {
    const lookup = (): DbCascadeResult => ({
      ...CACHE_HIT,
      result: {
        ...CACHE_HIT.result!,
        mpn: 'CC0603KRX7R9BB104',
        manufacturer: 'YAGEO',
        description: 'CAP CER 0.1UF 50V X7R 0603',
      },
    })

    expect(resolveVerifiedFunctionCandidate(
      {
        wordId: 'main_controller_mcu_word__decouple',
        nameHuman: 'Decoupling capacitor',
        characterId: 'decoupling_capacitor',
        functionClass: 'passive_c',
      },
      lookup,
    )).toMatchObject({
      partNumber: 'CC0603KRX7R9BB104',
      footprint: {
        library: 'Capacitor_SMD',
        footprint: 'C_0603_1608Metric',
      },
    })

    expect(resolveVerifiedFunctionCandidate(
      {
        wordId: 'bulk_capacitor_word',
        nameHuman: 'Bulk capacitor',
        characterId: 'bulk_capacitor',
        functionClass: 'passive_c',
      },
      lookup,
    )).toBeNull()
  })

  it.each([
    {
      request: {
        wordId: 'dc_dc_regulator_word',
        nameHuman: '3.3 V low-current instrument rail regulator',
        characterId: 'dc_dc_regulator',
        functionClass: 'regulator',
        requiredRatings: { voltageV: 5, currentA: 0.2 },
      },
      manufacturer: 'Microchip Technology',
      partNumber: 'MCP1700T-3302E/TT',
      description: 'IC REG LINEAR 3.3V 250MA SOT23-3',
      expectedFootprint: 'SOT-23',
      expectedSource: 'Microchip MCP1700 datasheet',
    },
    {
      request: {
        wordId: 'source_board_connector_word',
        nameHuman: 'Four-position source board connector',
        characterId: 'source_board_connector',
        functionClass: 'connector',
      },
      manufacturer: 'JST Sales America Inc.',
      partNumber: 'BM04B-SRSS-TB',
      description: 'CONN HEADER SMD 4POS 1MM',
      expectedFootprint: 'JST_SH_BM04B-SRSS-TB_1x04-1MP_P1.00mm_Vertical',
      expectedSource: 'Pioreactor Eye-Spy frozen BOM',
    },
    {
      request: {
        wordId: 'esd_protection_network_word',
        nameHuman: '5 V interface TVS protection',
        characterId: 'esd_protection_network',
        functionClass: 'diode_protection',
        requiredRatings: { voltageV: 5 },
      },
      manufacturer: 'Toshiba',
      partNumber: 'DF2S6.8MFS,L3M',
      description: 'TVS DIODE 5V 15V SOD923',
      expectedFootprint: 'D_SOD-923',
      expectedSource: 'Pioreactor Eye-Spy frozen BOM',
    },
  ] as const)(
    'resolves $partNumber only for its source-backed universal role and package',
    ({
      request,
      manufacturer,
      partNumber,
      description,
      expectedFootprint,
      expectedSource,
    }) => {
      const lookup = (): DbCascadeResult => ({
        ...CACHE_HIT,
        result: {
          ...CACHE_HIT.result!,
          mpn: partNumber,
          manufacturer,
          description,
        },
      })

      const resolved = resolveVerifiedFunctionCandidate(request, lookup)

      expect(resolved).toMatchObject({
        manufacturer,
        partNumber,
        footprint: { footprint: expectedFootprint },
      })
      expect(resolved?.provenance).toContain(expectedSource)
    },
  )

  it.each([
    {
      request: {
        wordId: 'wifi_module_word',
        nameHuman: 'ESP8266 Wi-Fi module',
        characterId: 'wifi_module',
        functionClass: 'connectivity_ic',
        requiredRatings: { voltageV: 3.3, currentA: 0.5 },
      },
      manufacturer: 'Espressif Systems',
      partNumber: 'ESP-WROOM-02',
      expectedSymbol: 'RF_Module:ESP-WROOM-02',
      expectedFootprint: 'ESP-WROOM-02',
    },
    {
      request: {
        wordId: 'high_voltage_boost_controller_word',
        nameHuman: 'Adjustable high-voltage boost controller',
        characterId: 'high_voltage_boost_controller',
        functionClass: 'regulator',
        requiredRatings: { voltageV: 12 },
      },
      manufacturer: 'Maxim Integrated',
      partNumber: 'MAX1771ESA',
      expectedSymbol: 'Regulator_Switching:MAX1771xSA',
      expectedFootprint: 'SO-8_3.9x4.9mm_P1.27mm',
    },
    {
      request: {
        wordId: 'photodiode_adc_word',
        nameHuman: 'Single-channel precision photodiode ADC',
        characterId: 'photodiode_adc',
        functionClass: 'sensor_ic',
        requiredRatings: { voltageV: 5.5 },
      },
      manufacturer: 'Texas Instruments',
      partNumber: 'ADS1114IDGSR',
      expectedSymbol: 'Analog_ADC:ADS1114IDGS',
      expectedFootprint: 'TSSOP-10_3x3mm_P0.5mm',
    },
    {
      request: {
        wordId: 'fan_power_connector_word',
        nameHuman: 'Three-circuit fan power connector',
        characterId: 'fan_power_connector',
        functionClass: 'connector',
        requiredRatings: { voltageV: 12, currentA: 2.5 },
      },
      manufacturer: 'Molex',
      partNumber: '22-23-2031',
      expectedSymbol: 'Connector_Generic:Conn_01x03',
      expectedFootprint: 'Molex_KK-254_AE-6410-03A_1x03_P2.54mm_Vertical',
    },
    {
      request: {
        wordId: 'dac_output_stage_word',
        nameHuman: 'Precision bipolar DAC conditioning stage',
        characterId: 'dac_output_stage',
        functionClass: 'op_amp',
        requiredRatings: { voltageV: 30 },
      },
      manufacturer: 'Texas Instruments',
      partNumber: 'OP07CDR',
      expectedSymbol: 'Amplifier_Operational:OP07',
      expectedFootprint: 'SOIC-8_3.9x4.9mm_P1.27mm',
    },
    {
      request: {
        wordId: 'current_measurement_tia_word',
        nameHuman: 'Selectable-gain current measurement TIA',
        characterId: 'current_measurement_tia',
        functionClass: 'op_amp',
        requiredRatings: { voltageV: 30 },
      },
      manufacturer: 'STMicroelectronics',
      partNumber: 'TL072CDT',
      expectedSymbol: 'Amplifier_Operational:TL072',
      expectedFootprint: 'SOIC-8_3.9x4.9mm_P1.27mm',
    },
    {
      request: {
        wordId: 'usb_power_entry_word',
        nameHuman: 'Full-featured USB-C power and data receptacle',
        characterId: 'usb_power_entry',
        functionClass: 'usb_connector',
        requiredRatings: { voltageV: 5, currentA: 5 },
      },
      manufacturer: 'Amphenol ICC',
      partNumber: '12401610E4#2A',
      expectedSymbol: 'Connector:USB_C_Receptacle',
      expectedFootprint: 'USB_C_Receptacle_Amphenol_12401610E4-2A',
    },
    {
      request: {
        wordId: 'dc_dc_regulator_word',
        nameHuman: '3.3 V low-current instrument rail regulator',
        characterId: 'dc_dc_regulator',
        functionClass: 'regulator',
        requiredRatings: { voltageV: 5, currentA: 0.2 },
      },
      manufacturer: 'Microchip Technology',
      partNumber: 'MCP1700T-3302E/TT',
      expectedSymbol: 'Forge_Manufacturer:MCP1700T-3302E-TT',
      expectedFootprint: 'SOT-23',
    },
    {
      request: {
        wordId: 'load_cell_bridge_adc_word',
        nameHuman: 'Load cell bridge sensor ADC',
        characterId: 'load_cell_bridge_adc',
        functionClass: 'sensor_ic',
        requiredRatings: { voltageV: 5 },
      },
      manufacturer: 'Nuvoton Technology Corporation',
      partNumber: 'NAU7802SGI',
      expectedSymbol: 'Forge_Manufacturer:NAU7802SGI',
      expectedFootprint: 'SOIC-16_3.9x9.9mm_P1.27mm',
    },
    {
      request: {
        wordId: 'zero_drift_shutdown_op_amp_word',
        nameHuman: 'Zero-drift shutdown operational amplifier',
        characterId: 'zero_drift_shutdown_op_amp',
        functionClass: 'op_amp',
        requiredRatings: { voltageV: 5 },
      },
      manufacturer: 'Texas Instruments',
      partNumber: 'OPA334AIDBVR',
      expectedSymbol: 'Forge_Manufacturer:OPA334AIDBVR',
      expectedFootprint: 'SOT-23-6',
    },
  ] as const)(
    'promotes frozen-gold $partNumber through exact local symbol and footprint parity',
    ({
      request,
      manufacturer,
      partNumber,
      expectedSymbol,
      expectedFootprint,
    }) => {
      const lookup = (): DbCascadeResult => ({
        ...CACHE_HIT,
        result: {
          ...CACHE_HIT.result!,
          mpn: partNumber,
          manufacturer,
          description: expectedFootprint,
        },
      })

      expect(resolveVerifiedComponentIdentity(request, lookup, {
        symbolsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols',
        footprintsRoot: '/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints',
      })).toMatchObject({
        manufacturer,
        partNumber,
        symbolId: expectedSymbol,
        footprint: { footprint: expectedFootprint },
        resolutionTier: 'mpn_symbol_footprint',
      })
    },
  )

  it('does not promote NAU7802 or OPA334 for generic foreign ADC/TIA roles', () => {
    const lookup = (
      manufacturer: string | null,
      mpn: string,
    ): DbCascadeResult => ({
      ...CACHE_HIT,
      result: {
        ...CACHE_HIT.result!,
        mpn,
        manufacturer: manufacturer ?? '',
        description: mpn,
      },
    })

    expect(resolveVerifiedFunctionCandidate({
      wordId: 'adc_input_stage_word',
      nameHuman: 'Generic electrochemical ADC input stage',
      characterId: 'adc_input_stage',
      functionClass: 'sensor_ic',
    }, lookup)).toBeNull()

    expect(resolveVerifiedFunctionCandidate({
      wordId: 'current_measurement_tia_word',
      nameHuman: 'Generic high-voltage current measurement TIA',
      characterId: 'current_measurement_tia',
      functionClass: 'op_amp',
    }, lookup)?.partNumber).not.toBe('OPA334AIDBVR')
  })

  it('does not repurpose the four-pin JST host interconnect as USB power entry', () => {
    const lookup = (): DbCascadeResult => ({
      ...CACHE_HIT,
      result: {
        ...CACHE_HIT.result!,
        mpn: 'BM04B-SRSS-TB',
        manufacturer: 'JST Sales America Inc.',
        description: 'CONN HEADER SMD 4POS 1MM',
      },
    })

    expect(resolveVerifiedFunctionCandidate({
      wordId: 'usb_power_entry_word',
      nameHuman: 'USB power entry',
      characterId: 'usb_power_entry',
      functionClass: 'usb_connector',
    }, lookup)).toBeNull()
  })

  it('rejects the MCP1700 when a regulator role requires a 12 V input rating', () => {
    const lookup = (): DbCascadeResult => ({
      ...CACHE_HIT,
      result: {
        ...CACHE_HIT.result!,
        mpn: 'MCP1700T-3302E/TT',
        manufacturer: 'Microchip Technology',
        description: 'IC REG LINEAR 3.3V 250MA SOT23-3',
      },
    })

    expect(resolveVerifiedComponentIdentity({
      wordId: 'dc_dc_regulator_word',
      nameHuman: '12 V to 3.3 V regulator',
      characterId: 'dc_dc_regulator',
      functionClass: 'regulator',
      requiredRatings: { voltageV: 12, currentA: 0.2 },
    }, lookup, {
      symbolsRoot: '/unused',
      footprintsRoot: '/unused',
    })).toEqual({
      status: 'unresolved',
      reason: 'MCP1700T-3302E/TT voltage rating 6 V is below required 12 V',
    })
  })

  it('promotes only a DB, symbol, complete-pinout, footprint and rating verified identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'pcb-verified-candidate-'))
    roots.push(root)
    const symbolsRoot = join(root, 'symbols')
    const footprintsRoot = join(root, 'footprints')
    mkdirSync(symbolsRoot)
    mkdirSync(join(footprintsRoot, 'Capacitor_SMD.pretty'), { recursive: true })
    writeFileSync(join(symbolsRoot, 'Device.kicad_sym'), `(kicad_symbol_lib
  (symbol "C"
    (property "Footprint" "")
    (symbol "C_1_1"
      (pin passive line (name "~") (number "1"))
      (pin passive line (name "~") (number "2"))
    )
  )
)
`)
    writeFileSync(
      join(footprintsRoot, 'Capacitor_SMD.pretty', 'C_0603_1608Metric.kicad_mod'),
      '(footprint "C_0603_1608Metric" (pad "1" smd rect) (pad "2" smd rect))\n',
    )
    const lookup = (): DbCascadeResult => ({
      ...CACHE_HIT,
      result: {
        ...CACHE_HIT.result!,
        mpn: 'CC0603KRX7R9BB104',
        manufacturer: 'YAGEO',
        description: 'CAP CER 0.1UF 50V X7R 0603',
      },
    })

    expect(resolveVerifiedComponentIdentity({
      wordId: 'controller__decouple',
      nameHuman: '100 nF decoupling capacitor',
      characterId: 'decoupling_capacitor',
      functionClass: 'passive_c',
      requiredRatings: { voltageV: 24 },
    }, lookup, { symbolsRoot, footprintsRoot })).toMatchObject({
      partNumber: 'CC0603KRX7R9BB104',
      symbolId: 'Device:C',
      pins: [
        { number: '1', name: '~', kind: 'passive' },
        { number: '2', name: '~', kind: 'passive' },
      ],
      footprint: {
        library: 'Capacitor_SMD',
        footprint: 'C_0603_1608Metric',
        padCount: 2,
        nonElectricalPadCount: 0,
        electricalPadCount: 2,
      },
      resolutionTier: 'mpn_symbol_footprint',
    })

    expect(resolveVerifiedComponentIdentity({
      wordId: 'controller__decouple',
      nameHuman: '100 nF decoupling capacitor',
      characterId: 'decoupling_capacitor',
      functionClass: 'passive_c',
      requiredRatings: { voltageV: 60 },
    }, lookup, { symbolsRoot, footprintsRoot })).toEqual({
      status: 'unresolved',
      reason: 'CC0603KRX7R9BB104 voltage rating 50 V is below required 60 V',
    })
  })
})
