import { buildSpendSummary } from "../spend-by-supplier"

describe("buildSpendSummary", () => {
    it("nominates the highest-score supplier as primary; non-primary alternates with no sole-source contribution are filtered out", () => {
        const parts = [
            {
                partNumber: "A1",
                name: "Sensor",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 100,
                massKg: 0.1,
            },
        ]
        const suppliers = [
            { name: "S-low", matchedPartNumbers: ["A1"], matchScore: 35 },
            { name: "S-high", matchedPartNumbers: ["A1"], matchScore: 80 },
            { name: "S-mid", matchedPartNumbers: ["A1"], matchScore: 50 },
        ]
        const result = buildSpendSummary(parts, suppliers)
        // Only S-high makes the table — the other two have no primary
        // nomination and aren't sole-source (3 candidates compete).
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0].supplier.name).toBe("S-high")
        expect(result.rows[0].modelledSpendGbp).toBe(100)
        expect(result.rows[0].partsAsPrimary).toBe(1)
        expect(result.rows[0].soleSourceParts).toBe(0)
    })

    it("marks parts unclaimed when no supplier scores >= 30", () => {
        const parts = [
            {
                partNumber: "B1",
                name: "ASIC",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 200,
            },
        ]
        const suppliers = [{ name: "S-low", matchedPartNumbers: ["B1"], matchScore: 22 }]
        const result = buildSpendSummary(parts, suppliers)
        expect(result.rows).toHaveLength(0)
        expect(result.unclaimedPartCount).toBe(1)
        expect(result.unclaimedSpendGbp).toBe(200)
    })

    it("excludes assembly-parent rows from spend (deduped to zero)", () => {
        // Realistic BESS data: PC-001-PUR £145k vs constituents
        // £62k+£24k+£18.5k = £104.5k → ratio 1.388 (within 1.5 band).
        // Helper drops PC-001-PUR from the cost roll-up.
        const parts = [
            {
                partNumber: "PC-001-PUR",
                name: "Skid Assembly",
                sourceModuleName: "pcs",
                estimatedUnitCostGbp: 145000,
            },
            {
                partNumber: "PC-002",
                name: "Inverter",
                sourceModuleName: "pcs",
                estimatedUnitCostGbp: 62000,
            },
            {
                partNumber: "PC-003",
                name: "Switchgear",
                sourceModuleName: "pcs",
                estimatedUnitCostGbp: 24000,
            },
            {
                partNumber: "PC-004",
                name: "Filter",
                sourceModuleName: "pcs",
                estimatedUnitCostGbp: 18500,
            },
        ]
        const suppliers = [
            { name: "S-Inverter", matchedPartNumbers: ["PC-002"], matchScore: 70 },
            { name: "S-Switchgear", matchedPartNumbers: ["PC-003"], matchScore: 65 },
            { name: "S-Filter", matchedPartNumbers: ["PC-004"], matchScore: 60 },
            { name: "S-Skid", matchedPartNumbers: ["PC-001-PUR"], matchScore: 90 },
        ]
        const result = buildSpendSummary(parts, suppliers)
        // S-Skid still appears (its only matched part is sole-source),
        // but its modelled spend is zero because PC-001-PUR was deduped.
        const skidRow = result.rows.find((r) => r.supplier.name === "S-Skid")
        expect(skidRow).toBeDefined()
        expect(skidRow!.modelledSpendGbp).toBe(0)
        expect(skidRow!.soleSourceParts).toBe(1)
        const inverterRow = result.rows.find((r) => r.supplier.name === "S-Inverter")
        expect(inverterRow!.modelledSpendGbp).toBe(62000)
        expect(result.bomTotalGbp).toBe(62000 + 24000 + 18500)
    })

    it("flags sole-source parts even when modelled spend is small", () => {
        const parts = [
            {
                partNumber: "RAR1",
                name: "Custom valve",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 50,
            },
            {
                partNumber: "RAR2",
                name: "Custom strut",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 50,
            },
        ]
        const suppliers = [
            { name: "S-only", matchedPartNumbers: ["RAR1", "RAR2"], matchScore: 65 },
        ]
        const result = buildSpendSummary(parts, suppliers)
        expect(result.rows[0].soleSourceParts).toBe(2)
        expect(result.rows[0].partsAsPrimary).toBe(2)
        expect(result.rows[0].modelledSpendGbp).toBe(100)
        expect(result.rows[0].spendPct).toBe(100)
    })

    it("sorts by spend descending; ties broken by match score", () => {
        const parts = [
            {
                partNumber: "X1",
                name: "Part X1",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 100,
            },
            {
                partNumber: "X2",
                name: "Part X2",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 100,
            },
        ]
        const suppliers = [
            { name: "S-tie-low", matchedPartNumbers: ["X1"], matchScore: 50 },
            { name: "S-tie-high", matchedPartNumbers: ["X2"], matchScore: 90 },
        ]
        const result = buildSpendSummary(parts, suppliers)
        // Both modelled spend 100; tie broken by matchScore (90 > 50)
        expect(result.rows[0].supplier.name).toBe("S-tie-high")
        expect(result.rows[1].supplier.name).toBe("S-tie-low")
    })

    it("caps at top 15 suppliers, reports capped flag + total count", () => {
        const parts: { partNumber: string; sourceModuleName: string; estimatedUnitCostGbp: number }[] = []
        const suppliers: { name: string; matchedPartNumbers: string[]; matchScore: number }[] = []
        for (let i = 0; i < 20; i++) {
            parts.push({
                partNumber: `P${i}`,
                sourceModuleName: "m",
                estimatedUnitCostGbp: 100 + i, // distinct so each supplier is the sole match
            })
            suppliers.push({
                name: `S${i}`,
                matchedPartNumbers: [`P${i}`],
                matchScore: 50 + (i % 5),
            })
        }
        const result = buildSpendSummary(parts, suppliers)
        expect(result.rows).toHaveLength(15)
        expect(result.capped).toBe(true)
        expect(result.rowCountBeforeCap).toBe(20)
    })

    it("flags concentration risk amber when modelled spend >= 30 percent of bom total", () => {
        const parts = [
            {
                partNumber: "M1",
                name: "Big part",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 70,
            },
            {
                partNumber: "M2",
                name: "Small part",
                sourceModuleName: "m",
                estimatedUnitCostGbp: 30,
            },
        ]
        const suppliers = [
            { name: "S-big", matchedPartNumbers: ["M1"], matchScore: 80 },
            { name: "S-small", matchedPartNumbers: ["M2"], matchScore: 60 },
        ]
        const result = buildSpendSummary(parts, suppliers)
        const big = result.rows.find((r) => r.supplier.name === "S-big")!
        const small = result.rows.find((r) => r.supplier.name === "S-small")!
        expect(big.spendPct).toBe(70)
        expect(big.concentrationRiskAmber).toBe(true)
        expect(small.spendPct).toBe(30)
        expect(small.concentrationRiskAmber).toBe(true) // == 30 boundary
    })
})
