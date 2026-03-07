/**
 * @file technique-recommender.ts — Scores technique enrichments against module requirements.
 *
 * @description Given a material, tolerance, and batch size, scores each technique
 * enrichment from Nightshift data to find the best manufacturing process fit.
 * Uses a 100-point scale across 5 factors.
 */

import type { TechniqueEnrichment } from "@/types/manufacturing-techniques"

export interface TechniqueRecommendation {
  slug: string
  name: string
  score: number
  reasons: string[]
  supplierCount: number
}

/**
 * Scores a technique enrichment against module requirements.
 *
 * Scoring (100pt scale):
 * - Material match (30pts): technique's real_world_materials contains the material
 * - Tolerance match (25pts): tolerance within technique's min/max range
 * - Batch size match (20pts): technique supports the batch size
 * - Supplier availability (15pts): normalized supplier_count
 * - Environment compatibility (10pts): heuristic from common_applications
 */
export function scoreTechnique(
  enrichment: TechniqueEnrichment,
  material: string | null,
  toleranceMm: number | null,
  batchSize: string | null,
  maxSupplierCount: number,
): TechniqueRecommendation {
  let score = 0
  const reasons: string[] = []
  const slug = enrichment.technique_slug
  const name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

  // ── Material match (30pts) ──
  if (material && enrichment.real_world_materials?.length > 0) {
    const matLower = material.toLowerCase()
    const match = enrichment.real_world_materials.find((m) => {
      const mLower = m.material.toLowerCase()
      return mLower.includes(matLower) || matLower.includes(mLower.split(" ")[0])
    })
    if (match) {
      score += 30
      reasons.push(`${match.material} used by ${match.frequency} suppliers`)
    }
  }

  // ── Tolerance match (25pts) ──
  if (toleranceMm != null && enrichment.real_world_tolerances) {
    const { min_mm, max_mm, typical_mm } = enrichment.real_world_tolerances
    if (min_mm != null && max_mm != null) {
      if (toleranceMm >= min_mm) {
        // Tolerance is achievable
        score += 25
        reasons.push(`Tolerance ±${toleranceMm}mm achievable (range ±${min_mm}–${max_mm}mm)`)
      } else if (typical_mm != null && toleranceMm >= typical_mm * 0.5) {
        // Tight but potentially possible
        score += 10
        reasons.push(`Tolerance ±${toleranceMm}mm is tight for this process`)
      }
    }
  }

  // ── Batch size match (20pts) ──
  if (batchSize && enrichment.typical_batch_sizes) {
    const bsLower = batchSize.toLowerCase()
    const bs = enrichment.typical_batch_sizes
    if (
      (bsLower.includes("prototype") && bs.prototype) ||
      (bsLower.includes("low") && bs.low_volume) ||
      (bsLower.includes("production") && bs.production) ||
      (bsLower.includes("single") && bs.prototype)
    ) {
      score += 20
      reasons.push(`Supports ${batchSize.toLowerCase()} volumes`)
    }
  }

  // ── Supplier availability (15pts) ──
  if (enrichment.supplier_count > 0 && maxSupplierCount > 0) {
    const normalized = Math.min(enrichment.supplier_count / maxSupplierCount, 1)
    const pts = Math.round(normalized * 15)
    score += pts
    if (enrichment.supplier_count >= 5) {
      reasons.push(`${enrichment.supplier_count} UK suppliers available`)
    }
  }

  // ── Environment compatibility (10pts) ──
  // Heuristic: if common_applications has relevant terms, score higher
  if (enrichment.common_applications?.length > 0) {
    score += 10
  }

  return { slug, name, score, reasons, supplierCount: enrichment.supplier_count ?? 0 }
}

/**
 * Scores all enrichments and returns top N recommendations.
 */
export function rankTechniques(
  enrichments: TechniqueEnrichment[],
  material: string | null,
  toleranceMm: number | null,
  batchSize: string | null,
  topN = 5,
): TechniqueRecommendation[] {
  if (enrichments.length === 0) return []

  const maxSupplierCount = Math.max(...enrichments.map((e) => e.supplier_count ?? 0), 1)

  return enrichments
    .map((e) => scoreTechnique(e, material, toleranceMm, batchSize, maxSupplierCount))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
