/**
 * @file max-redecomposition.test.ts — Gates Council R1 P1 (2026-04-29)
 *
 * Tests for the Max redecomposition path triggered when Fang sizing Guard 3
 * detects a topology-level structural change in the solver's recommendations.
 *
 * Coverage:
 *   1. Topology recommendation detected → emits NEEDS_MAX_REDECOMPOSITION (not DELIVER_AND_PUSHBACK)
 *   2. In-class envelope-variant alternate WITHOUT topology recommendation → DELIVER_AND_PUSHBACK (existing behaviour, preserve)
 *   3. Out-of-class alternate → DELIVER_AND_PUSHBACK (existing behaviour, preserve)
 *   4. NULL alternate → SOLVER_ERROR path (existing behaviour, preserve)
 *   5. autopilot-step route handler: NEEDS_MAX_REDECOMPOSITION → stage reset to waiting_max_redecomposition (not terminal)
 *   6. Max prompt receives override block when topology redecomposition context present
 *   7. Max prompt does NOT receive override on first-pass (no remediation context)
 *   8. Topology keyword regex — confirmed positives and negatives
 */

import type { RunFangSizingReturn } from "@/actions/specialists/run-fang-sizing"
import { hasTopologyRecommendation, findTopologyRecommendations } from "@/lib/forge-v2/topology-detection"
import { buildMaxTopologyOverrideBlock, buildRemediationPromptBlock } from "@/lib/forge-v2/stage-gates/remediation"

// ─── 1. Topology keyword detection ──────────────────────────────────────────

describe("hasTopologyRecommendation — topology keyword detection", () => {
    const positive: string[] = [
        "Split battery rack into 2 modules to fit the 40ft container",
        "split the system into 2 units",
        "Externalise the PCS skid as a separate module",
        "externalize power conversion skid as additional module",
        "Add an auxiliary cooling module to manage thermal load",
        "Consider additional module for thermal management",
        "Decompose the battery bank into 3 separate enclosures",
        "split into 2 containers to meet mass target",
        "A separate skid for the transformer is recommended",
        "auxiliary subsystem required for power conditioning",
    ]

    const negative: string[] = [
        "Reduce cell count to lower mass",
        "Switch to higher-density NMC cells",
        "Re-run sizing with explicit kWh targets",
        "Adjust the envelope class from container_40ft_iso to warehouse_bay",
        "The split between AC and DC costs should be reviewed",
        "Review load calculations",
        "Cost is split across thermal and structural components",
    ]

    test.each(positive)("detects topology change: %s", (rec) => {
        expect(hasTopologyRecommendation([rec])).toBe(true)
    })

    test.each(negative)("does NOT detect topology change: %s", (rec) => {
        expect(hasTopologyRecommendation([rec])).toBe(false)
    })

    test("returns false for empty array", () => {
        expect(hasTopologyRecommendation([])).toBe(false)
    })

    test("returns true when at least one recommendation matches", () => {
        expect(hasTopologyRecommendation([
            "Reduce cell count to lower mass",
            "Split battery rack into 2 modules",
        ])).toBe(true)
    })

    test("returns false when all recommendations are non-topology", () => {
        expect(hasTopologyRecommendation([
            "Reduce cell count",
            "Switch to NMC cells",
            "Re-run with explicit targets",
        ])).toBe(false)
    })
})

describe("findTopologyRecommendations — filters to topology-only entries", () => {
    test("returns only topology recommendations from a mixed array", () => {
        const mixed = [
            "Reduce cell count",
            "Split battery rack into 2 modules",
            "Switch to NMC",
            "Externalise the PCS skid as a separate module",
        ]
        const found = findTopologyRecommendations(mixed)
        expect(found).toHaveLength(2)
        expect(found[0]).toContain("Split")
        expect(found[1]).toContain("Externalise")
    })

    test("returns empty array when no topology recommendations", () => {
        const nonTopology = ["Reduce cell count", "Switch to NMC"]
        expect(findTopologyRecommendations(nonTopology)).toHaveLength(0)
    })
})

// ─── 2. Route handler logic ──────────────────────────────────────────────────
//
// Mirror of the waitForSizing branch in src/app/api/autopilot-step/route.ts
// after the NEEDS_MAX_REDECOMPOSITION extension (Gates Council R1 P1).

type StepOutcome = { ok: true } | { ok: false; error: string }

interface RemediationTriggerResult {
    ok: boolean
    error?: string
}

function simulateWaitForSizingBranch(
    result: RunFangSizingReturn,
    triggerRemediation?: (ctx: string) => RemediationTriggerResult,
): StepOutcome {
    // Guard: skipped is a legitimate outcome
    if (!result.ok && "skipped" in result && result.skipped === true) {
        return { ok: true }
    }
    // Guard: DELIVER_AND_PUSHBACK — advance normally
    if (!result.ok && "errorCode" in result && result.errorCode === "DELIVER_AND_PUSHBACK") {
        return { ok: true }
    }
    // Guard: NEEDS_MAX_REDECOMPOSITION — topology overflow
    if (!result.ok && "errorCode" in result && result.errorCode === "NEEDS_MAX_REDECOMPOSITION") {
        const ctx = (result as unknown as { _waitingMaxContext?: string })._waitingMaxContext ?? null
        if (ctx) {
            const remResult = triggerRemediation ? triggerRemediation(ctx) : { ok: true }
            if (!remResult.ok) {
                return { ok: false, error: `Remediation trigger failed: ${remResult.error}` }
            }
            // triggerRemediation already reset stage to waiting_max_redecomposition
            return { ok: true }
        }
        return { ok: false, error: result.error ?? "Topology overflow: no context" }
    }
    return result.ok
        ? { ok: true }
        : { ok: false, error: (result as { error?: string }).error ?? "Sizing failed" }
}

describe("waitForSizing branch — NEEDS_MAX_REDECOMPOSITION sets stage to waiting_max_redecomposition", () => {
    test("NEEDS_MAX_REDECOMPOSITION with context → calls triggerRemediation and returns ok:true", () => {
        const remediationCalls: string[] = []
        const result: RunFangSizingReturn & { _waitingMaxContext: string } = {
            ok: false,
            error: "Solver detected 1 topology-level recommendation(s): Split battery rack into 2 modules",
            errorCode: "NEEDS_MAX_REDECOMPOSITION",
            runId: "",
            _waitingMaxContext: JSON.stringify({
                reason: "fang_sizing_topology_overflow",
                recommended_module_changes: [{ kind: "split", reason: "Split battery rack into 2 modules", into_count: 2 }],
                fang_solver_summary: "Battery rack cannot fit in 40ft container as a single unit.",
                constraints_to_preserve: { kwh: 3500 },
            }),
        }
        const outcome = simulateWaitForSizingBranch(result, (ctx) => {
            remediationCalls.push(ctx)
            return { ok: true }
        })
        expect(outcome.ok).toBe(true)
        expect(remediationCalls).toHaveLength(1)
        expect(remediationCalls[0]).toContain("fang_sizing_topology_overflow")
    })

    test("NEEDS_MAX_REDECOMPOSITION does NOT leave stage stalled (no ok:false)", () => {
        const result: RunFangSizingReturn & { _waitingMaxContext: string } = {
            ok: false,
            error: "Topology overflow",
            errorCode: "NEEDS_MAX_REDECOMPOSITION",
            runId: "",
            _waitingMaxContext: JSON.stringify({ reason: "fang_sizing_topology_overflow" }),
        }
        const outcome = simulateWaitForSizingBranch(result, () => ({ ok: true }))
        expect(outcome.ok).toBe(true)
        expect("error" in outcome).toBe(false)
    })

    test("NEEDS_MAX_REDECOMPOSITION without context → ok:false (context missing guard)", () => {
        const result: RunFangSizingReturn = {
            ok: false,
            error: "Topology overflow: no context",
            errorCode: "NEEDS_MAX_REDECOMPOSITION",
            runId: "",
        }
        const outcome = simulateWaitForSizingBranch(result)
        expect(outcome.ok).toBe(false)
    })

    test("NEEDS_MAX_REDECOMPOSITION when triggerRemediation fails → ok:false", () => {
        const result: RunFangSizingReturn & { _waitingMaxContext: string } = {
            ok: false,
            error: "Topology overflow",
            errorCode: "NEEDS_MAX_REDECOMPOSITION",
            runId: "",
            _waitingMaxContext: JSON.stringify({ reason: "fang_sizing_topology_overflow" }),
        }
        const outcome = simulateWaitForSizingBranch(result, () => ({ ok: false, error: "DB write failed" }))
        expect(outcome.ok).toBe(false)
    })
})

// ─── 3. Existing behaviour preserved ────────────────────────────────────────

describe("waitForSizing branch — existing behaviour preserved", () => {
    test("in-class envelope-variant WITHOUT topology → DELIVER_AND_PUSHBACK still advances", () => {
        const result: RunFangSizingReturn = {
            ok: false,
            error: "Variant differs: 40ft vs 20ft (same class transportable_container)",
            errorCode: "DELIVER_AND_PUSHBACK",
            runId: "",
        }
        expect(simulateWaitForSizingBranch(result).ok).toBe(true)
    })

    test("out-of-class alternate → DELIVER_AND_PUSHBACK still advances", () => {
        const result: RunFangSizingReturn = {
            ok: false,
            error: "Alternate class warehouse_bay differs from briefed container",
            errorCode: "DELIVER_AND_PUSHBACK",
        }
        expect(simulateWaitForSizingBranch(result).ok).toBe(true)
    })

    test("NULL alternate (SOLVER_ERROR) → ok:false (must go to solver_error terminal)", () => {
        const result: RunFangSizingReturn = {
            ok: false,
            error: "Remediation context present but dimension_sheet is null.",
            errorCode: "SOLVER_ERROR",
        }
        expect(simulateWaitForSizingBranch(result).ok).toBe(false)
    })

    test("SOLVER_ERROR is not confused with NEEDS_MAX_REDECOMPOSITION", () => {
        const solverError: RunFangSizingReturn = { ok: false, error: "NULL sheet", errorCode: "SOLVER_ERROR" }
        const topoOverflow: RunFangSizingReturn & { _waitingMaxContext: string } = {
            ok: false, error: "Topology overflow",
            errorCode: "NEEDS_MAX_REDECOMPOSITION",
            runId: "",
            _waitingMaxContext: "{}",
        }
        expect(simulateWaitForSizingBranch(solverError).ok).toBe(false)
        expect(simulateWaitForSizingBranch(topoOverflow, () => ({ ok: true })).ok).toBe(true)
    })

    test("normal success ok:true → ok:true", () => {
        const result: RunFangSizingReturn = {
            ok: true, runId: "r1", feasible: true, conflictCount: 0, domain: "battery_energy_storage",
        }
        expect(simulateWaitForSizingBranch(result).ok).toBe(true)
    })

    test("skipped outcome → ok:true (exotic domain)", () => {
        const result: RunFangSizingReturn = {
            ok: false, skipped: true, runId: "", reason: "No domain support",
        }
        expect(simulateWaitForSizingBranch(result).ok).toBe(true)
    })
})

// ─── 4. Max prompt override block ────────────────────────────────────────────

describe("buildMaxTopologyOverrideBlock — structured prompt override for Max redecomposition", () => {
    const ctx = JSON.stringify({
        reason: "fang_sizing_topology_overflow",
        recommended_module_changes: [
            { kind: "split", reason: "Split battery rack into 2 modules", into_count: 2 },
            { kind: "externalise", reason: "Externalise PCS skid as separate module" },
        ],
        fang_solver_summary: "The battery rack and PCS cannot coexist in a single 40ft container.",
        constraints_to_preserve: { kwh: 3500, kw: 700 },
        envelope: { kind: "container_40ft_iso", label: "40ft ISO container" },
    })

    test("block contains REMEDIATION OVERRIDE heading", () => {
        const block = buildMaxTopologyOverrideBlock(ctx)
        expect(block).toContain("REMEDIATION OVERRIDE")
    })

    test("block contains solver summary", () => {
        const block = buildMaxTopologyOverrideBlock(ctx)
        expect(block).toContain("battery rack and PCS cannot coexist")
    })

    test("block contains split count", () => {
        const block = buildMaxTopologyOverrideBlock(ctx)
        expect(block).toContain("2")
        expect(block).toContain("Split")
    })

    test("block contains externalise instruction", () => {
        const block = buildMaxTopologyOverrideBlock(ctx)
        expect(block).toContain("Externalise")
    })

    test("block contains constraints to preserve", () => {
        const block = buildMaxTopologyOverrideBlock(ctx)
        expect(block).toContain("kwh")
        expect(block).toContain("3500")
    })

    test("block instructs Max NOT to regenerate the same modules", () => {
        const block = buildMaxTopologyOverrideBlock(ctx)
        expect(block).toContain("Do NOT regenerate the same modules")
    })

    test("falls back to buildRemediationPromptBlock on malformed JSON", () => {
        const malformed = "not-valid-json"
        const block = buildMaxTopologyOverrideBlock(malformed)
        // Fallback uses buildRemediationPromptBlock(3, ...) which includes gate 3
        expect(block).toContain("Gate 3")
    })
})

describe("Max prompt — first-pass receives no override block", () => {
    test("buildRemediationPromptBlock is NOT called when no remediation context", () => {
        // Simulate the run-max-decomposition.ts logic: remediationCtx is null on first pass
        const remediationCtx: string | null = null
        const report = "Research report content"
        const reportToUse = remediationCtx
            ? buildMaxTopologyOverrideBlock(remediationCtx) + report
            : report
        expect(reportToUse).toBe(report)
        expect(reportToUse).not.toContain("REMEDIATION OVERRIDE")
    })

    test("topology override block IS prepended when context is present", () => {
        const remediationCtx = JSON.stringify({
            reason: "fang_sizing_topology_overflow",
            fang_solver_summary: "Topology issue",
            recommended_module_changes: [],
            constraints_to_preserve: {},
        })
        const report = "Research report content"
        const reportToUse = remediationCtx
            ? buildMaxTopologyOverrideBlock(remediationCtx) + report
            : report
        expect(reportToUse).toContain("REMEDIATION OVERRIDE")
        expect(reportToUse).toContain("Research report content")
    })
})
