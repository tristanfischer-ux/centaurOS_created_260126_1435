/**
 * @file cross-modal-consistency.test.ts
 *
 * Loop 24 evidence: BOM count and illustration object count diverged on
 * 4 of 5 demos. These tests pin the deterministic gate against the spec's
 * examples and edge cases.
 *
 * Test matrix:
 *   (1) module 5-vessels-vs-BOM-3-vessels:           BLOCKER fires (40% short)
 *   (2) module 5-vessels-vs-BOM-5-vessels:           OK (0% divergence)
 *   (3) module 5-vessels-vs-BOM-7-vessels:           OK (BOM over keyParts is normal — Loop 26 fix)
 *   (4) cost rollup divergence >1%:                  BLOCKER fires
 *   (5) cost rollup divergence exactly at 1%:        no BLOCKER (boundary)
 *   (6) cost rollup divergence <1%:                  OK
 *   (7) missing module_id mapping (no BOM rows):     WARNING not BLOCKER
 *   (8) module with no keyParts declared:            WARNING not BLOCKER
 *   (9) illustration URL present:                    WARNING (skipped) not BLOCKER
 *  (10) Fang layout SHORTER than keyParts by >10%:   BLOCKER fires
 * (10b) Fang layout LONGER than keyParts:            OK (Loop 26 fix — one-sided)
 *  (11) Fang layout count divergence ≤10%:           OK
 *  (12) passed flag reflects blockers correctly
 *  (13) multiple modules — only divergent modules fire BLOCKER
 */

import {
    runCrossModalCheck,
    type CrossModalInput,
} from "@/lib/forge-v2/cross-modal-consistency"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MODULE_PRESSURE_VESSELS = {
    id: "mod-pv",
    name: "Pressure Vessel Bank",
    keyParts: ["vessel-1", "vessel-2", "vessel-3", "vessel-4", "vessel-5"],
}

const MODULE_PCS_SKID = {
    id: "mod-pcs",
    name: "PCS Skid",
    keyParts: ["skid-1"],
}

function makeInput(overrides: Partial<CrossModalInput>): CrossModalInput {
    return {
        modules: [MODULE_PRESSURE_VESSELS],
        bomPartCountByModuleId: { "mod-pv": 5 },
        canonicalBomTotalGbp: null,
        finnModuleTotalGbp: null,
        fangLayoutPlacementsByModuleId: null,
        systemIllustrationUrl: null,
        ...overrides,
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("runCrossModalCheck — module_part_count axis", () => {
    it("(1) 5 keyParts vs 3 BOM rows → BLOCKER fires (40% short)", () => {
        const verdict = runCrossModalCheck(
            makeInput({ bomPartCountByModuleId: { "mod-pv": 3 } }),
        )
        expect(verdict.passed).toBe(false)
        const blocker = verdict.blockers.find((b) => b.axis === "module_part_count")
        expect(blocker).toBeDefined()
        expect(blocker?.module_id).toBe("mod-pv")
        expect(blocker?.expected).toBe(5)
        expect(blocker?.actual).toBe(3)
        expect(blocker?.divergence_pct).toBeGreaterThan(0.1)
    })

    it("(2) 5 keyParts vs 5 BOM rows → OK (no BLOCKER)", () => {
        const verdict = runCrossModalCheck(
            makeInput({ bomPartCountByModuleId: { "mod-pv": 5 } }),
        )
        expect(verdict.passed).toBe(true)
        expect(verdict.blockers.filter((b) => b.axis === "module_part_count")).toHaveLength(0)
    })

    it("(3) 5 keyParts vs 7 BOM rows → OK (BOM over keyParts is normal — keyParts is curated, BOM is exhaustive)", () => {
        const verdict = runCrossModalCheck(
            makeInput({ bomPartCountByModuleId: { "mod-pv": 7 } }),
        )
        // One-sided gate: BOM longer than keyParts is normal procurement detail,
        // not a divergence. Only BOM-shorter-than-keyParts should fire.
        expect(verdict.blockers.filter((b) => b.axis === "module_part_count")).toHaveLength(0)
    })

    it("(7) module has keyParts but no BOM rows → WARNING not BLOCKER", () => {
        const verdict = runCrossModalCheck(
            makeInput({
                modules: [MODULE_PRESSURE_VESSELS],
                bomPartCountByModuleId: {}, // no entry for mod-pv
            }),
        )
        // Missing mapping is defensive: WARNING only
        expect(verdict.blockers.filter((b) => b.axis === "module_part_count")).toHaveLength(0)
        const warning = verdict.warnings.find((w) => w.axis === "module_part_count")
        expect(warning).toBeDefined()
        expect(warning?.explanation).toContain("mod-pv")
    })

    it("(8) module with no keyParts declared → WARNING not BLOCKER", () => {
        const verdict = runCrossModalCheck(
            makeInput({
                modules: [{ id: "mod-empty", name: "Empty Module", keyParts: [] }],
                bomPartCountByModuleId: { "mod-empty": 3 },
            }),
        )
        expect(verdict.blockers.filter((b) => b.axis === "module_part_count")).toHaveLength(0)
        const warning = verdict.warnings.find((w) => w.axis === "module_part_count")
        expect(warning).toBeDefined()
    })

    it("(13) multiple modules — only divergent modules fire BLOCKER", () => {
        const verdict = runCrossModalCheck({
            modules: [MODULE_PRESSURE_VESSELS, MODULE_PCS_SKID],
            bomPartCountByModuleId: {
                "mod-pv": 3,  // 5 vs 3 → BLOCKER
                "mod-pcs": 1, // 1 vs 1 → OK
            },
            canonicalBomTotalGbp: null,
            finnModuleTotalGbp: null,
            fangLayoutPlacementsByModuleId: null,
            systemIllustrationUrl: null,
        })
        expect(verdict.passed).toBe(false)
        // Only mod-pv fires
        const blockers = verdict.blockers.filter((b) => b.axis === "module_part_count")
        expect(blockers).toHaveLength(1)
        expect(blockers[0].module_id).toBe("mod-pv")
    })
})

describe("runCrossModalCheck — system_cost_rollup axis", () => {
    it("(4) cost rollup divergence >1% → BLOCKER fires", () => {
        const verdict = runCrossModalCheck(
            makeInput({
                canonicalBomTotalGbp: 100_000,
                finnModuleTotalGbp: 102_000, // 2% divergence → BLOCKER
            }),
        )
        const blocker = verdict.blockers.find((b) => b.axis === "system_cost_rollup")
        expect(blocker).toBeDefined()
        expect(blocker?.module_id).toBeNull()
        expect(blocker?.divergence_pct).toBeGreaterThan(0.01)
    })

    it("(5) cost rollup divergence at boundary ~1% → no BLOCKER (boundary ok)", () => {
        // Exactly 1%: |101000 - 100000| / 101000 ≈ 0.0099 < 0.01
        const verdict = runCrossModalCheck(
            makeInput({
                canonicalBomTotalGbp: 100_000,
                finnModuleTotalGbp: 101_000,
            }),
        )
        // |101000 - 100000| / max(101000, 100000) = 1000/101000 ≈ 0.0099 < 0.01
        expect(verdict.blockers.filter((b) => b.axis === "system_cost_rollup")).toHaveLength(0)
    })

    it("(6) cost rollup identical → no BLOCKER", () => {
        const verdict = runCrossModalCheck(
            makeInput({
                canonicalBomTotalGbp: 500_000,
                finnModuleTotalGbp: 500_000,
            }),
        )
        expect(verdict.blockers.filter((b) => b.axis === "system_cost_rollup")).toHaveLength(0)
    })

    it("cost rollup skipped when either value is null", () => {
        const verdictNullCanon = runCrossModalCheck(
            makeInput({ canonicalBomTotalGbp: null, finnModuleTotalGbp: 100_000 }),
        )
        const verdictNullFinn = runCrossModalCheck(
            makeInput({ canonicalBomTotalGbp: 100_000, finnModuleTotalGbp: null }),
        )
        expect(verdictNullCanon.blockers.filter((b) => b.axis === "system_cost_rollup")).toHaveLength(0)
        expect(verdictNullFinn.blockers.filter((b) => b.axis === "system_cost_rollup")).toHaveLength(0)
    })
})

describe("runCrossModalCheck — fang_layout_count axis", () => {
    it("(10) Fang layout SHORTER than keyParts by >10% → BLOCKER fires", () => {
        const verdict = runCrossModalCheck(
            makeInput({
                fangLayoutPlacementsByModuleId: { "mod-pv": 3 }, // 5 keyParts vs 3 placements → 40% short
            }),
        )
        const blocker = verdict.blockers.find((b) => b.axis === "fang_layout_count")
        expect(blocker).toBeDefined()
        expect(blocker?.module_id).toBe("mod-pv")
        expect(blocker?.expected).toBe(5)
        expect(blocker?.actual).toBe(3)
    })

    it("(10b) Fang layout LONGER than keyParts → OK (sub-assemblies / fasteners legitimately exceed curated keyParts)", () => {
        const verdict = runCrossModalCheck(
            makeInput({
                fangLayoutPlacementsByModuleId: { "mod-pv": 6 }, // 5 keyParts vs 6 placements
            }),
        )
        expect(verdict.blockers.filter((b) => b.axis === "fang_layout_count")).toHaveLength(0)
    })

    it("(11) Fang layout count divergence ≤10% → OK", () => {
        // 5 keyParts vs 5 placements → 0% divergence
        const verdict = runCrossModalCheck(
            makeInput({
                fangLayoutPlacementsByModuleId: { "mod-pv": 5 },
            }),
        )
        expect(verdict.blockers.filter((b) => b.axis === "fang_layout_count")).toHaveLength(0)
    })

    it("fang_layout_count skipped when placements map is null", () => {
        const verdict = runCrossModalCheck(
            makeInput({ fangLayoutPlacementsByModuleId: null }),
        )
        expect(verdict.blockers.filter((b) => b.axis === "fang_layout_count")).toHaveLength(0)
    })
})

describe("runCrossModalCheck — illustration_object_count axis", () => {
    it("(9) illustration URL present → WARNING (skipped) not BLOCKER", () => {
        const verdict = runCrossModalCheck(
            makeInput({
                systemIllustrationUrl: "https://example.com/illustration.png",
            }),
        )
        expect(verdict.blockers.filter((b) => b.axis === "illustration_object_count")).toHaveLength(0)
        const warning = verdict.warnings.find((w) => w.axis === "illustration_object_count")
        expect(warning).toBeDefined()
        expect(warning?.explanation).toContain("illustration_object_count")
    })

    it("no warning when illustration URL is null", () => {
        const verdict = runCrossModalCheck(
            makeInput({ systemIllustrationUrl: null }),
        )
        expect(verdict.warnings.filter((w) => w.axis === "illustration_object_count")).toHaveLength(0)
    })
})

describe("runCrossModalCheck — passed flag and version", () => {
    it("(12) passed is true when no blockers", () => {
        const verdict = runCrossModalCheck(
            makeInput({ bomPartCountByModuleId: { "mod-pv": 5 } }),
        )
        expect(verdict.passed).toBe(true)
        expect(verdict.blockers).toHaveLength(0)
    })

    it("(12) passed is false when at least one blocker", () => {
        const verdict = runCrossModalCheck(
            makeInput({ bomPartCountByModuleId: { "mod-pv": 1 } }),
        )
        expect(verdict.passed).toBe(false)
    })

    it("cross_modal_version is a semver string", () => {
        const verdict = runCrossModalCheck(makeInput({}))
        expect(verdict.cross_modal_version).toMatch(/^\d+\.\d+\.\d+$/)
    })
})
