import {
  parseLeadTimeWeeks,
  parseMoq,
  parseBatchSize,
} from "@/components/cad/design-constraint-banners"

describe("design-constraint-banners parsers", () => {
  describe("parseLeadTimeWeeks", () => {
    it("parses plain weeks", () => {
      expect(parseLeadTimeWeeks("8 weeks")).toBe(8)
      expect(parseLeadTimeWeeks("8 wk")).toBe(8)
      expect(parseLeadTimeWeeks("8wk")).toBe(8)
    })

    it("picks the upper bound of a range (worst case)", () => {
      expect(parseLeadTimeWeeks("6-8 weeks")).toBe(8)
      expect(parseLeadTimeWeeks("6 - 12 weeks")).toBe(12)
    })

    it("converts days and months", () => {
      expect(parseLeadTimeWeeks("14 days")).toBe(2)
      expect(parseLeadTimeWeeks("45 days")).toBe(6)
      expect(parseLeadTimeWeeks("3 months")).toBe(12)
      expect(parseLeadTimeWeeks("3 mo")).toBe(12)
    })

    it("returns null on unparseable input", () => {
      expect(parseLeadTimeWeeks(null)).toBeNull()
      expect(parseLeadTimeWeeks("")).toBeNull()
      expect(parseLeadTimeWeeks("tbd")).toBeNull()
      expect(parseLeadTimeWeeks("call for lead time")).toBeNull()
    })
  })

  describe("parseMoq", () => {
    it("parses plain numbers with and without commas", () => {
      expect(parseMoq("100")).toBe(100)
      expect(parseMoq("1,000")).toBe(1000)
      expect(parseMoq("100 units")).toBe(100)
      expect(parseMoq("MOQ 500")).toBe(500)
    })

    it("returns null when no digits present", () => {
      expect(parseMoq(null)).toBeNull()
      expect(parseMoq("")).toBeNull()
      expect(parseMoq("negotiable")).toBeNull()
    })
  })

  describe("parseBatchSize", () => {
    it("returns the lower bound of a range (pessimistic for MOQ check)", () => {
      // Intentional: '100-500' means founder must be OK at 100, so flag any
      // supplier MOQ above 100.
      expect(parseBatchSize("100-500")).toBe(100)
    })

    it("parses plain numbers", () => {
      expect(parseBatchSize("1000")).toBe(1000)
      expect(parseBatchSize("≤100")).toBe(100)
    })

    it("returns null on empty/non-numeric input", () => {
      expect(parseBatchSize(null)).toBeNull()
      expect(parseBatchSize("pilot only")).toBeNull()
    })
  })
})
