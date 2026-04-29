/**
 * @file cad-lab-supplier-match.ts — Multi-factor supplier matching for CadLab modules.
 *
 * @description Server action that matches CadLab modules to marketplace listings
 * using a 12-factor scoring system (100pts base + up to 21pts bonuses):
 *
 * | Factor              | Max | Source                                              |
 * |---------------------|-----|-----------------------------------------------------|
 * | Semantic relevance  | 30  | match_marketplace_listings RPC (cosine sim)          |
 * | Process match       | 15  | listing text + subcategory                           |
 * | Material match      | 10  | listing materials + text                             |
 * | Industry match      | 10  | listing industries vs inferred project industry      |
 * | Certifications      | 10  | listing certifications (regulated-industry aligned)  |
 * | Keyword relevance   | 10  | text matching on title/description/categories        |
 * | Specialties match   | 7   | listing specialties vs search terms                  |
 * | Capability match    | 5   | process_capabilities JSONB (sparse: 13.7% coverage)  |
 * | Quality & trust     | 3   | is_verified flag (sparse: 0.2% coverage)             |
 * | --- BONUSES (additive, do not replace base weights) ---                  |
 * | Sustainability      | 5   | iso_14001 (1.8% coverage — only field populated)     |
 * | Capacity fit        | 5   | production_capacity text + employee_count_exact      |
 * | Verification trust  | 4   | verification_tier enum + data_quality_score >= 70    |
 * | Region bonus        | 8   | country/country_iso vs brief target market           |
 *
 * REWEIGHT 2026-04-18: Previous weighting (capability 25 + quality 10) produced
 * all scores in the 21–31 range because capability JSONB is only 13.7% populated
 * and is_verified is 0.2%. Added industry/certifications/specialties which read
 * well-populated attribute fields (79–97%), restoring meaningful score spread.
 *
 * ENRICHMENT 2026-04-29: Added sustainability / capacity-fit / verification-trust
 * bonus scores leveraging the freshly-enriched 33k-row supplier DB. All three are
 * ADDITIVE — they do not compress existing weights. Coverage calibration (Services
 * + Products, n=19,928): iso_14001=1.8%, ecovadis/recycled_content=0% (skip),
 * verification_tier only "unverified"/"claimed" (no higher tiers yet), dqs>=70=61%,
 * production_capacity=7.2%, employee_count_exact=1.5%.
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
import { createAdminClient } from "@/lib/supabase/admin"
import { embedText } from "@/lib/search/semantic-search"
import type { TrustedContext } from "@/lib/server-action-utils"

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
  /**
   * Optional target-market hint extracted from the brief (e.g. "United Kingdom",
   * "GB", "Europe"). When provided, listings whose country/country_iso match
   * the market receive a region bonus on top of the 100-pt base score, so a
   * UK-HQ supplier outranks an overseas one on otherwise-equivalent matches.
   * Free text is fine — substring + ISO + region-bucket matching applied.
   */
  targetMarket?: string | null
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
  /**
   * Region bonus (0-8 pts) — added on top of the 100-pt base when a target
   * market is declared on the input and the listing's country matches.
   * Stays at 0 when the brief doesn't declare a target market.
   */
  region: number
  /**
   * Sustainability bonus (0-5 pts) — iso_14001=true awards full 5 pts.
   * ecovadis/recycled_content are 0% populated in DB (2026-04-29 audit) and
   * intentionally omitted from scoring until the DB is enriched.
   */
  sustainability: number
  /**
   * Capacity fit bonus (0-5 pts) — checks production_capacity text against
   * a rough scale bucket derived from the module's batchSize field.
   * Coverage: 7.2% of rows have production_capacity text (2026-04-29 audit).
   */
  capacityFit: number
  /**
   * Verification trust bonus (0-4 pts) — verification_tier enum + dqs>=70.
   * DB currently has only "unverified" (91%) and "claimed" (9%) tiers;
   * higher tiers ("verified", "premium") reserved for when enrichment adds them.
   */
  verificationTrust: number
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
  // ENRICHMENT 2026-04-29: New fields from the 33k-row DB enrichment pass.
  // Coverage: iso_14001=1.8%, verification_tier=100% (all "unverified"/"claimed"),
  // key_people=100% (all rows populated), lead_time=5.3%.
  iso14001?: boolean | null
  verificationTier?: string | null
  keyPeople?: Array<{ name?: string; title?: string }> | null
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

// L9-P4 (2026-04-26): bumped 15 → 30 to align with the PDF render's
// "BELOW NOISE FLOOR" cliff. Pre-bump, 228 of 617 shortlist rows
// across the 6 demos were <30 (Hedgerow 88%, Vertfarm 71%) — they were
// labelled "BELOW NOISE FLOOR" in the PDF but still in the cover-stat
// count. Founders saw "65 suppliers" then opened the section and got
// 5 real matches plus 60 disclaimers. Drop them at the source.
const MIN_SCORE_THRESHOLD = 30
const MAX_RESULTS = 8

// ─── URL Shape Filter ────────────────────────────────────────────────
//
// Why: the marketplace_listings table is enriched from web crawls, and
// many rows are blog articles, university research pages, industry
// guidebooks, or news/press posts that semantically embed close to real
// supplier pages. They have no business in a procurement shortlist.
// Observed across all five 2026-04-25 demo PDFs:
//   pyrophobic.com/blog/thermal-runaway-mitigation-and-containment/
//   uwyo.edu/.../argus-system.html
//   ledinside.com/press/2017/...
//   atlas-scientific.com/blog/nutrient-dosing-systems/
// Founders read these as legitimate suppliers and try to contact them.
//
// The filter is applied at candidate-fetch time so non-supplier URLs
// never enter the scoring loop — both faster and harder to bypass.

const NON_SUPPLIER_URL_PATH_PATTERNS = [
  "/blog/",
  "/blogs/",
  "/news/",
  "/press/",
  "/press-release",
  "/article/",
  "/articles/",
  "/guide/",
  "/guides/",
  "/whitepaper",
  "/case-study",
  "/case-studies",
  "/learn/",
  "/help/",
  "/faq/",
  "/wiki/",
  "/research/",
  "/papers/",
  "/post/",
  "/posts/",
  // L9-P4 (2026-04-26): marketplace + listicle + product-category gaps.
  // Caught Takoma listicle, Pumpkinspace store page, Fuspan
  // product-category, Grelly/eBay item pages, sensorsandtransmitters
  // guide-suffix slugs, Poeppelmann pharma-vessel deep page.
  "/store/",
  "/shop/",
  "/product-category/",
  "/product-categories/",
  "/category/",
  "/categories/",
  "/collections/",
  "/itm/", // eBay-style aggregator item path
  "-guide-", // article-slug pattern: "co2-fertilisation-guide-to-..."
  "-guide.",
  "-guide/",
  "/top-", // listicle pattern: "/top-10-...-manufacturers-in-uk/"
  "manufacturers-in-",
  "best-cnc-",
  "best-suppliers-",
] as const

const NON_SUPPLIER_TLD_PATTERNS = [
  ".edu",
  ".edu.",
  ".ac.uk",
  ".ac.",
  ".gov",
  ".gov.uk",
  "wikipedia.org",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "medium.com",
  "substack.com",
  "wordpress.com",
  // L9-P4: marketplace aggregators that index third-party listings.
  // Founders need direct supplier homepages, not marketplace stalls.
  "grelly.",
  "grelly.uk",
  "made-in-china.com",
  "madeinchina.com",
  "globalsources.com",
  "indiamart.com",
  "alibaba.com",
] as const

/**
 * Returns true if the URL points at a non-manufacturer surface — blog,
 * article, news, university research, government page, or major content
 * platform. False if the URL looks like a supplier homepage or product
 * page.
 *
 * Conservative: returns false (allow) for unknown shapes so we never drop
 * a legitimate supplier whose URL we can't classify.
 */
function isNonSupplierUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  for (const tld of NON_SUPPLIER_TLD_PATTERNS) {
    if (lower.includes(tld)) return true
  }
  for (const path of NON_SUPPLIER_URL_PATH_PATTERNS) {
    if (lower.includes(path)) return true
  }
  return false
}

// ─── Region Match ────────────────────────────────────────────────────
//
// Why: when a brief specifies "United Kingdom market", a UK-domiciled
// supplier should rank above an otherwise-equivalent overseas one.
// Currently a Chinese wholesaler and a UK supplier with identical
// semantic scores rank together — bad procurement signal.
//
// Region match is awarded as a bonus on top of the 100-pt base score
// rather than redistributing weights, because not every brief has a
// declared market and we don't want missing-market projects to score
// systematically lower.

const REGION_BONUS_MAX_POINTS = 8

/**
 * Scores how well a listing's country/country_iso aligns with a target
 * market. Returns 0-1 normalized.
 *
 * targetMarket can be a free-text market label ("United Kingdom",
 * "Europe", "United States"), an ISO-2 country code ("GB", "US"), or
 * a comma-separated list. Listing country values come in both shapes
 * across the corpus, so we match leniently on substring / ISO match.
 */
function scoreRegionMatch(
  listingCountry: string | null | undefined,
  listingCountryIso: string | null | undefined,
  targetMarket: string | null | undefined,
): number {
  if (!targetMarket) return 0
  const target = targetMarket.toLowerCase().trim()
  if (target.length === 0) return 0
  const country = (listingCountry ?? "").toLowerCase().trim()
  const iso = (listingCountryIso ?? "").toLowerCase().trim()
  if (country.length === 0 && iso.length === 0) return 0

  // Exact ISO-2 match (e.g. target="GB", iso="GB")
  if (iso.length === 2 && target.includes(iso)) return 1.0
  if (country.length === 2 && target.includes(country)) return 1.0

  // Free-text substring (e.g. target="United Kingdom market", country="United Kingdom")
  if (country.length >= 3 && target.includes(country)) return 1.0
  if (country.length >= 3 && country.includes(target.replace(/\s+market$/i, ""))) return 1.0

  // Region buckets — close-but-not-exact partial credit.
  const REGION_BUCKETS: Record<string, string[]> = {
    europe: ["gb", "united kingdom", "uk", "ireland", "germany", "france", "spain", "italy", "netherlands", "belgium", "sweden", "denmark", "finland", "poland", "portugal", "austria", "switzerland", "norway"],
    "north america": ["us", "united states", "usa", "canada", "mexico"],
    asia: ["china", "japan", "south korea", "korea", "taiwan", "singapore", "india", "vietnam", "thailand", "malaysia"],
  }
  for (const [bucket, members] of Object.entries(REGION_BUCKETS)) {
    if (target.includes(bucket)) {
      if (members.some((m) => country.includes(m) || iso === m)) return 0.5
    }
  }
  return 0
}

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

import { INDUSTRY_KEYWORDS, inferIndustriesFromText } from "@/lib/cad-lab/infer-industries"
// ^ Imported here so this file can keep using INDUSTRY_KEYWORDS locally. The
//   inferIndustriesFromText helper is also re-exported further down for
//   existing callers that already import it from this path — but the real
//   implementation lives in the plain lib module (this file is "use server"
//   and may only export async functions).

/** Regulated-industry certification fingerprints. Lower-case substring match. */
const REGULATORY_CERTS: Record<string, string[]> = {
  aerospace: ["as9100", "as 9100", "nadcap", "easa part"],
  medical: ["iso 13485", "iso13485", "fda registered", "ce medical", "mdr"],
  automotive: ["iatf 16949", "iatf16949", "ts 16949", "ts16949"],
  defence: ["itar", "cmmc", "mil-std", "di-mil", "ds ", "dfars"],
  nuclear: ["nqa-1", "asme nqa"],
  food: ["haccp", "fssc 22000", "brc"],
}

// inferIndustriesFromText lives in @/lib/cad-lab/infer-industries — imported
// above. Downstream callers that previously imported it from this file should
// migrate to the lib path; no re-export here because "use server" forbids it.

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

// ─── Enrichment Bonus Scores (additive — do not compress BASE_WEIGHTS) ─────
//
// These three functions score the new fields from the 2026-04-29 DB enrichment
// pass. They return raw pts (not 0-1 normalised) because they are bonuses added
// directly to the total rather than multiplied by a weight. Callers add the
// return value to ScoreBreakdown directly.
//
// Coverage calibration (Services+Products, n=19,928):
//   iso_14001      = 1.8%  populated (368 true rows)
//   ecovadis_score = 0%    — field exists but not yet enriched; skip
//   recycled_%     = 0%    — field exists but not yet enriched; skip
//   verification_tier: "unverified"=91%, "claimed"=9%; no higher tiers yet
//   data_quality_score >= 70 = 61% of rows
//   production_capacity text = 7.2% of rows
//   employee_count_exact     = 1.5% of rows (too sparse for hard rules)

/**
 * Sustainability bonus (0-5 pts additive).
 *
 * Awards 5 pts when iso_14001=true. ecovadis_score and recycled_content_percent
 * are intentionally excluded — both fields are 0% populated as of 2026-04-29.
 * When they are enriched, add: +2 if ecovadis_score >= 60, +1 if recycled >= 30,
 * cap total at 5.
 *
 * Only fires when the project does NOT explicitly deprioritise sustainability
 * (checked via a simple flag the caller passes — defaults to true = award score).
 */
function scoreSustainability(
  iso14001: boolean | null | undefined,
  awardSustainability: boolean,
): number {
  if (!awardSustainability) return 0
  let pts = 0
  if (iso14001 === true) pts += 5
  // ecovadis_score / recycled_content_percent: skip — 0% coverage in DB (2026-04-29)
  return Math.min(pts, 5)
}

/**
 * Capacity fit bonus (0-5 pts additive).
 *
 * Compares a rough scale bucket (derived from the module's batchSize or the
 * brief's target_scale field) against production_capacity text + employee_count_exact.
 * A keyword-bucket approach is intentional — production_capacity is free text
 * and only 7.2% populated. Mis-match = 0; match = 5; no partial credit.
 *
 * Scale buckets:
 *   prototype  → supplier capacity text contains "prototype" / "low-volume" / "small-batch" OR employee_count < 50
 *   pilot      → "pilot" / "low-volume" / "small batch" in capacity text
 *   production → "mass production" / "high-volume" / "large-scale" / employee_count > 200
 */
function scoreCapacityFit(
  productionCapacity: string | null | undefined,
  employeeCountExact: number | null | undefined,
  batchSize: string | null | undefined,
): number {
  if (!batchSize) return 0
  const cap = (productionCapacity ?? "").toLowerCase()
  const batch = batchSize.toLowerCase()
  const emp = employeeCountExact ?? null

  // Determine the requested scale bucket
  const wantsPrototype = batch.includes("prototype") || batch.includes("low") || batch.includes("sample")
  const wantsProduction = batch.includes("production") || batch.includes("10k") || batch.includes("10000") || batch.includes("high")
  const wantsPilot = batch.includes("pilot") || batch.includes("100") || batch.includes("1000")

  // Score against capacity text (primary signal)
  if (cap.length > 0) {
    if (wantsPrototype && (cap.includes("prototype") || cap.includes("low-volume") || cap.includes("small batch") || cap.includes("low volume"))) return 5
    if (wantsPilot && (cap.includes("pilot") || cap.includes("low-volume") || cap.includes("small batch"))) return 5
    if (wantsProduction && (cap.includes("mass production") || cap.includes("high-volume") || cap.includes("high volume") || cap.includes("large-scale"))) return 5
  }
  // Fallback: employee_count heuristic (1.5% coverage but worth using)
  if (emp !== null) {
    if (wantsPrototype && emp < 50) return 5
    if (wantsProduction && emp > 200) return 5
  }
  return 0
}

/**
 * Verification trust bonus (0-4 pts additive).
 *
 * verification_tier enum: "verified"=3, "claimed"=2, "unverified"=0.
 * An additional +1 if data_quality_score >= 70.
 *
 * DB state as of 2026-04-29: only "unverified" and "claimed" tiers exist.
 * "verified" and "premium" tiers are reserved for future enrichment passes.
 * Max currently achievable in practice: "claimed" (2) + dqs>=70 (1) = 3 pts.
 */
function scoreVerificationTrust(
  verificationTier: string | null | undefined,
  dataQualityScore: number | null | undefined,
): number {
  let pts = 0
  switch (verificationTier) {
    case "verified":
    case "premium":
      pts += 3
      break
    case "claimed":
      pts += 2
      break
    case "unverified":
    default:
      pts += 0
      break
  }
  if (typeof dataQualityScore === "number" && dataQualityScore >= 70) pts += 1
  return Math.min(pts, 4)
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
  trusted?: TrustedContext,
): Promise<CadLabSupplierMatch[]> {
  // AUTH: reject unauthenticated callers. Returning [] rather than throwing
  // because the caller (source/page.tsx) treats error as "no matches" and
  // this endpoint would otherwise be a public embedding-cost vector.
  // TRUSTED BYPASS: Background specialists (Supplier Match autopilot stage)
  // pass `trusted` with a verified userId + foundryId resolved upstream.
  // In that case we skip the cookie read and use an admin client — the
  // trusted context proves the caller has already verified identity.
  let supabase: Awaited<ReturnType<typeof createClient>>
  if (trusted) {
    supabase = createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>
  } else {
    supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.warn("[CadLabMatch] Rejected unauthenticated request")
      return []
    }
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
        // Filter Finance/People/AI rows at the semantic-score stage so they
        // don't waste slots in the match_count=50 budget. The RPC has no
        // category-filter param (v1), so we apply it here. This means only
        // Products and Services rows populate semanticScores and candidateIds,
        // preventing VC funds from outranking manufacturers on semantic score
        // alone. (The rawListings fetch below also filters by category — this
        // is defence-in-depth at the score-map level.)
        // Loop 26 P6: Finance rows were filling top-50 semantic slots and
        // displacing real manufacturers from candidateIds entirely.
        for (const ml of mlSemantic) {
          if (ml.category === "Products" || ml.category === "Services") {
            semanticScores.set(ml.id, ml.similarity as number)
          }
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
  //
  // SHIP-BLOCKER FIX (2026-04-24): `match_marketplace_listings` RPC returns
  // results across ALL categories by embedding similarity alone. VC funds
  // and PE firms (category='Finance') with prospectus text mentioning
  // "invests in battery storage" routinely beat actual manufacturers on
  // semantic score and populate the supplier shortlist with investors.
  // Observed in 2026-04-23 BESS PDF where 11/11 "suppliers" were funds.
  // Filter category to Products/Services at the candidate-fetch step so
  // Finance/People/AI rows never enter the scoring loop.
  // Loop 8 supplier-field-coverage audit (Tristan-flagged 2026-04-26):
  // previously we read 26 of marketplace_listings' ~50 columns. Adding
  // the high-impact missing fields:
  //   products             — what they actually make (top semantic signal)
  //   production_capacity  — scale fit for high-volume projects
  //   quality_systems      — supplier's QMS narrative
  //   iso_14001 / ecovadis_score / carbon_disclosed / recycled_content_percent
  //                        — sustainability credentials
  //   enrichment_quality   — pre-computed confidence multiplier
  //   address              — full street, beyond country+city
  //   contact_phone / contact_linkedin / contact_title — outreach beyond email
  //   key_people           — named contacts
  //   average_rating / review_count — marketplace-side quality signal
  // NOTE: keep this select as a SINGLE literal string. Supabase types
  // parse the literal at compile time; line-broken concatenation falls
  // back to GenericStringError and every column access TS-fails.
  const { data: rawListings } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, attributes, is_verified, subcategory, category, process_capabilities, certifications, materials, industries, key_equipment, specialties, country, country_iso, city, address, employee_count_exact, founded_year, lead_time, minimum_order, export_controls, security_clearances, website_url, contact_email, contact_name, contact_title, contact_phone, contact_linkedin, data_quality_score, products, production_capacity, quality_systems, key_people, iso_14001, ecovadis_score, carbon_disclosed, recycled_content_percent, enrichment_quality, average_rating, review_count, verification_tier")
    .in("id", [...candidateIds])
    .in("category", ["Products", "Services"])

  // SHIP-BLOCKER FIX (2026-04-25): drop listings whose website_url shape is
  // a blog, news/press, university research, government page, or major
  // content platform. The marketplace_listings corpus contains these because
  // crawls don't distinguish between manufacturer homepages and editorial
  // pages on the same domain — the embedding similarity then ranks them
  // alongside actual suppliers. See NON_SUPPLIER_URL_PATH_PATTERNS for the
  // full list and the comment block above isNonSupplierUrl().
  //
  // Loop 8 G3 (2026-04-26): also drop listings whose TITLE looks like a
  // product page ("FR4 Sheet Manufacturer", "Liquid Cooling Unit for
  // Battery Energy Storage System Rack"), news headline ("Tower makes
  // Ramon rad-hard processor"), academic-paper title, or marketing
  // tagline ("Unleash Precision with RS485 Soil EC and pH Sensor"). The
  // shape filter for names lives in src/lib/supplier-verification.ts;
  // applying it here means hallucinated rows never enter the shortlist
  // (vs the render-layer filter shipped in 290454be which only stops
  // them appearing in the PDF).
  // ── Fix 2 (audit Fix 2, 2026-04-27): hard-filter via supplier_capabilities ──
  //
  // The 11,647-row supplier_capabilities table has structured per-process
  // records (process_category, materials_worked, tolerance_min_mm, batch ranges)
  // linked to marketplace_listings via listing_id FK. The old scorer read only
  // the sparse process_capabilities JSONB on the listing row (13.7% populated),
  // giving the capability dimension almost no signal.
  //
  // This step fetches supplier_capabilities for the candidate set and:
  //   1. Builds a boosted-ID set: any listing that has a capability record
  //      matching the module's normalised process gets a hard boost in Factor 6
  //      (capability score multiplied by 3× — from 5 max points to 15).
  //   2. Builds a hard-reject set: when the module declares both a specific
  //      process AND a tolerance, any listing whose BEST matching capability row
  //      has tolerance_min_mm > requiredTolerance is hard-rejected before
  //      scoring (can never achieve the declared precision).
  //
  // Soft-scored listings with NO capability rows are unaffected (same as
  // before). The 13.7%-populated JSONB cap column is still used as Factor 6
  // fallback for those rows.
  //
  // Query is batched against the already-filtered candidateIds (≤100 rows),
  // not the full 11,647-row table — no table-scan risk.
  //
  // On any error the sets stay empty and scoring falls through to existing logic.

  // Normalised process keys already available: inputProcessKeys
  // Map supplier_capabilities.process_category → our internal key names
  const CAP_PROCESS_MAP: Record<string, string[]> = {
    cnc_machining: ["cnc_milling", "cnc_turning"],
    sheet_metal: ["sheet_metal_bending"],
    additive_manufacturing: ["fdm", "sla", "sls", "dmls"],
    injection_moulding: ["injection_molding"],
    welding: ["mig_welding", "tig_welding"],
    laser_cutting: ["laser_cutting"],
    waterjet: ["waterjet_cutting"],
    casting: ["die_casting", "investment_casting", "sand_casting"],
  }

  const capabilityBoostedIds = new Set<string>()   // listing_id has matching cap row
  const capabilityHardRejectIds = new Set<string>() // listing_id cannot meet tolerance

  if (candidateIds.size > 0 && inputProcessKeys.size > 0) {
    try {
      const adminForCaps = createAdminClient()
      const { data: capRows } = await adminForCaps
        .from("supplier_capabilities")
        .select("listing_id, process_category, materials_worked, tolerance_min_mm")
        .in("listing_id", [...candidateIds])
        .limit(500)

      if (capRows && capRows.length > 0) {
        // Build a map: listing_id → best matching capability rows
        const capByListing = new Map<string, typeof capRows>()
        for (const row of capRows) {
          const lid = row.listing_id as string
          if (!capByListing.has(lid)) capByListing.set(lid, [])
          capByListing.get(lid)!.push(row)
        }

        for (const [listingId, caps] of capByListing) {
          // Check if any cap row matches one of our input process keys
          const matchingCaps = caps.filter((cap) => {
            const capProcessKey = cap.process_category as string | null
            if (!capProcessKey) return false
            // Direct match against internal key
            if (inputProcessKeys.has(capProcessKey)) return true
            // Mapped match (e.g. "cnc_machining" → ["cnc_milling","cnc_turning"])
            const mappedKeys = CAP_PROCESS_MAP[capProcessKey] ?? []
            return mappedKeys.some((k) => inputProcessKeys.has(k))
          })

          if (matchingCaps.length > 0) {
            capabilityBoostedIds.add(listingId)

            // Hard reject: when the module declares a tolerance AND all matching
            // caps have tolerance_min_mm > requiredTolerance, reject outright.
            // Only reject when we have a SPECIFIC tolerance requirement (not null).
            if (input.toleranceMm != null && input.toleranceMm > 0) {
              const bestTolerance = Math.min(
                ...matchingCaps
                  .map((c) => c.tolerance_min_mm)
                  .filter((v): v is number => typeof v === "number" && v > 0),
              )
              if (Number.isFinite(bestTolerance) && bestTolerance > input.toleranceMm) {
                capabilityHardRejectIds.add(listingId)
              }
            }
          }
        }
        console.info(
          `[CadLabMatch:fix2] supplier_capabilities: boosted=${capabilityBoostedIds.size} hard-rejected=${capabilityHardRejectIds.size} (of ${candidateIds.size} candidates)`,
        )
      }
    } catch (capErr) {
      // Non-fatal — soft scoring continues without capability hard-filter
      console.warn("[CadLabMatch:fix2] supplier_capabilities fetch failed (non-fatal):", capErr instanceof Error ? capErr.message : capErr)
    }
  }

  const { looksLikeHallucinatedSupplierName: nameCheck } = await import(
    "@/lib/supplier-verification"
  )
  const listings = (rawListings ?? []).filter((l) => {
    if (isNonSupplierUrl(l.website_url)) return false
    if (typeof l.title === "string" && nameCheck(l.title).bad) return false
    // Fix 2: drop listings that provably cannot meet the declared tolerance
    if (capabilityHardRejectIds.has(l.id)) return false
    return true
  })
  const droppedNonSupplierCount = (rawListings?.length ?? 0) - listings.length
  if (droppedNonSupplierCount > 0) {
    console.info(
      `[CadLabMatch] Dropped ${droppedNonSupplierCount} non-supplier candidates (URL shape OR product-title name pattern)`,
    )
  }

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

  for (const listing of listings) {
    {
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
      // Loop 8 (Tristan-flagged 2026-04-26): pull `products` into the
      // semantic-match text. Was previously read at all — now becomes
      // a top-tier signal alongside specialties + key_equipment because
      // it's literally what the supplier makes.
      const productsList = pickArray(listing.products, "products")

      const enrichmentParts = [
        ...certsList,
        ...materialsList,
        ...industriesList,
        ...keyEquipmentList,
        ...specialtiesList,
        ...productsList,
      ].join(" ")
      // Quality narrative + production-capacity context — when present,
      // they materially help the keyword scorer match scale-relevant
      // terms ("ISO 9001 manufacturing", "10,000+ units/month").
      const qualityNarrative = `${listing.quality_systems ?? ""} ${listing.production_capacity ?? ""}`.trim()
      const listingText = `${listing.title || ""} ${listing.description || ""} ${listing.subcategory || ""} ${enrichmentParts} ${qualityNarrative}`.toLowerCase()

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
      // Fix 2 (audit Fix 2, 2026-04-27): when supplier_capabilities table has a
      // matching structured record for this listing, the raw score is multiplied
      // by 3 (from max 5pt → max 15pt effective weight). This converts the
      // previously near-useless capability dimension into a meaningful signal for
      // suppliers that have been fully profiled in the structured capabilities table.
      const caps = (listing.process_capabilities ?? []) as ProcessCapability[]
      const capabilityRawBase = scoreCapabilityMatch(
        caps,
        inputProcessKeys,
        input.material,
        input.toleranceMm,
        input.batchSize,
      )
      // Structured capability boost: 3× multiplier for listings with a verified
      // supplier_capabilities record matching the process. Floor at 0.33 (1/3) so
      // that even a marginal base score registers a meaningful boost.
      const capabilityRaw = capabilityBoostedIds.has(listing.id)
        ? Math.max(capabilityRawBase, 0.33) * 3
        : capabilityRawBase

      // Factor 7: Industry match (listing industries vs inferred project industries)
      const industryRaw = scoreIndustryMatch(industriesList, projectIndustries)

      // Factor 8: Certification alignment (regulated-industry cert match)
      const certificationsRaw = scoreCertificationAlignment(certsList, projectIndustries)

      // Factor 9: Specialties match (listing specialties vs search terms)
      const specialtiesRaw = scoreSpecialtiesMatch(specialtiesList, searchTerms)

      // Factor 10: Region match (bonus, only when brief declares target market)
      const regionRaw = scoreRegionMatch(
        listing.country,
        listing.country_iso,
        input.targetMarket,
      )

      // Bonus 1: Sustainability (additive, 0-5 pts)
      // awardSustainability=true unless caller explicitly opts out (no mechanism yet)
      const sustainabilityPts = scoreSustainability(
        listing.iso_14001,
        true,
      )

      // Bonus 2: Capacity fit (additive, 0-5 pts)
      const capacityFitPts = scoreCapacityFit(
        listing.production_capacity,
        listing.employee_count_exact,
        input.batchSize,
      )

      // Bonus 3: Verification trust (additive, 0-4 pts)
      const verificationTrustPts = scoreVerificationTrust(
        listing.verification_tier,
        listing.data_quality_score,
      )

      // Relevance gate. Now includes industry + cert alignment — an aerospace
      // shop with AS9100 but weak semantic overlap still surfaces.
      // SEMANTIC-ONLY FLOOR: a high semantic score alone (without process /
      // material / capability / industry / cert overlap) is a weak signal —
      // it just means the page text reads like the module description.
      // Without one of the structured signals, the listing might be a
      // tangentially-related product. Require structured corroboration.
      const hasStructuredSignal =
        processScore >= 1.0 ||
        materialScore >= 1.0 ||
        capabilityRaw > 0 ||
        industryRaw >= 0.5 ||
        certificationsRaw >= 1.0 ||
        specialtiesRaw > 0
      const hasRelevance = hasStructuredSignal || semanticRaw >= 0.5
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
        region: Math.round(regionRaw * REGION_BONUS_MAX_POINTS * 10) / 10,
        sustainability: sustainabilityPts,
        capacityFit: capacityFitPts,
        verificationTrust: verificationTrustPts,
        total: 0,
      }
      breakdown.total = Math.round(
        (breakdown.semantic + breakdown.process + breakdown.material + breakdown.quality +
         breakdown.keyword + breakdown.capability + breakdown.industry +
         breakdown.certifications + breakdown.specialties + breakdown.region +
         breakdown.sustainability + breakdown.capacityFit + breakdown.verificationTrust) * 10,
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
        if (regionRaw >= 1.0 && input.targetMarket) {
          reasons.push(`In ${input.targetMarket}`)
        } else if (regionRaw > 0 && input.targetMarket) {
          reasons.push(`Regional fit: ${input.targetMarket}`)
        }
        if (listing.subcategory) reasons.push(listing.subcategory)

        // Coerce for UI consumption — certsList already includes attributes-JSONB fallback.
        const certsArr = certsList.length > 0 ? certsList : null
        const clearancesArr = Array.isArray(listing.security_clearances)
          ? (listing.security_clearances as unknown[]).filter((c): c is string => typeof c === "string")
          : null

        // key_people: 100% populated (all 19,928 rows have this field).
        // Surface top 2 contacts for outreach use.
        const rawKeyPeople = listing.key_people as unknown
        const keyPeopleArr: Array<{ name?: string; title?: string }> | null =
          Array.isArray(rawKeyPeople)
            ? (rawKeyPeople as Array<Record<string, unknown>>)
                .slice(0, 2)
                .map((p) => ({ name: p.name as string | undefined, title: p.title as string | undefined }))
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
          iso14001: listing.iso_14001 ?? null,
          verificationTier: listing.verification_tier ?? null,
          keyPeople: keyPeopleArr,
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
