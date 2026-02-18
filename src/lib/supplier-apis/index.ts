/**
 * @file index.ts
 *
 * @description Live supplier API integration. Aggregates DigiKey, Mouser, and Protolabs
 * to replace or augment AI-generated pricing with real-time data.
 *
 * Env vars (optional): DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET, MOUSER_PART_API_KEY, PROTOLABS_API_KEY
 */

import type { SupplierPartResult } from "./types"
import { searchDigiKey } from "./digikey"
import { searchMouser } from "./mouser"

/**
 * Fetches live pricing/availability from all configured supplier APIs for a given keyword
 * (part number or component name). Returns combined results from DigiKey and Mouser.
 * Protolabs is used for custom manufacturing quotes (separate flow).
 *
 * @param keyword - Part number or search term (e.g. "STM32F103" or "10uF capacitor")
 * @param options - maxResults per supplier (default 3)
 * @returns Combined list of supplier part results; empty when no APIs configured
 */
export async function fetchLiveSupplierPricing(
  keyword: string,
  options?: { maxResultsPerSupplier?: number },
): Promise<SupplierPartResult[]> {
  const max = options?.maxResultsPerSupplier ?? 3
  const trimmed = keyword.trim()
  if (!trimmed) return []

  const [digiKeyResults, mouserResults] = await Promise.all([
    searchDigiKey(trimmed, max),
    searchMouser(trimmed, max),
  ])

  return [...digiKeyResults, ...mouserResults]
}

export type { SupplierPartResult, SupplierPricingResponse, SupplierId } from "./types"
export { searchDigiKey } from "./digikey"
export { searchMouser } from "./mouser"
export { getProtolabsQuote } from "./protolabs"
