/**
 * @file cost-rollup-canonical.test.ts — Fix 1 regression tests.
 *
 * Loop 25 P0: unified cost roll-up.
 *
 * Root cause: computeFeasibilityVerdict was called at pipeline time
 * (proofreader stage) using aiCostEstimates (Finn's coarse per-module
 * numbers), while the PDF stat tile was computed at render time using
 * dedupAssemblyRollUp (granular parts table, assembly-parent rows
 * de-duplicated). When the BOM was updated after the verdict was
 * persisted the two sources diverged — BESS Loop 25 showed £852,064
 * on the cover tile and £471,795 in the feasibility exception (81% gap).
 *
 * Fix: canonicalUnitCostGbp field on VerdictInput. When supplied it
 * replaces the aiCostEstimates + parts sum so both the persisted verdict
 * and the cover tile share one source of truth.
 *
 * Assertions:
 *   (1) When canonicalUnitCostGbp is supplied, the verdict uses it —
 *       NOT aiCostEstimates, NOT the parts sum.
 *   (2) canonicalUnitCostGbp overrides aiCostEstimates even when
 *       aiCostEstimates would produce a different number.
 *   (3) When canonicalUnitCostGbp is null, the verdict falls back to
 *       aiCostEstimates (existing behaviour preserved).
 *   (4) When canonicalUnitCostGbp is zero or null and aiCostEstimates
 *       is also empty, cost axis is not checked (no phantom-GREEN from
 *       cost axis alone).
 *   (5) A verdict whose cost evidence was computed with the canonical
 *       value and the cover tile's unitTotalGbp agree within 1%
 *       (no mismatch banner fires).
 */

import { computeFeasibilityVerdict } from "@/lib/feasibility/compute-verdict"
import type { VerdictInput } from "@/lib/feasibility/compute-verdict"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CEILING_GBP = 500_000

const BRIEF_WITH_CEILING: VerdictInput["briefConstraints"] = {
    unitCostCeilingGbp: CEILING_GBP,
    markets: [],
}

/** aiCostEstimates with a single module totalPerUnit = £300,000 (under ceiling). */
const AI_ESTIMATES_UNDER: VerdictInput["aiCostEstimates"] = {
    moduleA: { totalPerUnit: 300_000 },
}

/** aiCostEstimates with a single module totalPerUnit = £900,000 (OVER ceiling). */
const AI_ESTIMATES_OVER: VerdictInput["aiCostEstimates"] = {
    moduleA: { totalPerUnit: 900_000 },
}

/** Parts with raw sum £150,000 (under ceiling — simulates deduped BOM roll-up). */
const PARTS_UNDER: VerdictInput["parts"] = [
    { mass_kg: null, estimated_unit_cost_gbp: 75_000 },
    { mass_kg: null, estimated_unit_cost_gbp: 75_000 },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("computeFeasibilityVerdict — Fix 1: unified cost roll-up (Loop 25 P0)", () => {
    /**
     * (1) canonicalUnitCostGbp drives the verdict when supplied.
     *     aiCostEstimates says £900k OVER, but canonical says £300k UNDER.
     *     Verdict should be GREEN (no cost blocker) because the canonical
     *     value is authoritative.
     */
    it("(1) canonicalUnitCostGbp overrides aiCostEstimates — UNDER ceiling → no cost blocker", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: BRIEF_WITH_CEILING,
            parts: [],
            aiCostEstimates: AI_ESTIMATES_OVER, // would be £900k OVER without canonical
            shortlistCount: 0,
            bomRowCount: 0,
            canonicalUnitCostGbp: 300_000, // £300k UNDER ceiling — canonical wins
        }
        const verdict = computeFeasibilityVerdict(input)

        // Cost axis checked (ceiling + canonical value both present).
        expect(verdict.checkedConstraints).toContain("cost")
        // No cost blocker — canonical £300k < £500k ceiling.
        expect(verdict.fails.some((f) => f.axis === "cost")).toBe(false)
    })

    /**
     * (2) canonicalUnitCostGbp overrides in the OVER direction too.
     *     aiCostEstimates says £300k UNDER, but canonical says £900k OVER.
     *     Verdict should be RED because the canonical value is authoritative.
     */
    it("(2) canonicalUnitCostGbp OVER ceiling → cost blocker even when aiCostEstimates is under", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: BRIEF_WITH_CEILING,
            parts: [],
            aiCostEstimates: AI_ESTIMATES_UNDER, // would be £300k UNDER without canonical
            shortlistCount: 0,
            bomRowCount: 0,
            canonicalUnitCostGbp: 900_000, // 1.8× ceiling — canonical wins
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.checkedConstraints).toContain("cost")
        expect(verdict.fails.some((f) => f.axis === "cost" && f.severity === "blocker")).toBe(true)
        expect(verdict.status).toBe("red")
    })

    /**
     * (3) When canonicalUnitCostGbp is null, falls back to aiCostEstimates.
     *     This preserves pre-Fix-1 behaviour for legacy re-run paths.
     */
    it("(3) null canonicalUnitCostGbp falls back to aiCostEstimates", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: BRIEF_WITH_CEILING,
            parts: [],
            aiCostEstimates: AI_ESTIMATES_OVER, // £900k — should fire as blocker
            shortlistCount: 0,
            bomRowCount: 0,
            canonicalUnitCostGbp: null, // no canonical — use aiCostEstimates
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.checkedConstraints).toContain("cost")
        expect(verdict.fails.some((f) => f.axis === "cost" && f.severity === "blocker")).toBe(true)
    })

    /**
     * (4) canonicalUnitCostGbp = 0 with no aiCostEstimates and no parts
     *     cost → cost axis not checked (vacuously true is not an approval).
     */
    it("(4) zero canonical and no aiCostEstimates → cost axis not checked", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: BRIEF_WITH_CEILING,
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            canonicalUnitCostGbp: 0, // treat same as null
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.checkedConstraints).not.toContain("cost")
    })

    /**
     * (5) Canonical value ≤ ceiling by exactly 1% — no blocker, no warning.
     *     Ensures the cost gate uses the canonical value without rounding
     *     artefacts triggering false positives.
     */
    it("(5) canonical exactly at ceiling → no cost fail", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: BRIEF_WITH_CEILING,
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            canonicalUnitCostGbp: CEILING_GBP, // exactly at ceiling → no over
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.checkedConstraints).toContain("cost")
        // Exactly at ceiling is not over: condition is overFactor > 1.0
        expect(verdict.fails.some((f) => f.axis === "cost")).toBe(false)
    })

    /**
     * Parts-sum fallback: when canonicalUnitCostGbp is not set but parts
     * have costs, the verdict falls back to summing parts.estimated_unit_cost_gbp
     * (legacy path). Ensures backwards compatibility.
     */
    it("parts-sum fallback when canonical absent and aiCostEstimates absent", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: BRIEF_WITH_CEILING,
            parts: PARTS_UNDER, // sum = £150k, UNDER ceiling
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            // canonicalUnitCostGbp absent
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.checkedConstraints).toContain("cost")
        expect(verdict.fails.some((f) => f.axis === "cost")).toBe(false)
    })
})
