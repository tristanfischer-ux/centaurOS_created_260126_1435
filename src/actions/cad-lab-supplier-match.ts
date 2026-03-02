/**
 * @file cad-lab-supplier-match.ts — Multi-factor supplier matching for CadLab modules.
 *
 * @description Server action that matches CadLab modules to suppliers and
 * marketplace listings using a 5-factor scoring system (100pts total):
 *
 * | Factor            | Max | Source                                      |
 * |-------------------|-----|---------------------------------------------|
 * | Semantic relevance| 40  | match_suppliers_semantic RPC (cosine sim)    |
 * | Process match     | 20  | capabilities JSONB + domain_categories       |
 * | Material match    | 15  | capabilities JSONB                           |
 * | Quality & trust   | 15  | verification_status + community_rating       |
 * | Keyword relevance | 10  | text matching on name/description/categories  |
 *
 * When process or material is unspecified, their points redistribute to
 * semantic + keyword so the total always sums to 100.
 *
 * Falls back to keyword-only scoring when embedding is unavailable.
 *
 * @related
 * - Semantic infra: src/lib/search/semantic-search.ts (embedText)
 * - RPC: supabase/migrations/20260223130000_supplier_people_embeddings.sql
 * - X-Ray supplier matching: src/app/(platform)/the-forge/services/suppliers.ts
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
}

export interface ScoreBreakdown {
  semantic: number
  process: number
  material: number
  quality: number
  keyword: number
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
  semantic: 40,
  process: 20,
  material: 15,
  quality: 15,
  keyword: 10,
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

  // Process scoring: exact key overlap = 1.0, any related category = 0.5
  if (inputProcessKeys.size > 0) {
    const overlap = [...inputProcessKeys].filter((k) => candidateProcessKeys.has(k))
    if (overlap.length > 0) {
      processScore = 1.0
    } else if (candidateProcessKeys.size > 0) {
      // Partial credit if supplier does any manufacturing process
      processScore = 0.3
    }
  }

  // Material scoring: exact key overlap = 1.0, related material family = 0.5
  if (inputMaterialKeys.size > 0) {
    const overlap = [...inputMaterialKeys].filter((k) => candidateMaterialKeys.has(k))
    if (overlap.length > 0) {
      materialScore = 1.0
    } else if (candidateMaterialKeys.size > 0) {
      materialScore = 0.3
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
 * Scores keyword relevance (0-1 normalized).
 * Counts unique search term hits in candidate text, capped to prevent
 * common-word inflation.
 */
function scoreKeywords(
  searchTerms: string[],
  candidateText: string,
): { score: number; matchedTerms: string[] } {
  const matched: string[] = []
  for (const term of searchTerms) {
    // Skip very short terms that match everything
    if (term.length < 3) continue
    if (candidateText.includes(term)) {
      matched.push(term)
    }
  }
  // Normalize: cap at 5 unique hits → 1.0
  const score = Math.min(matched.length / 5, 1.0)
  return { score, matchedTerms: matched }
}

// ─── Main Action ────────────────────────────────────────────────────

/**
 * Matches a single CadLab module to suppliers and marketplace listings
 * using a 5-factor scoring system.
 *
 * @param input - Module data including diagnostics-derived process/material
 * @returns Top 8 supplier matches ranked by score (min 15pts)
 */
export async function matchCadLabModuleSuppliers(
  input: CadLabModuleInput,
): Promise<CadLabSupplierMatch[]> {
  const supabase = await createClient()

  const hasProcess = !!input.process
  const hasMaterial = !!input.material
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
      const [suppSemantic, mlSemantic] = await Promise.all([
        supabase.rpc("match_suppliers_semantic", {
          query_embedding: embedding as unknown as string,
          match_threshold: 0.3,
          match_count: 30,
        }),
        supabase.rpc("match_marketplace_listings", {
          query_embedding: JSON.stringify(embedding),
          match_threshold: 0.3,
          match_count: 20,
        }),
      ])

      if (suppSemantic.data) {
        for (const sm of suppSemantic.data) {
          semanticScores.set(sm.id, sm.similarity as number)
        }
      }
      if (mlSemantic.data) {
        for (const ml of mlSemantic.data) {
          semanticScores.set(ml.id, ml.similarity as number)
        }
      }
    }
  } catch (err) {
    console.warn("[CadLabMatch] Semantic matching failed, falling back to keyword-only:", err instanceof Error ? err.message : "Unknown")
  }

  // ── Step 2: Fetch candidate pools ──

  const [{ data: suppliers }, { data: listings }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, description, supplier_type, domain_categories, capabilities, verification_status, community_rating")
      .limit(50),
    supabase
      .from("marketplace_listings")
      .select("id, title, description, attributes, is_verified, subcategory, category")
      .in("category", ["Products", "Services"])
      .limit(50),
  ])

  const matches: CadLabSupplierMatch[] = []

  // ── Step 3: Score suppliers ──

  if (suppliers) {
    for (const supplier of suppliers) {
      const supplierText = `${supplier.name} ${supplier.description || ""} ${(supplier.domain_categories || []).join(" ")}`.toLowerCase()
      const caps = supplier.capabilities as Record<string, unknown> | null

      // Factor 1: Semantic (0-1)
      const semanticRaw = semanticScores.get(supplier.id) ?? 0

      // Factor 2 & 3: Process + Material
      const { processScore, materialScore } = scoreStructuredMatch(
        supplierText,
        supplier.domain_categories || [],
        caps,
        inputProcessKeys,
        inputMaterialKeys,
      )

      // Factor 4: Quality
      const qualityRaw = scoreQuality(
        supplier.verification_status,
        supplier.community_rating ? Number(supplier.community_rating) : null,
      )

      // Factor 5: Keyword
      const { score: keywordRaw } = scoreKeywords(searchTerms, supplierText)

      // Apply weights
      const breakdown: ScoreBreakdown = {
        semantic: Math.round(semanticRaw * weights.semantic * 10) / 10,
        process: Math.round(processScore * weights.process * 10) / 10,
        material: Math.round(materialScore * weights.material * 10) / 10,
        quality: Math.round(qualityRaw * weights.quality * 10) / 10,
        keyword: Math.round(keywordRaw * weights.keyword * 10) / 10,
        total: 0,
      }
      breakdown.total = Math.round(
        (breakdown.semantic + breakdown.process + breakdown.material + breakdown.quality + breakdown.keyword) * 10,
      ) / 10

      if (breakdown.total >= MIN_SCORE_THRESHOLD) {
        // Build human-readable match reasons
        const reasons: string[] = []
        if (breakdown.semantic >= weights.semantic * 0.5) reasons.push("Semantic match")
        if (processScore >= 1.0 && input.process) reasons.push(`Process: ${input.process}`)
        if (materialScore >= 1.0 && input.material) reasons.push(`Material: ${input.material}`)
        if (supplier.domain_categories?.length) {
          reasons.push(...supplier.domain_categories.slice(0, 2))
        }

        const isVerified = supplier.verification_status === "verified" || supplier.verification_status === "community_verified"

        matches.push({
          id: supplier.id,
          name: supplier.name,
          matchScore: breakdown.total,
          scoreBreakdown: breakdown,
          matchReasons: [...new Set(reasons)].slice(0, 3),
          isVerified,
          supplierType: supplier.supplier_type,
        })
      }
    }
  }

  // ── Step 4: Score marketplace listings ──

  if (listings) {
    for (const listing of listings) {
      const listingText = `${listing.title} ${listing.description || ""} ${listing.subcategory || ""}`.toLowerCase()
      const attrs = listing.attributes as Record<string, unknown> | null

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
      const qualityRaw = scoreQuality(
        listing.is_verified ? "verified" : "unverified",
        null,
      )

      // Factor 5: Keyword
      const { score: keywordRaw } = scoreKeywords(searchTerms, listingText)

      const breakdown: ScoreBreakdown = {
        semantic: Math.round(semanticRaw * weights.semantic * 10) / 10,
        process: Math.round(processScore * weights.process * 10) / 10,
        material: Math.round(materialScore * weights.material * 10) / 10,
        quality: Math.round(qualityRaw * weights.quality * 10) / 10,
        keyword: Math.round(keywordRaw * weights.keyword * 10) / 10,
        total: 0,
      }
      breakdown.total = Math.round(
        (breakdown.semantic + breakdown.process + breakdown.material + breakdown.quality + breakdown.keyword) * 10,
      ) / 10

      if (breakdown.total >= MIN_SCORE_THRESHOLD) {
        const reasons: string[] = []
        if (breakdown.semantic >= weights.semantic * 0.5) reasons.push("Semantic match")
        if (processScore >= 1.0 && input.process) reasons.push(`Process: ${input.process}`)
        if (materialScore >= 1.0 && input.material) reasons.push(`Material: ${input.material}`)
        if (listing.subcategory) reasons.push(listing.subcategory)

        matches.push({
          id: listing.id,
          name: listing.title,
          matchScore: breakdown.total,
          scoreBreakdown: breakdown,
          matchReasons: [...new Set(reasons)].slice(0, 3),
          isVerified: listing.is_verified ?? false,
          supplierType: listing.category === "Products" ? "manufacturer" : "service",
        })
      }
    }
  }

  // ── Step 5: Deduplicate by name, keeping higher score ──

  const deduped = new Map<string, CadLabSupplierMatch>()
  for (const m of matches) {
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
