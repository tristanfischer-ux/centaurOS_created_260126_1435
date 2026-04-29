import {
  scoreCategoryCoverage,
  hasLowCoverageCategories,
  type CategoryCoverage,
} from "../coverage-scoring"

describe("scoreCategoryCoverage", () => {
  it("returns strong coverage for well-represented categories", () => {
    const results = scoreCategoryCoverage(["automotive", "aerospace", "electronics"])

    for (const r of results) {
      expect(r.coverageLevel).toBe("strong")
      expect(r.supplierCount).toBeGreaterThanOrEqual(100)
      expect(r.confidenceDegradation).toBe("")
    }
  })

  it("returns moderate coverage for mid-range categories", () => {
    const [result] = scoreCategoryCoverage(["defence"])

    expect(result.coverageLevel).toBe("moderate")
    expect(result.supplierCount).toBeGreaterThanOrEqual(20)
    expect(result.supplierCount).toBeLessThan(100)
    expect(result.confidenceDegradation).toContain("moderately-sized")
  })

  it("returns weak coverage for sparsely-represented categories", () => {
    const [result] = scoreCategoryCoverage(["battery cell manufacturers"])

    expect(result.coverageLevel).toBe("weak")
    expect(result.supplierCount).toBeGreaterThan(0)
    expect(result.supplierCount).toBeLessThan(20)
    expect(result.confidenceDegradation).toContain("limited directory")
    expect(result.confidenceDegradation).toContain("Independent supplier research is recommended")
  })

  it("returns none for categories with zero suppliers", () => {
    const results = scoreCategoryCoverage([
      "horticulture",
      "modular construction",
      "heating ventilation and air conditioning",
    ])

    for (const r of results) {
      expect(r.coverageLevel).toBe("none")
      expect(r.supplierCount).toBe(0)
      expect(r.confidenceDegradation).toContain("no coverage")
      expect(r.confidenceDegradation).toContain("independent research")
    }
  })

  it("handles unknown categories as none", () => {
    const [result] = scoreCategoryCoverage(["underwater basket weaving"])

    expect(result.coverageLevel).toBe("none")
    expect(result.supplierCount).toBe(0)
    expect(result.confidenceDegradation).toContain("no coverage")
  })

  it("normalises category casing", () => {
    const [upper] = scoreCategoryCoverage(["AUTOMOTIVE"])
    const [lower] = scoreCategoryCoverage(["automotive"])

    expect(upper.coverageLevel).toBe(lower.coverageLevel)
    expect(upper.supplierCount).toBe(lower.supplierCount)
  })

  it("preserves the original category name in the output", () => {
    const [result] = scoreCategoryCoverage(["  Aerospace  "])

    expect(result.category).toBe("  Aerospace  ")
    expect(result.coverageLevel).toBe("strong")
  })

  it("returns one entry per input category", () => {
    const input = ["automotive", "horticulture", "electronics", "desalination membranes"]
    const results = scoreCategoryCoverage(input)

    expect(results).toHaveLength(4)
    expect(results.map((r) => r.category)).toEqual(input)
  })
})

describe("hasLowCoverageCategories", () => {
  it("returns false when all categories are strong", () => {
    expect(hasLowCoverageCategories(["automotive", "aerospace"])).toBe(false)
  })

  it("returns false when all categories are moderate or strong", () => {
    expect(hasLowCoverageCategories(["automotive", "defence"])).toBe(false)
  })

  it("returns true when any category is weak", () => {
    expect(
      hasLowCoverageCategories(["automotive", "battery cell manufacturers"]),
    ).toBe(true)
  })

  it("returns true when any category is none", () => {
    expect(hasLowCoverageCategories(["automotive", "horticulture"])).toBe(true)
  })

  it("returns false for an empty list", () => {
    expect(hasLowCoverageCategories([])).toBe(false)
  })
})
