/**
 * @file lib/distributors/mouser.ts — Mouser Search API v2 adapter (H1a).
 *
 * Free tier: 1000 calls/day. UK pricing + stock + datasheet URLs. Register
 * at https://www.mouser.co.uk/api-hub/ and paste the GUID into
 * ~/.claude/secrets/distributor-apis.env as MOUSER_API_KEY=...
 *
 * API reference: https://www.mouser.co.uk/api-hub/search
 *
 * Contract:
 *   lookupSkuMouser(mpn)
 *     → null if no match / key missing
 *     → { mpn, manufacturer, description, priceGBP[], stockUK, datasheetUrl, productUrl }
 *
 * Contract is identical across H1a / H1b / H1c so the aggregator H1d can
 * call any of them interchangeably.
 */

export interface DistributorResult {
  source: 'mouser' | 'digikey' | 'farnell' | 'lcsc' | 'rs' | 'eriks' | 'zoro'
  mpn: string
  manufacturer: string
  description: string
  /** Price breaks in GBP — [{ qty, unitPriceGbp }]. Sorted low → high qty. */
  priceGBP: Array<{ qty: number; unitPriceGbp: number }>
  /** UK warehouse stock level, 0 when out of stock, null when unknown. */
  stockUK: number | null
  datasheetUrl: string | null
  productUrl: string
  /** Timestamp so downstream can check staleness when caching. */
  fetchedAt: string
}

const MOUSER_API_URL = 'https://api.mouser.com/api/v2/search/partnumber'

export async function lookupSkuMouser(mpn: string): Promise<DistributorResult | null> {
  const key = process.env.MOUSER_API_KEY
  if (!key) {
    console.warn('[mouser] MOUSER_API_KEY not set — skipping')
    return null
  }
  if (!mpn || mpn.length < 2) return null

  try {
    const res = await fetch(`${MOUSER_API_URL}?apiKey=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        SearchByPartRequest: {
          mouserPartNumber: mpn,
          partSearchOptions: 'none',
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.warn(`[mouser] HTTP ${res.status} for ${mpn}`)
      return null
    }

    const data = await res.json() as any
    const parts = data?.SearchResults?.Parts
    if (!Array.isArray(parts) || parts.length === 0) return null

    // Prefer exact MPN match, else take first result
    const exact = parts.find((p: any) =>
      (p.ManufacturerPartNumber || '').toUpperCase() === mpn.toUpperCase())
    const best = exact || parts[0]

    // Mouser returns prices as strings with currency prefix, e.g. "£1.45"
    const priceGBP: Array<{ qty: number; unitPriceGbp: number }> = []
    if (Array.isArray(best.PriceBreaks)) {
      for (const pb of best.PriceBreaks) {
        const priceStr = String(pb.Price || '').replace(/[^0-9.]/g, '')
        const priceNum = parseFloat(priceStr)
        const qty = parseInt(pb.Quantity || '1', 10)
        if (Number.isFinite(priceNum) && Number.isFinite(qty)) {
          priceGBP.push({ qty, unitPriceGbp: priceNum })
        }
      }
    }

    const stockStr = String(best.AvailabilityInStock || '0').replace(/[^0-9]/g, '')
    const stockUK = stockStr ? parseInt(stockStr, 10) : null

    return {
      source: 'mouser',
      mpn: best.ManufacturerPartNumber || mpn,
      manufacturer: best.Manufacturer || '',
      description: best.Description || '',
      priceGBP,
      stockUK,
      datasheetUrl: best.DataSheetUrl || null,
      productUrl: best.ProductDetailUrl || `https://www.mouser.co.uk/c/?q=${encodeURIComponent(mpn)}`,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn(`[mouser] lookup failed for ${mpn}:`, (err as Error).message)
    return null
  }
}
