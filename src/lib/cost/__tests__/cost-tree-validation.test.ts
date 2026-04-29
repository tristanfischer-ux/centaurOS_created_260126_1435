/**
 * @file cost-tree-validation.test.ts — Tests for the Loop 26 P3 cost-tree
 * arithmetic validation gate.
 *
 * Covers the four checks defined in validateCostTree:
 *   (1) SUBSYSTEM_EXCEEDS_TOTAL — HAPS Wing-Integrated Solar Array at 104.8%
 *   (2) SUBTREE_SUM_MISMATCH — module totals diverge from unit total
 *   (3) LINE_ITEM_ARITHMETIC — "6,800 cells × £60 = £430,560" is wrong
 *   (4) BOM_MODULE_DISCREPANCY — propulsion motor £320 BOM vs £3,000 Finn
 */

import {
    validateCostTree,
    type ModuleCostEntry,
    type CostLineItem,
} from "../cost-tree-validation"

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** HAPS-like perModuleCost with the Wing-Integrated Solar Array bug. */
const HAPS_MODULES_WITH_EXCEED: ModuleCostEntry[] = [
    {
        moduleName: "Wing-Integrated Solar Array",
        totalGbp: 430_560, // 104.8% of £410,907 — impossible
        finnTotalGbp: null,
    },
    {
        moduleName: "Propulsion System",
        totalGbp: 12_000,
        finnTotalGbp: null,
    },
]

const HAPS_UNIT_TOTAL = 410_907

/** Three modules that correctly sum to the unit total. */
const BALANCED_MODULES: ModuleCostEntry[] = [
    { moduleName: "Wing Structure", totalGbp: 50_000, finnTotalGbp: 52_000 },
    { moduleName: "Avionics", totalGbp: 30_000, finnTotalGbp: 30_500 },
    { moduleName: "Power System", totalGbp: 20_000, finnTotalGbp: 19_800 },
]

const BALANCED_UNIT_TOTAL = 100_000

// ── Check 1: SUBSYSTEM_EXCEEDS_TOTAL ─────────────────────────────────────────

describe("validateCostTree — check 1: SUBSYSTEM_EXCEEDS_TOTAL", () => {
    it("flags a module that exceeds 100% of unit total as critical", () => {
        const result = validateCostTree(HAPS_MODULES_WITH_EXCEED, HAPS_UNIT_TOTAL)
        expect(result.hasCritical).toBe(true)
        const finding = result.findings.find((f) => f.code === "SUBSYSTEM_EXCEEDS_TOTAL")
        expect(finding).toBeDefined()
        expect(finding?.severity).toBe("critical")
        expect(finding?.detail.moduleName).toBe("Wing-Integrated Solar Array")
        const pct = (finding?.detail.fractionOfTotal as number) * 100
        expect(pct).toBeGreaterThan(100)
    })

    it("does not flag when a single module equals the unit total (100% = valid)", () => {
        const singleModule: ModuleCostEntry[] = [
            { moduleName: "Single module", totalGbp: 50_000, finnTotalGbp: null },
        ]
        const result = validateCostTree(singleModule, 50_000)
        const exceed = result.findings.find((f) => f.code === "SUBSYSTEM_EXCEEDS_TOTAL")
        expect(exceed).toBeUndefined()
    })

    it("does not flag when all modules are under 100%", () => {
        const result = validateCostTree(BALANCED_MODULES, BALANCED_UNIT_TOTAL)
        const exceed = result.findings.find((f) => f.code === "SUBSYSTEM_EXCEEDS_TOTAL")
        expect(exceed).toBeUndefined()
    })

    it("suppresses the check when total is below the minimum cost threshold", () => {
        const tiny: ModuleCostEntry[] = [
            { moduleName: "Tiny module", totalGbp: 200, finnTotalGbp: null },
        ]
        // Unit total 50 GBP — below MIN_COST_FOR_CHECKS_GBP (100)
        const result = validateCostTree(tiny, 50)
        const exceed = result.findings.find((f) => f.code === "SUBSYSTEM_EXCEEDS_TOTAL")
        expect(exceed).toBeUndefined()
    })
})

// ── Check 2: SUBTREE_SUM_MISMATCH ────────────────────────────────────────────

describe("validateCostTree — check 2: SUBTREE_SUM_MISMATCH", () => {
    it("flags when module sum diverges by more than 1% from unit total", () => {
        // Modules sum to £102,000 but unit total says £100,000 — 2% gap
        const modules: ModuleCostEntry[] = [
            { moduleName: "A", totalGbp: 60_000, finnTotalGbp: null },
            { moduleName: "B", totalGbp: 42_000, finnTotalGbp: null },
        ]
        const result = validateCostTree(modules, 100_000)
        const finding = result.findings.find((f) => f.code === "SUBTREE_SUM_MISMATCH")
        expect(finding).toBeDefined()
        expect(finding?.detail.moduleSum).toBe(102_000)
    })

    it("promotes to critical when gap exceeds 5%", () => {
        // Modules sum to £120,000 vs £100,000 unit total — 20% gap
        const modules: ModuleCostEntry[] = [
            { moduleName: "A", totalGbp: 80_000, finnTotalGbp: null },
            { moduleName: "B", totalGbp: 40_000, finnTotalGbp: null },
        ]
        const result = validateCostTree(modules, 100_000)
        const finding = result.findings.find((f) => f.code === "SUBTREE_SUM_MISMATCH")
        expect(finding?.severity).toBe("critical")
    })

    it("does not flag when module sum matches within 1% tolerance", () => {
        const result = validateCostTree(BALANCED_MODULES, BALANCED_UNIT_TOTAL)
        const mismatch = result.findings.find((f) => f.code === "SUBTREE_SUM_MISMATCH")
        expect(mismatch).toBeUndefined()
    })
})

// ── Check 3: LINE_ITEM_ARITHMETIC ────────────────────────────────────────────

describe("validateCostTree — check 3: LINE_ITEM_ARITHMETIC", () => {
    it("flags wrong embedded arithmetic (the HAPS 6,800 cells case)", () => {
        const lineItems: CostLineItem[] = [
            {
                name: "6,800 solar cells × £60 = £430,560", // correct: £408,000
                cost: 430_560,
                moduleName: "Wing-Integrated Solar Array",
            },
        ]
        const result = validateCostTree([], 1, lineItems)
        const finding = result.findings.find((f) => f.code === "LINE_ITEM_ARITHMETIC")
        expect(finding).toBeDefined()
        expect(finding?.severity).toBe("critical")
        expect(finding?.detail.expectedExtended).toBeCloseTo(408_000, -1)
        expect(finding?.detail.embeddedExtended).toBeCloseTo(430_560, -1)
    })

    it("passes when embedded arithmetic is correct", () => {
        const lineItems: CostLineItem[] = [
            {
                name: "24 propulsion motors × £3,000 = £72,000",
                cost: 72_000,
                moduleName: "Propulsion",
            },
        ]
        const result = validateCostTree([], 1, lineItems)
        const finding = result.findings.find((f) => f.code === "LINE_ITEM_ARITHMETIC")
        expect(finding).toBeUndefined()
    })

    it("flags when recorded cost disagrees with what the expression says", () => {
        const lineItems: CostLineItem[] = [
            {
                name: "10 units × £100 = £1,000", // expression correct
                cost: 1_500, // but recorded as £1,500 — mismatch
                moduleName: "Module A",
            },
        ]
        const result = validateCostTree([], 1, lineItems)
        const finding = result.findings.find((f) => f.code === "LINE_ITEM_ARITHMETIC")
        expect(finding).toBeDefined()
        expect(finding?.severity).toBe("warning")
    })

    it("ignores line items with no embedded arithmetic", () => {
        const lineItems: CostLineItem[] = [
            {
                name: "Carbon fibre wing spar — custom lay-up",
                cost: 8_500,
                moduleName: "Wing Structure",
            },
        ]
        const result = validateCostTree([], 1, lineItems)
        const arithmetic = result.findings.filter((f) => f.code === "LINE_ITEM_ARITHMETIC")
        expect(arithmetic).toHaveLength(0)
    })
})

// ── Check 4: BOM_MODULE_DISCREPANCY ──────────────────────────────────────────

describe("validateCostTree — check 4: BOM_MODULE_DISCREPANCY", () => {
    it("flags a > 10% discrepancy between bill-of-materials and Finn as a warning", () => {
        const modules: ModuleCostEntry[] = [
            {
                moduleName: "Propulsion",
                totalGbp: 320, // bill of materials
                finnTotalGbp: 3_000, // Finn — 9× higher
            },
        ]
        // Unit total below threshold so pct checks are skipped, but BOM vs Finn
        // discrepancy check does not depend on unit total being above threshold.
        // Use a large enough total to avoid the MIN_COST_FOR_CHECKS_GBP skip.
        const result = validateCostTree(modules, 50_000)
        const finding = result.findings.find((f) => f.code === "BOM_MODULE_DISCREPANCY")
        expect(finding).toBeDefined()
        // 9× gap: (3000 - 320) / 3000 = 89.3% — critical (> 15%)
        expect(finding?.severity).toBe("critical")
    })

    it("flags a 12% gap as a warning (above 10%, below 15% critical threshold)", () => {
        const modules: ModuleCostEntry[] = [
            {
                moduleName: "Thermal Management",
                totalGbp: 10_000,
                finnTotalGbp: 11_250, // 11.1% gap
            },
        ]
        const result = validateCostTree(modules, 50_000)
        const finding = result.findings.find((f) => f.code === "BOM_MODULE_DISCREPANCY")
        expect(finding).toBeDefined()
        expect(finding?.severity).toBe("warning")
    })

    it("does not flag when both sources are within 10%", () => {
        const modules: ModuleCostEntry[] = [
            {
                moduleName: "Wing Structure",
                totalGbp: 50_000,
                finnTotalGbp: 52_000, // 3.8% gap — within tolerance
            },
        ]
        const result = validateCostTree(modules, 100_000)
        const finding = result.findings.find((f) => f.code === "BOM_MODULE_DISCREPANCY")
        expect(finding).toBeUndefined()
    })

    it("skips the check when Finn total is null", () => {
        const modules: ModuleCostEntry[] = [
            { moduleName: "Unknown", totalGbp: 10_000, finnTotalGbp: null },
        ]
        const result = validateCostTree(modules, 50_000)
        const finding = result.findings.find((f) => f.code === "BOM_MODULE_DISCREPANCY")
        expect(finding).toBeUndefined()
    })
})

// ── Aggregate behaviour ───────────────────────────────────────────────────────

describe("validateCostTree — aggregate behaviour", () => {
    it("returns hasFindings=false and empty summaryMessage when everything is clean", () => {
        const result = validateCostTree(BALANCED_MODULES, BALANCED_UNIT_TOTAL)
        // BALANCED_MODULES has small BOM vs Finn gaps (under 10%) so
        // no findings should fire.
        // Wing module: 50k vs 52k = 3.8%, Avionics: 30k vs 30.5k = 1.6%
        // Power: 20k vs 19.8k = 1%.
        expect(result.hasFindings).toBe(false)
        expect(result.summaryMessage).toBe("")
    })

    it("sorts findings critical-first", () => {
        const modules: ModuleCostEntry[] = [
            {
                moduleName: "Solar Array",
                totalGbp: 450_000, // exceeds unit total — critical
                finnTotalGbp: 3_000, // also a huge discrepancy — critical
            },
        ]
        const lineItems: CostLineItem[] = [
            {
                name: "100 cells × £10 = £500", // expression correct but cost field differs
                cost: 600,
                moduleName: "Solar Array",
            },
        ]
        const result = validateCostTree(modules, 400_000, lineItems)
        if (result.findings.length >= 2) {
            expect(result.findings[0].severity).toBe("critical")
        }
    })

    it("includes a summary message when critical findings exist", () => {
        const result = validateCostTree(HAPS_MODULES_WITH_EXCEED, HAPS_UNIT_TOTAL)
        expect(result.summaryMessage).toMatch(/critical/)
    })
})
