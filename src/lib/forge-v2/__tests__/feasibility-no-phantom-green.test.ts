/**
 * @file feasibility-no-phantom-green.test.ts — Regression tests for the
 * Loop 24 P0 phantom-GREEN feasibility gate fix.
 *
 * Three assertions (per the delivery spec):
 *   (a) Empty fails + solver-ran (checkedConstraints non-empty) => GREEN is valid.
 *   (b) No solver invocation (all inputs null) => status still GREEN but
 *       checkedConstraints empty => phantom-GREEN condition fires.
 *   (c) Valid GREEN requires checkedConstraints list to be non-empty AND
 *       status === "green".
 *
 * These are unit tests over the pure `computeFeasibilityVerdict` function —
 * no Supabase, no LLM.
 */

import { computeFeasibilityVerdict } from "@/lib/feasibility/compute-verdict"
import type { VerdictInput } from "@/lib/feasibility/compute-verdict"

// ─── Fixtures ─────────────────────────────────────────────────────────────

/** A dimension sheet that says the design is feasible (no conflicts). */
const FEASIBLE_SHEET: VerdictInput["dimensionSheet"] = {
    feasible: true,
    conflicts: [],
    recommendations: [],
}

/** Brief constraints with a cost ceiling and UK market flag. */
const BRIEF_WITH_CEILING: VerdictInput["briefConstraints"] = {
    unitCostCeilingGbp: 100_000,
    maxMassKg: 10_000,
    markets: ["GB"],
}

/** One part with mass and cost well under ceilings. */
const PARTS_UNDER_CEILING: VerdictInput["parts"] = [
    { mass_kg: 500, estimated_unit_cost_gbp: 50_000 },
]

/** Minimal valid input where the solver has real data for every axis. */
const FULL_INPUT: VerdictInput = {
    dimensionSheet: FEASIBLE_SHEET,
    briefConstraints: BRIEF_WITH_CEILING,
    parts: PARTS_UNDER_CEILING,
    aiCostEstimates: null,
    shortlistCount: 3,
    bomRowCount: 3,
    fangModuleReviews: [{ moduleName: "Module 1", issues: [] }],
    fangModuleCoverage: { totalModules: 1, reviewedModuleIds: ["m1"], unreviewedModules: [] },
}

/** Input where ALL inputs are null — the solver has nothing to check. */
const EMPTY_INPUT: VerdictInput = {
    dimensionSheet: null,
    briefConstraints: null,
    parts: [],
    aiCostEstimates: null,
    shortlistCount: 0,
    bomRowCount: 0,
}

/** Input where dimensionSheet is present but briefConstraints is null. */
const PARTIAL_SHEET_ONLY: VerdictInput = {
    dimensionSheet: FEASIBLE_SHEET,
    briefConstraints: null,
    parts: [],
    aiCostEstimates: null,
    shortlistCount: 0,
    bomRowCount: 0,
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("computeFeasibilityVerdict — phantom-GREEN guard (Loop 24 P0)", () => {
    /**
     * (a) Solver ran with real data, found no violations => valid GREEN.
     * checkedConstraints must be non-empty to distinguish from phantom-GREEN.
     */
    it("(a) full inputs with no violations => GREEN with non-empty checkedConstraints", () => {
        const verdict = computeFeasibilityVerdict(FULL_INPUT)

        expect(verdict.status).toBe("green")
        expect(verdict.fails).toHaveLength(0)
        expect(verdict.checkedConstraints.length).toBeGreaterThan(0)

        // Envelope was checked (feasible sheet present with boolean feasible flag).
        expect(verdict.checkedConstraints).toContain("envelope")
        // Cost was checked (ceiling + parts both provided).
        expect(verdict.checkedConstraints).toContain("cost")
        // Mass was checked (ceiling + parts both provided).
        expect(verdict.checkedConstraints).toContain("mass")
        // Transport was checked (UK market in briefConstraints).
        expect(verdict.checkedConstraints).toContain("transport")
        // Suppliers were checked (bomRowCount > 0).
        expect(verdict.checkedConstraints).toContain("suppliers")
    })

    /**
     * (b) No solver inputs at all => status still GREEN (no fails) but
     * checkedConstraints is empty — this is the phantom-GREEN condition.
     * The PDF layer maps this to UNREVIEWED.
     */
    it("(b) all inputs null => AMBER due to data_completeness warning", () => {
        const verdict = computeFeasibilityVerdict(EMPTY_INPUT)

        // With the data_completeness check, null inputs trigger a warning → amber.
        expect(verdict.status).toBe("amber")
        expect(verdict.fails.some((f) => f.axis === "data_completeness")).toBe(true)
        expect(verdict.checkedConstraints).toContain("data_completeness")
    })

    /**
     * (c) Valid GREEN is only possible when checkedConstraints.length > 0.
     * Status GREEN with empty checkedConstraints is the phantom pattern.
     */
    it("(c) null-input verdict is AMBER (data_completeness), full-input verdict is GREEN", () => {
        const phantomVerdict = computeFeasibilityVerdict(EMPTY_INPUT)
        const validVerdict = computeFeasibilityVerdict(FULL_INPUT)

        // Null inputs now produce amber (data_completeness warning).
        expect(phantomVerdict.status).toBe("amber")
        // Full inputs produce green.
        expect(validVerdict.status).toBe("green")

        // The valid verdict has real constraint checks; the null one only has data_completeness.
        expect(validVerdict.checkedConstraints.length).toBeGreaterThan(1)
        expect(phantomVerdict.checkedConstraints).toContain("data_completeness")
    })

    /**
     * Partial input (dimension sheet only, no costs / mass) — envelope
     * axis is checked, others are not. GREEN is partial, not full.
     */
    it("sheet-only input checks envelope axis + data_completeness warning", () => {
        const verdict = computeFeasibilityVerdict(PARTIAL_SHEET_ONLY)

        // Amber because most inputs are null (data_completeness fires).
        expect(verdict.status).toBe("amber")
        expect(verdict.checkedConstraints).toContain("envelope")
        expect(verdict.checkedConstraints).toContain("data_completeness")
        expect(verdict.checkedConstraints).not.toContain("cost")
        expect(verdict.checkedConstraints).not.toContain("mass")
        expect(verdict.checkedConstraints).not.toContain("transport")
        expect(verdict.checkedConstraints).not.toContain("suppliers")
    })

    /**
     * When the dimension sheet declares feasible=false, the verdict is RED
     * AND checkedConstraints includes "envelope" (it WAS checked — and it failed).
     */
    it("infeasible design => RED + envelope in checkedConstraints", () => {
        const input: VerdictInput = {
            ...FULL_INPUT,
            dimensionSheet: {
                feasible: false,
                conflicts: ["Footprint 12.4m × 5.1m exceeds 40ft container dimensions."],
                recommendations: ["Reduce module count from 8 to 5."],
            },
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.status).toBe("red")
        expect(verdict.fails.some((f) => f.axis === "envelope" && f.severity === "blocker")).toBe(true)
        // Envelope was checked even though it failed.
        expect(verdict.checkedConstraints).toContain("envelope")
    })

    /**
     * Cost blocker: design 2× the ceiling. Status RED, cost in checkedConstraints.
     */
    it("cost 2× ceiling => RED + cost in checkedConstraints", () => {
        const input: VerdictInput = {
            ...EMPTY_INPUT,
            briefConstraints: { unitCostCeilingGbp: 50_000, markets: [] },
            parts: [{ mass_kg: null, estimated_unit_cost_gbp: 100_000 }],
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.status).toBe("red")
        expect(verdict.fails.some((f) => f.axis === "cost" && f.severity === "blocker")).toBe(true)
        expect(verdict.checkedConstraints).toContain("cost")
        // No sheet, so envelope not checked.
        expect(verdict.checkedConstraints).not.toContain("envelope")
    })
})
