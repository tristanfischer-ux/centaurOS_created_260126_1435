/**
 * @file standards-recommender.ts — Scores design standards by relevance to a product.
 *
 * INTENT: Follows the same 100-point multi-factor scoring pattern as
 * technique-recommender.ts. Given a product description and detected industry
 * domain, scores each standard and returns the most relevant ones.
 */

import type { DesignStandard, StandardsRecommendation } from "@/types/design-standards"
import type { IndustryDomain } from "./industry-domains"

// ─── Scoring Weights ────────────────────────────────────────────────

const WEIGHTS = {
  domainMatch: 30,
  productTagMatch: 25,
  engineeringTagMatch: 20,
  materialRelevance: 15,
  regionMatch: 10,
} as const

/**
 * Scores a single design standard against the product context.
 *
 * @param standard - The standard to score
 * @param industryDomain - Detected industry domain for the product
 * @param productKeywords - Keywords extracted from the product description
 * @param engineeringKeywords - Engineering concern keywords (from research/diagnostics)
 * @param materials - Materials mentioned in the product context
 * @param userRegion - User's region (default "global")
 * @returns Score 0-100 with reasons
 */
export function scoreStandard(
  standard: DesignStandard,
  industryDomain: IndustryDomain,
  productKeywords: string[],
  engineeringKeywords: string[],
  materials: string[],
  userRegion: string = "global",
): StandardsRecommendation {
  const reasons: string[] = []
  let score = 0

  // 1. Domain match (30pts)
  if (standard.industry_domain === industryDomain) {
    score += WEIGHTS.domainMatch
    reasons.push(`Domain match: ${industryDomain}`)
  }

  // 2. Product tag match (25pts) — proportional to overlap (case-insensitive)
  if (standard.product_tags.length > 0 && productKeywords.length > 0) {
    const overlap = standard.product_tags.filter(tag => {
      const lTag = tag.toLowerCase()
      return productKeywords.some(kw => kw.toLowerCase().includes(lTag) || lTag.includes(kw.toLowerCase()))
    })
    if (overlap.length > 0) {
      const ratio = Math.min(overlap.length / Math.max(standard.product_tags.length, 1), 1)
      const pts = Math.round(ratio * WEIGHTS.productTagMatch)
      score += pts
      reasons.push(`Product tags: ${overlap.slice(0, 3).join(", ")}`)
    }
  }

  // 3. Engineering tag match (20pts) — proportional to overlap (case-insensitive)
  if (standard.engineering_tags.length > 0 && engineeringKeywords.length > 0) {
    const overlap = standard.engineering_tags.filter(tag => {
      const lTag = tag.toLowerCase()
      return engineeringKeywords.some(kw => kw.toLowerCase().includes(lTag) || lTag.includes(kw.toLowerCase()))
    })
    if (overlap.length > 0) {
      const ratio = Math.min(overlap.length / Math.max(standard.engineering_tags.length, 1), 1)
      const pts = Math.round(ratio * WEIGHTS.engineeringTagMatch)
      score += pts
      reasons.push(`Engineering: ${overlap.slice(0, 3).join(", ")}`)
    }
  }

  // 4. Material relevance (15pts)
  const allowedMaterials = standard.material_specs?.allowed_materials ?? []
  if (allowedMaterials.length > 0 && materials.length > 0) {
    const materialOverlap = allowedMaterials.filter(mat =>
      materials.some(m => m.toLowerCase().includes(mat.toLowerCase()) || mat.toLowerCase().includes(m.toLowerCase()))
    )
    if (materialOverlap.length > 0) {
      score += WEIGHTS.materialRelevance
      reasons.push(`Materials: ${materialOverlap.slice(0, 2).join(", ")}`)
    }
  }

  // 5. Region match (10pts) — currently all standards include "global", so this
  // always awards 10pts. Will differentiate when foundry region is passed.
  const regions = standard.region ?? ["global"]
  if (regions.includes("global") || regions.includes(userRegion)) {
    score += WEIGHTS.regionMatch
  }

  return {
    standardCode: standard.standard_code,
    standardName: standard.standard_name,
    issuingBody: standard.issuing_body,
    score,
    reasons,
    tokenEstimate: standard.token_estimate,
    summary: standard.summary,
    requirementsMarkdown: standard.requirements_markdown,
    designRules: standard.design_rules,
  }
}

/**
 * Ranks all standards and returns the top-N above the score threshold.
 *
 * @param standards - All candidate standards (pre-filtered by domain query)
 * @param industryDomain - Detected industry domain
 * @param productKeywords - Keywords from the product description
 * @param engineeringKeywords - Engineering concern keywords
 * @param materials - Materials mentioned
 * @param threshold - Minimum score to include (default 30)
 * @param maxResults - Maximum standards to return (default 10)
 * @returns Sorted recommendations, highest score first
 */
export function rankStandards(
  standards: DesignStandard[],
  industryDomain: IndustryDomain,
  productKeywords: string[],
  engineeringKeywords: string[],
  materials: string[],
  threshold: number = 30,
  maxResults: number = 10,
): StandardsRecommendation[] {
  return standards
    .map(s => scoreStandard(s, industryDomain, productKeywords, engineeringKeywords, materials))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}
