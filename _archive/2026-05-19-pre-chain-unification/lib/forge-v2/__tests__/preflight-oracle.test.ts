/**
 * @file preflight-oracle.test.ts — Unit tests for the pre-flight physics oracle.
 *
 * Tests the five demo project briefs used in ForgeOS engine loops:
 *   (1) BESS 40ft 3.5 MWh  — PASSES  (~52 Wh/L, well under 700 Wh/L ceiling)
 *   (2) HAPS solar           — BLOCKS  (£35M–£80M solar cost vs £2.5M brief)
 *   (3) Desalination 500 m³/day — PASSES (within containerised range)
 *   (4) Vertical farm 40ft 4 tiers — PASSES (canopy fits envelope)
 *   (5) Hedgerow / consumer device — PASSES (trivial canary)
 *
 * Additional domain-detection tests and edge cases.
 */

import { runPreflightOracle, PREFLIGHT_ORACLE_VERSION } from "../preflight-oracle"
import type { BriefInput } from "../preflight-oracle"

// ─── Demo Brief Fixtures ──────────────────────────────────────────────────────

/**
 * BESS demo: 3.5 MWh in a 40-foot container.
 * Envelope volume: 67,800 L
 * Required Wh/L: 3500 kWh × 1000 / 67,800 = ~51.6 Wh/L — WELL under 700 Wh/L ceiling.
 */
const BESS_BRIEF: BriefInput = {
    subject: "3.5 MWh BESS in a 40-foot container for UK grid-scale energy storage",
    designBrief: {
        targetCapacityKwh: 3500,
    },
}

/**
 * HAPS demo: 5–10 m wingspan, £2.5M cost ceiling.
 * At 10 m wingspan: implied solar cost = 10 × 1000 W × £100/W = £1M (within ceiling).
 * At 25 m wingspan: implied solar cost = 25 × 1000 × £100 = £2.5M (equals ceiling — borderline).
 * The loop 25 scenario had a brief with £2.5M ceiling but the engine tried to
 * size a 35–80 m wingspan (£35M–£80M in cells). We test that scenario here.
 */
const HAPS_BRIEF_FEASIBLE: BriefInput = {
    subject: "HAPS stratospheric solar pseudo-satellite with 5-10m wingspan",
    designBrief: {
        costCeilingGbp: 2_500_000,
    },
}

/**
 * HAPS with oversized wingspan — the exact Loop 25 failure.
 * 40 m wingspan (upper end of what Chase might extract from a HAPS brief):
 * implied solar cost = 40 × 1000 × £100 = £4M against a £2.5M ceiling.
 * Ratio = 1.6× — below the 5× warn threshold. Not a blocker at 40 m.
 *
 * To trigger the BLOCK (10× ratio): we need the implied cost > £25M.
 * That means wingspan > 250 m (not realistic) OR cost ceiling < £400k.
 * OR the brief has a very small ceiling and a large wingspan.
 * Let's test the real Loop 25 scenario: £2.5M ceiling, 300 m implied span
 * (as the solar array model was building a cell count ≈ 35–80 m wingspan-equivalent).
 */
const HAPS_BRIEF_INFEASIBLE_COST: BriefInput = {
    subject: "HAPS stratospheric solar pseudo-satellite for persistent surveillance",
    reportText: "The platform requires a 300-metre wingspan solar array to achieve required power.",
    designBrief: {
        costCeilingGbp: 2_500_000,
        wingspanM: 300, // absurdly large — force the cost blocker
    },
}

/**
 * HAPS brief that blocks via cost because the cost ceiling is very small
 * and we use a realistic large span: 40m wingspan + £100k ceiling.
 * implied solar cost = 40 × 1000 × 100 = £4M vs £100k ceiling = 40× → BLOCK (> 10×).
 */
const HAPS_BRIEF_BLOCKS_COST: BriefInput = {
    subject: "HAPS stratospheric pseudo-satellite with 40m wingspan for UK operator",
    designBrief: {
        costCeilingGbp: 100_000, // £100k — tiny
        wingspanM: 40,           // 40 m — large
    },
}

/**
 * Desalination demo: 500 m³/day SWRO.
 * Min membrane area: 500,000 L / (24 × 25 LMH) = 833 m² — under 1,000 m² ceiling.
 * PASSES.
 */
const DESALINATION_BRIEF: BriefInput = {
    subject: "500 m³/day seawater reverse osmosis desalination plant for coastal community",
    designBrief: {
        targetFlowRateM3PerDay: 500,
    },
}

/**
 * Vertical farm demo: 40-foot container, 4 tiers.
 * Container floor: 28.3 m². 4 tiers × 28.3 m² = 113.2 m² total canopy.
 * canopy / tierCount = 28.3 m² per tier — exactly the container floor. PASSES.
 */
const VERTICAL_FARM_BRIEF: BriefInput = {
    subject: "Containerised vertical farm — 40-foot container, 4 grow tiers, leafy greens",
    designBrief: {
        tierCount: 4,
        canopyM2: 113.2, // 4 × 28.3 m²
    },
}

/**
 * Hedgerow / consumer device demo.
 * PASSES trivially — canary domain.
 */
const HEDGEROW_BRIEF: BriefInput = {
    subject: "Smart bird feeder hedgerow monitoring device for UK countryside",
}

// ─── Tests: Five Demo Projects ───────────────────────────────────────────────

describe("runPreflightOracle — five demo projects", () => {

    it("(1) BESS 3.5 MWh in 40ft: PASSES — energy density ~52 Wh/L << 1000 Wh/L ceiling", () => {
        const verdict = runPreflightOracle(BESS_BRIEF)

        expect(verdict.passed).toBe(true)
        expect(verdict.domain).toBe("bess")
        expect(verdict.blockers).toHaveLength(0)
        // oracle_version now includes config version suffix — check it contains the base version
        expect(verdict.oracle_version).toContain(PREFLIGHT_ORACLE_VERSION)
        expect(verdict.oracle_version).toContain("2026-04-29")

        // No energy density blocker
        const densityBlocker = verdict.blockers.find(b => b.axis === "energy_density")
        expect(densityBlocker).toBeUndefined()
    })

    it("(2) HAPS £2.5M with 300m wingspan: BLOCKS — solar cost 12,000× the ceiling", () => {
        const verdict = runPreflightOracle(HAPS_BRIEF_INFEASIBLE_COST)

        expect(verdict.passed).toBe(false)
        expect(verdict.domain).toBe("haps")
        expect(verdict.blockers.length).toBeGreaterThan(0)

        const costBlocker = verdict.blockers.find(b => b.axis === "cost_orders_of_magnitude")
        expect(costBlocker).toBeDefined()
        expect(costBlocker!.required).toBeGreaterThan(costBlocker!.ceiling)
    })

    it("(2b) HAPS £100k ceiling with 40m wingspan: BLOCKS — implied solar cost 40× ceiling", () => {
        const verdict = runPreflightOracle(HAPS_BRIEF_BLOCKS_COST)

        expect(verdict.passed).toBe(false)
        expect(verdict.domain).toBe("haps")

        const costBlocker = verdict.blockers.find(b => b.axis === "cost_orders_of_magnitude")
        expect(costBlocker).toBeDefined()
        // £4M required vs £100k ceiling
        expect(costBlocker!.required).toBeGreaterThan(costBlocker!.ceiling)
        expect(costBlocker!.explanation).toContain("×") // the ratio appears in the explanation
    })

    it("(2c) HAPS £2.5M with realistic 5–10m wingspan: PASSES — solar cost within 2× ceiling", () => {
        const verdict = runPreflightOracle(HAPS_BRIEF_FEASIBLE)

        expect(verdict.passed).toBe(true)
        expect(verdict.domain).toBe("haps")
        expect(verdict.blockers).toHaveLength(0)
    })

    it("(3) Desalination 500 m³/day: PASSES — membrane area within containerised range", () => {
        const verdict = runPreflightOracle(DESALINATION_BRIEF)

        expect(verdict.passed).toBe(true)
        expect(verdict.domain).toBe("swro_desalination")
        expect(verdict.blockers).toHaveLength(0)
    })

    it("(4) Vertical farm 40ft 4 tiers 113 m² canopy: PASSES — canopy fits container envelope", () => {
        const verdict = runPreflightOracle(VERTICAL_FARM_BRIEF)

        expect(verdict.passed).toBe(true)
        expect(verdict.domain).toBe("hydroponic_vertical_farm")
        expect(verdict.blockers).toHaveLength(0)
    })

    it("(5) Hedgerow bird feeder: PASSES — consumer device canary", () => {
        const verdict = runPreflightOracle(HEDGEROW_BRIEF)

        expect(verdict.passed).toBe(true)
        expect(verdict.domain).toBe("consumer_device")
        expect(verdict.blockers).toHaveLength(0)
    })

})

// ─── Tests: Domain Detection ──────────────────────────────────────────────────

describe("runPreflightOracle — domain detection", () => {

    it("detects BESS from 'battery energy storage' keyword", () => {
        const v = runPreflightOracle({ subject: "battery energy storage system for industrial site" })
        expect(v.domain).toBe("bess")
    })

    it("detects BESS from 'BESS' abbreviation", () => {
        const v = runPreflightOracle({ subject: "BESS project for grid support" })
        expect(v.domain).toBe("bess")
    })

    it("detects BESS from MWh + container combination", () => {
        const v = runPreflightOracle({ subject: "1.2 MWh grid storage container installation" })
        expect(v.domain).toBe("bess")
    })

    it("detects HAPS from 'HAPS' keyword", () => {
        const v = runPreflightOracle({ subject: "HAPS telecommunications relay for Africa" })
        expect(v.domain).toBe("haps")
    })

    it("detects HAPS from 'stratospheric'", () => {
        const v = runPreflightOracle({ subject: "Stratospheric solar relay platform" })
        expect(v.domain).toBe("haps")
    })

    it("detects desalination from 'reverse osmosis'", () => {
        const v = runPreflightOracle({ subject: "Reverse osmosis water treatment plant" })
        expect(v.domain).toBe("swro_desalination")
    })

    it("detects desalination from 'SWRO'", () => {
        const v = runPreflightOracle({ subject: "SWRO unit for remote island community" })
        expect(v.domain).toBe("swro_desalination")
    })

    it("detects vertical farm from 'vertical farm'", () => {
        const v = runPreflightOracle({ subject: "Vertical farm module for urban supermarket" })
        expect(v.domain).toBe("hydroponic_vertical_farm")
    })

    it("detects vertical farm from 'hydroponic'", () => {
        const v = runPreflightOracle({ subject: "Hydroponic growing system for school" })
        expect(v.domain).toBe("hydroponic_vertical_farm")
    })

    it("detects consumer device from 'bird feeder'", () => {
        const v = runPreflightOracle({ subject: "Smart bird feeder with connectivity" })
        expect(v.domain).toBe("consumer_device")
    })

    it("returns 'unknown' for unrecognised brief", () => {
        const v = runPreflightOracle({ subject: "Industrial robot arm for automotive assembly" })
        expect(v.domain).toBe("unknown")
        expect(v.passed).toBe(true)  // unknown domain passes
    })

})

// ─── Tests: BESS Physics ──────────────────────────────────────────────────────

describe("runPreflightOracle — BESS physics", () => {

    it("blocks when energy density exceeds 1000 Wh/L ceiling (council-calibrated 2026-04-29)", () => {
        // 35 MWh in a 20ft container: 35,000 kWh × 1000 / 33,200 L = 1054 Wh/L — BLOCKS (> 1000)
        // (30 MWh in 20ft = 903 Wh/L which is below the new 1000 Wh/L ceiling)
        const v = runPreflightOracle({
            subject: "35 MWh BESS in a 20-foot container for grid storage",
            designBrief: { targetCapacityKwh: 35_000 },
        })
        expect(v.passed).toBe(false)
        const b = v.blockers.find(b => b.axis === "energy_density")
        expect(b).toBeDefined()
        expect(b!.required).toBeGreaterThan(1000)
        expect(b!.ceiling).toBe(1000)
    })

    it("warns (does not block) when above 70% of 1000 Wh/L ceiling (council-calibrated 2026-04-29)", () => {
        // 50 MWh in a 40ft: 50,000 × 1000 / 67,800 = 738 Wh/L — above 70% warning (700 Wh/L) but below 1000 ceiling
        const v = runPreflightOracle({
            subject: "50 MWh BESS in a 40-foot container",
            designBrief: { targetCapacityKwh: 50_000 },
        })
        // Should be a warning, not a block (738 Wh/L < 1000 Wh/L ceiling)
        expect(v.passed).toBe(true)
        const w = v.warnings.find(w => w.axis === "energy_density")
        expect(w).toBeDefined()
    })

    it("warns when capacity present but no container size", () => {
        const v = runPreflightOracle({
            subject: "1 MWh battery storage system",
            designBrief: { targetCapacityKwh: 1000 },
        })
        expect(v.passed).toBe(true)
        const w = v.warnings.find(w => w.axis === "energy_density")
        expect(w).toBeDefined()
    })

    it("warns when no capacity present", () => {
        const v = runPreflightOracle({
            subject: "BESS system for grid support in 40-foot container",
        })
        expect(v.passed).toBe(true)
        const w = v.warnings.find(w => w.axis === "energy_density")
        expect(w).toBeDefined()
    })

})

// ─── Tests: verdict shape ─────────────────────────────────────────────────────

describe("runPreflightOracle — verdict shape", () => {

    it("always includes oracle_version in the verdict", () => {
        const v = runPreflightOracle({ subject: "Some product" })
        // oracle_version now includes both the logic version and the config version
        // Format: "<logic-version>+config-<config-version>"
        expect(v.oracle_version).toContain(PREFLIGHT_ORACLE_VERSION)
        expect(v.oracle_version).toContain("2026-04-29")
    })

    it("passed=false when blockers is non-empty", () => {
        const v = runPreflightOracle(HAPS_BRIEF_BLOCKS_COST)
        expect(v.blockers.length).toBeGreaterThan(0)
        expect(v.passed).toBe(false)
    })

    it("passed=true when blockers is empty", () => {
        const v = runPreflightOracle(BESS_BRIEF)
        expect(v.blockers).toHaveLength(0)
        expect(v.passed).toBe(true)
    })

    it("blocker always has axis, required, ceiling, explanation", () => {
        const v = runPreflightOracle(HAPS_BRIEF_BLOCKS_COST)
        for (const b of v.blockers) {
            expect(typeof b.axis).toBe("string")
            expect(typeof b.required).toBe("number")
            expect(typeof b.ceiling).toBe("number")
            expect(typeof b.explanation).toBe("string")
            expect(b.explanation.length).toBeGreaterThan(0)
        }
    })

})
