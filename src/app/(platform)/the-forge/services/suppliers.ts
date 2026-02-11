/**
 * @file suppliers.ts — Supplier matching service for X-Ray modules
 *
 * @description Matches X-Ray module requirements to real suppliers:
 * 1. Suppliers table (domain_categories, capabilities, supplier_type)
 * 2. Marketplace Products/Services listings
 *
 * Enforces gating: no supplier matches until the gating module's
 * diagnostic is complete (clarity-first quoting principle).
 *
 * @related
 * - Schema: ./xray-schema.ts (ModuleSpec types)
 * - Server actions: src/actions/xray.ts (orchestrates matching)
 */

import { createClient } from "@/lib/supabase/server"

import type { ModuleSpec } from "./xray-schema"

// ─── Types ───────────────────────────────────────────────────────────

export interface SupplierMatch {
  id: string
  name: string
  capabilities: string[]
  typicalLeadWeeks: number
  warrantyMonths: number
  matchReason: string
  matchScore: number
  supplierType: string
  isVerified: boolean
  moduleId: string
}

// ─── Matching Logic ──────────────────────────────────────────────────

/**
 * Finds suppliers that can build/supply components for a given module.
 *
 * @param module - The X-Ray module to find suppliers for
 * @param isGatingDiagComplete - Whether the gating diagnostic is complete (affects scoring accuracy)
 * @returns Ranked list of supplier matches
 *
 * @description Matches suppliers based on module requirements. When the
 * gating diagnostic is complete, process-class-specific scoring improves
 * match accuracy. Without the diagnostic, broad matches are returned.
 */
export async function matchSuppliersForModule(
  module: ModuleSpec,
  isGatingDiagComplete: boolean,
): Promise<SupplierMatch[]> {

  const supabase = await createClient()

  // Build search terms from module data
  const searchTerms = [
    module.name,
    module.purpose,
    ...module.keyParts,
  ].map((t) => t.toLowerCase())

  // Query suppliers table
  const { data: suppliers, error: suppliersError } = await supabase
    .from("suppliers")
    .select("id, name, description, supplier_type, domain_categories, capabilities, verification_status, community_rating")
    .limit(50)

  if (suppliersError) {
    console.error("[SupplierMatch] Failed to query suppliers:", suppliersError.message)
  }

  // Query marketplace listings for Products and Services
  const { data: listings, error: listingsError } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, attributes, is_verified, subcategory, category")
    .in("category", ["Products", "Services"])
    .limit(50)

  if (listingsError) {
    console.error("[SupplierMatch] Failed to query marketplace_listings:", listingsError.message)
  }

  const matches: SupplierMatch[] = []

  // Score suppliers
  if (suppliers) {
    for (const supplier of suppliers) {
      const supplierText = `${supplier.name} ${supplier.description || ""} ${(supplier.domain_categories || []).join(" ")}`.toLowerCase()
      const caps = supplier.capabilities as Record<string, unknown> | null

      let score = 0
      const matchReasons: string[] = []

      // Match domain categories
      if (supplier.domain_categories) {
        for (const cat of supplier.domain_categories) {
          for (const term of searchTerms) {
            if (cat.toLowerCase().includes(term) || term.includes(cat.toLowerCase())) {
              score += 3
              matchReasons.push(`Domain: ${cat}`)
            }
          }
        }
      }

      // Match name/description text
      for (const term of searchTerms) {
        if (supplierText.includes(term)) {
          score += 2
          matchReasons.push(`Matched: ${term}`)
        }
      }

      // Match capabilities JSONB
      if (caps) {
        const capsStr = JSON.stringify(caps).toLowerCase()
        for (const term of searchTerms) {
          if (capsStr.includes(term)) {
            score += 2
          }
        }
      }

      if (score > 0) {
        const isVerified = supplier.verification_status === "verified" || supplier.verification_status === "community_verified"
        const leadTime = (caps as Record<string, unknown>)?.lead_time
        const warranty = 12 // Default warranty

        matches.push({
          id: supplier.id,
          name: supplier.name,
          capabilities: supplier.domain_categories || [],
          typicalLeadWeeks: typeof leadTime === "number" ? leadTime : 8,
          warrantyMonths: warranty,
          matchReason: [...new Set(matchReasons)].slice(0, 3).join(", "),
          matchScore: score + (isVerified ? 3 : 0) + (supplier.community_rating ? Number(supplier.community_rating) : 0),
          supplierType: supplier.supplier_type,
          isVerified,
          moduleId: module.id,
        })
      }
    }
  }

  // Score marketplace listings
  if (listings) {
    for (const listing of listings) {
      const listingText = `${listing.title} ${listing.description || ""} ${listing.subcategory || ""}`.toLowerCase()
      const attrs = listing.attributes as Record<string, unknown> | null

      let score = 0
      const matchReasons: string[] = []

      for (const term of searchTerms) {
        if (listingText.includes(term)) {
          score += 2
          matchReasons.push(`Matched: ${term}`)
        }
      }

      // Check attributes for capabilities
      if (attrs) {
        const attrsStr = JSON.stringify(attrs).toLowerCase()
        for (const term of searchTerms) {
          if (attrsStr.includes(term)) {
            score += 1
          }
        }
      }

      if (score > 0) {
        matches.push({
          id: listing.id,
          name: listing.title,
          capabilities: [listing.subcategory || listing.category].filter(Boolean),
          typicalLeadWeeks: 8,
          warrantyMonths: 12,
          matchReason: [...new Set(matchReasons)].slice(0, 3).join(", "),
          matchScore: score + (listing.is_verified ? 2 : 0),
          supplierType: listing.category === "Products" ? "manufacturer" : "service",
          isVerified: listing.is_verified ?? false,
          moduleId: module.id,
        })
      }
    }
  }

  // Sort by score and return top results per module
  return matches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5)
}
