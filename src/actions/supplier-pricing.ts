"use server"

/**
 * @file supplier-pricing.ts
 *
 * @description Server action for live supplier pricing (DigiKey, Mouser).
 * Used by procurement enrichment to show real-time pricing alongside DB data.
 *
 * @security Requires authenticated user; rate limited.
 */

import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { fetchLiveSupplierPricing } from "@/lib/supplier-apis"

/**
 * Returns live pricing from configured supplier APIs (DigiKey, Mouser) for a given keyword.
 * Use for component names or part numbers. Returns empty when no API keys are set.
 *
 * @param keyword - Part number or component name to search
 * @returns Array of supplier part results with pricing when available
 */
export async function getLiveSupplierPricing(keyword: string): Promise<
  Array<{
    supplierId: string
    partNumber: string
    manufacturerPartNumber: string | null
    description: string
    unitPrice: number | null
    currency: string
    quantityAvailable: number | null
    leadTimeDays: number | null
    productUrl: string
    priceBreaks?: Array<{ quantity: number; unitPrice: number }>
  }>
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const rateLimitError = await checkRateLimit("aiCadLab", `supplier:${user.id}`)
  if (rateLimitError) return []

  const results = await fetchLiveSupplierPricing(keyword, { maxResultsPerSupplier: 3 })
  return results.map((r) => ({
    supplierId: r.supplierId,
    partNumber: r.partNumber,
    manufacturerPartNumber: r.manufacturerPartNumber,
    description: r.description,
    unitPrice: r.unitPrice,
    currency: r.currency,
    quantityAvailable: r.quantityAvailable,
    leadTimeDays: r.leadTimeDays,
    productUrl: r.productUrl,
    priceBreaks: r.priceBreaks,
  }))
}
