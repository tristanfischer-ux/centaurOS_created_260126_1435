/**
 * @file lib/distributors/nexar.ts — Nexar (Octopart) Supply API adapter (H1e).
 *
 * Nexar Supply API is the GraphQL aggregator that fronts Mouser + Digi-Key
 * + Farnell + RS + Avnet + ~60 other distributors. The free Evaluation plan
 * gives 100 matched parts/month — so we use Nexar as the FALLBACK after the
 * native Mouser/Farnell/Digi-Key adapters miss (those have higher free
 * quotas: Mouser 1000/day, Farnell free, Digi-Key 1000/day after OAuth).
 *
 * OAuth client_credentials flow at https://identity.nexar.com/connect/token
 * — the access token has ~24-hour expiry. We support both:
 *   (a) NEXAR_ACCESS_TOKEN pre-minted env var (fastest, no refresh)
 *   (b) NEXAR_CLIENT_ID + NEXAR_CLIENT_SECRET (auto-refresh when (a) expires)
 *
 * Secrets in ~/.claude/secrets/distributor-apis.env. Source at
 * https://portal.nexar.com → Apps → ForgeOS.
 *
 * GraphQL endpoint: https://api.nexar.com/graphql
 * Schema docs: https://support.nexar.com/support/solutions/articles/101000515215
 */

import type { DistributorResult } from './mouser'

const NEXAR_GRAPHQL_ENDPOINT = 'https://api.nexar.com/graphql'
const NEXAR_TOKEN_ENDPOINT = 'https://identity.nexar.com/connect/token'

/** Cached access token shared across module-level calls. Refresh on demand. */
let cachedToken: { token: string; expiresAt: number } | null = null

function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

async function refreshNexarToken(): Promise<string | null> {
  const clientId = process.env.NEXAR_CLIENT_ID
  const clientSecret = process.env.NEXAR_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.warn('[nexar] NEXAR_CLIENT_ID / NEXAR_CLIENT_SECRET not set — cannot refresh')
    return null
  }
  try {
    const res = await fetch(NEXAR_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'supply.domain',
      }),
    })
    if (!res.ok) {
      console.warn(`[nexar] token refresh HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    const expiresAt = Date.now() + ((data.expires_in ?? 86400) - 60) * 1000  // 1-min safety margin
    cachedToken = { token: data.access_token, expiresAt }
    return data.access_token
  } catch (err) {
    console.warn(`[nexar] token refresh error: ${(err as Error).message}`)
    return null
  }
}

async function getNexarToken(): Promise<string | null> {
  // Use cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token
  // Try pre-minted token from env (validate expiry from JWT)
  const preminted = process.env.NEXAR_ACCESS_TOKEN
  if (preminted) {
    const expMs = decodeJwtExp(preminted)
    if (expMs && expMs > Date.now() + 60_000) {
      cachedToken = { token: preminted, expiresAt: expMs - 60_000 }
      return preminted
    }
  }
  // Refresh via client_credentials
  return refreshNexarToken()
}

const SUP_SEARCH_MPN_QUERY = `
  query SupplySearch($q: String!, $country: String!, $currency: String!) {
    supSearchMpn(q: $q, country: $country, currency: $currency, limit: 1) {
      results {
        part {
          mpn
          manufacturer { name }
          shortDescription
          bestDatasheet { url }
          medianPrice1000 { price currency }
          sellers(authorizedOnly: true) {
            company { name }
            offers {
              clickUrl
              inventoryLevel
              moq
              factoryLeadDays
              prices { quantity price currency }
            }
          }
        }
      }
    }
  }
`

function bestGbpPrice(part: any): { qty1Gbp: number | null; productUrl: string; stockUK: number } {
  const sellers: any[] = part?.sellers ?? []
  let cheapest = Infinity
  let productUrl = ''
  let stockUK = 0
  for (const seller of sellers) {
    for (const offer of seller?.offers ?? []) {
      if (typeof offer?.inventoryLevel === 'number') stockUK += offer.inventoryLevel
      for (const p of offer?.prices ?? []) {
        if (p?.currency === 'GBP' && typeof p.price === 'number' && p.price < cheapest) {
          cheapest = p.price
          productUrl = offer.clickUrl ?? ''
        }
      }
    }
  }
  return {
    qty1Gbp: cheapest < Infinity ? cheapest : null,
    productUrl,
    stockUK,
  }
}

export async function lookupSkuNexar(mpn: string): Promise<DistributorResult | null> {
  const token = await getNexarToken()
  if (!token) return null
  try {
    const res = await fetch(NEXAR_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: SUP_SEARCH_MPN_QUERY,
        variables: { q: mpn, country: 'GB', currency: 'GBP' },
      }),
    })
    if (!res.ok) {
      console.warn(`[nexar] HTTP ${res.status} for mpn=${mpn}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const json = (await res.json()) as any
    if (json.errors) {
      console.warn(`[nexar] GraphQL errors for mpn=${mpn}:`, JSON.stringify(json.errors).slice(0, 200))
      return null
    }
    const part = json?.data?.supSearchMpn?.results?.[0]?.part
    if (!part) return null

    const { qty1Gbp, productUrl, stockUK } = bestGbpPrice(part)
    return {
      source: 'nexar',
      mpn: part.mpn ?? mpn,
      manufacturer: part.manufacturer?.name ?? '',
      description: part.shortDescription ?? '',
      priceGBP: qty1Gbp != null ? [{ qty: 1, unitPriceGbp: qty1Gbp }] : [],
      stockUK,
      datasheetUrl: part.bestDatasheet?.url ?? null,
      productUrl,
      leadWeeks: null,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn(`[nexar] fetch error for mpn=${mpn}: ${(err as Error).message}`)
    return null
  }
}
