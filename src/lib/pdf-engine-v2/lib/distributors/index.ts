/**
 * @file lib/distributors/index.ts — Aggregator (H1d).
 *
 * Given a manufacturer part number, queries Mouser + Digi-Key + Farnell in
 * parallel and returns a merged view with the cheapest UK-stocked option
 * plus alternates.
 *
 * Usage:
 *   const result = await findSkuForPart('STM32H743ZIT6')
 *   if (result) {
 *     result.best.source        // 'mouser' | 'digikey' | 'farnell'
 *     result.best.priceGBP[0]   // cheapest qty-1 price
 *     result.alternates         // other distributors with stock
 *   }
 */

import { lookupSkuMouser } from './mouser'
import { lookupSkuDigikey } from './digikey'
import { lookupSkuFarnell } from './farnell'
import { lookupSkuLcsc } from './lcsc'
import type { DistributorResult } from './mouser'

export type { DistributorResult } from './mouser'

export interface AggregateResult {
  mpn: string
  /** Lowest-price distributor that has stock. Same shape as DistributorResult. */
  best: DistributorResult
  /** Other distributors that returned a match, sorted by qty-1 price asc. */
  alternates: DistributorResult[]
  /** Distributors that failed or had no match — useful for debugging coverage. */
  misses: string[]
  /** Price at qty=1 across all hits, for quick arithmetic in the renderer. */
  qty1GBP: number | null
}

// 'lcsc' added — API pending approval, stub returns null when key absent.
export type CostSource = 'mouser' | 'farnell' | 'digikey' | 'lcsc' | 'supplier' | 'estimated' | 'database'

function qty1Price(r: DistributorResult): number {
  if (!r.priceGBP || r.priceGBP.length === 0) return Infinity
  // Find the price break applicable at qty=1 (smallest break)
  const sorted = [...r.priceGBP].sort((a, b) => a.qty - b.qty)
  return sorted[0].unitPriceGbp
}

/**
 * Look up a part's SKU across Mouser + Digi-Key + Farnell in parallel.
 * Returns null if no distributor has a match.
 *
 * @param mpn - Manufacturer part number to look up.
 * @param manufacturer - Optional declared manufacturer. When provided, any
 *   distributor result whose `manufacturer` field does NOT contain (or is not
 *   contained by) this string (case-insensitive substring match) is rejected.
 *   Null/undefined = no manufacturer filter (legacy behaviour).
 */
export async function findSkuForPart(mpn: string, manufacturer?: string | null): Promise<AggregateResult | null> {
  if (!mpn || mpn.length < 2) return null

  const [mouser, digikey, farnell, lcsc] = await Promise.all([
    lookupSkuMouser(mpn).catch(() => null),
    lookupSkuDigikey(mpn).catch(() => null),
    lookupSkuFarnell(mpn).catch(() => null),
    lookupSkuLcsc(mpn).catch(() => null),
  ])

  // Manufacturer-strict filter: when the BoM line declares a manufacturer,
  // reject any distributor row whose manufacturer field doesn't match.
  // Case-insensitive substring match in either direction (e.g. "Murata" matches
  // "Murata Manufacturing Co., Ltd." and vice-versa).
  function manufacturerMatches(row: DistributorResult | null): boolean {
    if (!row) return false
    if (!manufacturer || !manufacturer.trim()) return true  // no filter declared
    const declaredNorm = manufacturer.trim().toLowerCase()
    const rowNorm = (row.manufacturer ?? '').toLowerCase()
    if (!rowNorm) return true  // distributor returned no manufacturer — don't reject
    const matches = rowNorm.includes(declaredNorm) || declaredNorm.includes(rowNorm)
    if (!matches) {
      console.warn('[findSkuForPart] manufacturer-strict reject', {
        part: { mpn, manufacturer },
        row: { source: row.source, manufacturer: row.manufacturer, mpn: row.mpn },
      })
    }
    return matches
  }

  const hits: DistributorResult[] = []
  const misses: string[] = []
  if (mouser && manufacturerMatches(mouser)) hits.push(mouser); else misses.push('mouser')
  if (digikey && manufacturerMatches(digikey)) hits.push(digikey); else misses.push('digikey')
  if (farnell && manufacturerMatches(farnell)) hits.push(farnell); else misses.push('farnell')
  if (lcsc && manufacturerMatches(lcsc)) hits.push(lcsc); else misses.push('lcsc')

  if (hits.length === 0) return null

  // Sort by qty=1 price asc; prefer in-stock
  hits.sort((a, b) => {
    const aStock = (a.stockUK ?? 0) > 0 ? 0 : 1
    const bStock = (b.stockUK ?? 0) > 0 ? 0 : 1
    if (aStock !== bStock) return aStock - bStock
    return qty1Price(a) - qty1Price(b)
  })

  const best = hits[0]
  const alternates = hits.slice(1)
  const bestQty1 = qty1Price(best)

  return {
    mpn,
    best,
    alternates,
    misses,
    qty1GBP: Number.isFinite(bestQty1) ? bestQty1 : null,
  }
}

/**
 * Diagnostic: how many BOM lines can we actually resolve across the 3 APIs?
 * Used by the H5 coverage harness.
 */
export async function batchFindSkus(mpns: string[]): Promise<{
  resolved: number
  missing: number
  total: number
  results: Array<{ mpn: string; result: AggregateResult | null }>
}> {
  const results = await Promise.all(
    mpns.map(async mpn => ({ mpn, result: await findSkuForPart(mpn) })),
  )
  const resolved = results.filter(r => r.result !== null).length
  return {
    resolved,
    missing: results.length - resolved,
    total: results.length,
    results,
  }
}
