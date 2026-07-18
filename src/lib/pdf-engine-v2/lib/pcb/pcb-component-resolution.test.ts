import {
  evaluatePcbComponentResolution,
  type PcbComponentResolutionCandidate,
} from './pcb-component-resolution'

function verifiedCandidate(
  overrides: Partial<PcbComponentResolutionCandidate> = {},
): PcbComponentResolutionCandidate {
  return {
    wordId: 'main_controller_word',
    instanceName: 'U1',
    requestedRole: 'microcontroller',
    manufacturer: 'Microchip',
    partNumber: 'ATSAMD21G18A-AU',
    mpnVerified: true,
    procurementProvenance: 'forge-truth:distributor-cascade-cache',
    compatibleRoles: ['microcontroller'],
    symbolId: 'MCU_Microchip_SAMD:ATSAMD21G18A-AU',
    footprint: {
      library: 'Package_QFP',
      footprint: 'TQFP-48_7x7mm_P0.5mm',
      padCount: 48,
      nonElectricalPadCount: 0,
    },
    pins: Array.from({ length: 48 }, (_, index) => ({
      number: String(index + 1),
      name: index === 0 ? 'VDD' : index === 1 ? 'GND' : `PIN_${index + 1}`,
      kind: index === 0 ? 'power_in' : index === 1 ? 'ground' : 'bidirectional',
    })),
    resolutionTier: 'mpn_symbol_footprint',
    resolutionBasis: 'verified catalogue identity and KiCad library mapping',
    ...overrides,
  }
}

describe('evaluatePcbComponentResolution', () => {
  it('accepts only a verified MPN, symbol, full pinout, and fitted footprint', () => {
    const result = evaluatePcbComponentResolution(verifiedCandidate())

    expect(result.status).toBe('verified')
    expect(result.isFabricationVerified).toBe(true)
    expect(result.findings).toEqual([])
  })

  it.each(['package_family', 'function_class'] as const)(
    'classifies %s package/function fallback as a stub',
    (resolutionTier) => {
      const result = evaluatePcbComponentResolution(verifiedCandidate({
        resolutionTier,
        mpnVerified: false,
        procurementProvenance: null,
      }))

      expect(result.status).toBe('stub')
      expect(result.isFabricationVerified).toBe(false)
      expect(result.findings.map((finding) => finding.code)).toContain('component_resolution_stub')
    },
  )

  it('rejects a verified part whose catalogue roles do not satisfy its requested role', () => {
    const result = evaluatePcbComponentResolution(verifiedCandidate({
      wordId: 'current_sense_shunt_word',
      requestedRole: 'passive_r',
      partNumber: 'TLC5916IDR',
      compatibleRoles: ['led_driver'],
    }))

    expect(result.status).toBe('invalid')
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'component_role_mismatch',
        wordId: 'current_sense_shunt_word',
        fixStage: 'component-resolution',
      }),
    ]))
  })

  it('rejects a short synthetic pin list fitted to a larger package', () => {
    const result = evaluatePcbComponentResolution(verifiedCandidate({
      pins: verifiedCandidate().pins.slice(0, 4),
    }))

    expect(result.status).toBe('invalid')
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'pinout_footprint_mismatch',
        message: expect.stringContaining('4 unique symbol pins for 48 electrical footprint pads'),
      }),
    ]))
  })

  it('names every missing fabrication-critical identity element', () => {
    const result = evaluatePcbComponentResolution(verifiedCandidate({
      manufacturer: null,
      partNumber: null,
      mpnVerified: false,
      procurementProvenance: null,
      symbolId: null,
      footprint: null,
      pins: [],
      resolutionTier: 'unresolved',
    }))

    expect(result.status).toBe('invalid')
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'unverified_component_mpn',
      'missing_component_symbol',
      'incomplete_component_pinout',
      'missing_component_footprint',
    ]))
  })
})
