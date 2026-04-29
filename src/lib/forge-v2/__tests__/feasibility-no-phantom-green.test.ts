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
    it("(b) all inputs null => GREEN but checkedConstraints empty (phantom-GREEN)", () => {
        const verdict = computeFeasibilityVerdict(EMPTY_INPUT)

        // Status is GREEN because there are no fails — but this is phantom-GREEN.
        expect(verdict.status).toBe("green")
        expect(verdict.fails).toHaveLength(0)

        // THE KEY ASSERTION: checkedConstraints must be empty.
        // This is what the PDF layer uses to detect phantom-GREEN.
        expect(verdict.checkedConstraints).toHaveLength(0)
    })

    /**
     * (c) Valid GREEN is only possible when checkedConstraints.length > 0.
     * Status GREEN with empty checkedConstraints is the phantom pattern.
     */
    it("(c) GREEN without checkedConstraints is NOT valid approval — it is phantom-GREEN", () => {
        const phantomVerdict = computeFeasibilityVerdict(EMPTY_INPUT)
        const validVerdict = computeFeasibilityVerdict(FULL_INPUT)

        // Both are "green" in the raw status field...
        expect(phantomVerdict.status).toBe("green")
        expect(validVerdict.status).toBe("green")

        // ...but only the valid one has checkedConstraints.
        const isPhantomGreen = (v: typeof phantomVerdict) =>
            v.status === "green" && v.checkedConstraints.length === 0

        expect(isPhantomGreen(phantomVerdict)).toBe(true)
        expect(isPhantomGreen(validVerdict)).toBe(false)
    })

    /**
     * Partial input (dimension sheet only, no costs / mass) — envelope
     * axis is checked, others are not. GREEN is partial, not full.
     */
    it("sheet-only input checks only the envelope axis", () => {
        const verdict = computeFeasibilityVerdict(PARTIAL_SHEET_ONLY)

        expect(verdict.status).toBe("green")
        expect(verdict.checkedConstraints).toContain("envelope")
        expect(verdict.checkedConstraints).not.toContain("cost")
        expect(verdict.checkedConstraints).not.toContain("mass")
        expect(verdict.checkedConstraints).not.toContain("transport")
        // bomRowCount === 0 so suppliers not checked either.
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
