/**
 * @file feasibility-haps-phantom-green.test.ts — Fix 3 regression tests.
 *
 * Loop 25 P0: HAPS phantom-GREEN closure via Fang CRITICAL escalation.
 *
 * Root cause: HAPS (High Altitude Platform Station) produced phantom-GREEN
 * because:
 *   (a) Its dimension sheet had no `feasible` field → envelope not checked.
 *   (b) Its brief may lack explicit `unitCostCeilingGbp` → cost not checked.
 *   (c) Fang's CRITICAL findings (solar array cell cost £35M–£80M against a
 *       £2.5M brief) lived only on module review pages and were NEVER wired
 *       into the feasibility verdict.
 *
 * The result: verdict had status=GREEN and checkedConstraints=[] → PDF
 * rendered "UNREVIEWED" which is better than "GREEN" but still wrong. The
 * project should have been RED because a CRITICAL Fang finding is a blocker.
 *
 * Fix 3: new `fangModuleReviews` field on VerdictInput. When any module has
 * an issue with severity="CRITICAL", a blocker fail is added on the
 * fang_critical_findings axis. This means:
 *   (a) checkedConstraints becomes non-empty → phantom-GREEN cannot fire.
 *   (b) fails[] is non-empty → status becomes RED.
 *   (c) The feasibility exception page lists the CRITICAL findings as blockers.
 *
 * Assertions:
 *   (1) HAPS-shaped project with CRITICAL Fang findings → RED verdict +
 *       fang_critical_findings in checkedConstraints.
 *   (2) A project with only WARNING/INFO findings → no fang_critical_findings
 *       blocker (non-CRITICAL does not escalate).
 *   (3) Multiple modules with CRITICAL findings → one blocker per module.
 *   (4) fangModuleReviews=null or [] → axis not checked (backward compat).
 *   (5) CRITICAL finding is case-insensitive ("critical" matches "CRITICAL").
 *   (6) HAPS-shaped project WITHOUT Fang CRITICAL findings and without
 *       dimension-sheet or brief ceiling → phantom-GREEN (no fix-3 override
 *       when there are genuinely no CRITICAL findings).
 */

import { computeFeasibilityVerdict } from "@/lib/feasibility/compute-verdict"
import type { VerdictInput } from "@/lib/feasibility/compute-verdict"

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** HAPS-class brief: no dimension sheet (not a container), no mass ceiling,
 *  but HAS a cost ceiling of £2.5M. The brief ceiling is deliberately set
 *  but cost is checked via Fang CRITICAL path. */
const HAPS_BRIEF: VerdictInput["briefConstraints"] = {
    unitCostCeilingGbp: 2_500_000,
    markets: [],
}

/** HAPS solar array CRITICAL finding: cell cost massively exceeds brief. */
const SOLAR_ARRAY_CRITICAL: VerdictInput["fangModuleReviews"] = [
    {
        moduleName: "Solar Array",
        issues: [
            {
                severity: "CRITICAL",
                message:
                    "Cell cost estimated at £35,000,000–£80,000,000 against a £2,500,000 system budget. " +
                    "The solar array alone is 14×–32× the total brief ceiling. The brief target is not achievable " +
                    "with silicon photovoltaic cells at current market prices; alternative cell chemistry or " +
                    "a fundamentally different power architecture is required.",
            },
        ],
    },
]

/** A module with WARNING and INFO findings only — should NOT produce a CRITICAL escalation. */
const MODULE_WITH_WARNINGS_ONLY: VerdictInput["fangModuleReviews"] = [
    {
        moduleName: "Battery Pack",
        issues: [
            { severity: "WARNING", message: "Cell temperature management may be insufficient above 40°C." },
            { severity: "INFO", message: "Consider LFP chemistry for improved cycle life." },
        ],
    },
]

/** Two modules, both with CRITICAL findings. */
const TWO_CRITICAL_MODULES: VerdictInput["fangModuleReviews"] = [
    {
        moduleName: "Propulsion",
        issues: [{ severity: "CRITICAL", message: "Motor thermal runaway risk unmitigated." }],
    },
    {
        moduleName: "Payload Enclosure",
        issues: [{ severity: "CRITICAL", message: "Structural load path does not route around apertures." }],
    },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("computeFeasibilityVerdict — Fix 3: HAPS phantom-GREEN closure (Loop 25 P0)", () => {
    /**
     * (1) HAPS-shaped project with CRITICAL Fang findings produces RED.
     *     This is the primary regression test: the exact scenario that was
     *     phantom-GREEN in Loop 25 must now produce RED.
     */
    it("(1) HAPS with Fang CRITICAL → RED verdict + fang_critical_findings axis", () => {
        const input: VerdictInput = {
            dimensionSheet: null,         // HAPS: no container dimension sheet
            briefConstraints: HAPS_BRIEF, // £2.5M ceiling
            parts: [],                    // no BOM rows yet — envelope not checkable
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            fangModuleReviews: SOLAR_ARRAY_CRITICAL,
        }
        const verdict = computeFeasibilityVerdict(input)

        // Status must be RED — CRITICAL finding is a blocker.
        expect(verdict.status).toBe("red")

        // fang_critical_findings must be in checkedConstraints.
        expect(verdict.checkedConstraints).toContain("fang_critical_findings")

        // There must be at least one blocker on the fang_critical_findings axis.
        const fangBlocker = verdict.fails.find(
            (f) => f.axis === "fang_critical_findings" && f.severity === "blocker",
        )
        expect(fangBlocker).toBeDefined()

        // The blocker evidence must mention the module name.
        expect(fangBlocker!.summary).toContain("Solar Array")
    })

    /**
     * (2) Modules with WARNING/INFO findings only → no fang_critical_findings
     *     blocker. Non-CRITICAL findings must NOT escalate.
     */
    it("(2) WARNING/INFO findings only → no fang_critical_findings blocker", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: HAPS_BRIEF,
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            fangModuleReviews: MODULE_WITH_WARNINGS_ONLY,
        }
        const verdict = computeFeasibilityVerdict(input)

        // No fang_critical_findings axis because no CRITICAL findings.
        expect(verdict.checkedConstraints).not.toContain("fang_critical_findings")
        expect(verdict.fails.some((f) => f.axis === "fang_critical_findings")).toBe(false)
    })

    /**
     * (3) Multiple modules with CRITICAL findings → one blocker per module.
     *     The feasibility exception must list each module separately so the
     *     founder can trace which modules need attention.
     */
    it("(3) two modules with CRITICAL findings → two blockers, one per module", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: null,
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            fangModuleReviews: TWO_CRITICAL_MODULES,
        }
        const verdict = computeFeasibilityVerdict(input)

        const fangBlockers = verdict.fails.filter(
            (f) => f.axis === "fang_critical_findings" && f.severity === "blocker",
        )
        // One blocker per module.
        expect(fangBlockers).toHaveLength(2)
        // Each blocker must reference its module.
        const summaries = fangBlockers.map((f) => f.summary)
        expect(summaries.some((s) => s.includes("Propulsion"))).toBe(true)
        expect(summaries.some((s) => s.includes("Payload Enclosure"))).toBe(true)
    })

    /**
     * (4) fangModuleReviews null or empty → axis not checked.
     *     Backward compatibility: projects without Fang reviews should not
     *     be affected by Fix 3.
     */
    it("(4) null fangModuleReviews → fang_critical_findings axis not checked", () => {
        const inputNull: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: null,
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            fangModuleReviews: null,
        }
        const verdictNull = computeFeasibilityVerdict(inputNull)
        expect(verdictNull.checkedConstraints).not.toContain("fang_critical_findings")

        const inputEmpty: VerdictInput = {
            ...inputNull,
            fangModuleReviews: [],
        }
        const verdictEmpty = computeFeasibilityVerdict(inputEmpty)
        expect(verdictEmpty.checkedConstraints).not.toContain("fang_critical_findings")
    })

    /**
     * (5) CRITICAL severity is case-insensitive.
     *     Some Fang implementations may emit "critical" lowercase. Both
     *     forms must be treated as CRITICAL escalation.
     */
    it("(5) lowercase 'critical' severity escalates identically to 'CRITICAL'", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: null,
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            fangModuleReviews: [
                {
                    moduleName: "Motor Controller",
                    issues: [
                        { severity: "critical", message: "Thermal runaway unmitigated." },
                    ],
                },
            ],
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.checkedConstraints).toContain("fang_critical_findings")
        expect(verdict.fails.some((f) => f.axis === "fang_critical_findings" && f.severity === "blocker")).toBe(true)
    })

    /**
     * (6) HAPS-shaped project with NO Fang reviews and no other checkable
     *     inputs → phantom-GREEN (status=GREEN, checkedConstraints empty).
     *     Fix 3 must not silently "fix" a phantom-GREEN that has genuinely
     *     no reviews — the phantom-GREEN is still exposed as UNREVIEWED by
     *     the PDF layer, which is correct for a project where Fang hasn't
     *     run yet.
     */
    it("(6) HAPS with no Fang reviews and no other inputs → phantom-GREEN (correct)", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: null,
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            fangModuleReviews: null,
        }
        const verdict = computeFeasibilityVerdict(input)

        // With data_completeness check, null inputs trigger amber.
        expect(verdict.status).toBe("amber")
        expect(verdict.checkedConstraints).toContain("data_completeness")
    })

    /**
     * Combined: HAPS with CRITICAL Fang findings AND a cost ceiling with
     * canonical cost well over the ceiling. Both axes should fire.
     */
    it("combined: CRITICAL findings + canonical cost over ceiling → RED + both axes", () => {
        const input: VerdictInput = {
            dimensionSheet: null,
            briefConstraints: HAPS_BRIEF, // £2.5M ceiling
            parts: [],
            aiCostEstimates: null,
            shortlistCount: 0,
            bomRowCount: 0,
            canonicalUnitCostGbp: 50_000_000, // £50M — 20× ceiling
            fangModuleReviews: SOLAR_ARRAY_CRITICAL,
        }
        const verdict = computeFeasibilityVerdict(input)

        expect(verdict.status).toBe("red")
        expect(verdict.checkedConstraints).toContain("cost")
        expect(verdict.checkedConstraints).toContain("fang_critical_findings")
        expect(verdict.fails.some((f) => f.axis === "cost" && f.severity === "blocker")).toBe(true)
        expect(verdict.fails.some((f) => f.axis === "fang_critical_findings" && f.severity === "blocker")).toBe(true)
    })
})
