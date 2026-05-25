/**
 * @file lib/distributors/farnell.ts — Farnell / Element14 Product Search API (H1c).
 *
 * Free tier, UK-native. Register at https://partner.element14.com/
 * Store key as FARNELL_API_KEY in ~/.claude/secrets/distributor-apis.env.
 *
 * IMPORTANT: Farnell returns XML regardless of Accept: application/json.
 * We regex-extract the fields we need. Fragile but zero-dep.
 *
 * Gotchas learned the hard way (2026-05-07):
 *   - Param names use DOTTED paths: callInfo.apiKey (not callInfoApiKey),
 *     storeInfo.id (not storeInfoId), resultsSettings.responseGroup, etc.
 *   - 403 "Developer Inactive" = wrong auth header style (Farnell only
 *     accepts the key as a callInfo.apiKey query param, not a header).
 *   - 400 "Bad Request" = missing required versionNumber=1.4 param.
 */

import type { DistributorResult } from './mouser'
import { parseLeadTimeWeeks } from './mouser'
import { recordDistributorHit } from './library-writeback'
import { getCached, setCached } from './cascade-cache'

const FARNELL_URL = 'https://api.element14.com/catalog/products'
const STORE = 'uk.farnell.com'

export async function lookupSkuFarnell(mpn: string, manufacturerHint?: string | null): Promise<DistributorResult | null> {
  const key = process.env.FARNELL_API_KEY
  if (!key) {
    console.warn('[farnell] FARNELL_API_KEY not set — skipping')
    return null
  }
  if (!mpn || mpn.length < 2) return null

  // Cache short-circuit (wired 2026-05-25 — module existed but no caller used it)
  const cached = getCached(manufacturerHint ?? '', mpn, 'farnell')
  if (cached !== undefined) return cached

  const params = new URLSearchParams({
    'term': `manuPartNum:${mpn}`,
    'storeInfo.id': STORE,
    'resultsSettings.numberOfResults': '5',
    'resultsSettings.responseGroup': 'large',
    'callInfo.responseGroup': 'large',
    'callInfo.apiKey': key,
    'versionNumber': '1.4',
  })

  try {
    const res = await fetch(`${FARNELL_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/xml' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.warn(`[farnell] HTTP ${res.status} for ${mpn}`)
      return null
    }

    const xml = await res.text()
    if (!xml.includes('<ns1:products>')) {
      // No matches — confirmed catalogue miss; cache so we don't re-query.
      setCached(manufacturerHint ?? '', mpn, 'farnell', null)
      return null
    }

    // Extract the first product block (prefer exact-match MPN, else take first)
    const productBlocks = [...xml.matchAll(/<ns1:products>([\s\S]*?)<\/ns1:products>/g)].map(m => m[1])
    if (productBlocks.length === 0) {
      setCached(manufacturerHint ?? '', mpn, 'farnell', null)
      return null
    }

    const upperMpn = mpn.toUpperCase()
    const block = productBlocks.find(b => {
      const m = b.match(/<ns1:translatedManufacturerPartNumber>([^<]+)<\/ns1:translatedManufacturerPartNumber>/)
      return m && m[1].toUpperCase() === upperMpn
    }) || productBlocks[0]

    const extract = (tag: string): string | null => {
      const m = block.match(new RegExp(`<ns1:${tag}>([^<]*)<\\/ns1:${tag}>`))
      return m ? m[1] : null
    }

    const returnedMpn = extract('translatedManufacturerPartNumber') || mpn
    const displayName = extract('displayName') || ''
    const productURL = extract('productURL') || `https://uk.farnell.com/search?st=${encodeURIComponent(mpn)}`
    const manufacturer = extract('vendorName') || extract('brandName') || ''
    const invStr = extract('inv')
    const stockUK = invStr !== null ? parseInt(invStr, 10) : null

    // Price breaks — Farnell emits repeated <ns1:prices><from/><to/><cost/></ns1:prices>
    const priceGBP: Array<{ qty: number; unitPriceGbp: number }> = []
    const priceBlocks = [...block.matchAll(/<ns1:prices>([\s\S]*?)<\/ns1:prices>/g)].map(m => m[1])
    for (const pb of priceBlocks) {
      const fromM = pb.match(/<ns1:from>([^<]+)<\/ns1:from>/)
      const costM = pb.match(/<ns1:cost>([^<]+)<\/ns1:cost>/)
      if (fromM && costM) {
        const qty = parseInt(fromM[1], 10)
        const price = parseFloat(costM[1])
        if (Number.isFinite(qty) && Number.isFinite(price)) {
          priceGBP.push({ qty, unitPriceGbp: price })
        }
      }
    }
    priceGBP.sort((a, b) => a.qty - b.qty)

    // Datasheet — first datasheets block
    const dsMatch = block.match(/<ns1:datasheets>[\s\S]*?<ns1:url>([^<]+)<\/ns1:url>[\s\S]*?<\/ns1:datasheets>/)
    const datasheetUrl = dsMatch ? dsMatch[1] : null

    // Lead time — Farnell exposes <ns1:leadTime> as a numeric string (days),
    // and sometimes <ns1:replenishmentLeadTime> on backorder items.
    // Strictly-numeric → days. Unit-suffixed ("2 Weeks") → parseLeadTimeWeeks.
    // Without the strict numeric guard, parseFloat("2 Weeks") returned 2 and
    // got divided by 7 → 0 weeks (silent truncation).
    const leadStr = extract('leadTime') ?? extract('replenishmentLeadTime')
    let leadWeeks: number | null = null
    if (leadStr !== null) {
      const trimmed = leadStr.trim()
      if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
        const days = parseFloat(trimmed)
        if (Number.isFinite(days) && days >= 0) {
          leadWeeks = Math.max(0, Math.round(days / 7))
        }
      } else {
        leadWeeks = parseLeadTimeWeeks(trimmed)
      }
    }

    const result: DistributorResult = {
      source: 'farnell',
      mpn: returnedMpn,
      manufacturer,
      description: displayName,
      priceGBP,
      stockUK,
      datasheetUrl,
      productUrl: productURL,
      leadWeeks,
      fetchedAt: new Date().toISOString(),
    }
    recordDistributorHit(result)
    setCached(manufacturerHint ?? result.manufacturer ?? '', mpn, 'farnell', result)
    return result
  } catch (err) {
    console.warn(`[farnell] lookup failed for ${mpn}:`, (err as Error).message)
    return null
  }
}
