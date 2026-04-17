/**
 * @file cad-lab-supplier-match.ts — Multi-factor supplier matching for CadLab modules.
 *
 * @description Server action that matches CadLab modules to marketplace listings
 * using a 6-factor scoring system (100pts total):
 *
 * | Factor            | Max | Source                                      |
 * |-------------------|-----|---------------------------------------------|
 * | Semantic relevance| 30  | match_marketplace_listings RPC (cosine sim)  |
 * | Capability match  | 25  | process_capabilities JSONB (Nightshift data) |
 * | Process match     | 15  | attributes JSONB + subcategory               |
 * | Material match    | 10  | attributes JSONB                             |
 * | Quality & trust   | 10  | is_verified flag                             |
 * | Keyword relevance | 10  | text matching on title/description/categories |
 *
 * When process, material, or capabilities are unavailable, their points
 * redistribute to semantic + keyword so the total always sums to 100.
 *
 * Falls back to keyword-only scoring when embedding is unavailable.
 *
 * @related
 * - Semantic infra: src/lib/search/semantic-search.ts (embedText)
 * - RPC: supabase/migrations/20260218110000_semantic_search_embeddings.sql
 * - CadLab supply chain UI: src/components/cad/cad-lab-supply-chain.tsx
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import { embedText } from "@/lib/search/semantic-search"

// ─── Types ──────────────────────────────────────────────────────────

export interface CadLabModuleInput {
  id: string
  name: string
  purpose: string
  keyParts: string[]
  description?: string
  process?: string | null
  material?: string | null
  toleranceMm?: number | null
  batchSize?: string | null
}

export interface ScoreBreakdown {
  semantic: number
  process: number
  material: number
  quality: number
  keyword: number
  capability: number
  total: number
}

export interface CadLabSupplierMatch {
  id: string
  name: string
  matchScore: number
  scoreBreakdown: ScoreBreakdown
  matchReasons: string[]
  isVerified: boolean
  supplierType: string
  processCapabilities?: Array<{
    process_category?: string
    materials_worked?: string[]
    tolerance_value_mm?: number
    batch_size_range?: string
  }>
  // INTENT: Enriched fields surfaced to Supply Risk Radar + NDA gate. Filled
  // from marketplace_listings columns on the scoring pass.
  country?: string | null
  city?: string | null
  employeeCountExact?: number | null
  foundedYear?: number | null
  leadTime?: string | null
  minimumOrder?: string | null
  exportControls?: string | null
  securityClearances?: string[] | null
  certifications?: string[] | null
  websiteUrl?: string | null
}

// ─── Category Normalization Maps ────────────────────────────────────

// INTENT: Normalize raw process strings to canonical keys so "CNC machining",
// "cnc", "milling" all map to the same category — prevents naive substring
// matching from treating "manufacturing" as a match for everything.

const PROCESS_CATEGORIES: Record<string, string[]> = {
  cnc_machining: ["cnc", "machining", "milling", "turning", "lathe"],
  injection_moulding: ["injection", "moulding", "molding", "plastic injection"],
  additive: ["3d print", "additive", "fdm", "sla", "sls", "dmls", "3d-print"],
  sheet_metal: ["sheet metal", "stamping", "laser cutting", "laser cut", "bending"],
  casting: ["casting", "die casting", "sand casting", "investment casting"],
  fabrication: ["fabrication", "welding", "assembly"],
  pcb: ["pcb", "circuit board", "electronics", "electronic"],
  finishing: ["anodize", "anodizing", "paint", "coating", "plating", "finish", "powder coat"],
  extrusion: ["extrusion", "extruded", "profile"],
  forging: ["forging", "forged"],
}

const MATERIAL_CATEGORIES: Record<string, string[]> = {
  aluminium: ["aluminium", "aluminum", "alu", "al6061", "al7075", "6061", "7075"],
  steel: ["steel", "stainless", "mild steel", "carbon steel", "aisi", "ss304", "ss316"],
  titanium: ["titanium", "ti64", "ti-6al-4v", "grade 5"],
  abs: ["abs", "abs plastic"],
  pla: ["pla"],
  nylon: ["nylon", "pa6", "pa66", "pa12", "polyamide"],
  petg: ["petg", "pet-g"],
  polycarbonate: ["polycarbonate", "pc", "lexan"],
  carbon_fibre: ["carbon fibre", "carbon fiber", "cfrp", "cf"],
  copper: ["copper", "cu", "brass", "bronze"],
  wood: ["wood", "plywood", "mdf", "timber"],
  rubber: ["rubber", "silicone", "elastomer", "tpu"],
  glass: ["glass", "borosilicate"],
  acrylic: ["acrylic", "pmma", "perspex", "plexiglass"],
}

/**
 * Normalizes a raw string to a set of canonical category keys.
 * Returns all matching keys (may be multiple for compound terms).
 */
function normalizeToCategories(
  raw: string | null | undefined,
  categoryMap: Record<string, string[]>,
): Set<string> {
  if (!raw) return new Set()
  const lower = raw.toLowerCase()
  const matched = new Set<string>()
  for (const [key, terms] of Object.entries(categoryMap)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        matched.add(key)
        break
      }
    }
  }
  return matched
}

// ─── Scoring Helpers ────────────────────────────────────────────────

/** Base weights (when both process and material are specified) */
const BASE_WEIGHTS = {
  semantic: 30,
  process: 15,
  material: 10,
  quality: 10,
  keyword: 10,
  capability: 25,
} as const

const MIN_SCORE_THRESHOLD = 15
const MAX_RESULTS = 8

/**
 * Calculates dynamic weights based on which structured inputs are available.
 * Redistributes unspecified factor points to semantic (60%) and keyword (40%).
 */
function computeWeights(
  hasProcess: boolean,
  hasMaterial: boolean,
): Record<keyof typeof BASE_WEIGHTS, number> {
  let redistributable = 0
  if (!hasProcess) redistributable += BASE_WEIGHTS.process
  if (!hasMaterial) redistributable += BASE_WEIGHTS.material

  return {
    semantic: BASE_WEIGHTS.semantic + Math.round(redistributable * 0.6),
    process: hasProcess ? BASE_WEIGHTS.process : 0,
    material: hasMaterial ? BASE_WEIGHTS.material : 0,
    quality: BASE_WEIGHTS.quality,
    keyword: BASE_WEIGHTS.keyword + Math.round(redistributable * 0.4),
    capability: BASE_WEIGHTS.capability,
  }
}

/**
 * Scores a single candidate across process and material factors.
 * Returns 0-1 normalized scores for each.
 */
function scoreStructuredMatch(
  candidateText: string,
  candidateCategories: string[],
  candidateCaps: Record<string, unknown> | null,
  inputProcessKeys: Set<string>,
  inputMaterialKeys: Set<string>,
): { processScore: number; materialScore: number } {
  let processScore = 0
  let materialScore = 0

  // Build candidate's normalized process/material keys
  const candidateAllText = `${candidateText} ${candidateCategories.join(" ")} ${candidateCaps ? JSON.stringify(candidateCaps) : ""}`
  const candidateProcessKeys = normalizeToCategories(candidateAllText, PROCESS_CATEGORIES)
  const candidateMaterialKeys = normalizeToCategories(candidateAllText, MATERIAL_CATEGORIES)

  // Process scoring: exact key overlap = 1.0, no partial credit for unrelated processes
  if (inputProcessKeys.size > 0) {
    const overlap = [...inputProcessKeys].filter((k) => candidateProcessKeys.has(k))
    if (overlap.length > 0) {
      processScore = 1.0
    }
  }

  // Material scoring: exact key overlap = 1.0, no partial credit for unrelated materials
  if (inputMaterialKeys.size > 0) {
    const overlap = [...inputMaterialKeys].filter((k) => candidateMaterialKeys.has(k))
    if (overlap.length > 0) {
      materialScore = 1.0
    }
  }

  return { processScore, materialScore }
}

/**
 * Scores quality & trust factor (0-1 normalized).
 * verified = 10pts base, community_verified = 7pts, unverified = 2pts
 * Plus community_rating scaled to remaining 5pts.
 */
function scoreQuality(
  verificationStatus: string | null,
  communityRating: number | null,
): number {
  const maxQuality = 15
  let pts = 0

  // Verification status (0-10 pts)
  switch (verificationStatus) {
    case "verified":
      pts += 10
      break
    case "community_verified":
      pts += 7
      break
    default:
      pts += 2
      break
  }

  // Community rating (0-5 pts)
  if (communityRating != null) {
    pts += Math.min(communityRating, 5)
  }

  return pts / maxQuality
}

/**
 * Scores keyword relevance (0-1 normalized) with length-weighted terms.
 *
 * Longer terms are more specific and score higher:
 * - Terms 3-5 chars: 1pt each (generic: "cnc", "abs")
 * - Terms 6-11 chars: 2pts each (moderate: "nylon", "milling")
 * - Terms 12+ chars: 3pts each (specific: "injection moulding")
 *
 * keyParts (module-specific component names) get a 2x multiplier since
 * they represent the most relevant search context.
 *
 * Normalized so 12 weighted points → 1.0 (prevents all suppliers from
 * hitting the same generic terms and scoring identically).
 */
function scoreKeywords(
  searchTerms: string[],
  candidateText: string,
  keyParts: string[] = [],
): { score: number; matchedTerms: string[] } {
  const matched: string[] = []
  const keyPartsLower = new Set(keyParts.map((k) => k.toLowerCase()))
  let weightedScore = 0

  for (const term of searchTerms) {
    if (term.length < 3) continue
    if (candidateText.includes(term)) {
      matched.push(term)

      // Length-based weight: longer = more specific = higher value
      let weight = 1
      if (term.length >= 12) weight = 3
      else if (term.length >= 6) weight = 2

      // keyParts get 2x multiplier — they're the most relevant terms
      if (keyPartsLower.has(term)) weight *= 2

      weightedScore += weight
    }
  }

  // Normalize: 12 weighted points → 1.0
  const score = Math.min(weightedScore / 12, 1.0)
  return { score, matchedTerms: matched }
}

// ─── Capability Scoring ──────────────────────────────────────────────

interface ProcessCapability {
  process_category?: string
  materials_worked?: string[]
  tolerance_value_mm?: number
  batch_size_range?: string
}

/**
 * Scores a listing's process_capabilities JSONB against module diagnostics.
 * Returns 0-1 normalized score across 4 sub-factors:
 * - Process category match (10pts)
 * - Material match (7pts)
 * - Tolerance met (5pts)
 * - Batch size match (3pts)
 */
function scoreCapabilityMatch(
  capabilities: ProcessCapability[],
  inputProcessKeys: Set<string>,
  inputMaterial: string | null | undefined,
  inputToleranceMm: number | null | undefined,
  inputBatchSize: string | null | undefined,
): number {
  if (!capabilities || capabilities.length === 0) return 0
  const maxPts = 25
  let bestScore = 0

  for (const cap of capabilities) {
    let pts = 0

    // Process category match (10pts)
    if (cap.process_category && inputProcessKeys.has(cap.process_category)) {
      pts += 10
    }

    // Material match (7pts) — check if any of the supplier's materials match input
    if (inputMaterial && cap.materials_worked && cap.materials_worked.length > 0) {
      const inputMatLower = inputMaterial.toLowerCase()
      const hasMatch = cap.materials_worked.some((m) => {
        const matLower = m.toLowerCase()
        return matLower.includes(inputMatLower) || inputMatLower.includes(matLower.split(" ")[0])
      })
      if (hasMatch) pts += 7
    }

    // Tolerance met (5pts) — supplier can achieve the required tolerance
    if (inputToleranceMm != null && cap.tolerance_value_mm != null) {
      if (cap.tolerance_value_mm <= inputToleranceMm) {
        pts += 5
      }
    }

    // Batch size match (3pts) — simple range containment check
    if (inputBatchSize && cap.batch_size_range) {
      const rangeLower = cap.batch_size_range.toLowerCase()
      const batchLower = inputBatchSize.toLowerCase()
      // Check for keyword overlap (prototype, low, production, etc.)
      if (
        rangeLower.includes(batchLower) ||
        batchLower.includes("prototype") && rangeLower.includes("1") ||
        batchLower.includes("low") && (rangeLower.includes("10") || rangeLower.includes("100")) ||
        batchLower.includes("production") && (rangeLower.includes("1000") || rangeLower.includes("10000"))
      ) {
        pts += 3
      }
    }

    bestScore = Math.max(bestScore, pts)
  }

  return bestScore / maxPts
}

// ─── Main Action ────────────────────────────────────────────────────

/**
 * Matches a single CadLab module to marketplace listings
 * using a 5-factor scoring system.
 *
 * @param input - Module data including diagnostics-derived process/material
 * @returns Top 8 marketplace matches ranked by score (min 25pts)
 *
 * @security Requires authenticated user. Marketplace listings are cross-foundry
 * (publicly visible to logged-in Forge users), but authentication is required
 * to prevent unauthenticated enumeration and embedding-call cost abuse.
 */
export async function matchCadLabModuleSuppliers(
  input: CadLabModuleInput,
): Promise<CadLabSupplierMatch[]> {
  // AUTH: reject unauthenticated callers. Returning [] rather than throwing
  // because the caller (source/page.tsx) treats error as "no matches" and
  // this endpoint would otherwise be a public embedding-cost vector.
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.warn("[CadLabMatch] Rejected unauthenticated request")
    return []
  }

  const hasProcess = !!input.process && input.process.toLowerCase() !== "other"
  const hasMaterial = !!input.material && input.material.toLowerCase() !== "other"
  const weights = computeWeights(hasProcess, hasMaterial)

  // Normalize input process/material to canonical keys
  const inputProcessKeys = normalizeToCategories(input.process, PROCESS_CATEGORIES)
  const inputMaterialKeys = normalizeToCategories(input.material, MATERIAL_CATEGORIES)

  // Build search terms (for keyword scoring)
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

  // ── Step 1: Semantic matching via embeddings ──

  const semanticScores = new Map<string, number>()
  try {
    const embeddingText = `${input.name} ${input.purpose} ${input.keyParts.join(" ")} ${input.description ?? ""}`
    const embedding = await embedText(embeddingText)

    if (embedding) {
      // GOTCHA: Supabase types map vector(1536) → string, but the client correctly sends number[] at runtime
      const { data: mlSemantic } = await supabase.rpc("match_marketplace_listings", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.25,
        match_count: 50,
      })

      if (mlSemantic) {
        for (const ml of mlSemantic) {
          semanticScores.set(ml.id, ml.similarity as number)
        }
      }
    }
  } catch (err) {
    console.warn("[CadLabMatch] Semantic matching failed, falling back to keyword-only:", err instanceof Error ? err.message : "Unknown")
  }

  // ── Step 2: Build candidate set from semantic hits + process fallback ──

  const candidateIds = new Set(semanticScores.keys())

  // Fallback: also fetch listings matching process keywords via subcategory
  // (catches cases where semantic is weak but process is exact)
  if (inputProcessKeys.size > 0) {
    const processTerms = [...inputProcessKeys].flatMap(
      (key) => PROCESS_CATEGORIES[key] ?? []
    )
    // Use ilike on subcategory for each process term
    for (const term of processTerms.slice(0, 3)) {
      const { data: processHits } = await supabase
        .from("marketplace_listings")
        .select("id")
        .in("category", ["Products", "Services"])
        .ilike("subcategory", `%${term}%`)
        .limit(20)
      if (processHits) {
        for (const h of processHits) candidateIds.add(h.id)
      }
    }
  }

  // If we still have few candidates, add a general fallback
  if (candidateIds.size < 20) {
    const { data: fallback } = await supabase
      .from("marketplace_listings")
      .select("id")
      .in("category", ["Products", "Services"])
      .limit(30)
    if (fallback) {
      for (const h of fallback) candidateIds.add(h.id)
    }
  }

  // Fetch full data for all candidates (includes process_capabilities for capability scoring)
  // DECISION: Select top-level enrichment columns alongside attributes JSONB.
  // Nightshift (script 35) writes certifications, materials, industries, key_equipment
  // as top-level columns, NOT inside attributes. Without these columns the scoring
  // engine can't see enrichment data, causing weak process/material matches.
  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, attributes, is_verified, subcategory, category, process_capabilities, certifications, materials, industries, key_equipment, specialties, country, city, employee_count_exact, founded_year, lead_time, minimum_order, export_controls, security_clearances, website_url")
    .in("id", [...candidateIds])

  const matches: CadLabSupplierMatch[] = []

  // ── Step 3: Score marketplace listings ──

  if (listings) {
    for (const listing of listings) {
      // INTENT: Build scoring text from ALL data sources — title, description,
      // subcategory, AND top-level enrichment columns that Nightshift writes.
      // This ensures process/material scoring sees the full enrichment picture.
      const enrichmentParts = [
        ...(Array.isArray(listing.certifications) ? listing.certifications : []),
        ...(Array.isArray(listing.materials) ? listing.materials : []),
        ...(Array.isArray(listing.industries) ? listing.industries : []),
        ...(Array.isArray(listing.key_equipment) ? listing.key_equipment : []),
        ...(Array.isArray(listing.specialties) ? listing.specialties : []),
      ].join(" ")
      const listingText = `${listing.title || ""} ${listing.description || ""} ${listing.subcategory || ""} ${enrichmentParts}`.toLowerCase()

      // Merge top-level columns into attrs so scoreStructuredMatch sees them
      const baseAttrs = (listing.attributes as Record<string, unknown>) || {}
      const attrs: Record<string, unknown> = {
        ...baseAttrs,
        ...(listing.certifications != null && { certifications: listing.certifications }),
        ...(listing.materials != null && { materials: listing.materials }),
        ...(listing.industries != null && { industries: listing.industries }),
        ...(listing.key_equipment != null && { key_equipment: listing.key_equipment }),
        ...(listing.specialties != null && { specialties: listing.specialties }),
      }

      // Factor 1: Semantic
      const semanticRaw = semanticScores.get(listing.id) ?? 0

      // Factor 2 & 3: Process + Material (from listing text + attributes)
      const { processScore, materialScore } = scoreStructuredMatch(
        listingText,
        [listing.subcategory, listing.category].filter(Boolean) as string[],
        attrs,
        inputProcessKeys,
        inputMaterialKeys,
      )

      // Factor 4: Quality (listings use is_verified, no community_rating)
      let qualityRaw = scoreQuality(
        listing.is_verified ? "verified" : "unverified",
        null,
      )

      // Factor 5: Keyword (with keyParts for higher-value term matching)
      let { score: keywordRaw } = scoreKeywords(searchTerms, listingText, input.keyParts)

      // Factor 6: Capability (from process_capabilities JSONB)
      const caps = (listing.process_capabilities ?? []) as ProcessCapability[]
      const capabilityRaw = scoreCapabilityMatch(
        caps,
        inputProcessKeys,
        input.material,
        input.toleranceMm,
        input.batchSize,
      )

      // Relevance gate (same logic as suppliers above)
      const hasRelevance = semanticRaw >= 0.3 || processScore >= 1.0 || materialScore >= 1.0 || capabilityRaw > 0
      if (!hasRelevance) {
        qualityRaw = 0
        keywordRaw = 0
      }

      // INTENT: When a listing has no process_capabilities, redistribute its
      // capability points to semantic (60%) + keyword (40%) — same pattern as
      // missing process/material.
      const hasCapabilities = caps.length > 0
      const effectiveCapWeight = hasCapabilities ? weights.capability : 0
      const capRedist = hasCapabilities ? 0 : weights.capability
      const effectiveSemanticWeight = weights.semantic + Math.round(capRedist * 0.6)
      const effectiveKeywordWeight = weights.keyword + Math.round(capRedist * 0.4)

      const breakdown: ScoreBreakdown = {
        semantic: Math.round(semanticRaw * effectiveSemanticWeight * 10) / 10,
        process: Math.round(processScore * weights.process * 10) / 10,
        material: Math.round(materialScore * weights.material * 10) / 10,
        quality: Math.round(qualityRaw * weights.quality * 10) / 10,
        keyword: Math.round(keywordRaw * effectiveKeywordWeight * 10) / 10,
        capability: Math.round(capabilityRaw * effectiveCapWeight * 10) / 10,
        total: 0,
      }
      breakdown.total = Math.round(
        (breakdown.semantic + breakdown.process + breakdown.material + breakdown.quality + breakdown.keyword + breakdown.capability) * 10,
      ) / 10

      if (breakdown.total >= MIN_SCORE_THRESHOLD) {
        const reasons: string[] = []
        if (breakdown.semantic >= weights.semantic * 0.5) reasons.push("Semantic match")
        if (processScore >= 1.0 && input.process) reasons.push(`Process: ${input.process}`)
        if (materialScore >= 1.0 && input.material) reasons.push(`Material: ${input.material}`)
        if (capabilityRaw >= 0.4) reasons.push("Verified capabilities")
        if (listing.subcategory) reasons.push(listing.subcategory)

        // INTENT: Coerce JSONB arrays to string[] for UI consumption.
        // security_clearances + certifications are stored as JSONB arrays.
        const certsArr = Array.isArray(listing.certifications)
          ? (listing.certifications as unknown[]).filter((c): c is string => typeof c === "string")
          : null
        const clearancesArr = Array.isArray(listing.security_clearances)
          ? (listing.security_clearances as unknown[]).filter((c): c is string => typeof c === "string")
          : null

        matches.push({
          id: listing.id,
          name: listing.title || "Unknown Supplier",
          matchScore: breakdown.total,
          scoreBreakdown: breakdown,
          matchReasons: [...new Set(reasons)].slice(0, 3),
          isVerified: listing.is_verified ?? false,
          supplierType: listing.category === "Products" ? "manufacturer" : "service",
          processCapabilities: caps.length > 0 ? caps : undefined,
          country: listing.country ?? null,
          city: listing.city ?? null,
          employeeCountExact: listing.employee_count_exact ?? null,
          foundedYear: listing.founded_year ?? null,
          leadTime: listing.lead_time ?? null,
          minimumOrder: listing.minimum_order ?? null,
          exportControls: listing.export_controls ?? null,
          securityClearances: clearancesArr,
          certifications: certsArr,
          websiteUrl: listing.website_url ?? null,
        })
      }
    }
  }

  // ── Step 5: Deduplicate by name, keeping higher score ──

  const deduped = new Map<string, CadLabSupplierMatch>()
  for (const m of matches) {
    const key = (m.name || "").toLowerCase()
    const existing = deduped.get(key)
    if (!existing || m.matchScore > existing.matchScore) {
      deduped.set(key, m)
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, MAX_RESULTS)
}
