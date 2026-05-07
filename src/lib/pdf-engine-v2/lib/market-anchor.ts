export interface MarketAnchorResult {
  partName: string
  mpn: string | null
  priceGbp: number | null
  source: 'distributor_api' | 'corpus' | 'benchmark' | 'unpriced'
  url: string | null
  flagged: boolean // true if no price source found
}

export function anchorPartsToMarket(
  parts: Array<{
    name: string
    partNumber?: string
    estimatedUnitCostGbp?: number
    regimeRouterResult?: { priceGbp?: number; sku?: string; supplier?: string; datasheetUrl?: string; source?: string }
  }>,
  maxParts: number = 10
): MarketAnchorResult[] {
  const sortedParts = [...parts].sort((a, b) => {
    const costA = a.estimatedUnitCostGbp ?? 0
    const costB = b.estimatedUnitCostGbp ?? 0
    return costB - costA
  })

  return sortedParts.slice(0, maxParts).map(part => {
    const res = part.regimeRouterResult
    
    if (res && res.priceGbp !== undefined && res.priceGbp !== null) {
      return {
        partName: part.name,
        mpn: part.partNumber ?? null,
        priceGbp: res.priceGbp,
        source: 'distributor_api',
        url: res.datasheetUrl ?? null,
        flagged: false
      }
    }

    return {
      partName: part.name,
      mpn: part.partNumber ?? null,
      priceGbp: null,
      source: 'unpriced',
      url: null,
      flagged: true
    }
  })
}
