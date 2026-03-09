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
 * DECISION: Only matches companies that explicitly offer assembly services —
 * either via fulfillment_capabilities OR marketplace_listings with
 * specialties containing 'contract_assembly' or assembly_verified attribute.
 * Generic keyword search removed to prevent false positives.
 *
 * @related
 * - Pattern reference: src/actions/cad-lab-supplier-match.ts
 * - Types: src/lib/assembly-utils.ts
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import { ASSEMBLY_KEYWORDS } from "@/lib/assembly-utils"
import type { AssemblyCompanyMatch, AssemblyScoreBreakdown } from "@/lib/assembly-utils"
import { inferRequiredSpecialties, specialtyCoverageScore } from "@/lib/cad-lab/assembly-capability-map"
import type { CategoryInput } from "@/lib/cad-lab/assembly-capability-map"

// ─── Input ──────────────────────────────────────────────────────────

interface AssemblyMatchInput {
  productName: string
  productDescription: string
  processTypes: string[]
  materialTypes: string[]
  categories?: CategoryInput[]   // Optional: enables specialty-weighted scoring
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

  // INTENT: If categories provided, infer required specialties for weighted scoring
  const requiredSpecialties = input.categories
    ? inferRequiredSpecialties(input.categories)
    : []

  // ── Step 1: Query fulfillment_capabilities for assemblers (primary) ──

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

  // ── Step 2: Query marketplace listings with EXPLICIT assembly capability ──
  // DECISION: Only include listings where specialties contains 'contract_assembly'
  // OR attributes->>'assembly_verified' is 'true'. This prevents generic keyword
  // matches from polluting assembly results with non-assembly companies.

  const { data: verifiedListings } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, is_verified, subcategory, category, specialties, certifications, attributes, lead_time, company_size, city, country, website_url")
    .or("specialties.cs.[\"contract_assembly\"],attributes->>assembly_verified.eq.true")
    .eq("approval_status", "approved")
    .limit(40)

  const listings = verifiedListings ?? []

  // ── Step 3: Score and merge all candidates ──

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

      // INTENT: Fulfillment capabilities don't have specialties — flat 25pts (backwards compat)
      const capabilityScore = 25
      const companySpecialties: string[] = []
      const matchedSpecs: string[] = []
      const missingSpecs: string[] = [...requiredSpecialties]

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
            websiteUrl: null,
            specialties: companySpecialties,
            matchedSpecialties: matchedSpecs,
            missingSpecialties: missingSpecs,
          })
        }
      }
    }
  }

  // Score verified assembly listings from marketplace
  // INTENT: These listings passed the explicit assembly filter (specialties or assembly_verified),
  // so they get a higher base capability score than the old generic keyword approach.
  for (const listing of listings) {
    const listingText = `${listing.title} ${listing.description ?? ""} ${listing.subcategory ?? ""}`.toLowerCase()

    // INTENT: Read specialties from DB (JSONB array) for coverage scoring
    const companySpecialties = Array.isArray(listing.specialties)
      ? (listing.specialties as string[])
      : []

    // Capability: weighted by specialty coverage if categories provided, else flat 25pts
    let capabilityScore: number
    let matchedSpecs: string[]
    let missingSpecs: string[]

    if (requiredSpecialties.length > 0) {
      const coverage = specialtyCoverageScore(companySpecialties, requiredSpecialties)
      capabilityScore = Math.round(coverage.score * 25 * 10) / 10
      matchedSpecs = coverage.matched
      missingSpecs = coverage.missing
    } else {
      capabilityScore = 25
      matchedSpecs = []
      missingSpecs = []
    }

    // Capacity: extract from promoted columns if available
    let capacityScore = 0
    if (listing.lead_time) capacityScore += 5
    const listingCerts = (listing.certifications ?? []) as string[]
    if (listingCerts.length > 0) capacityScore += 5
    if (listing.company_size && listing.company_size !== "Unknown" && listing.company_size !== "Dormant") capacityScore += 5

    // Quality
    let qualityScore = listing.is_verified ? 10 : 2
    if (listingCerts.length > 0) qualityScore += 5
    qualityScore = Math.min(qualityScore, 15)

    // Keyword relevance
    const { score: kwRaw, matchedTerms } = scoreKeywords(listingText)
    const keywordScore = Math.round(kwRaw * 15 * 10) / 10

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
      const reasons: string[] = ["Verified assembly company"]
      if (listing.subcategory) reasons.push(listing.subcategory)
      if (matchedSpecs.length > 0) {
        reasons.push(`Covers: ${matchedSpecs.slice(0, 3).map((s) => s.replace(/_/g, " ")).join(", ")}`)
      }
      if (listingCerts.length > 0 && reasons.length < 4) reasons.push(`Certs: ${listingCerts.slice(0, 2).join(", ")}`)
      if (matchedTerms.length > 0 && reasons.length < 4) reasons.push(`Keywords: ${matchedTerms.slice(0, 2).join(", ")}`)

      const existing = matchMap.get(listing.id)
      if (!existing || total > existing.matchScore) {
        matchMap.set(listing.id, {
          id: listing.id,
          name: listing.title,
          matchScore: total,
          scoreBreakdown: breakdown,
          matchReasons: reasons.slice(0, 3),
          isVerified: listing.is_verified ?? false,
          capabilities: ["assemble"],
          typicalLeadDays: listing.lead_time ? parseInt(listing.lead_time.match(/\d+/)?.[0] ?? "0", 10) || null : null,
          locationCountry: listing.country ?? null,
          certifications: listingCerts,
          websiteUrl: listing.website_url ?? null,
          specialties: companySpecialties,
          matchedSpecialties: matchedSpecs,
          missingSpecialties: missingSpecs,
        })
      }
    }
  }

  // ── Step 4: Sort, deduplicate by name, return top 8 ──

  const deduped = new Map<string, AssemblyCompanyMatch>()
  for (const m of matchMap.values()) {
    const key = m.name.toLowerCase()
    const existing = deduped.get(key)
    if (!existing || m.matchScore > existing.matchScore) {
      // GOTCHA: When fulfillment_capabilities entry (flat 25pts, empty specialties) wins
      // over marketplace listing (weighted, real specialties), merge specialty data from
      // the losing entry so the UI still shows accurate specialty badges.
      if (existing && existing.specialties.length > 0 && m.specialties.length === 0) {
        deduped.set(key, {
          ...m,
          specialties: existing.specialties,
          matchedSpecialties: existing.matchedSpecialties,
          missingSpecialties: existing.missingSpecialties,
        })
      } else {
        deduped.set(key, m)
      }
    } else if (existing && existing.specialties.length === 0 && m.specialties.length > 0) {
      // Existing entry won on score but has no specialty data — take it from the loser
      deduped.set(key, {
        ...existing,
        specialties: m.specialties,
        matchedSpecialties: m.matchedSpecialties,
        missingSpecialties: m.missingSpecialties,
      })
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, MAX_RESULTS)
}
