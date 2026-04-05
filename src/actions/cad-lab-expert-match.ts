"use server"

/**
 * @file cad-lab-expert-match.ts — Match fractional executives to CAD Lab projects.
 *
 * @description Fetches executives from multiple sources (directory, listing_executives,
 * profiles) and scores them against the project's manufacturing processes, materials,
 * use case, and role context. Used by the Executive Review tab on both Specify and
 * Source pages.
 *
 * Multi-source fetch:
 * - Source A: provider_profiles via directory RPC (is_public + is_active)
 * - Source B: listing_executives joined to marketplace_listings (status=active)
 * - Source C: profiles where role=Executive, is_active=true
 *
 * Scoring (max 100):
 * - Specialization overlap with project processes/materials (0–40pts)
 * - Role weighting: design favours CTO/CPO, sourcing favours COO/CPO (0–30pts)
 * - Industry alignment: useCase keywords vs expert industries (0–20pts)
 * - Baseline: verified + experienced (0–10pts)
 */

import { getDirectoryExperts } from "@/actions/directory"
import { createAdminClient } from "@/lib/supabase/admin"
import type { DirectoryExpert } from "@/lib/directory/types"

export interface MatchedExpert {
  expert: DirectoryExpert
  matchScore: number
  matchReasons: string[]
  sourceLabel: string
}

// ── Internal type for normalizing across sources ──

interface NormalizedExpert {
  dedupKey: string
  name: string
  headline: string | null
  bio: string | null
  specializations: string[]
  industries: string[]
  yearsExperience: number | null
  isVerified: boolean
  source: "directory" | "listing" | "profile"
  /** Company name from marketplace listing (for listing execs) */
  companyName: string | null
  /** Original DirectoryExpert shape — present for directory source */
  directoryExpert: DirectoryExpert | null
}

// ── Role keywords for design vs sourcing contexts ──

const DESIGN_ROLE_KEYWORDS = ["cto", "chief technology", "engineering", "design", "product", "cpo", "chief product"]
const SOURCING_ROLE_KEYWORDS = ["coo", "chief operating", "supply chain", "procurement", "operations", "cpo", "chief product"]

// ── Industry keyword map: useCase text → industry categories ──

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  automotive: ["automotive", "vehicle", "car", "truck", "ev", "electric vehicle", "drivetrain", "chassis"],
  aerospace: ["aerospace", "aircraft", "aviation", "satellite", "space", "rocket", "drone", "uav"],
  medical: ["medical", "healthcare", "surgical", "implant", "prosthetic", "dental", "biomedical", "pharma"],
  consumer: ["consumer", "retail", "household", "appliance", "wearable", "gadget", "lifestyle"],
  industrial: ["industrial", "factory", "machinery", "heavy equipment", "tooling", "automation"],
  electronics: ["electronics", "pcb", "semiconductor", "circuit", "sensor", "iot", "embedded"],
  energy: ["energy", "solar", "wind", "turbine", "battery", "power", "oil", "gas", "renewable"],
  defence: ["defence", "defense", "military", "armour", "armor", "munitions", "naval"],
  marine: ["marine", "boat", "ship", "offshore", "subsea", "maritime"],
  food: ["food", "beverage", "packaging", "fmcg", "processing"],
}

/**
 * Matches executives from multiple sources against a project's manufacturing profile.
 *
 * @param params.processes - Manufacturing processes used (e.g., "CNC Machining", "Sheet Metal")
 * @param params.materials - Materials specified (e.g., "Aluminum 6061", "Stainless Steel")
 * @param params.context - "design" weights CTO/CPO roles; "sourcing" weights COO/CPO roles
 * @param params.useCase - Free-text use case description for industry matching
 * @returns Scored and sorted list of matched experts with source labels
 */
export async function matchProjectExperts(params: {
  processes: string[]
  materials: string[]
  context: "design" | "sourcing"
  useCase?: string
}): Promise<{ experts: MatchedExpert[] }> {
  const { processes, materials, context, useCase } = params

  // ── Fetch from all 3 sources in parallel ──
  const [directoryResult, listingExecs, profileExecs] = await Promise.all([
    fetchDirectoryExperts(),
    fetchListingExecutives(),
    fetchProfileExecutives(),
  ])

  // ── Normalize into common shape ──
  const normalized: NormalizedExpert[] = [
    ...directoryResult,
    ...listingExecs,
    ...profileExecs,
  ]

  if (normalized.length === 0) {
    return { experts: [] }
  }

  // ── Deduplicate: keep highest potential (directory > listing > profile) ──
  const dedupMap = new Map<string, NormalizedExpert>()
  const SOURCE_PRIORITY: Record<string, number> = { directory: 3, listing: 2, profile: 1 }

  for (const expert of normalized) {
    const existing = dedupMap.get(expert.dedupKey)
    if (!existing || (SOURCE_PRIORITY[expert.source] ?? 0) > (SOURCE_PRIORITY[existing.source] ?? 0)) {
      dedupMap.set(expert.dedupKey, expert)
    }
  }

  const deduped = Array.from(dedupMap.values())

  // ── Score each expert ──
  const processLower = processes.map((p) => p.toLowerCase())
  const materialLower = materials.map((m) => m.toLowerCase())
  const roleKeywords = context === "design" ? DESIGN_ROLE_KEYWORDS : SOURCING_ROLE_KEYWORDS
  const matchedIndustries = useCase ? extractIndustries(useCase) : []

  const scored: MatchedExpert[] = []

  for (const expert of deduped) {
    let score = 0
    const reasons: string[] = []

    // ── Specialization overlap (max 40pts) ──
    const specsLower = expert.specializations.map((s) => s.toLowerCase())
    let specScore = 0

    for (const proc of processLower) {
      const match = specsLower.find(
        (s) => s.includes(proc) || proc.includes(s.split(" ")[0]),
      )
      if (match) {
        specScore += 15
        reasons.push(`Specializes in ${proc}`)
      }
    }

    for (const mat of materialLower) {
      const match = specsLower.find(
        (s) => s.includes(mat.split(" ")[0]) || mat.includes(s.split(" ")[0]),
      )
      if (match) {
        specScore += 10
        reasons.push(`Experience with ${mat}`)
      }
    }

    score += Math.min(specScore, 40)

    // ── Role relevance (max 30pts) ──
    const headline = (expert.headline ?? "").toLowerCase()
    const bio = (expert.bio ?? "").toLowerCase()
    const combined = `${headline} ${bio}`

    for (const keyword of roleKeywords) {
      if (combined.includes(keyword)) {
        score += 30
        reasons.push(`Relevant role for ${context} review`)
        break // INTENT: Only count role once
      }
    }

    // ── Industry alignment (max 20pts) ──
    if (matchedIndustries.length > 0) {
      const expertIndustriesLower = expert.industries.map((i) => i.toLowerCase())
      let industryHits = 0
      for (const industry of matchedIndustries) {
        if (expertIndustriesLower.some((ei) => ei.includes(industry) || industry.includes(ei))) {
          industryHits++
        }
      }
      if (industryHits >= 2) {
        score += 20
        reasons.push("Strong industry alignment")
      } else if (industryHits === 1) {
        score += 10
        reasons.push("Industry alignment")
      }
    }

    // ── Baseline trust (max 10pts) ──
    if (expert.isVerified) {
      score += 5
      reasons.push("Verified expert")
    }
    if (expert.yearsExperience && expert.yearsExperience >= 10) {
      score += 5
      reasons.push(`${expert.yearsExperience}+ years experience`)
    }

    if (reasons.length > 0) {
      // INTENT: Build a DirectoryExpert-shaped object for non-directory sources
      // so ExpertCard can render them.
      const expertData: DirectoryExpert = expert.directoryExpert ?? {
        id: expert.dedupKey,
        profile_slug: null,
        username: null,
        headline: expert.headline,
        bio: expert.bio,
        location: null,
        years_experience: expert.yearsExperience,
        day_rate: null,
        hourly_rate: null,
        currency: "GBP",
        tier: "standard",
        specializations: expert.specializations,
        industries: expert.industries,
        company_stages: [],
        is_verified: expert.isVerified,
        profile_completeness: 0,
        user_name: expert.name,
        user_avatar: null,
        average_rating: null,
        total_reviews: 0,
        total_transactions: 0,
        featured_until: null,
      }

      const sourceLabel = getSourceLabel(expert)

      scored.push({
        expert: expertData,
        matchScore: Math.min(score, 100),
        matchReasons: reasons,
        sourceLabel,
      })
    }
  }

  // Sort by score descending, take top 12
  scored.sort((a, b) => b.matchScore - a.matchScore)

  return { experts: scored.slice(0, 12) }
}

// ── Source A: Directory (provider_profiles via RPC) ──

async function fetchDirectoryExperts(): Promise<NormalizedExpert[]> {
  try {
    const { experts } = await getDirectoryExperts({ limit: 50 })
    return experts.map((e) => ({
      dedupKey: e.id,
      name: e.user_name ?? "Unknown",
      headline: e.headline,
      bio: e.bio,
      specializations: e.specializations,
      industries: e.industries,
      yearsExperience: e.years_experience,
      isVerified: e.is_verified,
      source: "directory" as const,
      companyName: null,
      directoryExpert: e,
    }))
  } catch (error) {
    console.error("[ExpertMatch] Failed to fetch directory experts:", error)
    return []
  }
}

// ── Source B: listing_executives joined to marketplace_listings ──

async function fetchListingExecutives(): Promise<NormalizedExpert[]> {
  try {
    // SECURITY: admin client — cross-foundry marketplace expert search, foundry_id not needed: marketplace is public
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("listing_executives")
      .select(`
        id,
        full_name,
        title,
        bio,
        specializations,
        provider_profile_id,
        listing_id,
        marketplace_listings!inner (
          id,
          title,
          status,
          industries
        )
      `)
      .eq("marketplace_listings.status", "active")
      .limit(50)

    if (error) {
      console.error("[ExpertMatch] Failed to fetch listing executives:", error)
      return []
    }

    return (data ?? []).map((row) => {
      // INTENT: If linked to a provider_profile, use that ID for dedup
      const dedupKey = row.provider_profile_id ?? `listing-${row.id}`
      const listing = row.marketplace_listings as unknown as {
        id: string
        title: string | null
        status: string
        industries: string[] | null
      }

      return {
        dedupKey,
        name: row.full_name,
        headline: row.title,
        bio: row.bio,
        specializations: row.specializations ?? [],
        industries: Array.isArray(listing?.industries) ? listing.industries : [],
        yearsExperience: null,
        isVerified: false,
        source: "listing" as const,
        companyName: listing?.title ?? null,
        directoryExpert: null,
      }
    })
  } catch (error) {
    console.error("[ExpertMatch] Failed to fetch listing executives:", error)
    return []
  }
}

// ── Source C: profiles where role=Executive ──

async function fetchProfileExecutives(): Promise<NormalizedExpert[]> {
  try {
    // SECURITY: admin client — cross-foundry profile search for expert matching, foundry_id not needed: profiles SELECT is public
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, headline, bio, expertise_areas, industries, is_active")
      .eq("role", "Executive")
      .eq("is_active", true)
      .limit(50)

    if (error) {
      console.error("[ExpertMatch] Failed to fetch profile executives:", error)
      return []
    }

    return (data ?? []).map((row) => ({
      dedupKey: `profile-${row.id}`,
      name: row.full_name ?? "Unknown",
      headline: row.headline,
      bio: row.bio,
      specializations: row.expertise_areas ?? [],
      industries: row.industries ?? [],
      yearsExperience: null,
      isVerified: false,
      source: "profile" as const,
      companyName: null,
      directoryExpert: null,
    }))
  } catch (error) {
    console.error("[ExpertMatch] Failed to fetch profile executives:", error)
    return []
  }
}

// ── Helpers ──

/**
 * Extracts industry categories from a useCase string by matching keywords.
 */
function extractIndustries(useCase: string): string[] {
  const lower = useCase.toLowerCase()
  const matched: string[] = []
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched.push(industry)
    }
  }
  return matched
}

/**
 * Returns a human-readable label for the expert's source.
 */
function getSourceLabel(expert: NormalizedExpert): string {
  switch (expert.source) {
    case "directory":
      return "Independent"
    case "listing":
      return expert.companyName ? `Via ${expert.companyName}` : "Marketplace"
    case "profile":
      return "ForgeOS Member"
  }
}
