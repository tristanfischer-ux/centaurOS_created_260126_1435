/**
 * @file coverage-scoring.ts — supplier directory category-coverage scorer
 *
 * The supplier directory (marketplace_listings) is heavily biased towards
 * automotive, aerospace, and electronics. When the bill of materials contains
 * parts from under-represented domains (horticulture, heating ventilation and
 * air conditioning, desalination membranes, etc.), match confidence should be
 * degraded so founders know to do their own supplier research.
 *
 * This module scores each requested category against the known directory
 * composition and returns a confidence-degradation string when coverage is
 * weak or absent.
 */

export type CoverageLevel = "strong" | "moderate" | "weak" | "none"

export interface CategoryCoverage {
  category: string
  supplierCount: number
  coverageLevel: CoverageLevel
  confidenceDegradation: string
}

const KNOWN_COUNTS: Record<string, number> = {
  automotive: 370,
  aerospace: 331,
  electronics: 298,
  industrial: 214,
  medical: 184,
  defence: 45,
  marine: 30,
  energy: 25,
  "battery cell manufacturers": 8,
  "stratospheric materials": 5,
  "desalination membranes": 3,
  horticulture: 0,
  "heating ventilation and air conditioning": 0,
  hvac: 0,
  "modular construction": 0,
  "container manufacturing": 0,
  "controlled environment agriculture": 0,
}

const STRONG_THRESHOLD = 100
const MODERATE_THRESHOLD = 20

function normaliseCategoryKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function coverageLevelFromCount(count: number): CoverageLevel {
  if (count >= STRONG_THRESHOLD) return "strong"
  if (count >= MODERATE_THRESHOLD) return "moderate"
  if (count > 0) return "weak"
  return "none"
}

function buildConfidenceString(
  category: string,
  level: CoverageLevel,
): string {
  switch (level) {
    case "strong":
      return ""
    case "moderate":
      return (
        `Supplier matches for ${category} are drawn from a moderately-sized ` +
        `directory. Cross-referencing with independent supplier research is advised.`
      )
    case "weak":
      return (
        `Supplier matches for ${category} are drawn from a limited directory. ` +
        `Independent supplier research is recommended.`
      )
    case "none":
      return (
        `The supplier directory has no coverage for ${category}. ` +
        `All supplier sourcing for this category must come from independent research.`
      )
  }
}

/**
 * Score category coverage for a list of bill-of-materials categories or
 * product domains. Returns one entry per input category with a coverage
 * level and, when coverage is weak or absent, a human-readable confidence
 * degradation string.
 */
export function scoreCategoryCoverage(
  categories: string[],
): CategoryCoverage[] {
  return categories.map((raw) => {
    const key = normaliseCategoryKey(raw)
    const supplierCount = KNOWN_COUNTS[key] ?? 0
    const coverageLevel = coverageLevelFromCount(supplierCount)

    return {
      category: raw,
      supplierCount,
      coverageLevel,
      confidenceDegradation: buildConfidenceString(raw, coverageLevel),
    }
  })
}

/**
 * Convenience: returns true when ANY of the requested categories has weak
 * or no coverage, signalling that the overall supplier shortlist confidence
 * should be downgraded.
 */
export function hasLowCoverageCategories(categories: string[]): boolean {
  return scoreCategoryCoverage(categories).some(
    (c) => c.coverageLevel === "weak" || c.coverageLevel === "none",
  )
}
