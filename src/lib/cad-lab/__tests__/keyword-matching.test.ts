import { extractKeywords, hasKeywordOverlap, KEYWORD_STOP_WORDS } from "../keyword-matching"

/* ─── extractKeywords ──────────────────────────────────────────────────── */

describe("extractKeywords", () => {
  it("extracts lowercase keywords from normal text", () => {
    const result = extractKeywords("Battery Voltage Regulator")
    expect(result).toEqual(new Set(["battery", "voltage", "regulator"]))
  })

  it("filters out stop words", () => {
    const result = extractKeywords("Power to the Motor")
    // "to" and "the" are stop words
    expect(result).toEqual(new Set(["power", "motor"]))
  })

  it("filters out short words (≤2 chars)", () => {
    const result = extractKeywords("DC to AC power")
    // "dc" and "to" and "ac" all ≤2 chars or stop words
    expect(result).toEqual(new Set(["power"]))
  })

  it("strips special characters", () => {
    const result = extractKeywords("Thermal-management (cooling)")
    expect(result).toEqual(new Set(["thermal", "management", "cooling"]))
  })

  it("returns empty set for empty string", () => {
    expect(extractKeywords("")).toEqual(new Set())
  })

  it("returns empty set for only stop words", () => {
    expect(extractKeywords("the and or for")).toEqual(new Set())
  })
})

/* ─── hasKeywordOverlap ────────────────────────────────────────────────── */

describe("hasKeywordOverlap", () => {
  it("returns true when long labels share 2+ keywords", () => {
    expect(hasKeywordOverlap(
      "Battery voltage regulator output",
      "Regulated battery voltage input",
    )).toBe(true)
  })

  it("returns false when long labels share only 1 keyword", () => {
    // Both sides have >2 keywords, so minShared stays at 2
    expect(hasKeywordOverlap(
      "Motor control signal output",
      "Thermal control cooling system",
    )).toBe(false)
  })

  it("returns true for short label with 1 shared keyword (short-label fix)", () => {
    // "Fuel" → 1 keyword, "Fuel intake valve" → 3 keywords
    // Since "Fuel" has ≤2 keywords, effectiveMin drops to 1
    expect(hasKeywordOverlap("Fuel", "Fuel intake valve")).toBe(true)
  })

  it("returns true when both labels are short with 1 shared keyword", () => {
    expect(hasKeywordOverlap("Fuel", "Fuel")).toBe(true)
  })

  it("returns true for 2-keyword label matching 1 keyword", () => {
    // "Motor power" → 2 keywords (≤2), so effectiveMin drops to 1
    expect(hasKeywordOverlap("Motor power", "Motor control signal")).toBe(true)
  })

  it("returns false when there is no overlap", () => {
    expect(hasKeywordOverlap(
      "Battery voltage regulator",
      "Thermal cooling system",
    )).toBe(false)
  })

  it("returns false for empty strings", () => {
    expect(hasKeywordOverlap("", "")).toBe(false)
    expect(hasKeywordOverlap("", "Motor power")).toBe(false)
    expect(hasKeywordOverlap("Motor power", "")).toBe(false)
  })

  it("returns false when all words are stop words", () => {
    expect(hasKeywordOverlap("the and or", "the and for")).toBe(false)
  })

  it("respects custom minShared parameter for long labels", () => {
    // "battery voltage regulator" and "battery voltage converter" share 2 keywords
    // With minShared=3, should fail
    expect(hasKeywordOverlap(
      "Battery voltage regulator",
      "Battery voltage converter",
      3,
    )).toBe(false)

    // With minShared=2, should pass
    expect(hasKeywordOverlap(
      "Battery voltage regulator",
      "Battery voltage converter",
      2,
    )).toBe(true)
  })

  it("short-label fix clamps custom minShared to 1", () => {
    // "Fuel" is ≤2 keywords, so even minShared=3 gets clamped to 1
    expect(hasKeywordOverlap("Fuel", "Fuel intake valve", 3)).toBe(true)
  })
})
