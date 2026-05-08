/**
 * @file lib/distributors/lcsc.ts — LCSC Electronics API stub (H1e).
 *
 * LCSC is a major Chinese electronics distributor (via JLCPCB / EasyEDA)
 * with an extensive catalogue of passives, ICs, and connectors at lower
 * price points than Mouser/Farnell/Digi-Key.
 *
 * Status: API access pending approval (1-3 week turnaround as of 2026-05-08).
 * This stub returns null gracefully when LCSC_API_KEY is absent.
 * Once the key and API docs are available, implement the actual fetch below.
 *
 * Contract: same as mouser.ts / digikey.ts / farnell.ts so the aggregator
 * can include it interchangeably.
 *
 * Auth: Store key as LCSC_API_KEY in environment / Vercel env vars.
 */

import type { DistributorResult } from './mouser'

export async function lookupSkuLcsc(mpn: string): Promise<DistributorResult | null> {
  const key = process.env.LCSC_API_KEY
  if (!key) {
    // Graceful no-op — API access not yet obtained.
    return null
  }
  if (!mpn || mpn.length < 2) return null

  // ── Placeholder: replace with real LCSC API call once API docs received ──
  // Expected endpoint (unconfirmed): https://lcscapi.com/products/search?mpn=...
  // or via https://wmsc.lcsc.com/wmsc/product/search — check official docs.
  //
  // The response should be mapped to DistributorResult with source: 'lcsc'.
  // Example implementation skeleton:
  //
  // const res = await fetch(
  //   `https://lcscapi.com/products/search?${new URLSearchParams({ mpn, key })}`,
  //   { signal: AbortSignal.timeout(15_000) },
  // )
  // if (!res.ok) { console.warn(`[lcsc] HTTP ${res.status} for ${mpn}`); return null }
  // const json = await res.json()
  // const product = json?.result?.list?.[0]
  // if (!product) return null
  // const priceUsd = product.productPriceList?.[0]?.productPrice ?? 0
  // const GBP = 0.8
  // return {
  //   source: 'lcsc',
  //   mpn: product.productCode ?? mpn,
  //   manufacturer: product.brandName ?? '',
  //   description: product.productDescription ?? '',
  //   priceGBP: [{ qty: 1, unitPriceGbp: priceUsd * GBP }],
  //   stockUK: null,  // LCSC ships from CN; UK stock not applicable
  //   datasheetUrl: product.pdfUrl ?? null,
  //   productUrl: `https://www.lcsc.com/product-detail/${product.productCode}.html`,
  //   fetchedAt: new Date().toISOString(),
  // }

  console.warn('[lcsc] API key present but implementation pending — skipping. Replace stub once API docs received.')
  return null
}
