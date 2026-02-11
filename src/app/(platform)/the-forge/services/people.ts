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

import type { Discipline, ModuleSpec } from "./xray-schema"

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

        if (score > 0) {
          const rate = provider.day_rate ? `£${provider.day_rate}/day` : "Rate on request"
          matches.push({
            id: provider.id,
            name: provider.headline || "Provider",
            role: (provider.specializations || []).slice(0, 2).join(", ") || "Specialist",
            tags: [...new Set(matchedKeywords)],
            rate,
            matchedDiscipline: discipline,
            isInternal: false,
            matchScore: score + (provider.years_experience ? Math.min(provider.years_experience, 5) : 0),
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

  return Array.from(uniqueMatches.values())
    .sort((a, b) => b.matchScore - a.matchScore)
}
