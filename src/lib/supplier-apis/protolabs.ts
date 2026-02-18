/**
 * @file protolabs.ts
 *
 * @description Protolabs / Xometry quote API adapter for custom manufacturing quotes.
 * Use for CNC, injection molding, etc. Requires PROTOLABS_API_KEY or similar when available.
 * This is a stub: real integration would use Protolabs Design-to-Order or Xometry API.
 */

import type { SupplierPartResult } from "./types"

/**
 * Request a manufacturing quote (CNC, injection molding). Returns empty when API key not set.
 * Full implementation would submit part geometry and get real-time quote.
 */
export async function getProtolabsQuote(
  _description: string,
  _quantity: number,
): Promise<SupplierPartResult[]> {
  const apiKey = process.env.PROTOLABS_API_KEY ?? process.env.XOMETRY_API_KEY
  if (!apiKey) return []

  try {
    // Stub: real implementation would call Protolabs/Xometry quote API
    // and map response to SupplierPartResult (e.g. unit price from quote, lead time).
    return []
  } catch (err) {
    console.warn("[SupplierAPIs] Protolabs quote failed:", err instanceof Error ? err.message : err)
    return []
  }
}
