/**
 * @file mouser.ts
 *
 * @description Mouser Search API adapter for live part search and pricing.
 * Requires MOUSER_PART_API_KEY (request from Mouser API hub).
 *
 * @see https://www.mouser.com/api-search/ https://api.mouser.com/api/docs/
 */

import type { SupplierPartResult } from "./types"

const MOUSER_SEARCH_URL = "https://api.mouser.com/api/v1/search/partnumber"

/**
 * Search Mouser by part number or keyword. Returns up to maxResults with pricing when available.
 */
export async function searchMouser(
  keyword: string,
  maxResults: number = 5,
): Promise<SupplierPartResult[]> {
  const apiKey = process.env.MOUSER_PART_API_KEY ?? process.env.MOUSER_API_KEY
  if (!apiKey) return []

  try {
    const res = await fetch(MOUSER_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Mouser-PartAPI-Key": apiKey,
      },
      body: JSON.stringify({
        SearchByPartRequest: {
          mouserPartNumber: keyword,
          partSearchOptions: "Exact",
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []

    const data = (await res.json()) as {
      SearchResults?: {
        Parts?: Array<{
          MouserPartNumber?: string
          ManufacturerPartNumber?: string
          Description?: string
          PriceBreaks?: Array<{ Quantity: number; Price: number }>
          ProductDetailUrl?: string
          Availability?: string
          LeadTime?: string
        }>
      }
    }
    const parts = data.SearchResults?.Parts ?? []
    return parts.slice(0, maxResults).map((p) => {
      const priceBreaks = p.PriceBreaks ?? []
      const unitPrice = priceBreaks.length > 0 ? priceBreaks[0].Price : null
      return {
        supplierId: "mouser" as const,
        partNumber: p.MouserPartNumber ?? "",
        manufacturerPartNumber: p.ManufacturerPartNumber ?? null,
        description: p.Description ?? "",
        unitPrice,
        currency: "USD",
        quantityAvailable: null,
        leadTimeDays: p.LeadTime ? parseInt(p.LeadTime, 10) : null,
        productUrl: p.ProductDetailUrl ?? `https://www.mouser.com/Search/Refine?Keyword=${encodeURIComponent(keyword)}`,
        priceBreaks: priceBreaks.length ? priceBreaks.map((b) => ({ quantity: b.Quantity, unitPrice: b.Price })) : undefined,
      }
    })
  } catch (err) {
    console.warn("[SupplierAPIs] Mouser search failed:", err instanceof Error ? err.message : err)
    return []
  }
}
