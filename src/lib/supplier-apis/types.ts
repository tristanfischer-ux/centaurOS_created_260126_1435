/**
 * @file types.ts
 *
 * @description Shared types for live supplier API integrations (DigiKey, Mouser, Protolabs).
 * Used to replace or augment AI-generated pricing with real-time data.
 */

export type SupplierId = "digikey" | "mouser" | "protolabs"

export interface SupplierPartResult {
  supplierId: SupplierId
  partNumber: string
  manufacturerPartNumber: string | null
  description: string
  unitPrice: number | null
  currency: string
  quantityAvailable: number | null
  leadTimeDays: number | null
  productUrl: string
  /** Optional: price breaks by quantity */
  priceBreaks?: Array<{ quantity: number; unitPrice: number }>
}

export interface SupplierPricingResponse {
  success: boolean
  results: SupplierPartResult[]
  error?: string
}
