import { describe, expect, it } from "vitest"
import {
    computeFullyBurdenedCost,
    formatGbp,
    PRODUCT_CLASSES,
    summariseFullyBurdenedCost,
    type FullyBurdenedCost,
    type ProductClass,
} from "../fully-burdened-cost"

describe("computeFullyBurdenedCost", () => {
    it("computes correct breakdown for an aerospace product at volume 100", () => {
        const result = computeFullyBurdenedCost(
            10_000,
            "High-Altitude Pseudo-Satellite",
            100,
        )

        expect(result.rawBomCost).toBe(10_000)
        expect(result.nreAmortised).toBe(500_000 / 100) // 5000
        expect(result.certificationEstimate).toBe(125_000 / 100) // 1250
        expect(result.toolingEstimate).toBe(200_000 / 100) // 2000
        expect(result.warrantyReserve).toBe(10_000 * 0.08) // 800 (industrial rate for aerospace)
        expect(result.landedCostUplift).toBe(10_000 * 0.15) // 1500
        expect(result.yieldScrapAllowance).toBe(10_000 * 0.05) // 500
        expect(result.certificationTier).toBe("aerospace")

        const expectedTotal =
            10_000 + 5_000 + 1_250 + 2_000 + 800 + 1_500 + 500
        expect(result.fullyBurdenedUnitCost).toBeCloseTo(expectedTotal, 2)
    })

    it("uses consumer warranty rate (3%) for consumer devices", () => {
        const result = computeFullyBurdenedCost(
            50,
            "Consumer Device",
            10_000,
        )

        expect(result.warrantyReserve).toBeCloseTo(50 * 0.03, 4)
        expect(result.certificationTier).toBe("consumer")
    })

    it("uses industrial warranty rate (8%) for battery energy storage", () => {
        const result = computeFullyBurdenedCost(
            5_000,
            "Battery Energy Storage System",
            500,
        )

        expect(result.warrantyReserve).toBeCloseTo(5_000 * 0.08, 4)
        expect(result.certificationTier).toBe("industrial")
    })

    it("amortises lump sums correctly at high volume", () => {
        const result = computeFullyBurdenedCost(
            50,
            "Consumer Device",
            1_000_000,
        )

        // At 1M volume, lump sums become negligible per unit
        expect(result.nreAmortised).toBeCloseTo(50_000 / 1_000_000, 6)
        expect(result.certificationEstimate).toBeCloseTo(17_500 / 1_000_000, 6)
        expect(result.toolingEstimate).toBeCloseTo(30_000 / 1_000_000, 6)
    })

    it("throws when volume is less than 1", () => {
        expect(() =>
            computeFullyBurdenedCost(100, "Consumer Device", 0),
        ).toThrow("Amortisation volume must be at least 1")

        expect(() =>
            computeFullyBurdenedCost(100, "Consumer Device", -5),
        ).toThrow("Amortisation volume must be at least 1")
    })

    it("accepts overrides for all default values", () => {
        const result = computeFullyBurdenedCost(
            1_000,
            "Vertical Farm",
            100,
            {
                nreLumpSumGbp: 10_000,
                certificationLumpSumGbp: 5_000,
                toolingLumpSumGbp: 3_000,
                warrantyReserveFraction: 0.10,
                landedCostUpliftFraction: 0.20,
                yieldScrapFraction: 0.02,
            },
        )

        expect(result.nreAmortised).toBe(10_000 / 100)
        expect(result.certificationEstimate).toBe(5_000 / 100)
        expect(result.toolingEstimate).toBe(3_000 / 100)
        expect(result.warrantyReserve).toBeCloseTo(1_000 * 0.10, 4)
        expect(result.landedCostUplift).toBeCloseTo(1_000 * 0.20, 4)
        expect(result.yieldScrapAllowance).toBeCloseTo(1_000 * 0.02, 4)
    })

    it("fullyBurdenedUnitCost equals the sum of all components", () => {
        const result = computeFullyBurdenedCost(
            2_500,
            "Seawater Reverse Osmosis",
            200,
        )

        const manualSum =
            result.rawBomCost +
            result.nreAmortised +
            result.certificationEstimate +
            result.toolingEstimate +
            result.warrantyReserve +
            result.landedCostUplift +
            result.yieldScrapAllowance

        expect(result.fullyBurdenedUnitCost).toBeCloseTo(manualSum, 10)
    })

    it("handles all five product classes without error", () => {
        for (const pc of PRODUCT_CLASSES) {
            const result = computeFullyBurdenedCost(1_000, pc, 100)
            expect(result.productClass).toBe(pc)
            expect(result.fullyBurdenedUnitCost).toBeGreaterThan(1_000)
        }
    })

    it("burden is always positive when raw bill of materials cost is positive", () => {
        const result = computeFullyBurdenedCost(
            1,
            "Consumer Device",
            1,
        )
        expect(result.fullyBurdenedUnitCost).toBeGreaterThan(result.rawBomCost)
    })
})

describe("formatGbp", () => {
    it("formats millions", () => {
        expect(formatGbp(2_500_000)).toBe("£2.50M")
    })

    it("formats thousands", () => {
        expect(formatGbp(12_345)).toBe("£12,345")
    })

    it("formats small amounts with two decimals", () => {
        expect(formatGbp(42.5)).toBe("£42.50")
    })
})

describe("summariseFullyBurdenedCost", () => {
    it("produces a multi-line summary containing all cost layers", () => {
        const result = computeFullyBurdenedCost(
            5_000,
            "Battery Energy Storage System",
            200,
        )
        const summary = summariseFullyBurdenedCost(result)

        expect(summary).toContain("Fully burdened unit cost")
        expect(summary).toContain("Raw bill of materials cost")
        expect(summary).toContain("Non-recurring engineering")
        expect(summary).toContain("Certification")
        expect(summary).toContain("Tooling")
        expect(summary).toContain("Warranty reserve")
        expect(summary).toContain("Landed cost uplift")
        expect(summary).toContain("Yield and scrap allowance")
        expect(summary).toContain("200 units")
    })

    it("does not contain any acronyms", () => {
        const result = computeFullyBurdenedCost(
            1_000,
            "High-Altitude Pseudo-Satellite",
            50,
        )
        const summary = summariseFullyBurdenedCost(result)

        // No NRE, BOM, COGS, or other acronyms
        expect(summary).not.toMatch(/\bNRE\b/)
        expect(summary).not.toMatch(/\bBOM\b/)
        expect(summary).not.toMatch(/\bCOGS\b/)
    })
})
