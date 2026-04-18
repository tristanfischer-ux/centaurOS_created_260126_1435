/**
 * @file cad-lab-supplier-match.ts — Multi-factor supplier matching for CadLab modules.
 *
 * @description Server action that matches CadLab modules to marketplace listings
 * using a 9-factor scoring system (100pts total):
 *
 * | Factor             | Max | Source                                             |
 * |--------------------|-----|----------------------------------------------------|
 * | Semantic relevance | 30  | match_marketplace_listings RPC (cosine sim)         |
 * | Process match      | 15  | listing text + subcategory                          |
 * | Material match     | 10  | listing materials + text                            |
 * | Industry match     | 10  | listing industries vs inferred project industry     |
 * | Certifications     | 10  | listing certifications (regulated-industry aligned) |
 * | Keyword relevance  | 10  | text matching on title/description/categories       |
 * | Specialties match  | 7   | listing specialties vs search terms                 |
 * | Capability match   | 5   | process_capabilities JSONB (sparse: 13.7% coverage) |
 * | Quality & trust    | 3   | is_verified flag (sparse: 0.2% coverage)            |
 *
 * REWEIGHT 2026-04-18: Previous weighting (capability 25 + quality 10) produced
 * all scores in the 21–31 range because capability JSONB is only 13.7% populated
 * and is_verified is 0.2%. Added industry/certifications/specialties which read
 * well-populated attribute fields (79–97%), restoring meaningful score spread.
 *
 * When process or material are unavailable on the module input, their points
 * redistribute to semantic + keyword so the total always sums to 100.
 *
 * ATTRIBUTE FALLBACK: top-level columns (industries/specialties/materials/
 * key_equipment) are sparsely populated on `marketplace_listings` (0.8% / 35% /
 * 11% / 5%), but the SAME fields in `attributes` JSONB hit 84%. The scoring pass
 * reads top-level first, then falls back to attributes JSONB.
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
  /**
   * Optional industry tags inferred from the whole project (e.g. ["aerospace"]
   * for a HAPS UAV). When provided, enables industry + certification alignment
   * scoring. When absent, the action infers from the module's own fields
   * (name/purpose/description/keyParts) which is weaker signal.
   */
  projectIndustries?: string[]
}

export interface ScoreBreakdown {
  semantic: number
  process: number
  material: number
  quality: number
  keyword: number
  capability: number
  industry: number
  certifications: number
  specialties: number
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
  // INTENT: Enriched fields surfaced to Supply Risk Radar + NDA gate + Outreach
  // Log. Filled from marketplace_listings columns on the scoring pass. DB coverage
  // varies: country ~58%, email ~39%, website ~65%, MOQ ~2%, lead_time ~5%.
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
  contactEmail?: string | null
  contactName?: string | null
  dataQualityScore?: number | null
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

/** Base weights (when both process and material are specified). Sum = 100. */
const BASE_WEIGHTS = {
  semantic: 30,
  process: 15,
  material: 10,
  keyword: 10,
  industry: 10,
  certifications: 10,
  specialties: 7,
  capability: 5,
  quality: 3,
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
    keyword: BASE_WEIGHTS.keyword + Math.round(redistributable * 0.4),
    industry: BASE_WEIGHTS.industry,
    certifications: BASE_WEIGHTS.certifications,
    specialties: BASE_WEIGHTS.specialties,
    capability: BASE_WEIGHTS.capability,
    quality: BASE_WEIGHTS.quality,
  }
}

// ─── Industry / Certification Alignment ──────────────────────────────
//
// Why: regulated-industry projects (aerospace, medical, defence) demand
// specific certifications (AS9100, ISO 13485, ITAR). The six original
// factors didn't read these signals, so a supplier holding AS9100 for an
// aerospace UAV project scored below a generic CNC shop. This aligns
// scoring with how procurement decisions actually get made.

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  aerospace: ["aerospace", "aviation", "uav", "drone", "haps", "satellite", "space", "aircraft", "avionics"],
  medical: ["medical", "implant", "surgical", "biomedical", "dental", "orthopaedic", "orthopedic"],
  automotive: ["automotive", "vehicle", "ev ", "electric vehicle", "ecu"],
  defence: ["defence", "defense", "military", "tactical", "weapons"],
  energy: ["turbine", "nuclear", "reactor", "wind turbine"],
  consumer: ["consumer electronics", "wearable", "gadget"],
  industrial: ["machine tool", "factory automation", "industrial automation"],
  marine: ["marine", "naval", "submarine"],
}

/** Regulated-industry certification fingerprints. Lower-case substring match. */
const REGULATORY_CERTS: Record<string, string[]> = {
  aerospace: ["as9100", "as 9100", "nadcap", "easa part"],
  medical: ["iso 13485", "iso13485", "fda registered", "ce medical", "mdr"],
  automotive: ["iatf 16949", "iatf16949", "ts 16949", "ts16949"],
  defence: ["itar", "cmmc", "mil-std", "di-mil", "ds ", "dfars"],
  nuclear: ["nqa-1", "asme nqa"],
  food: ["haccp", "fssc 22000", "brc"],
}

/**
 * Infers project-level industry tags from free-text. Used as a fallback when
 * the caller doesn't supply explicit projectIndustries.
 */
function inferIndustriesFromText(text: string): Set<string> {
  const lower = text.toLowerCase()
  const matched = new Set<string>()
  for (const [key, terms] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (terms.some((t) => lower.includes(t))) matched.add(key)
  }
  return matched
}

function scoreIndustryMatch(
  listingIndustries: string[],
  projectIndustries: Set<string>,
): number {
  if (projectIndustries.size === 0 || listingIndustries.length === 0) return 0
  const lowerList = listingIndustries.map((i) => i.toLowerCase())
  let hits = 0
  for (const proj of projectIndustries) {
    const terms = INDUSTRY_KEYWORDS[proj] ?? [proj]
    if (lowerList.some((l) => terms.some((t) => l.includes(t)))) hits++
  }
  return Math.min(hits / projectIndustries.size, 1.0)
}

function scoreCertificationAlignment(
  listingCerts: string[],
  projectIndustries: Set<string>,
): number {
  if (listingCerts.length === 0) return 0
  const lowerCerts = listingCerts.map((c) => c.toLowerCase())
  // Base signal: generic quality cert = partial credit
  let base = 0
  if (lowerCerts.some((c) => c.includes("iso 9001") || c.includes("iso9001"))) base = 0.3
  // Industry-aligned regulated cert = full credit
  if (projectIndustries.size > 0) {
    for (const ind of projectIndustries) {
      const regCerts = REGULATORY_CERTS[ind] ?? []
      if (regCerts.some((rc) => lowerCerts.some((lc) => lc.includes(rc)))) {
        return 1.0
      }
    }
  }
  return base
}

function scoreSpecialtiesMatch(
  listingSpecialties: string[],
  searchTerms: string[],
): number {
  if (listingSpecialties.length === 0 || searchTerms.length === 0) return 0
  const joined = listingSpecialties.map((s) => s.toLowerCase()).join(" ")
  const meaningful = searchTerms.filter((t) => t.length >= 4).slice(0, 10)
  if (meaningful.length === 0) return 0
  let hits = 0
  for (const term of meaningful) {
    if (joined.includes(term)) hits++
  }
  return Math.min(hits / meaningful.length, 1.0)
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
    .select("id, title, description, attributes, is_verified, subcategory, category, process_capabilities, certifications, materials, industries, key_equipment, specialties, country, city, employee_count_exact, founded_year, lead_time, minimum_order, export_controls, security_clearances, website_url, contact_email, contact_name, data_quality_score")
    .in("id", [...candidateIds])

  const matches: CadLabSupplierMatch[] = []

  // ── Step 3: Score marketplace listings ──

  // Resolve project-level industry tags once, before the scoring loop.
  // Prefer caller-supplied projectIndustries; fall back to inference from
  // the module's own fields (name/purpose/description/keyParts/material).
  const projectIndustries: Set<string> = input.projectIndustries && input.projectIndustries.length > 0
    ? new Set(input.projectIndustries.map((i) => i.toLowerCase()))
    : inferIndustriesFromText(
        [input.name, input.purpose, input.description ?? "", input.material ?? "", ...input.keyParts].join(" "),
      )

  if (listings) {
    for (const listing of listings) {
      // INTENT: Read enrichment arrays with fallback to attributes JSONB.
      // Top-level columns are sparsely populated (industries 0.8%, materials
      // 11%, specialties 35%, key_equipment 5%), but the same fields in
      // attributes JSONB hit ~84% coverage. Falling back restores matching
      // power without requiring a data migration.
      const baseAttrs = (listing.attributes as Record<string, unknown>) || {}
      const pickArray = (topLevel: unknown, attrKey: string): string[] => {
        if (Array.isArray(topLevel) && topLevel.length > 0) {
          return topLevel.filter((v): v is string => typeof v === "string")
        }
        const fromAttrs = baseAttrs[attrKey]
        if (Array.isArray(fromAttrs)) {
          return fromAttrs.filter((v): v is string => typeof v === "string")
        }
        return []
      }
      const certsList = pickArray(listing.certifications, "certifications")
      const materialsList = pickArray(listing.materials, "materials")
      const industriesList = pickArray(listing.industries, "industries")
      const keyEquipmentList = pickArray(listing.key_equipment, "key_equipment")
      const specialtiesList = pickArray(listing.specialties, "specialties")

      const enrichmentParts = [
        ...certsList,
        ...materialsList,
        ...industriesList,
        ...keyEquipmentList,
        ...specialtiesList,
      ].join(" ")
      const listingText = `${listing.title || ""} ${listing.description || ""} ${listing.subcategory || ""} ${enrichmentParts}`.toLowerCase()

      // Merge top-level + attrs-fallback into attrs so scoreStructuredMatch sees them
      const attrs: Record<string, unknown> = {
        ...baseAttrs,
        certifications: certsList,
        materials: materialsList,
        industries: industriesList,
        key_equipment: keyEquipmentList,
        specialties: specialtiesList,
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

      // Factor 4: Quality (is_verified only — is_verified=true is 0.2% of listings,
      // so this factor intentionally scored low at weight=3)
      let qualityRaw = scoreQuality(
        listing.is_verified ? "verified" : "unverified",
        null,
      )

      // Factor 5: Keyword (with keyParts for higher-value term matching)
      let { score: keywordRaw } = scoreKeywords(searchTerms, listingText, input.keyParts)

      // Factor 6: Capability (from process_capabilities JSONB — 13.7% populated)
      const caps = (listing.process_capabilities ?? []) as ProcessCapability[]
      const capabilityRaw = scoreCapabilityMatch(
        caps,
        inputProcessKeys,
        input.material,
        input.toleranceMm,
        input.batchSize,
      )

      // Factor 7: Industry match (listing industries vs inferred project industries)
      const industryRaw = scoreIndustryMatch(industriesList, projectIndustries)

      // Factor 8: Certification alignment (regulated-industry cert match)
      const certificationsRaw = scoreCertificationAlignment(certsList, projectIndustries)

      // Factor 9: Specialties match (listing specialties vs search terms)
      const specialtiesRaw = scoreSpecialtiesMatch(specialtiesList, searchTerms)

      // Relevance gate. Now includes industry + cert alignment — an aerospace
      // shop with AS9100 but weak semantic overlap still surfaces.
      const hasRelevance =
        semanticRaw >= 0.3 ||
        processScore >= 1.0 ||
        materialScore >= 1.0 ||
        capabilityRaw > 0 ||
        industryRaw >= 0.5 ||
        certificationsRaw >= 1.0
      if (!hasRelevance) {
        qualityRaw = 0
        keywordRaw = 0
      }

      const breakdown: ScoreBreakdown = {
        semantic: Math.round(semanticRaw * weights.semantic * 10) / 10,
        process: Math.round(processScore * weights.process * 10) / 10,
        material: Math.round(materialScore * weights.material * 10) / 10,
        quality: Math.round(qualityRaw * weights.quality * 10) / 10,
        keyword: Math.round(keywordRaw * weights.keyword * 10) / 10,
        capability: Math.round(capabilityRaw * weights.capability * 10) / 10,
        industry: Math.round(industryRaw * weights.industry * 10) / 10,
        certifications: Math.round(certificationsRaw * weights.certifications * 10) / 10,
        specialties: Math.round(specialtiesRaw * weights.specialties * 10) / 10,
        total: 0,
      }
      breakdown.total = Math.round(
        (breakdown.semantic + breakdown.process + breakdown.material + breakdown.quality +
         breakdown.keyword + breakdown.capability + breakdown.industry +
         breakdown.certifications + breakdown.specialties) * 10,
      ) / 10

      if (breakdown.total >= MIN_SCORE_THRESHOLD) {
        const reasons: string[] = []
        if (breakdown.semantic >= weights.semantic * 0.5) reasons.push("Semantic match")
        if (processScore >= 1.0 && input.process) reasons.push(`Process: ${input.process}`)
        if (materialScore >= 1.0 && input.material) reasons.push(`Material: ${input.material}`)
        if (industryRaw >= 0.5 && projectIndustries.size > 0) {
          const tag = [...projectIndustries][0]
          reasons.push(`Industry: ${tag.charAt(0).toUpperCase() + tag.slice(1)}`)
        }
        if (certificationsRaw >= 1.0) reasons.push("Regulated-industry certs")
        if (capabilityRaw >= 0.4) reasons.push("Verified capabilities")
        if (listing.subcategory) reasons.push(listing.subcategory)

        // Coerce for UI consumption — certsList already includes attributes-JSONB fallback.
        const certsArr = certsList.length > 0 ? certsList : null
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
          contactEmail: listing.contact_email ?? null,
          contactName: listing.contact_name ?? null,
          dataQualityScore: listing.data_quality_score ?? null,
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
