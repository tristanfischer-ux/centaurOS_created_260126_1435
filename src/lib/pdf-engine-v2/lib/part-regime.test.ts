import { classifyRegime, classifyAllRegimes } from './part-regime'
import type { Part } from '../types'

function p(overrides: Partial<Part> & { name: string }): Part {
  return {
    partNumber: overrides.partNumber || 'PN-TEST-001',
    name: overrides.name,
    isPurchased: overrides.isPurchased ?? true,
    process: overrides.process || '',
    material: overrides.material || '',
    sourceModuleId: overrides.sourceModuleId || 'mod-1',
    ...overrides,
  } as Part
}

describe('classifyRegime', () => {
  // ─── buy_electronic ─────────────────────────────────────────────────

  it('classifies an MCU as buy_electronic (high confidence)', () => {
    const c = classifyRegime(p({ name: 'STM32H743 MCU 32-bit ARM Cortex-M7' }))
    expect(c.regime).toBe('named_manufacturer_reseller') // STM matches stmicro
  })

  it('classifies an IGBT module as buy_electronic', () => {
    const c = classifyRegime(p({ name: 'Generic IGBT module 1200V 100A' }))
    expect(c.regime).toBe('buy_electronic')
    expect(c.confidence).toBe('high')
  })

  it('classifies a thermistor as buy_electronic', () => {
    const c = classifyRegime(p({ name: '10k NTC thermistor' }))
    expect(c.regime).toBe('buy_electronic')
  })

  it('classifies an LED as buy_electronic', () => {
    const c = classifyRegime(p({ name: 'High-brightness LED, green, 5mm' }))
    expect(c.regime).toBe('buy_electronic')
  })

  // ─── buy_mechanical_industrial ──────────────────────────────────────

  it('classifies a bolt as buy_mechanical_industrial', () => {
    const c = classifyRegime(p({ name: 'M6 × 20 stainless steel socket head bolt' }))
    expect(c.regime).toBe('buy_mechanical_industrial')
  })

  it('classifies a bearing as buy_mechanical_industrial', () => {
    const c = classifyRegime(p({ name: 'SKF 6205 deep-groove ball bearing' }))
    // SKF isn't in the named_manufacturers list for this regime
    expect(c.regime).toBe('buy_mechanical_industrial')
  })

  it('classifies a gasket as buy_mechanical_industrial', () => {
    const c = classifyRegime(p({ name: 'Silicone gasket, 50mm ID' }))
    expect(c.regime).toBe('buy_mechanical_industrial')
  })

  // ─── named_manufacturer_reseller ────────────────────────────────────

  it('classifies a CATL cell as named_manufacturer_reseller', () => {
    const c = classifyRegime(p({ name: 'CATL 280Ah LFP prismatic cell' }))
    expect(c.regime).toBe('named_manufacturer_reseller')
    expect(c.matchedRule).toBe('named_manufacturer')
  })

  it('classifies a Sungrow PCS as named_manufacturer_reseller', () => {
    const c = classifyRegime(p({ name: 'Sungrow SG2500HV 1MW PCS' }))
    expect(c.regime).toBe('named_manufacturer_reseller')
  })

  it('classifies a Copeland compressor as named_manufacturer_reseller', () => {
    const c = classifyRegime(p({ name: 'Copeland ZP38K5 scroll compressor' }))
    expect(c.regime).toBe('named_manufacturer_reseller')
  })

  // ─── make_custom_fab ────────────────────────────────────────────────

  it('classifies a fabricated chassis plate as make_custom_fab', () => {
    const c = classifyRegime(p({
      name: 'Top chassis plate, 3mm thick',
      isPurchased: false,
      process: 'sheet_metal',
      material: '6061-T6',
    }))
    expect(c.regime).toBe('make_custom_fab')
    expect(c.matchedRule).toBe('fabricated_part')
  })

  it('classifies an injection-moulded housing as make_custom_fab', () => {
    const c = classifyRegime(p({
      name: 'Enclosure lid',
      isPurchased: false,
      process: 'injection_moulding',
      material: 'abs',
    }))
    expect(c.regime).toBe('make_custom_fab')
  })

  // ─── service_certification ──────────────────────────────────────────

  it('classifies a UL 9540A test as service_certification', () => {
    const c = classifyRegime(p({
      name: 'UL 9540A thermal runaway test service',
      isPurchased: true,
      process: 'service',
    }))
    expect(c.regime).toBe('service_certification')
  })

  it('classifies an EMC precompliance service', () => {
    const c = classifyRegime(p({
      name: 'EMC precompliance chamber testing',
    }))
    expect(c.regime).toBe('service_certification')
  })

  // ─── low-confidence fallbacks ───────────────────────────────────────

  it('defaults ambiguous COTS to buy_electronic (low confidence)', () => {
    const c = classifyRegime(p({
      name: 'Miscellaneous widget',
      isPurchased: true,
      process: 'purchased_cots',
    }))
    expect(c.regime).toBe('buy_electronic')
    expect(c.confidence).toBe('low')
  })
})

describe('classifyAllRegimes', () => {
  it('counts regimes correctly across a mixed BOM', () => {
    const parts: Part[] = [
      p({ partNumber: 'e1', name: 'IGBT module' }),
      p({ partNumber: 'e2', name: 'NTC thermistor' }),
      p({ partNumber: 'm1', name: 'M6 bolt stainless' }),
      p({ partNumber: 'n1', name: 'CATL 280Ah LFP cell' }),
      p({ partNumber: 'f1', name: 'Top chassis plate', isPurchased: false }),
      p({ partNumber: 's1', name: 'UL 9540A test service' }),
    ]
    const result = classifyAllRegimes(parts)
    expect(result.counts.buy_electronic).toBe(2)
    expect(result.counts.buy_mechanical_industrial).toBe(1)
    expect(result.counts.named_manufacturer_reseller).toBe(1)
    expect(result.counts.make_custom_fab).toBe(1)
    expect(result.counts.service_certification).toBe(1)
    expect(result.byPartId.size).toBe(6)
  })
})
