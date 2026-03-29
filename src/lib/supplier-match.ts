/**
 * @file supplier-match.ts
 *
 * @description Deterministic 0–100 match scoring for marketplace suppliers/services
 * against a company's profile, gaps, objectives, and Forge project needs.
 * Pure functions — no "use server", no DB calls. All data passed in.
 *
 * Scoring factors:
 *   Industry alignment   (25pts) — supplier industries vs company industry/sector
 *   Gap coverage         (25pts) — supplier fills a critical/non-critical business function gap
 *   Manufacturing fit    (20pts) — process capabilities match Forge project diagnostics
 *   Stage fit            (10pts) — supplier size/minimums appropriate for company stage
 *   Certification match  (10pts) — supplier holds certs relevant to company's industry
 *   Quality & trust      (10pts) — verified, data quality score, ratings
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyMatchProfile {
  industry: string | null
  sector: string | null
  stage: string | null
  /** Manufacturing processes needed (from Forge project diagnostics) */
  processes: string[]
  /** Materials needed (from Forge project diagnostics) */
  materials: string[]
  /** Critical business function gaps */
  criticalGaps: { category: string; name: string }[]
  /** Non-critical gaps */
  nonCriticalGaps: { category: string; name: string }[]
  /** Active objective titles for keyword matching */
  objectives: string[]
  /** Active task titles for keyword matching */
  tasks: string[]
  /** Certifications the company likely needs based on industry */
  certNeeds: string[]
  /** Forge project descriptions for context */
  projectDescriptions: string[]
}

export interface SupplierListing {
  id: string
  title: string
  description: string
  category: string
  subcategory: string
  industries: string[] | null
  process_capabilities: Record<string, unknown>[] | null
  materials: string[] | null
  certifications: string[] | null
  key_equipment: string[] | null
  specialties: string[] | null
  company_size: string | null
  minimum_order: string | null
  is_verified: boolean
  data_quality_score: number | null
  average_rating: number | null
  attributes: Record<string, unknown> | null
  contact_email: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_linkedin: string | null
  city: string | null
  country: string | null
}

export interface SupplierMatchBreakdown {
  total: number
  industryScore: number
  gapScore: number
  manufacturingScore: number
  stageScore: number
  certScore: number
  qualityScore: number
  topFactors: string[]
}

// ---------------------------------------------------------------------------
// Industry certification mapping
// ---------------------------------------------------------------------------

// INTENT: Map common industries to the certifications they typically require.
// Used when the company hasn't explicitly stated cert needs.
const INDUSTRY_CERTS: Record<string, string[]> = {
  medical: ['iso 13485', 'iso 14971', 'fda', 'mdd', 'mdr', 'ce marking'],
  aerospace: ['as9100', 'nadcap', 'iso 9100'],
  automotive: ['iatf 16949', 'iso 26262', 'ppap'],
  defence: ['iso 27001', 'itar', 'sc21', 'nato'],
  food: ['brc', 'iso 22000', 'haccp', 'salsa'],
  electronics: ['iec 61508', 'ul', 'rohs', 'reach', 'weee'],
  general: ['iso 9001', 'iso 14001'],
}

// INTENT: Map gap categories to marketplace categories/subcategories for matching.
const GAP_TO_MARKETPLACE: Record<string, { categories: string[]; keywords: string[] }> = {
  finance: { categories: ['Services'], keywords: ['finance', 'cfo', 'accounting', 'bookkeeping', 'financial'] },
  legal: { categories: ['Services'], keywords: ['legal', 'lawyer', 'solicitor', 'compliance', 'ip', 'patent'] },
  hr: { categories: ['Services', 'People'], keywords: ['hr', 'recruitment', 'people', 'talent', 'payroll'] },
  marketing: { categories: ['Services', 'People'], keywords: ['marketing', 'brand', 'pr', 'communications', 'growth'] },
  sales: { categories: ['Services', 'People'], keywords: ['sales', 'business development', 'revenue', 'commercial'] },
  operations: { categories: ['Services'], keywords: ['operations', 'supply chain', 'logistics', 'procurement'] },
  product: { categories: ['Services', 'People'], keywords: ['product', 'design', 'ux', 'engineering', 'cto'] },
  engineering: { categories: ['Products', 'Services'], keywords: ['engineering', 'manufacturing', 'cnc', 'machining'] },
  strategy: { categories: ['People'], keywords: ['strategy', 'advisor', 'mentor', 'non-executive', 'ned'] },
}

// INTENT: Map company stage to appropriate supplier sizes. Early-stage companies
// need suppliers that accept small orders; growth companies need larger operations.
const STAGE_SIZE_FIT: Record<string, string[]> = {
  pre_seed: ['1-10', '11-50', 'micro', 'small'],
  seed: ['1-10', '11-50', '51-200', 'micro', 'small', 'medium'],
  series_a: ['11-50', '51-200', '201-500', 'small', 'medium'],
  series_b: ['51-200', '201-500', '501-1000', 'medium', 'large'],
  growth: ['201-500', '501-1000', '1001-5000', 'large'],
  late_stage: ['501-1000', '1001-5000', '5001+', 'large', 'enterprise'],
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/[_-]+/g, ' ')
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalise(needle)
  const h = normalise(haystack)
  return h.includes(n) || n.includes(h)
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Calculates a deterministic 0–100 match score for a supplier against a company profile.
 */
export function calculateSupplierMatchScore(
  listing: SupplierListing,
  profile: CompanyMatchProfile
): SupplierMatchBreakdown {
  const topFactors: string[] = []

  // Track which sections have data for weight redistribution
  const hasProjects = profile.processes.length > 0 || profile.materials.length > 0
  const hasGaps = profile.criticalGaps.length > 0 || profile.nonCriticalGaps.length > 0
  const hasIndustry = !!profile.industry || !!profile.sector

  // Weight redistribution when sections are empty
  let industryMax = 25
  let gapMax = 25
  let mfgMax = 20

  if (!hasProjects) {
    // Redistribute manufacturing pts
    industryMax += hasIndustry ? 12 : 0
    gapMax += hasGaps ? 8 : 0
    mfgMax = 0
  }
  if (!hasGaps) {
    industryMax += hasIndustry ? Math.floor(gapMax * 0.6) : 0
    mfgMax += hasProjects ? Math.floor(gapMax * 0.4) : 0
    gapMax = 0
  }
  if (!hasIndustry) {
    mfgMax += hasProjects ? Math.floor(industryMax * 0.5) : 0
    gapMax += hasGaps ? Math.floor(industryMax * 0.5) : 0
    industryMax = 0
  }

  // 1. Industry alignment (up to industryMax pts)
  // INTENT: ~70% of suppliers have industries[], ~60% have specialties[].
  // Search both, plus description, for maximum coverage.
  let industryScore = 0
  if (hasIndustry) {
    const companyTerms = [profile.industry, profile.sector].filter(Boolean).map(s => normalise(s!))
    const supplierIndustries = (listing.industries ?? []).map(normalise)
    const supplierSpecialties = (listing.specialties ?? []).map(normalise)
    const descNorm = normalise(listing.description || '')

    let matches = 0
    for (const term of companyTerms) {
      if (
        supplierIndustries.some(si => fuzzyMatch(term, si)) ||
        supplierSpecialties.some(sp => fuzzyMatch(term, sp)) ||
        descNorm.includes(term)
      ) {
        matches++
      }
    }

    if (matches >= 2) {
      industryScore = industryMax
      topFactors.push(`Strong ${profile.industry || profile.sector} match`)
    } else if (matches >= 1) {
      industryScore = Math.round(industryMax * 0.6)
      topFactors.push(`${profile.industry || profile.sector} overlap`)
    }
  }

  // 2. Gap coverage (up to gapMax pts)
  let gapScore = 0
  if (hasGaps) {
    const criticalPts = Math.round(gapMax * 0.8)
    const nonCriticalPts = gapMax - criticalPts
    const listingText = normalise(`${listing.title} ${listing.description} ${listing.subcategory}`)

    // Check critical gaps
    for (const gap of profile.criticalGaps) {
      const mapping = GAP_TO_MARKETPLACE[normalise(gap.category)]
      if (!mapping) continue
      const categoryMatch = mapping.categories.includes(listing.category)
      const keywordMatch = mapping.keywords.some(kw => listingText.includes(kw))
      if (categoryMatch && keywordMatch) {
        gapScore = criticalPts
        topFactors.push(`Covers ${gap.name} gap (critical)`)
        break
      }
    }

    // Check non-critical gaps if no critical match
    if (gapScore === 0) {
      for (const gap of profile.nonCriticalGaps) {
        const mapping = GAP_TO_MARKETPLACE[normalise(gap.category)]
        if (!mapping) continue
        const categoryMatch = mapping.categories.includes(listing.category)
        const keywordMatch = mapping.keywords.some(kw => listingText.includes(kw))
        if (categoryMatch && keywordMatch) {
          gapScore = nonCriticalPts
          topFactors.push(`Addresses ${gap.name} gap`)
          break
        }
      }
    }
  }

  // 3. Manufacturing fit (up to mfgMax pts)
  // INTENT: Most suppliers (~80%) lack structured process_capabilities and materials
  // fields. Fall back to description, specialties, and key_equipment text matching
  // which are populated on ~60-95% of listings.
  let manufacturingScore = 0
  if (hasProjects && mfgMax > 0) {
    const processPts = Math.round(mfgMax * 0.6)
    const materialPts = mfgMax - processPts

    // Build searchable text from all available supplier data
    const supplierProcesses = (listing.process_capabilities ?? [])
      .map(pc => normalise(String((pc as Record<string, unknown>).process || (pc as Record<string, unknown>).name || '')))
      .filter(Boolean)
    const specialtiesText = (listing.specialties ?? []).map(normalise)
    const equipmentText = (listing.key_equipment ?? []).map(normalise)
    const supplierText = normalise(
      `${listing.title} ${listing.description} ${listing.subcategory} ${specialtiesText.join(' ')} ${equipmentText.join(' ')}`
    )

    let processMatched = false
    for (const needed of profile.processes) {
      const n = normalise(needed)
      if (
        supplierProcesses.some(sp => fuzzyMatch(n, sp)) ||
        specialtiesText.some(st => fuzzyMatch(n, st)) ||
        supplierText.includes(n)
      ) {
        manufacturingScore += processPts
        topFactors.push(`${needed} capability`)
        processMatched = true
        break
      }
    }

    // Material match — check structured field + description fallback
    const supplierMaterials = (listing.materials ?? []).map(normalise)
    for (const needed of profile.materials) {
      const n = normalise(needed)
      if (
        supplierMaterials.some(sm => fuzzyMatch(n, sm)) ||
        supplierText.includes(n)
      ) {
        manufacturingScore += materialPts
        if (!processMatched) topFactors.push(`Works with ${needed}`)
        break
      }
    }
  }

  // 4. Stage fit (10 pts)
  let stageScore = 5 // Default: neutral
  const userStage = normalise(profile.stage || '').replace(/\s+/g, '_')
  if (userStage && STAGE_SIZE_FIT[userStage]) {
    const goodSizes = STAGE_SIZE_FIT[userStage]
    const supplierSize = normalise(listing.company_size || '')
    if (supplierSize && goodSizes.some(s => supplierSize.includes(s))) {
      stageScore = 10
    } else if (supplierSize) {
      stageScore = 3
    }
  }

  // 5. Certification match (10 pts)
  // INTENT: Only ~45% of suppliers have structured certifications field.
  // Also search description text for cert mentions.
  let certScore = 0
  const supplierCerts = (listing.certifications ?? []).map(normalise)
  const certSearchText = normalise(`${listing.description || ''} ${(listing.specialties ?? []).join(' ')}`)

  // Use explicit cert needs if provided, else infer from industry
  let neededCerts = profile.certNeeds.map(normalise)
  if (neededCerts.length === 0 && profile.industry) {
    const industryKey = normalise(profile.industry)
    const matched = Object.entries(INDUSTRY_CERTS).find(([k]) => industryKey.includes(k))
    neededCerts = matched ? matched[1] : INDUSTRY_CERTS.general
  }

  for (const needed of neededCerts) {
    const certMatch = supplierCerts.find(sc => fuzzyMatch(needed, sc))
    if (certMatch || certSearchText.includes(needed)) {
      certScore = 10
      const label = certMatch?.toUpperCase() || needed.toUpperCase()
      topFactors.push(`${label} certified`)
      break
    }
  }

  // 6. Quality & trust (10 pts)
  let qualityScore = 0
  if (listing.is_verified) {
    qualityScore += 5
    topFactors.push('Verified supplier')
  }
  if ((listing.data_quality_score ?? 0) > 70) qualityScore += 3
  if ((listing.average_rating ?? 0) > 0) qualityScore += 2

  const total = Math.min(100, industryScore + gapScore + manufacturingScore + stageScore + certScore + qualityScore)

  return {
    total,
    industryScore,
    gapScore,
    manufacturingScore,
    stageScore,
    certScore,
    qualityScore,
    topFactors: topFactors.slice(0, 3),
  }
}
