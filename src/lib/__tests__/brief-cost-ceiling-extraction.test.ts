import { extractCostCeilingFromProse } from "@/lib/brief-cost-ceiling-extractor"

describe("extractCostCeilingFromProse", () => {
    // Happy-path — pound symbol
    it("extracts £150,000 with commas", () => {
        const result = extractCostCeilingFromProse(
            "target installed capital cost under £150,000",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(150_000)
        expect(result!.source).toContain("150,000")
    })

    it("extracts £150000 without commas", () => {
        const result = extractCostCeilingFromProse(
            "the budget constraint is £150000 per unit",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(150_000)
    })

    it("extracts £150k suffix", () => {
        const result = extractCostCeilingFromProse(
            "target landed bill of materials ~£155k",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(155_000)
    })

    it("extracts £1.5M suffix", () => {
        const result = extractCostCeilingFromProse(
            "cost ceiling £1.5M for the installed system",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(1_500_000)
    })

    // Spelled-out pounds
    it("extracts spelled-out '150,000 pounds'", () => {
        const result = extractCostCeilingFromProse(
            "target installed capital cost under 150,000 pounds",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(150_000)
    })

    it("extracts spelled-out '150k pounds sterling'", () => {
        const result = extractCostCeilingFromProse(
            "the brief targets a ceiling of 150k pounds sterling",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(150_000)
    })

    // GBP prefix
    it("extracts GBP 200,000 prefix style", () => {
        const result = extractCostCeilingFromProse(
            "procurement budget GBP 200,000 per installation",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(200_000)
    })

    // Context keyword variants
    it("extracts 'budget … £X' pattern", () => {
        const result = extractCostCeilingFromProse(
            "the founder's budget for this project is £85,000",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(85_000)
    })

    // Approximately / tilde prefix
    it("extracts approximately £X with tilde", () => {
        const result = extractCostCeilingFromProse(
            "target landed bill of materials ~£155",
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(155)
    })

    // Edge cases — should return null
    it("returns null when no currency mention", () => {
        const result = extractCostCeilingFromProse(
            "we aim to minimise cost as much as possible",
        )
        expect(result).toBeNull()
    })

    it("returns null for empty string", () => {
        expect(extractCostCeilingFromProse("")).toBeNull()
    })

    it("returns null for text with only a year number", () => {
        // "2025" should not be treated as a cost ceiling
        const result = extractCostCeilingFromProse(
            "target ship date Q1 2025, first customer delivery Q2 2025",
        )
        // Should not fire because "2025" lacks currency context
        expect(result).toBeNull()
    })
})
