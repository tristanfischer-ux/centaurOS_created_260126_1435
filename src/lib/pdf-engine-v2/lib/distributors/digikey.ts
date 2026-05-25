/**
 * @file lib/distributors/digikey.ts — Digi-Key API v4 adapter (H1b).
 *
 * Free tier: ~1000 calls/day. UK pricing. OAuth 2.0 client-credentials flow.
 * Register at https://developer.digikey.com/ and paste into
 * ~/.claude/secrets/distributor-apis.env:
 *   DIGIKEY_CLIENT_ID=...
 *   DIGIKEY_CLIENT_SECRET=...
 *
 * Token is refreshed on 401. Cached in memory for ~10 min.
 */

import type { DistributorResult } from './mouser'
import { parseLeadTimeWeeks } from './mouser'
import { recordDistributorHit } from './library-writeback'

const DK_TOKEN_URL = 'https://api.digikey.com/v1/oauth2/token'
const DK_SEARCH_URL = 'https://api.digikey.com/products/v4/search/keyword'

let _accessToken: string | null = null
let _tokenExpiresAt = 0

async function getAccessToken(): Promise<string | null> {
  const id = process.env.DIGIKEY_CLIENT_ID
  const secret = process.env.DIGIKEY_CLIENT_SECRET
  if (!id || !secret) {
    console.warn('[digikey] DIGIKEY_CLIENT_ID / DIGIKEY_CLIENT_SECRET not set — skipping')
    return null
  }
  if (_accessToken && Date.now() < _tokenExpiresAt) return _accessToken

  try {
    const res = await fetch(DK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn(`[digikey] token HTTP ${res.status}`)
      return null
    }
    const data = await res.json() as any
    _accessToken = data.access_token
    _tokenExpiresAt = Date.now() + (data.expires_in * 1000 - 60_000) // 1min safety
    return _accessToken
  } catch (err) {
    console.warn('[digikey] token fetch failed:', (err as Error).message)
    return null
  }
}

export async function lookupSkuDigikey(mpn: string): Promise<DistributorResult | null> {
  const token = await getAccessToken()
  if (!token) return null
  const id = process.env.DIGIKEY_CLIENT_ID
  if (!id) return null
  if (!mpn || mpn.length < 2) return null

  try {
    const res = await fetch(DK_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-DIGIKEY-Client-Id': id,
        'X-DIGIKEY-Locale-Site': 'UK',
        'X-DIGIKEY-Locale-Currency': 'GBP',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Keywords: mpn, Limit: 5, Offset: 0 }),
      signal: AbortSignal.timeout(15_000),
    })

    if (res.status === 401) {
      _accessToken = null
      console.warn('[digikey] 401 — will retry on next call')
      return null
    }
    if (!res.ok) {
      console.warn(`[digikey] HTTP ${res.status} for ${mpn}`)
      return null
    }

    const data = await res.json() as any
    const products = data?.Products
    if (!Array.isArray(products) || products.length === 0) return null

    const exact = products.find((p: any) =>
      (p.ManufacturerProductNumber || '').toUpperCase() === mpn.toUpperCase())
    const best = exact || products[0]

    const variations = Array.isArray(best.ProductVariations) ? best.ProductVariations : []
    const firstVar = variations[0] || {}

    const priceGBP: Array<{ qty: number; unitPriceGbp: number }> = []
    if (Array.isArray(firstVar.StandardPricing)) {
      for (const pb of firstVar.StandardPricing) {
        if (typeof pb.BreakQuantity === 'number' && typeof pb.UnitPrice === 'number') {
          priceGBP.push({ qty: pb.BreakQuantity, unitPriceGbp: pb.UnitPrice })
        }
      }
    }

    // Lead time — Digi-Key v4 exposes the field on the Product or Variation:
    //   - product.ManufacturerLeadWeeks (numeric weeks, when populated)
    //   - product.ManufacturerLeadTime (free string, e.g. "12 Weeks")
    //   - product.LeadStatus (e.g. "In Stock", "Backorder")
    //   - variation.ManufacturerLeadWeeks
    // P0-1: the field was previously dropped on the floor.
    const leadCandidates: unknown[] = [
      best.ManufacturerLeadWeeks,
      firstVar.ManufacturerLeadWeeks,
      best.ManufacturerLeadTime,
      firstVar.ManufacturerLeadTime,
      best.LeadStatus,
    ]
    let leadWeeks: number | null = null
    for (const cand of leadCandidates) {
      const parsed = parseLeadTimeWeeks(cand)
      if (parsed !== null) {
        leadWeeks = parsed
        break
      }
    }

    const result: DistributorResult = {
      source: 'digikey',
      mpn: best.ManufacturerProductNumber || mpn,
      manufacturer: best.Manufacturer?.Name || '',
      description: best.Description?.ProductDescription || '',
      priceGBP,
      stockUK: typeof firstVar.QuantityAvailableforPackageType === 'number'
        ? firstVar.QuantityAvailableforPackageType
        : null,
      datasheetUrl: best.DatasheetUrl || null,
      productUrl: best.ProductUrl || `https://www.digikey.co.uk/en/products/result?keywords=${encodeURIComponent(mpn)}`,
      leadWeeks,
      fetchedAt: new Date().toISOString(),
    }
    recordDistributorHit(result)
    return result
  } catch (err) {
    console.warn(`[digikey] lookup failed for ${mpn}:`, (err as Error).message)
    return null
  }
}
