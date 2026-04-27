import { checkMirrorParity } from "../mirror-parity"

describe("checkMirrorParity", () => {
    it("flags HAPS port wing vs starboard wing 13× cost asymmetry", () => {
        const modules = [
            { name: "Port Wing Assembly", massKg: 12 },
            { name: "Starboard Wing Assembly", massKg: 12 },
            { name: "Fuselage and Empennage Structure", massKg: 18 },
        ]
        const parts = [
            // Port wing — 7 unpriced rows (cost 0)
            { sourceModuleName: "Port Wing Assembly", estimatedUnitCostGbp: 0 },
            { sourceModuleName: "Port Wing Assembly", estimatedUnitCostGbp: 0 },
            { sourceModuleName: "Port Wing Assembly", estimatedUnitCostGbp: 895 },
            // Starboard wing — full pricing
            { sourceModuleName: "Starboard Wing Assembly", estimatedUnitCostGbp: 4500 },
            { sourceModuleName: "Starboard Wing Assembly", estimatedUnitCostGbp: 3200 },
            { sourceModuleName: "Starboard Wing Assembly", estimatedUnitCostGbp: 2100 },
            { sourceModuleName: "Starboard Wing Assembly", estimatedUnitCostGbp: 2265 },
            // Unrelated module
            { sourceModuleName: "Fuselage and Empennage Structure", estimatedUnitCostGbp: 25000 },
        ]
        const findings = checkMirrorParity(modules, parts)
        expect(findings).toHaveLength(1)
        expect(findings[0].pairLabel).toContain("Port Wing")
        expect(findings[0].pairLabel).toContain("Starboard Wing")
        expect(findings[0].costDiffPct).toBeGreaterThan(80) // 895 vs 12,065 = ~93%
    })

    it("does not double-emit when both directions of a pair are checked", () => {
        const modules = [
            { name: "Left Propulsion Pod" },
            { name: "Right Propulsion Pod" },
        ]
        const parts = [
            { sourceModuleName: "Left Propulsion Pod", estimatedUnitCostGbp: 100 },
            { sourceModuleName: "Right Propulsion Pod", estimatedUnitCostGbp: 1000 },
        ]
        const findings = checkMirrorParity(modules, parts)
        expect(findings).toHaveLength(1)
    })

    it("does not flag pairs where both wings are within tolerance", () => {
        const modules = [
            { name: "Port Wing" },
            { name: "Starboard Wing" },
        ]
        const parts = [
            { sourceModuleName: "Port Wing", estimatedUnitCostGbp: 1000 },
            { sourceModuleName: "Port Wing", estimatedUnitCostGbp: 500 },
            { sourceModuleName: "Starboard Wing", estimatedUnitCostGbp: 1100 },
            { sourceModuleName: "Starboard Wing", estimatedUnitCostGbp: 480 },
        ]
        const findings = checkMirrorParity(modules, parts)
        expect(findings).toHaveLength(0)
    })

    it("does not flag modules without a mirror keyword", () => {
        const modules = [
            { name: "Wing Assembly" },
            { name: "Fuselage" },
        ]
        const parts = [
            { sourceModuleName: "Wing Assembly", estimatedUnitCostGbp: 100 },
            { sourceModuleName: "Fuselage", estimatedUnitCostGbp: 5000 },
        ]
        expect(checkMirrorParity(modules, parts)).toHaveLength(0)
    })

    it("does not match when names differ in more than the mirror keyword", () => {
        // "Port Wing" vs "Starboard Aileron" are NOT mirrors — the rest
        // of the name differs. Helper should not pair them.
        const modules = [
            { name: "Port Wing" },
            { name: "Starboard Aileron" },
        ]
        const parts = [
            { sourceModuleName: "Port Wing", estimatedUnitCostGbp: 100 },
            { sourceModuleName: "Starboard Aileron", estimatedUnitCostGbp: 5000 },
        ]
        expect(checkMirrorParity(modules, parts)).toHaveLength(0)
    })

    it("flags mass asymmetry too", () => {
        const modules = [
            { name: "Port Wing" },
            { name: "Starboard Wing" },
        ]
        const parts = [
            { sourceModuleName: "Port Wing", estimatedUnitCostGbp: 1000, massKg: 1.0 },
            { sourceModuleName: "Starboard Wing", estimatedUnitCostGbp: 1010, massKg: 12.0 },
        ]
        const findings = checkMirrorParity(modules, parts)
        expect(findings).toHaveLength(1)
        expect(findings[0].massDiffPct).toBeGreaterThan(80)
        expect(findings[0].costDiffPct).toBeLessThan(5)
    })

    it("respects the threshold option", () => {
        const modules = [
            { name: "Port Wing" },
            { name: "Starboard Wing" },
        ]
        const parts = [
            { sourceModuleName: "Port Wing", estimatedUnitCostGbp: 100 },
            { sourceModuleName: "Starboard Wing", estimatedUnitCostGbp: 140 }, // 28.6% diff
        ]
        // Default threshold 30%: should not flag
        expect(checkMirrorParity(modules, parts)).toHaveLength(0)
        // Lower threshold 20%: should flag
        expect(checkMirrorParity(modules, parts, { thresholdPct: 20 })).toHaveLength(1)
    })
})
