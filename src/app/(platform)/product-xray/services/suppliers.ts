/**
 * @file suppliers.ts — Supplier matching service for X-Ray modules
 *
 * @description Matches X-Ray module requirements (key parts, materials, purpose)
 * to Marketplace listings in the Products and Services categories.
 *
 * CURRENT STATE: Returns the demo's hardcoded COMPANIES array.
 *
 * TODO: Replace with real queries:
 * 1. Query `marketplace_listings` where category IN ('Products', 'Services'):
 *    - Text search on module.keyParts + module.name + module.purpose
 *    - Use search_vector for full-text search
 *    - Parse attributes JSON for capabilities, lead_time, warranty
 *    - Filter by is_verified = true for trusted suppliers
 * 2. If Reaction diagnostic is incomplete, return blocked state (no matches)
 *    - This enforces the "clarity-first quoting" principle
 * 3. Score by capability overlap with module.keyParts
 * 4. Include subcategory for grouping (e.g., "Fabrication", "Electronics", "Filtration")
 *
 * @related
 * - Demo mock: ../demo/ForgeOS_CompanyScan_Demo.tsx (COMPANIES, suggestSuppliersForModule)
 * - Marketplace: src/actions/marketplace.ts
 * - RFQ system: src/components/rfq/RFQTechniqueSelector.tsx (technique-to-supplier linking)
 * - Manufacturing techniques: src/lib/manufacturing-techniques/ (technique metadata)
 */

import { COMPANIES } from "../demo/ForgeOS_CompanyScan_Demo"

import type { CompanyListing, ModuleSpec } from "../demo/ForgeOS_CompanyScan_Demo"

export interface SupplierMatch {
  supplier: CompanyListing
  moduleId: string
  matchReason: string
  matchScore: number
}

/**
 * Finds suppliers for a given module based on its key parts and purpose.
 *
 * @param module - The X-Ray module to find suppliers for
 * @param reactionDiagComplete - Whether the Reaction diagnostic is complete (gates matching)
 * @returns Ranked list of supplier matches, or empty if reaction diagnostic incomplete
 *
 * TODO: Accept foundryId for foundry-scoped marketplace queries
 * TODO: Cross-reference with manufacturing techniques for richer matching
 */
export async function matchSuppliersForModule(
  module: ModuleSpec,
  reactionDiagComplete: boolean
): Promise<SupplierMatch[]> {
  // Enforce gating: no supplier matches until Reaction is characterized
  if (!reactionDiagComplete) {
    return []
  }

  // TODO: Replace with real Supabase queries
  // const searchTerms = [module.name, ...module.keyParts].join(' ')
  // const { data } = await supabase
  //   .from('marketplace_listings')
  //   .select('*')
  //   .in('category', ['Products', 'Services'])
  //   .textSearch('search_vector', searchTerms)
  //   .eq('is_verified', true)
  //   .limit(5)

  const hay = (module.name + " " + module.purpose + " " + module.keyParts.join(" ")).toLowerCase()
  return COMPANIES
    .map((c) => ({
      supplier: c,
      moduleId: module.id,
      matchReason: `Matched on: ${c.capabilities.filter((cap) => hay.includes(cap.toLowerCase())).join(", ")}`,
      matchScore: c.capabilities.reduce((s, cap) => s + (hay.includes(cap.toLowerCase()) ? 2 : 0), 0),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3)
}
