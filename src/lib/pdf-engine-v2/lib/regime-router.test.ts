import { routePartLookup } from './regime-router'
import type { PartRegime } from './part-regime'

// ─── Mock the distributor aggregator ─────────────────────────────────────────

const mockFindSkuForPart = jest.fn()

jest.mock('./distributors/index', () => ({
  get findSkuForPart() {
    return mockFindSkuForPart
  },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePart(overrides: Partial<{ name: string; partNumber: string; regime: PartRegime; sourceModuleId: string }> = {}) {
  return {
    name: 'Generic part',
    regime: 'buy_electronic' as PartRegime,
    ...overrides,
  }
}

const SAMPLE_AGGREGATE_RESULT = {
  mpn: 'STM32H743ZIT6',
  best: {
    source: 'mouser' as const,
    mpn: 'STM32H743ZIT6',
    manufacturer: 'STMicroelectronics',
    description: '32-bit ARM Cortex-M7 MCU',
    priceGBP: [{ qty: 1, unitPriceGbp: 12.50 }],
    stockUK: 340,
    datasheetUrl: 'https://www.mouser.com/datasheet/2/stm32h743zi-2954673.pdf',
    productUrl: 'https://www.mouser.com/ProductDetail/STMicroelectronics/STM32H743ZIT6',
    leadWeeks: 12,
    fetchedAt: '2026-05-06T10:00:00Z',
  },
  alternates: [],
  misses: ['digikey', 'farnell'],
  qty1GBP: 12.50,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('routePartLookup', () => {
  beforeEach(() => {
    mockFindSkuForPart.mockReset()
  })

  // ── buy_electronic ────────────────────────────────────────────────────

  it('routes buy_electronic to distributor source when SKU is found', async () => {
    mockFindSkuForPart.mockResolvedValue(SAMPLE_AGGREGATE_RESULT)

    const result = await routePartLookup(makePart({
      name: 'STM32H743ZIT6',
      partNumber: 'STM32H743ZIT6',
      regime: 'buy_electronic',
    }))

    expect(result.source).toBe('distributor')
    expect(result.regime).toBe('buy_electronic')
    expect(result.sku).toBe('STM32H743ZIT6')
    expect(result.priceGbp).toBe(12.50)
    expect(result.supplier).toBe('mouser')
    expect(result.datasheetUrl).toContain('mouser.com')
    expect(result.stockQty).toBe(340)
    expect(result.confidence).toBe('HIGH')
    expect(mockFindSkuForPart).toHaveBeenCalledWith('STM32H743ZIT6')
  })

  it('routes buy_electronic to corpus fallback when no SKU is found', async () => {
    mockFindSkuForPart.mockResolvedValue(null)

    const result = await routePartLookup(makePart({
      name: 'Obscure electronic widget',
      regime: 'buy_electronic',
    }))

    expect(result.source).toBe('corpus')
    expect(result.confidence).toBe('LOW')
    expect(result.notes).toContain('no match')
  })

  it('routes buy_electronic to corpus fallback when distributor throws', async () => {
    mockFindSkuForPart.mockRejectedValue(new Error('MOUSER_API_KEY not set'))

    const result = await routePartLookup(makePart({
      name: 'Some IC',
      partNumber: 'IC-123',
      regime: 'buy_electronic',
    }))

    expect(result.source).toBe('corpus')
    expect(result.confidence).toBe('LOW')
    expect(result.notes).toContain('no match')
  })

  // ── make_custom_fab ───────────────────────────────────────────────────

  it('routes make_custom_fab to corpus source with HIGH confidence', async () => {
    const result = await routePartLookup(makePart({
      name: 'Custom mounting bracket',
      regime: 'make_custom_fab',
    }))

    expect(result.source).toBe('corpus')
    expect(result.regime).toBe('make_custom_fab')
    expect(result.confidence).toBe('HIGH')
    expect(result.notes).toContain('nightshift')
    expect(mockFindSkuForPart).not.toHaveBeenCalled()
  })

  // ── buy_mechanical_industrial ─────────────────────────────────────────

  it('routes buy_mechanical_industrial to corpus source with LOW confidence', async () => {
    const result = await routePartLookup(makePart({
      name: 'M6 bolt',
      regime: 'buy_mechanical_industrial',
    }))

    expect(result.source).toBe('corpus')
    expect(result.regime).toBe('buy_mechanical_industrial')
    expect(result.confidence).toBe('LOW')
    expect(result.notes).toContain('H7b')
    expect(mockFindSkuForPart).not.toHaveBeenCalled()
  })

  // ── named_manufacturer_reseller ───────────────────────────────────────

  it('routes named_manufacturer_reseller to corpus source with MEDIUM confidence', async () => {
    const result = await routePartLookup(makePart({
      name: 'CATL 280Ah LFP cell',
      regime: 'named_manufacturer_reseller',
    }))

    expect(result.source).toBe('corpus')
    expect(result.regime).toBe('named_manufacturer_reseller')
    expect(result.confidence).toBe('MEDIUM')
    expect(result.notes).toContain('H6')
    expect(mockFindSkuForPart).not.toHaveBeenCalled()
  })

  // ── service_certification ─────────────────────────────────────────────

  it('routes service_certification to registry source with LOW confidence', async () => {
    const result = await routePartLookup(makePart({
      name: 'UL 9540A thermal runaway test',
      regime: 'service_certification',
    }))

    expect(result.source).toBe('registry')
    expect(result.regime).toBe('service_certification')
    expect(result.confidence).toBe('LOW')
    expect(result.notes).toContain('not yet implemented')
    expect(mockFindSkuForPart).not.toHaveBeenCalled()
  })

  // ── edge cases ────────────────────────────────────────────────────────

  it('uses part name as MPN fallback when partNumber is missing', async () => {
    mockFindSkuForPart.mockResolvedValue(null)

    await routePartLookup(makePart({
      name: 'LM7805 voltage regulator',
      regime: 'buy_electronic',
    }))

    expect(mockFindSkuForPart).toHaveBeenCalledWith('LM7805 voltage regulator')
  })

  it('uses partNumber over name for distributor lookup', async () => {
    mockFindSkuForPart.mockResolvedValue(SAMPLE_AGGREGATE_RESULT)

    await routePartLookup(makePart({
      name: 'Some descriptive name',
      partNumber: 'STM32H743ZIT6',
      regime: 'buy_electronic',
    }))

    expect(mockFindSkuForPart).toHaveBeenCalledWith('STM32H743ZIT6')
  })
})
