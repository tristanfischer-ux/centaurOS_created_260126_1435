/**
 * @file lib/distributors/farnell.ts — Farnell / Element14 Product Search API (H1c).
 *
 * Free tier: UK-native. Register at https://partner.element14.com/ and paste
 * into ~/.claude/secrets/distributor-apis.env as FARNELL_API_KEY=...
 *
 * API reference: https://partner.element14.com/docs/Product_Search_API
 */

import type { DistributorResult } from './mouser'

const FARNELL_URL = 'https://api.element14.com/catalog/products'
const STORE = 'uk.farnell.com'

export async function lookupSkuFarnell(mpn: string): Promise<DistributorResult | null> {
  const key = process.env.FARNELL_API_KEY
  if (!key) {
    console.warn('[farnell] FARNELL_API_KEY not set — skipping')
    return null
  }
  if (!mpn || mpn.length < 2) return null

  const params = new URLSearchParams({
    term: `manuPartNum:${mpn}`,
    storeInfo: 'id',
    resultsSettings: 'id',
    'storeInfo.id': STORE,
    callInfo: 'responseGroup,productId,priceAvailability,inventory,productDetails',
    versionNumber: '1.4',
    callInfoResponseGroup: 'extended',
    'resultsSettings.numberOfResults': '5',
    'resultsSettings.responseGroup': 'large',
    'resultsSettings.refinements.filters': '',
    callInfoApiKey: key,
  })

  try {
    const res = await fetch(`${FARNELL_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.warn(`[farnell] HTTP ${res.status} for ${mpn}`)
      return null
    }

    const data = await res.json() as any
    const products = data?.manufacturerPartNumberSearchReturn?.products
      || data?.keywordSearchReturn?.products
    if (!Array.isArray(products) || products.length === 0) return null

    const exact = products.find((p: any) =>
      (p.translatedManufacturerPartNumber || p.manufacturerPartNumber || '').toUpperCase() === mpn.toUpperCase())
    const best = exact || products[0]

    const priceGBP: Array<{ qty: number; unitPriceGbp: number }> = []
    if (Array.isArray(best.prices)) {
      for (const pb of best.prices) {
        const price = parseFloat(pb.cost ?? pb.price ?? '0')
        const qty = parseInt(pb.from || pb.quantity || '1', 10)
        if (Number.isFinite(price) && Number.isFinite(qty)) {
          priceGBP.push({ qty, unitPriceGbp: price })
        }
      }
    }

    const stockUK = typeof best.inv === 'number'
      ? best.inv
      : (typeof best.inventoryCode === 'string' ? null : null)

    const productId = best.id || best.sku
    const productUrl = productId
      ? `https://uk.farnell.com/${best.vendorName || 'c'}/${productId}`
      : `https://uk.farnell.com/search?st=${encodeURIComponent(mpn)}`

    return {
      source: 'farnell',
      mpn: best.translatedManufacturerPartNumber || best.manufacturerPartNumber || mpn,
      manufacturer: best.vendorName || best.brandName || '',
      description: best.displayName || best.translatedMinimumDescription || '',
      priceGBP,
      stockUK,
      datasheetUrl: (Array.isArray(best.datasheets) && best.datasheets[0])
        ? best.datasheets[0] : null,
      productUrl,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn(`[farnell] lookup failed for ${mpn}:`, (err as Error).message)
    return null
  }
}
