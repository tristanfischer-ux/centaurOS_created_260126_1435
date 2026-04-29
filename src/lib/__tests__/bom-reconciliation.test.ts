/**
 * @file bom-reconciliation.test.ts -- Loop 24 Fix 5 tests.
 *
 * Covers:
 *   (a) Clean reconciliation -- all modules within 10% threshold, passes.
 *   (b) Count mismatch >10% -- blocks emission (runBomCountCheck returns passed=false).
 *   (c) Chemistry mismatch via buildChemistryCheckPrompt -- prompt contains right fields.
 *   (d) Parametric and todo rows flagged correctly by classifyCostProvenance.
 */

import {
    runBomCountCheck,
    extractModulePartCounts,
    countBomPartsForClass,
    classifyCostProvenance,
    enrichPartsWithProvenance,
    summariseProvenanceGaps,
    buildChemistryCheckPrompt,
    type CostProvenance,
} from "@/lib/bom/bom-reconciliation"

// ---- extractModulePartCounts ----------------------------------------

describe("extractModulePartCounts", () => {
    test("extracts digit-prefixed part classes", () => {
        const result = extractModulePartCounts(
            "The module contains 5 pressure vessels and 30 RO elements for filtration.",
            [],
        )
        expect(result.get("pressure vessel")).toBe(5)
        expect(result.get("ro element")).toBe(30)
    })

    test("extracts word-number part classes", () => {
        const result = extractModulePartCounts(
            "Two redundant pumps and three control valves are installed.",
            [],
        )
        expect(result.get("redundant pump")).toBe(2)
        expect(result.get("control valve")).toBe(3)
    })

    test("includes keyParts in extraction", () => {
        const result = extractModulePartCounts("", ["12 battery cells", "1 PCS skid"])
        expect(result.get("battery cell")).toBe(12)
        // Single-count items are still extractable (gate only skips count<=1)
        expect(result.get("pcs skid")).toBe(1)
    })

    test("skips noise words after digit", () => {
        // "30 percent efficiency" should not produce a class "percent efficiency"
        const result = extractModulePartCounts("30 percent efficiency target", [])
        expect(result.has("percent efficiency")).toBe(false)
    })

    test("returns empty map for empty input", () => {
        const result = extractModulePartCounts("", [])
        expect(result.size).toBe(0)
    })

    test("keeps largest count for a repeated class", () => {
        // "up to 10 pumps" and "3 pumps" -- should keep 10
        const result = extractModulePartCounts("up to 10 pumps; minimum 3 pumps.", [])
        expect(result.get("pump")).toBe(10)
    })
})

// ---- countBomPartsForClass ------------------------------------------

describe("countBomPartsForClass", () => {
    const parts = [
        { name: "High-Pressure Vessel Assembly", quantity: 3 },
        { name: "RO Membrane Element", quantity: 18 },
        { name: "Feed Pump", quantity: 1 },
    ]

    test("matches substring case-insensitively and sums quantities", () => {
        expect(countBomPartsForClass(parts, "pressure vessel")).toBe(3)
        expect(countBomPartsForClass(parts, "ro membrane element")).toBe(18)
    })

    test("returns 0 for no match", () => {
        expect(countBomPartsForClass(parts, "heat exchanger")).toBe(0)
    })

    test("defaults quantity to 1 when undefined", () => {
        const noQty = [{ name: "Control Valve" }]
        expect(countBomPartsForClass(noQty, "control valve")).toBe(1)
    })
})

// ---- runBomCountCheck -----------------------------------------------

describe("runBomCountCheck -- clean reconciliation (a)", () => {
    test("passes when module count matches BOM count within 10%", () => {
        const modules = [
            {
                id: "desal-membrane",
                name: "Membrane Array",
                description: "Contains 10 pressure vessels and 60 RO elements.",
                keyParts: [],
            },
        ]
        const bomParts = [
            { partNumber: "PV-001", name: "Pressure Vessel", sourceModuleId: "desal-membrane", quantity: 10 },
            { partNumber: "RO-001", name: "RO Element", sourceModuleId: "desal-membrane", quantity: 60 },
        ]
        const result = runBomCountCheck(modules, bomParts)
        expect(result.passed).toBe(true)
        expect(result.mismatches).toHaveLength(0)
    })

    test("passes when no multi-count classes found in description", () => {
        const modules = [
            {
                id: "single",
                name: "Single Item Module",
                description: "One control skid with integrated monitoring.",
                keyParts: [],
            },
        ]
        const bomParts = [
            { partNumber: "SKD-001", name: "Control Skid", sourceModuleId: "single", quantity: 1 },
        ]
        const result = runBomCountCheck(modules, bomParts)
        expect(result.passed).toBe(true)
    })
})

describe("runBomCountCheck -- count mismatch >10% blocks emission (b)", () => {
    test("fails when BOM has 40% fewer parts than declared -- Desalination scenario", () => {
        const modules = [
            {
                id: "desal",
                name: "Desalination Array",
                // Module declares 5 vessels and 30 elements
                description: "The array uses 5 pressure vessels each loaded with 30 RO elements.",
                keyParts: [],
            },
        ]
        const bomParts = [
            // BOM only procures 3 vessels and 18 elements (40% short)
            { partNumber: "PV-001", name: "Pressure Vessel", sourceModuleId: "desal", quantity: 3 },
            { partNumber: "RO-001", name: "RO Element", sourceModuleId: "desal", quantity: 18 },
        ]
        const result = runBomCountCheck(modules, bomParts)
        expect(result.passed).toBe(false)
        expect(result.mismatches.length).toBeGreaterThan(0)
        // Specific mismatch for pressure vessels
        const pvMismatch = result.mismatches.find((m) => m.partClass.includes("pressure vessel"))
        expect(pvMismatch).toBeDefined()
        if (pvMismatch) {
            expect(pvMismatch.moduleCount).toBe(5)
            expect(pvMismatch.bomCount).toBe(3)
            expect(pvMismatch.pctDiff).toBeGreaterThan(10)
        }
    })

    test("logLine contains structured mismatch fields", () => {
        const modules = [
            {
                id: "m1",
                name: "Battery Pack",
                description: "Contains 20 battery cells in series.",
                keyParts: [],
            },
        ]
        const bomParts = [
            { partNumber: "BAT-001", name: "Battery Cell", sourceModuleId: "m1", quantity: 10 },
        ]
        const result = runBomCountCheck(modules, bomParts)
        expect(result.passed).toBe(false)
        expect(result.logLine).toContain("bom-reconcile")
        expect(result.logLine).toContain("mismatch")
        expect(result.logLine).toContain("Battery Pack")
    })

    test("passes with 9% mismatch (just inside threshold)", () => {
        // 10 declared, 9 in BOM = 10% diff -- passes (not > 10%)
        const modules = [
            {
                id: "m2",
                name: "Panel Array",
                description: "Ten solar panels mounted on the frame.",
                keyParts: [],
            },
        ]
        const bomParts = [
            { partNumber: "SOL-001", name: "Solar Panel", sourceModuleId: "m2", quantity: 9 },
        ]
        const result = runBomCountCheck(modules, bomParts)
        // diff = |10-9|/max(10,9) = 1/10 = 10.0% which is NOT > 10%, so passes
        expect(result.passed).toBe(true)
    })
})

// ---- classifyCostProvenance (d) ------------------------------------

describe("classifyCostProvenance -- parametric row flagged (d)", () => {
    test("zero cost -> todo", () => {
        expect(classifyCostProvenance(0, null)).toBe("todo")
        expect(classifyCostProvenance(0, "some description")).toBe("todo")
    })

    test("null cost -> todo", () => {
        expect(classifyCostProvenance(null, null)).toBe("todo")
        expect(classifyCostProvenance(undefined, undefined)).toBe("todo")
    })

    test("positive cost with no suspicious note -> quoted", () => {
        expect(classifyCostProvenance(1200, "Sourced from RS Components catalogue")).toBe("quoted")
        expect(classifyCostProvenance(500, null)).toBe("quoted")
    })

    test("TBD in justification -> todo", () => {
        expect(classifyCostProvenance(100, "TBD — awaiting supplier quote")).toBe("todo")
        expect(classifyCostProvenance(100, "Cost tbd pending RFQ")).toBe("todo")
    })

    test("placeholder in justification -> todo", () => {
        expect(classifyCostProvenance(1, "placeholder — RFQ pending")).toBe("todo")
    })

    test("+- in justification -> parametric", () => {
        expect(classifyCostProvenance(5000, "Estimated +-30% based on mass")).toBe("parametric")
    })

    test("HAPS structural item with parametric cost note -> parametric", () => {
        expect(
            classifyCostProvenance(2500, "Parametric estimate based on composite mass at GBP180/kg"),
        ).toBe("parametric")
    })

    test("enrichPartsWithProvenance populates cost_provenance on all rows", () => {
        const parts = [
            { partNumber: "P1", estimatedUnitCostGbp: 0, costJustification: null },
            { partNumber: "P2", estimatedUnitCostGbp: 1500, costJustification: "RS Components catalogue" },
            { partNumber: "P3", estimatedUnitCostGbp: 800, costJustification: "Parametric estimate +-20%" },
        ]
        const enriched = enrichPartsWithProvenance(parts)
        expect(enriched[0].cost_provenance).toBe("todo")
        expect(enriched[1].cost_provenance).toBe("quoted")
        expect(enriched[2].cost_provenance).toBe("parametric")
    })
})

// ---- summariseProvenanceGaps ----------------------------------------

describe("summariseProvenanceGaps", () => {
    test("no banner when all quoted", () => {
        const parts = [
            { name: "Part A", cost_provenance: "quoted" as CostProvenance },
            { name: "Part B", cost_provenance: "quoted" as CostProvenance },
        ]
        const summary = summariseProvenanceGaps(parts)
        expect(summary.bannerNeeded).toBe(false)
        expect(summary.bannerCopy).toBeNull()
        expect(summary.quotedCount).toBe(2)
    })

    test("banner when todo rows present", () => {
        const parts = [
            { name: "Part A", cost_provenance: "todo" as CostProvenance },
            { name: "Part B", cost_provenance: "quoted" as CostProvenance },
        ]
        const summary = summariseProvenanceGaps(parts)
        expect(summary.bannerNeeded).toBe(true)
        expect(summary.todoCount).toBe(1)
        expect(summary.bannerCopy).toContain("no cost")
    })

    test("banner when parametric rows present", () => {
        const parts = [
            { name: "Part A", cost_provenance: "parametric" as CostProvenance },
        ]
        const summary = summariseProvenanceGaps(parts)
        expect(summary.bannerNeeded).toBe(true)
        expect(summary.parametricCount).toBe(1)
        expect(summary.bannerCopy).toContain("parametric")
    })
})

// ---- buildChemistryCheckPrompt (c) ---------------------------------

describe("buildChemistryCheckPrompt -- chemistry mismatch prompt (c)", () => {
    test("includes module name, description, key parts, and BOM rows", () => {
        const prompt = buildChemistryCheckPrompt(
            "Membrane Array",
            "The module uses LFP lithium-ion cells for energy storage.",
            ["LFP battery cells", "Battery management system"],
            [
                { partNumber: "BAT-001", name: "NMC Battery Cell Pack", material: "NMC", description: "Nickel manganese cobalt cell" },
            ],
        )
        expect(prompt).toContain("Membrane Array")
        expect(prompt).toContain("LFP lithium-ion")
        expect(prompt).toContain("LFP battery cells")
        expect(prompt).toContain("BAT-001")
        expect(prompt).toContain("NMC Battery Cell Pack")
        // Prompt must request JSON with the right fields
        expect(prompt).toContain('"passed"')
        expect(prompt).toContain('"issues"')
        expect(prompt).toContain('"field"')
        expect(prompt).toContain("chemistry")
    })

    test("handles empty BOM rows gracefully", () => {
        const prompt = buildChemistryCheckPrompt(
            "Empty Module",
            "Some description",
            [],
            [],
        )
        expect(prompt).toContain("(none)")
    })
})
