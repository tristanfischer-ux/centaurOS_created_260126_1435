/**
 * @file cad-lab-supplier-match.ts — Supplier matching for CadLab modules.
 *
 * @description Server action that matches CadLab modules to suppliers and
 * marketplace listings using keyword + attribute scoring. Adapts the pattern
 * from the X-Ray supplier matching service for CadLab's module schema.
 *
 * @related
 * - X-Ray supplier matching: src/app/(platform)/the-forge/services/suppliers.ts
 * - CadLab supply chain UI: src/components/cad/cad-lab-supply-chain.tsx
 */

"use server"

import { createClient } from "@/lib/supabase/server"

// ─── Types ──────────────────────────────────────────────────────────

export interface CadLabModuleInput {
  id: string
  name: string
  purpose: string
  keyParts: string[]
  description?: string
  process?: string | null
  material?: string | null
}

export interface CadLabSupplierMatch {
  id: string
  name: string
  matchScore: number
  matchReasons: string[]
  isVerified: boolean
  supplierType: string
}

// ─── Action ─────────────────────────────────────────────────────────

/**
 * Matches a single CadLab module to suppliers and marketplace listings.
 *
 * @param input - Module data including diagnostics-derived process/material
 * @returns Top 5 supplier matches ranked by score
 */
export async function matchCadLabModuleSuppliers(
  input: CadLabModuleInput,
): Promise<CadLabSupplierMatch[]> {
  const supabase = await createClient()

  // Build search terms from module data + diagnostics
  const searchTerms = [
    input.name,
    input.purpose,
    ...input.keyParts,
    input.process,
    input.material,
    input.description,
  ]
    .filter(Boolean)
    .map((t) => (t as string).toLowerCase())

  // Query suppliers table
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, description, supplier_type, domain_categories, capabilities, verification_status, community_rating")
    .limit(50)

  // Query marketplace listings for Products and Services
  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, attributes, is_verified, subcategory, category")
    .in("category", ["Products", "Services"])
    .limit(50)

  const matches: CadLabSupplierMatch[] = []

  // Score suppliers
  if (suppliers) {
    for (const supplier of suppliers) {
      const supplierText = `${supplier.name} ${supplier.description || ""} ${(supplier.domain_categories || []).join(" ")}`.toLowerCase()
      const caps = supplier.capabilities as Record<string, unknown> | null

      let score = 0
      const reasons: string[] = []

      // Match domain categories
      if (supplier.domain_categories) {
        for (const cat of supplier.domain_categories) {
          for (const term of searchTerms) {
            if (cat.toLowerCase().includes(term) || term.includes(cat.toLowerCase())) {
              score += 3
              if (!reasons.includes(cat)) reasons.push(cat)
            }
          }
        }
      }

      // Match name/description text
      for (const term of searchTerms) {
        if (supplierText.includes(term)) {
          score += 2
          if (reasons.length < 3) reasons.push(term)
        }
      }

      // Match capabilities JSONB
      if (caps) {
        const capsStr = JSON.stringify(caps).toLowerCase()
        for (const term of searchTerms) {
          if (capsStr.includes(term)) score += 2
        }
      }

      if (score > 0) {
        const isVerified = supplier.verification_status === "verified" || supplier.verification_status === "community_verified"
        matches.push({
          id: supplier.id,
          name: supplier.name,
          matchScore: score + (isVerified ? 3 : 0) + (supplier.community_rating ? Number(supplier.community_rating) : 0),
          matchReasons: [...new Set(reasons)].slice(0, 3),
          isVerified,
          supplierType: supplier.supplier_type,
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
      const reasons: string[] = []

      for (const term of searchTerms) {
        if (listingText.includes(term)) {
          score += 2
          if (reasons.length < 3) reasons.push(term)
        }
      }

      if (attrs) {
        const attrsStr = JSON.stringify(attrs).toLowerCase()
        for (const term of searchTerms) {
          if (attrsStr.includes(term)) score += 1
        }
      }

      if (score > 0) {
        matches.push({
          id: listing.id,
          name: listing.title,
          matchScore: score + (listing.is_verified ? 2 : 0),
          matchReasons: [...new Set(reasons)].slice(0, 3),
          isVerified: listing.is_verified ?? false,
          supplierType: listing.category === "Products" ? "manufacturer" : "service",
        })
      }
    }
  }

  // Deduplicate by name (case-insensitive), keeping the higher-scoring entry
  const deduped = new Map<string, CadLabSupplierMatch>()
  for (const m of matches) {
    const key = m.name.toLowerCase()
    const existing = deduped.get(key)
    if (!existing || m.matchScore > existing.matchScore) {
      deduped.set(key, m)
    }
  }

  return [...deduped.values()].sort((a, b) => b.matchScore - a.matchScore).slice(0, 5)
}
