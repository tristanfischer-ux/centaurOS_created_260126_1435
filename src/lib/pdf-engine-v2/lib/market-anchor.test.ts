import { anchorPartsToMarket } from './market-anchor'

describe('market-anchor', () => {
  it('handles all priced parts correctly and sorts by cost', () => {
    const parts = [
      { name: 'Cheap Part', estimatedUnitCostGbp: 10, regimeRouterResult: { priceGbp: 15, datasheetUrl: 'http://example.com/cheap' } },
      { name: 'Expensive Part', estimatedUnitCostGbp: 100, regimeRouterResult: { priceGbp: 110, datasheetUrl: 'http://example.com/expensive' } }
    ]
    const result = anchorPartsToMarket(parts)
    expect(result).toHaveLength(2)
    // Expensive should be first
    expect(result[0].partName).toBe('Expensive Part')
    expect(result[0].priceGbp).toBe(110)
    expect(result[0].source).toBe('distributor_api')
    expect(result[0].flagged).toBe(false)
    expect(result[0].url).toBe('http://example.com/expensive')
  })

  it('handles a mix of priced and unpriced parts', () => {
    const parts = [
      { name: 'Priced', estimatedUnitCostGbp: 50, regimeRouterResult: { priceGbp: 55 } },
      { name: 'Unpriced', estimatedUnitCostGbp: 60 }
    ]
    const result = anchorPartsToMarket(parts)
    expect(result).toHaveLength(2)
    // Unpriced is first because 60 > 50
    expect(result[0].partName).toBe('Unpriced')
    expect(result[0].priceGbp).toBeNull()
    expect(result[0].source).toBe('unpriced')
    expect(result[0].flagged).toBe(true)

    expect(result[1].partName).toBe('Priced')
    expect(result[1].priceGbp).toBe(55)
    expect(result[1].source).toBe('distributor_api')
    expect(result[1].flagged).toBe(false)
  })

  it('handles empty parts array', () => {
    const result = anchorPartsToMarket([])
    expect(result).toHaveLength(0)
  })
})
