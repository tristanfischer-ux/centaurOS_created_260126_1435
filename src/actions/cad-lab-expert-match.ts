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
  /**
   * Score contribution from process/material overlap alone (0–40pts).
   * Used to classify the match as "strong" (≥ STRONG_MATCH_SPEC_THRESHOLD)
   * vs "closest candidate" (< threshold). Role/industry/baseline-trust scoring
   * doesn't count toward specialisation fit — a CTO with no process overlap
   * isn't a design reviewer for a CNC project.
   */
  specializationScore: number
  matchReasons: string[]
  sourceLabel: string
}

/**
 * Minimum specialisation score for an expert to be considered a "strong" match.
 * 10pts = at least one material overlap; 15pts = at least one process overlap.
 * Everything below this is rendered as a "closest candidate" behind a disclosure.
 *
 * Why not gate on total matchScore? Because role relevance (+30) and industry
 * alignment (+20) can push a total to 50+ with zero actual specialisation
 * overlap — which hides the failure mode the UX is trying to surface.
 */
const STRONG_MATCH_SPEC_THRESHOLD = 10

/** Max strong matches returned. Closest-candidate expander is capped separately. */
const STRONG_MATCH_LIMIT = 20

/** Max closest candidates returned (shown only if the user expands the disclosure). */
const CLOSEST_CANDIDATE_LIMIT = 10

export interface ExpertMatchResult {
  strong: MatchedExpert[]
  closest: MatchedExpert[]
  /** Total clickable, scored candidates considered — strong + closest after filters/caps have applied. */
  totalScanned: number
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
  /** profile_slug from provider_profiles — used to build /expert/[slug] link */
  profileSlug: string | null
  /** username from provider_profiles — fallback slug */
  username: string | null
  /** user_id — used to look up provider_profile when not already linked */
  userId: string | null
  /** provider_profile_id — direct link to provider_profiles for enrichment */
  providerProfileId: string | null
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
}): Promise<ExpertMatchResult> {
  // AUTH: reject unauthenticated callers. Internally this uses createAdminClient()
  // via fetchListingExecutives / fetchProfileExecutives which bypass RLS, so
  // without this gate any anonymous caller could enumerate the executive
  // directory with full bios + verification status.
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.warn("[ExpertMatch] Rejected unauthenticated request")
    return { strong: [], closest: [], totalScanned: 0 }
  }

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
    return { strong: [], closest: [], totalScanned: 0 }
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

  // ── Enrich missing slugs by looking up provider_profiles for known user_ids ──
  // INTENT: Profile-sourced experts arrive without a slug. If they also have a
  // provider_profile (linked by user_id), promote that slug so the card links.
  await enrichSlugsFromProviderProfiles(deduped)

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

    const cappedSpecScore = Math.min(specScore, 40)
    score += cappedSpecScore

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
        profile_slug: expert.profileSlug,
        username: expert.username,
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
        specializationScore: cappedSpecScore,
        matchReasons: reasons,
        sourceLabel,
      })
    }
  }

  // INTENT: Drop experts whose card would link nowhere. A matched exec the user
  // cannot click through to is noise, and renders a dead href="#" on the card.
  const clickable = scored.filter(
    (s) => s.expert.profile_slug || s.expert.username,
  )

  // Sort by score descending so the best candidates sit at the top of each bucket.
  clickable.sort((a, b) => b.matchScore - a.matchScore)

  // ── Partition into strong matches vs closest candidates ──
  // INTENT: The UI refuses to advertise weak matches as "matches". An expert is
  // only "strong" if their specialisations actually overlap with the project's
  // processes/materials. Role/industry/baseline scores boost ranking WITHIN each
  // bucket but don't promote a candidate out of the "closest" bucket.
  const strong: MatchedExpert[] = []
  const closest: MatchedExpert[] = []
  for (const candidate of clickable) {
    if (candidate.specializationScore >= STRONG_MATCH_SPEC_THRESHOLD) {
      strong.push(candidate)
    } else {
      closest.push(candidate)
    }
  }

  const cappedStrong = strong.slice(0, STRONG_MATCH_LIMIT)
  const cappedClosest = closest.slice(0, CLOSEST_CANDIDATE_LIMIT)

  return {
    strong: cappedStrong,
    closest: cappedClosest,
    totalScanned: cappedStrong.length + cappedClosest.length,
  }
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
      profileSlug: e.profile_slug,
      username: e.username,
      userId: null,
      providerProfileId: e.id,
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
        ),
        provider_profiles (
          id,
          profile_slug,
          username,
          user_id
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
      const providerProfile = row.provider_profiles as unknown as {
        id: string
        profile_slug: string | null
        username: string | null
        user_id: string | null
      } | null

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
        profileSlug: providerProfile?.profile_slug ?? null,
        username: providerProfile?.username ?? null,
        userId: providerProfile?.user_id ?? null,
        providerProfileId: row.provider_profile_id ?? null,
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
      profileSlug: null,
      username: null,
      userId: row.id,
      providerProfileId: null,
    }))
  } catch (error) {
    console.error("[ExpertMatch] Failed to fetch profile executives:", error)
    return []
  }
}

// ── Helpers ──

/**
 * Looks up provider_profiles for any experts missing a slug/username but with
 * a known user_id, then mutates those experts to carry the slug forward.
 *
 * @description Without this step, profile-sourced experts have no slug, so the
 * ExpertCard renders an inert href="#" and clicking the name does nothing.
 */
async function enrichSlugsFromProviderProfiles(experts: NormalizedExpert[]): Promise<void> {
  const userIdsNeedingSlug = experts
    .filter((e) => !e.profileSlug && !e.username && e.userId)
    .map((e) => e.userId as string)

  if (userIdsNeedingSlug.length === 0) return

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("provider_profiles")
      .select("user_id, profile_slug, username")
      .in("user_id", userIdsNeedingSlug)

    if (error) {
      console.error("[ExpertMatch] Failed to enrich slugs from provider_profiles:", error)
      return
    }

    const byUserId = new Map<string, { profile_slug: string | null; username: string | null }>()
    for (const row of data ?? []) {
      if (row.user_id) {
        byUserId.set(row.user_id, {
          profile_slug: row.profile_slug,
          username: row.username,
        })
      }
    }

    for (const expert of experts) {
      if (expert.profileSlug || expert.username || !expert.userId) continue
      const slug = byUserId.get(expert.userId)
      if (slug) {
        expert.profileSlug = slug.profile_slug
        expert.username = slug.username
      }
    }
  } catch (error) {
    console.error("[ExpertMatch] Unexpected error enriching slugs:", error)
  }
}

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
