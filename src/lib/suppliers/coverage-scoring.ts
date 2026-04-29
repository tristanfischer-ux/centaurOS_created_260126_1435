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

// ─── Directory coverage report (SP1, 4/6 council) ─────────────────────────

export type OverallConfidence = "high" | "medium" | "low"

export interface DirectoryCoverageReport {
  overallConfidence: OverallConfidence
  categories: CategoryCoverage[]
  warnings: string[]
  /** ISO string when the report was generated. */
  assessedAt: string
}

/**
 * Assess overall directory coverage for the given bill-of-materials categories.
 *
 * Returns a structured report with per-category coverage and an overall
 * confidence level. Designed to be persisted alongside supplier match results
 * and consumed by the PDF renderer.
 *
 * Council fix SP1 (GPT-5.5, Mistral, Kimi, Gemini): "Category-coverage scoring.
 * If product/BOM category underrepresented, degrade confidence explicitly."
 */
export function assessDirectoryCoverage(
  bomCategories: string[],
): DirectoryCoverageReport {
  if (bomCategories.length === 0) {
    return {
      overallConfidence: "low",
      categories: [],
      warnings: [
        "No bill of materials categories provided — supplier coverage cannot be assessed.",
      ],
      assessedAt: new Date().toISOString(),
    }
  }

  const categories = scoreCategoryCoverage(bomCategories)
  const warnings: string[] = []

  const noneCount = categories.filter(
    (c) => c.coverageLevel === "none",
  ).length
  const weakCount = categories.filter(
    (c) => c.coverageLevel === "weak",
  ).length
  const total = categories.length

  if (noneCount > 0) {
    const noneNames = categories
      .filter((c) => c.coverageLevel === "none")
      .map((c) => c.category)
      .join(", ")
    warnings.push(
      `No directory coverage for: ${noneNames}. All supplier sourcing for these categories must come from independent research.`,
    )
  }

  if (weakCount > 0) {
    const weakNames = categories
      .filter((c) => c.coverageLevel === "weak")
      .map((c) => c.category)
      .join(", ")
    warnings.push(
      `Limited directory coverage for: ${weakNames}. Cross-referencing with independent supplier research is recommended.`,
    )
  }

  let overallConfidence: OverallConfidence
  const problemRatio = (noneCount + weakCount) / total
  if (noneCount > 0 || problemRatio > 0.5) {
    overallConfidence = "low"
  } else if (weakCount > 0 || problemRatio > 0.2) {
    overallConfidence = "medium"
  } else {
    overallConfidence = "high"
  }

  return {
    overallConfidence,
    categories,
    warnings,
    assessedAt: new Date().toISOString(),
  }
}

/**
 * Generate a disclosure paragraph for the PDF supplier section.
 * Tells the founder exactly how confident the directory coverage is.
 */
export function formatCoverageDisclosure(
  report: DirectoryCoverageReport,
): string {
  if (report.overallConfidence === "high") {
    return (
      "The supplier directory has strong coverage for all bill of materials " +
      "categories in this project. Matches are drawn from a database of 651 " +
      "verified suppliers."
    )
  }

  const parts: string[] = [
    "Supplier directory coverage disclosure: the directory of 651 suppliers is " +
      "concentrated in automotive, aerospace, and electronics domains.",
  ]

  for (const warning of report.warnings) {
    parts.push(warning)
  }

  if (report.overallConfidence === "low") {
    parts.push(
      "Overall supplier match confidence is LOW. Founders should treat the " +
        "supplier shortlist as a starting point and conduct independent " +
        "supplier research for categories with no or limited directory coverage.",
    )
  } else {
    parts.push(
      "Overall supplier match confidence is MEDIUM. Some categories have " +
        "limited directory coverage — independent verification is recommended " +
        "for those areas.",
    )
  }

  return parts.join(" ")
}
