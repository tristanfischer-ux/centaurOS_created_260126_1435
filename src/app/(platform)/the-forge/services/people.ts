/**
 * @file people.ts — People matching service for X-Ray modules
 *
 * @description Matches X-Ray module expert-question disciplines to real data:
 * 1. Marketplace People listings (marketplace_listings where category='People')
 * 2. Provider profiles with specializations
 *
 * @related
 * - Schema: ./xray-schema.ts (ModuleSpec, Discipline types)
 * - Server actions: src/actions/xray.ts (orchestrates matching)
 */

import { createClient } from "@/lib/supabase/server"
import { createHash } from "crypto"
import { embedText } from "@/lib/search/semantic-search"

import type { Discipline, ModuleSpec } from "./xray-schema"

// ─── Cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_SIZE = 100

interface CacheEntry<T> {
  data: T
  ts: number
}

const peopleCache = new Map<string, CacheEntry<PersonMatch[]>>()

/** Evict expired entries, then oldest if still over limit */
function evictPeopleCache(): void {
  const now = Date.now()
  for (const [key, entry] of peopleCache) {
    if (now - entry.ts >= CACHE_TTL_MS) peopleCache.delete(key)
  }
  if (peopleCache.size > MAX_CACHE_SIZE) {
    const sorted = [...peopleCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    const toDelete = sorted.slice(0, peopleCache.size - MAX_CACHE_SIZE)
    for (const [key] of toDelete) peopleCache.delete(key)
  }
}

function peopleCacheKey(modules: ModuleSpec[]): string {
  const raw = modules.map((m) => `${m.id}|${m.name}|${m.purpose}`).join(";")
  return createHash("sha256").update(raw).digest("hex").slice(0, 16)
}

// ─── Types ───────────────────────────────────────────────────────────

export interface PersonMatch {
  id: string
  name: string
  role: string
  tags: string[]
  rate: string
  matchedDiscipline: Discipline
  isInternal: boolean
  matchScore: number
  isVerified: boolean
  /** Full marketplace listing data for rendering standard marketplace cards */
  listing: {
    id: string
    category: "People" | "Products" | "Services" | "AI"
    subcategory: string
    title: string
    description: string
    attributes: Record<string, unknown>
    image_url: string | null
    is_verified: boolean
  } | null
}

// ─── Discipline to search keyword mapping ────────────────────────────

const DISCIPLINE_KEYWORDS: Record<Discipline, string[]> = {
  Process: ["process", "chemical", "engineering", "reaction", "thermodynamics", "mass balance"],
  Mechanical: ["mechanical", "fabrication", "piping", "skids", "pressure", "structural"],
  Controls: ["controls", "automation", "PLC", "HMI", "instrumentation", "SCADA"],
  Operations: ["operations", "maintenance", "uptime", "commissioning", "reliability"],
  Regulatory: ["regulatory", "compliance", "permits", "safety", "environmental", "ISO"],
  Commercial: ["commercial", "sales", "GTM", "go-to-market", "business development", "procurement"],
}

// ─── Matching Logic ──────────────────────────────────────────────────

/**
 * Finds people from marketplace listings who can answer expert questions.
 *
 * @param modules - The X-Ray modules containing expert questions
 * @returns Ranked list of people matches grouped by discipline
 *
 * @description Queries marketplace_listings (category='People') and
 * provider_profiles, scoring by keyword overlap with module disciplines.
 */
export async function matchPeopleForModules(modules: ModuleSpec[]): Promise<PersonMatch[]> {
  // Check cache first
  const cacheKey = peopleCacheKey(modules)
  const cached = peopleCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data
  }

  const supabase = await createClient()

  // Extract unique disciplines from all modules
  const disciplines = new Set<Discipline>()
  modules.forEach((m) =>
    m.detail.expertQuestions.forEach((q) => disciplines.add(q.discipline))
  )

  // Query marketplace listings for People category
  const { data: listings, error: listingsError } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, attributes, is_verified, subcategory, category, image_url")
    .eq("category", "People")
    .limit(50)

  if (listingsError) {
    console.error("[PeopleMatch] Failed to query marketplace_listings:", listingsError.message)
  }

  // Query provider profiles
  const { data: providers, error: providersError } = await supabase
    .from("provider_profiles")
    .select("id, headline, bio, specializations, industries, day_rate, years_experience, is_active")
    .eq("is_active", true)
    .limit(50)

  if (providersError) {
    console.error("[PeopleMatch] Failed to query provider_profiles:", providersError.message)
  }

  // Semantic matching: embed discipline descriptions, call RPC for cosine similarity
  const semanticProviderScores = new Map<string, number>()
  try {
    const embeddingText = modules.map((m) => `${m.name} ${m.purpose}`).join(". ")
    const embedding = await embedText(embeddingText)
    if (embedding) {
      // GOTCHA: Supabase types map vector(1536) → string, but the client correctly sends number[] at runtime
      const { data: semanticMatches, error: rpcError } = await supabase.rpc("match_people_semantic", {
        query_embedding: embedding as unknown as string,
        match_threshold: 0.4,
        match_count: 20,
      })
      if (rpcError) {
        console.error("[PeopleMatch] Semantic RPC error:", rpcError.message)
      }
      if (semanticMatches) {
        for (const sm of semanticMatches) {
          semanticProviderScores.set(sm.id, (sm.similarity as number) * 10)
        }
      }
    }
  } catch (err) {
    console.warn("[PeopleMatch] Semantic matching failed, using keyword-only:", err instanceof Error ? err.message : "Unknown")
  }

  const matches: PersonMatch[] = []

  // Score marketplace listings against each discipline
  for (const discipline of disciplines) {
    const keywords = DISCIPLINE_KEYWORDS[discipline]

    // Score listings
    if (listings) {
      for (const listing of listings) {
        const searchText = `${listing.title} ${listing.description || ""} ${listing.subcategory || ""}`.toLowerCase()
        const attrs = listing.attributes as Record<string, unknown> | null

        let score = 0
        const matchedKeywords: string[] = []

        for (const kw of keywords) {
          if (searchText.includes(kw.toLowerCase())) {
            score += 2
            matchedKeywords.push(kw)
          }
        }

        // Check attributes JSONB for expertise
        if (attrs) {
          const expertise = String(attrs.expertise || "").toLowerCase()
          const role = String(attrs.role || "").toLowerCase()
          for (const kw of keywords) {
            if (expertise.includes(kw.toLowerCase()) || role.includes(kw.toLowerCase())) {
              score += 3
              matchedKeywords.push(kw)
            }
          }
        }

        if (score > 0) {
          const rate = attrs?.rate ? String(attrs.rate) : "Rate on request"
          matches.push({
            id: listing.id,
            name: listing.title,
            role: listing.subcategory || "Specialist",
            tags: [...new Set(matchedKeywords)],
            rate,
            matchedDiscipline: discipline,
            isInternal: false,
            matchScore: score + (listing.is_verified ? 2 : 0),
            isVerified: listing.is_verified ?? false,
            listing: {
              id: listing.id,
              category: (listing.category as "People" | "Products" | "Services" | "AI") ?? "People",
              subcategory: listing.subcategory || "Specialist",
              title: listing.title,
              description: listing.description || "",
              attributes: (attrs || {}) as Record<string, unknown>,
              image_url: listing.image_url ?? null,
              is_verified: listing.is_verified ?? false,
            },
          })
        }
      }
    }

    // Score provider profiles
    if (providers) {
      for (const provider of providers) {
        const searchText = `${provider.headline || ""} ${provider.bio || ""} ${(provider.specializations || []).join(" ")} ${(provider.industries || []).join(" ")}`.toLowerCase()

        let score = 0
        const matchedKeywords: string[] = []

        for (const kw of keywords) {
          if (searchText.includes(kw.toLowerCase())) {
            score += 2
            matchedKeywords.push(kw)
          }
        }

        // Boost for specializations match
        if (provider.specializations) {
          for (const spec of provider.specializations) {
            for (const kw of keywords) {
              if (spec.toLowerCase().includes(kw.toLowerCase())) {
                score += 3
              }
            }
          }
        }

        // Combine keyword score with semantic score (×1.5 so semantic max ~15 is comparable to keyword range)
        const semScore = (semanticProviderScores.get(provider.id) ?? 0) * 1.5
        const combinedScore = score + semScore

        if (combinedScore > 0) {
          const rate = provider.day_rate ? `£${provider.day_rate}/day` : "Rate on request"
          matches.push({
            id: provider.id,
            name: provider.headline || "Provider",
            role: (provider.specializations || []).slice(0, 2).join(", ") || "Specialist",
            tags: [...new Set(matchedKeywords)],
            rate,
            matchedDiscipline: discipline,
            isInternal: false,
            matchScore: combinedScore + (provider.years_experience ? Math.min(provider.years_experience, 5) : 0),
            isVerified: true,
            listing: null,
          })
        }
      }
    }
  }

  // Deduplicate and sort by score
  const uniqueMatches = new Map<string, PersonMatch>()
  for (const match of matches) {
    const key = `${match.id}-${match.matchedDiscipline}`
    const existing = uniqueMatches.get(key)
    if (!existing || match.matchScore > existing.matchScore) {
      uniqueMatches.set(key, match)
    }
  }

  const results = Array.from(uniqueMatches.values())
    .sort((a, b) => b.matchScore - a.matchScore)

  // Store in cache
  peopleCache.set(cacheKey, { data: results, ts: Date.now() })
  if (peopleCache.size > MAX_CACHE_SIZE) evictPeopleCache()

  return results
}
