/**
 * @file assembly-match.ts — Multi-factor assembly company matching.
 *
 * @description Server action that matches a product to assembly/fulfilment companies
 * using a 5-factor scoring system (100pts total):
 *
 * | Factor            | Max | Source                                          |
 * |-------------------|-----|-------------------------------------------------|
 * | Semantic relevance| 30  | match_marketplace_listings RPC (cosine sim)      |
 * | Capability match  | 25  | fulfillment_capabilities.capability              |
 * | Capacity fit      | 15  | max_concurrent_jobs, typical_lead_days, certs    |
 * | Quality & trust   | 15  | is_verified, certifications                      |
 * | Keyword relevance | 15  | ASSEMBLY_KEYWORDS text match on title/desc       |
 *
 * Falls back to keyword-only when embedding is unavailable.
 *
 * @related
 * - Pattern reference: src/actions/cad-lab-supplier-match.ts
 * - Types: src/lib/assembly-utils.ts
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import { embedText } from "@/lib/search/semantic-search"
import { ASSEMBLY_KEYWORDS } from "@/lib/assembly-utils"
import type { AssemblyCompanyMatch, AssemblyScoreBreakdown } from "@/lib/assembly-utils"

// ─── Input ──────────────────────────────────────────────────────────

interface AssemblyMatchInput {
  productName: string
  productDescription: string
  processTypes: string[]
  materialTypes: string[]
}

// ─── Constants ──────────────────────────────────────────────────────

const MIN_SCORE_THRESHOLD = 15
const MAX_RESULTS = 8

// ─── Scoring Helpers ────────────────────────────────────────────────

function scoreKeywords(
  candidateText: string,
): { score: number; matchedTerms: string[] } {
  const lower = candidateText.toLowerCase()
  const matched: string[] = []
  let weightedScore = 0

  for (const term of ASSEMBLY_KEYWORDS) {
    if (lower.includes(term)) {
      matched.push(term)
      // INTENT: Longer terms are more specific and score higher
      if (term.length >= 12) weightedScore += 3
      else if (term.length >= 6) weightedScore += 2
      else weightedScore += 1
    }
  }

  // Normalize: 10 weighted points -> 1.0
  return { score: Math.min(weightedScore / 10, 1.0), matchedTerms: matched }
}

// ─── Main Action ────────────────────────────────────────────────────

/**
 * Matches a product to assembly/fulfilment companies using a 5-factor scoring system.
 *
 * @param input - Product data for matching
 * @returns Top 8 assembly company matches ranked by score (min 15pts)
 */
export async function matchAssemblyCompanies(
  input: AssemblyMatchInput,
): Promise<AssemblyCompanyMatch[]> {
  const supabase = await createClient()

  // ── Step 1: Semantic matching via embeddings ──

  const semanticScores = new Map<string, number>()
  try {
    const embeddingText = `${input.productName} ${input.productDescription} assembly fulfillment ${input.processTypes.join(" ")} ${input.materialTypes.join(" ")}`
    const embedding = await embedText(embeddingText)

    if (embedding) {
      const { data: mlSemantic } = await supabase.rpc("match_marketplace_listings", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.2,
        match_count: 40,
      })

      if (mlSemantic) {
        for (const ml of mlSemantic) {
          semanticScores.set(ml.id, ml.similarity as number)
        }
      }
    }
  } catch (err) {
    console.warn("[AssemblyMatch] Semantic matching failed, falling back to keyword-only:", err instanceof Error ? err.message : "Unknown")
  }

  // ── Step 2: Query fulfillment_capabilities for assemblers ──

  const { data: assemblerCaps } = await supabase
    .from("fulfillment_capabilities")
    .select(`
      id,
      capability,
      certifications,
      typical_lead_days,
      max_concurrent_jobs,
      location_country,
      is_active,
      provider_profile_id,
      provider_profiles!inner (
        id,
        company_name,
        is_verified
      )
    `)
    .in("capability", ["assemble", "kit_and_ship"])
    .eq("is_active", true)

  // ── Step 3: Fallback — also query marketplace listings with assembly keywords ──

  const candidateIds = new Set(semanticScores.keys())
  for (const keyword of ASSEMBLY_KEYWORDS.slice(0, 5)) {
    const { data: kwHits } = await supabase
      .from("marketplace_listings")
      .select("id")
      .or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`)
      .limit(15)
    if (kwHits) {
      for (const h of kwHits) candidateIds.add(h.id)
    }
  }

  // Fetch full listing data for all candidates
  const listings = candidateIds.size > 0
    ? (await supabase
        .from("marketplace_listings")
        .select("id, title, description, is_verified, subcategory, category")
        .in("id", [...candidateIds])
      ).data ?? []
    : []

  // ── Step 4: Score and merge all candidates ──

  const matchMap = new Map<string, AssemblyCompanyMatch>()

  // Score assemblers from fulfillment_capabilities
  if (assemblerCaps) {
    for (const cap of assemblerCaps) {
      const profile = cap.provider_profiles as unknown as {
        id: string
        company_name: string
        is_verified: boolean
      }
      if (!profile) continue

      const id = profile.id
      const name = profile.company_name ?? `Assembler ${id.slice(0, 8)}`

      // Capability score: assemblers get full 25pts
      const capabilityScore = 25

      // Capacity score (15pts max): concurrent jobs (5pts), lead days <=30 (5pts), certifications (5pts)
      let capacityScore = 0
      if (cap.max_concurrent_jobs && cap.max_concurrent_jobs > 0) capacityScore += 5
      if (cap.typical_lead_days && cap.typical_lead_days <= 30) capacityScore += 5
      if (cap.certifications && cap.certifications.length > 0) capacityScore += 5

      // Quality score (15pts max): verified (10pts), has certs (5pts)
      let qualityScore = profile.is_verified ? 10 : 2
      if (cap.certifications && cap.certifications.length > 0) qualityScore += 5
      qualityScore = Math.min(qualityScore, 15)

      // Keyword score: match on name
      const { score: kwRaw, matchedTerms } = scoreKeywords(name)
      const keywordScore = Math.round(kwRaw * 15 * 10) / 10

      // Semantic: if we have a listing match for this provider, use it
      // (cross-reference would need listing_id, so use 0 for direct capability matches)
      const semanticScore = 0

      const breakdown: AssemblyScoreBreakdown = {
        semantic: semanticScore,
        capability: capabilityScore,
        capacity: capacityScore,
        quality: qualityScore,
        keyword: keywordScore,
      }
      const total = Math.round(
        (breakdown.semantic + breakdown.capability + breakdown.capacity + breakdown.quality + breakdown.keyword) * 10,
      ) / 10

      if (total >= MIN_SCORE_THRESHOLD) {
        const reasons: string[] = [`Capability: ${cap.capability}`]
        if (profile.is_verified) reasons.push("Verified provider")
        if (cap.certifications && cap.certifications.length > 0) {
          reasons.push(`Certs: ${cap.certifications.slice(0, 2).join(", ")}`)
        }
        if (matchedTerms.length > 0) reasons.push(`Keywords: ${matchedTerms.join(", ")}`)

        const existing = matchMap.get(id)
        if (!existing || total > existing.matchScore) {
          matchMap.set(id, {
            id,
            name,
            matchScore: total,
            scoreBreakdown: breakdown,
            matchReasons: reasons.slice(0, 3),
            isVerified: profile.is_verified ?? false,
            capabilities: [cap.capability as "assemble" | "kit_and_ship"],
            typicalLeadDays: cap.typical_lead_days,
            locationCountry: cap.location_country,
            certifications: cap.certifications ?? [],
          })
        }
      }
    }
  }

  // Score marketplace listing candidates
  for (const listing of listings) {
    const listingText = `${listing.title} ${listing.description ?? ""} ${listing.subcategory ?? ""}`.toLowerCase()

    // Semantic
    const semanticRaw = semanticScores.get(listing.id) ?? 0
    const semanticScore = Math.round(semanticRaw * 30 * 10) / 10

    // Capability: listings don't have structured capability data, give partial credit
    // if their text mentions assembly keywords
    const { score: kwRaw, matchedTerms } = scoreKeywords(listingText)
    const hasAssemblyKeywords = kwRaw > 0
    const capabilityScore = hasAssemblyKeywords ? 15 : 0

    // Capacity: unknown from listings, give 0
    const capacityScore = 0

    // Quality
    const qualityScore = listing.is_verified ? 10 : 2

    // Keyword
    const keywordScore = Math.round(kwRaw * 15 * 10) / 10

    // Relevance gate: need semantic or keyword relevance
    if (semanticRaw < 0.25 && !hasAssemblyKeywords) continue

    const breakdown: AssemblyScoreBreakdown = {
      semantic: semanticScore,
      capability: capabilityScore,
      capacity: capacityScore,
      quality: qualityScore,
      keyword: keywordScore,
    }
    const total = Math.round(
      (breakdown.semantic + breakdown.capability + breakdown.capacity + breakdown.quality + breakdown.keyword) * 10,
    ) / 10

    if (total >= MIN_SCORE_THRESHOLD) {
      const reasons: string[] = []
      if (semanticScore >= 10) reasons.push("Semantic match")
      if (hasAssemblyKeywords) reasons.push("Assembly capability")
      if (listing.subcategory) reasons.push(listing.subcategory)
      if (matchedTerms.length > 0 && reasons.length < 3) reasons.push(`Keywords: ${matchedTerms.slice(0, 2).join(", ")}`)

      const existing = matchMap.get(listing.id)
      if (!existing || total > existing.matchScore) {
        matchMap.set(listing.id, {
          id: listing.id,
          name: listing.title,
          matchScore: total,
          scoreBreakdown: breakdown,
          matchReasons: reasons.slice(0, 3),
          isVerified: listing.is_verified ?? false,
          capabilities: hasAssemblyKeywords ? ["assemble"] : [],
          typicalLeadDays: null,
          locationCountry: null,
          certifications: [],
        })
      }
    }
  }

  // ── Step 5: Sort, deduplicate by name, return top 8 ──

  const deduped = new Map<string, AssemblyCompanyMatch>()
  for (const m of matchMap.values()) {
    const key = m.name.toLowerCase()
    const existing = deduped.get(key)
    if (!existing || m.matchScore > existing.matchScore) {
      deduped.set(key, m)
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, MAX_RESULTS)
}
