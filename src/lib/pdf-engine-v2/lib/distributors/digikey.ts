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
 *
 * 429 circuit-breaker: a single 429 response sets _quotaExhaustedUntil to
 * the reset timestamp from the Retry-After header (or midnight UTC as
 * fallback). All calls short-circuit with null until the clock passes that
 * timestamp — no further API calls, no token exchanges. This prevents
 * burning the remaining calls or hammering the endpoint after daily quota
 * is hit. The in-process circuit-breaker also means the cascade-cache miss
 * entries written here avoid being churned away by repeated null returns.
 *
 * Cascade-cache wiring: getCached / setCached from cascade-cache.ts are
 * called around every live API call. A confirmed hit is cached for 30 days;
 * a confirmed miss is cached for 7 days. This prevents the 1000/day quota
 * from burning on repeated lookups of the same MPN across chain runs.
 */

import type { DistributorResult } from './mouser'
import { parseLeadTimeWeeks } from './mouser'
import { recordDistributorHit } from './library-writeback'
import { getCached, setCached } from './cascade-cache'

const DK_TOKEN_URL = 'https://api.digikey.com/v1/oauth2/token'
const DK_SEARCH_URL = 'https://api.digikey.com/products/v4/search/keyword'

let _accessToken: string | null = null
let _tokenExpiresAt = 0

// ── 429 circuit-breaker ────────────────────────────────────────────────────────
// When the daily quota is hit, Digi-Key returns 429 with a Retry-After header
// (seconds until midnight UTC). We record the reset wall-clock and short-circuit
// all calls until then, logging once.
let _quotaExhaustedUntil = 0
let _quotaWarnedThisProcess = false

function markQuotaExhausted(retryAfterSeconds: number | null): void {
  // Use Retry-After from header when available; fall back to midnight UTC.
  let resetMs: number
  if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
    resetMs = Date.now() + retryAfterSeconds * 1000
  } else {
    // Fall back: next midnight UTC.
    const now = new Date()
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    resetMs = midnight.getTime()
  }
  _quotaExhaustedUntil = resetMs
  if (!_quotaWarnedThisProcess) {
    const resetStr = new Date(resetMs).toISOString()
    console.warn(`[digikey] daily quota exhausted (429). Calls disabled until ${resetStr}. Quota resets at midnight UTC.`)
    _quotaWarnedThisProcess = true
  }
}

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

export async function lookupSkuDigikey(mpn: string, manufacturerHint?: string | null): Promise<DistributorResult | null> {
  if (!mpn || mpn.length < 2) return null

  // 429 circuit-breaker: short-circuit if quota is exhausted for today.
  if (_quotaExhaustedUntil > 0 && Date.now() < _quotaExhaustedUntil) return null

  // Cascade-cache read: return cached result (hit or confirmed miss) without
  // touching the API. The cache key uses manufacturerHint for precision but
  // '' as the empty-manufacturer fallback matches lookups from code that
  // doesn't know the manufacturer at call time.
  const mfgKey = (manufacturerHint ?? '').trim()
  const cached = getCached(mfgKey, mpn, 'digikey')
  if (cached !== undefined) return cached  // null = confirmed miss, object = hit

  const token = await getAccessToken()
  if (!token) return null
  const id = process.env.DIGIKEY_CLIENT_ID
  if (!id) return null

  try {
    const res = await fetch(DK_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-DIGIKEY-Client-Id': id,
        'X-DIGIKEY-Locale-Site': 'UK',
        'X-DIGIKEY-Locale-Language': 'en',
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
    if (res.status === 429) {
      // Parse Retry-After header (seconds). Digi-Key sends e.g. "29547".
      const retryAfterRaw = res.headers.get('retry-after') ?? res.headers.get('Retry-After')
      const retryAfterSec = retryAfterRaw !== null ? parseInt(retryAfterRaw, 10) : null
      markQuotaExhausted(retryAfterSec !== null && Number.isFinite(retryAfterSec) ? retryAfterSec : null)
      return null
    }
    if (!res.ok) {
      console.warn(`[digikey] HTTP ${res.status} for ${mpn}`)
      return null
    }

    const data = await res.json() as any
    const products = data?.Products
    if (!Array.isArray(products) || products.length === 0) {
      // Confirmed miss — cache it so repeated lookups of this MPN don't burn quota.
      setCached(mfgKey, mpn, 'digikey', null)
      return null
    }

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
    // Cache the hit (30-day TTL) and write back to the parts library.
    setCached(mfgKey, mpn, 'digikey', result)
    recordDistributorHit(result)
    return result
  } catch (err) {
    console.warn(`[digikey] lookup failed for ${mpn}:`, (err as Error).message)
    return null
  }
}
