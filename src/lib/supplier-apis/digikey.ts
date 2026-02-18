/**
 * @file digikey.ts
 *
 * @description DigiKey Product Information V4 API adapter for live part search and pricing.
 * Requires DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET. Uses OAuth2 client credentials.
 *
 * @see https://developer.digikey.com/products/product-information-v4/productsearch
 */

import type { SupplierPartResult } from "./types"

const TOKEN_URL = "https://api.digikey.com/v1/oauth2/token"
const BASE_URL = "https://api.digikey.com"

let cachedToken: { access_token: string; expires_at: number } | null = null

async function getAccessToken(): Promise<string> {
  const clientId = process.env.DIGIKEY_CLIENT_ID
  const clientSecret = process.env.DIGIKEY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET required")

  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.access_token
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`DigiKey token error: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.access_token
}

async function keywordSearch(
  token: string,
  keyword: string,
  limit: number = 5,
): Promise<Array<{ digiKeyPartNumber: string }>> {
  const clientId = process.env.DIGIKEY_CLIENT_ID
  const res = await fetch(`${BASE_URL}/products/v4/search/keyword`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-DIGIKEY-Client-Id": clientId!,
      "X-DIGIKEY-Locale-Site": "US",
      "X-DIGIKEY-Locale-Language": "en",
      "X-DIGIKEY-Locale-Currency": "USD",
    },
    body: JSON.stringify({
      Keywords: keyword,
      RecordCount: limit,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return []
  const data = (await res.json()) as { Products?: Array<{ DigiKeyPartNumber?: string }> }
  const products = data.Products ?? []
  return products
    .filter((p) => p.DigiKeyPartNumber)
    .map((p) => ({ digiKeyPartNumber: p.DigiKeyPartNumber! }))
}

async function productDetails(
  token: string,
  digiKeyPartNumber: string,
): Promise<SupplierPartResult | null> {
  const clientId = process.env.DIGIKEY_CLIENT_ID
  const res = await fetch(
    `${BASE_URL}/products/v4/search/${encodeURIComponent(digiKeyPartNumber)}/productdetails`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DIGIKEY-Client-Id": clientId!,
        "X-DIGIKEY-Locale-Site": "US",
        "X-DIGIKEY-Locale-Language": "en",
        "X-DIGIKEY-Locale-Currency": "USD",
      },
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    ProductDescription?: string
    ManufacturerPartNumber?: string
    UnitPrice?: number
    QuantityAvailable?: number
    ProductUrl?: string
    StandardPricing?: Array<{ BreakQuantity: number; UnitPrice: number }>
    LeadTime?: number
  }
  const unitPrice = data.UnitPrice ?? null
  const priceBreaks = data.StandardPricing?.map((p) => ({
    quantity: p.BreakQuantity,
    unitPrice: p.UnitPrice,
  }))
  return {
    supplierId: "digikey",
    partNumber: digiKeyPartNumber,
    manufacturerPartNumber: data.ManufacturerPartNumber ?? null,
    description: data.ProductDescription ?? "",
    unitPrice,
    currency: "USD",
    quantityAvailable: data.QuantityAvailable ?? null,
    leadTimeDays: data.LeadTime ?? null,
    productUrl: data.ProductUrl ?? `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(digiKeyPartNumber)}`,
    priceBreaks: priceBreaks?.length ? priceBreaks : undefined,
  }
}

/**
 * Search DigiKey by keyword and return up to maxResults part results with pricing.
 */
export async function searchDigiKey(
  keyword: string,
  maxResults: number = 3,
): Promise<SupplierPartResult[]> {
  if (!process.env.DIGIKEY_CLIENT_ID || !process.env.DIGIKEY_CLIENT_SECRET) {
    return []
  }
  try {
    const token = await getAccessToken()
    const hits = await keywordSearch(token, keyword, maxResults)
    const results: SupplierPartResult[] = []
    for (const hit of hits) {
      const detail = await productDetails(token, hit.digiKeyPartNumber)
      if (detail) results.push(detail)
    }
    return results
  } catch (err) {
    console.warn("[SupplierAPIs] DigiKey search failed:", err instanceof Error ? err.message : err)
    return []
  }
}
