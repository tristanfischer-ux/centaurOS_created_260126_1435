/**
 * @file suppliers.ts — Supplier matching service for X-Ray modules
 *
 * @description Matches X-Ray module requirements to marketplace listings
 * (Products/Services categories) using keyword + semantic scoring.
 *
 * Enforces gating: no supplier matches until the gating module's
 * diagnostic is complete (clarity-first quoting principle).
 *
 * @related
 * - Schema: ./xray-schema.ts (ModuleSpec types)
 * - Server actions: src/actions/xray.ts (orchestrates matching)
 */

import { createClient } from "@/lib/supabase/server"
import { createHash } from "crypto"
import { embedText } from "@/lib/search/semantic-search"

import type { ModuleSpec } from "./xray-schema"
import { filterSupplierUrls } from "@/actions/cad-lab-supplier-match"

// ─── Cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_SIZE = 100

interface CacheEntry<T> {
  data: T
  ts: number
}

const supplierCache = new Map<string, CacheEntry<SupplierMatch[]>>()

/** Evict expired entries, then oldest if still over limit */
function evictSupplierCache(): void {
  const now = Date.now()
  // First pass: remove expired
  for (const [key, entry] of supplierCache) {
    if (now - entry.ts >= CACHE_TTL_MS) supplierCache.delete(key)
  }
  // Second pass: if still over limit, delete oldest
  if (supplierCache.size > MAX_CACHE_SIZE) {
    const sorted = [...supplierCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    const toDelete = sorted.slice(0, supplierCache.size - MAX_CACHE_SIZE)
    for (const [key] of toDelete) supplierCache.delete(key)
  }
}

function supplierCacheKey(module: ModuleSpec): string {
  const raw = `${module.id}|${module.name}|${module.purpose}|${module.keyParts.join(",")}`
  return createHash("sha256").update(raw).digest("hex").slice(0, 16)
}

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

  // Check cache first
  const cacheKey = supplierCacheKey(module)
  const cached = supplierCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data
  }

  const supabase = await createClient()

  // Build search terms from module data
  const searchTerms = [
    module.name,
    module.purpose,
    ...module.keyParts,
  ].map((t) => t.toLowerCase())

  // Query marketplace listings for Products and Services
  const { data: listings, error: listingsError } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, attributes, is_verified, subcategory, category")
    .in("category", ["Products", "Services"])
    .limit(50)

  if (listingsError) {
    console.error("[SupplierMatch] Failed to query marketplace_listings:", listingsError.message)
  }

  // Semantic matching: embed module description, call RPC for cosine similarity
  const semanticScores = new Map<string, number>()
  try {
    const embeddingText = `${module.name} ${module.purpose} ${module.keyParts.join(" ")}`
    const embedding = await embedText(embeddingText)
    if (embedding) {
      // GOTCHA: Supabase types map vector(1536) → string, but the client correctly sends number[] at runtime
      const { data: semanticMatches, error: rpcError } = await supabase.rpc("match_marketplace_listings", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.4,
        match_count: 20,
      })
      if (rpcError) {
        console.error("[SupplierMatch] Semantic RPC error:", rpcError.message)
      }
      if (semanticMatches) {
        for (const sm of semanticMatches) {
          // Scale similarity (0-1) to 0-10 range for combining with keyword score
          semanticScores.set(sm.id, (sm.similarity as number) * 10)
        }
      }
    }
  } catch (err) {
    // Graceful fallback: if embedding fails, continue with keyword-only scoring
    console.warn("[SupplierMatch] Semantic matching failed, using keyword-only:", err instanceof Error ? err.message : "Unknown")
  }

  const matches: SupplierMatch[] = []

  // Filter listings whose website_url points at a non-supplier surface
  // (blog, academic page, social media, marketplace stall, government page).
  // Applied after the DB fetch so non-supplier URLs never enter the scoring loop.
  const filteredListings = listings
    ? listings.filter((l) => {
        const url = (l.attributes as Record<string, unknown> | null)?.website_url
        if (typeof url === "string") {
          return filterSupplierUrls([url]).length > 0
        }
        return true
      })
    : null

  // Score marketplace listings
  if (filteredListings) {
    for (const listing of filteredListings) {
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
  const results = matches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5)

  // Store in cache
  supplierCache.set(cacheKey, { data: results, ts: Date.now() })
  if (supplierCache.size > MAX_CACHE_SIZE) evictSupplierCache()

  return results
}
