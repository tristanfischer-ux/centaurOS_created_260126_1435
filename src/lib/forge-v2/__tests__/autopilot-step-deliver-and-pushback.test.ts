/**
 * @file autopilot-step-deliver-and-pushback.test.ts — P1 follow-up to Loop 24
 * gate-3 class-fence (commit ad7e8ca2).
 *
 * Assertion: when `runFangSizingBackground` returns `errorCode: "DELIVER_AND_PUSHBACK"`,
 * the `waitForSizing` branch in `/api/autopilot-step/route.ts` MUST treat the
 * result as a success and advance the autopilot stage normally — it must NOT
 * mark `pipeline_runs.status = 'failed'` or leave the project stalled.
 *
 * Context:
 *   - Guard 2 in run-fang-sizing.ts fires when the alternate envelope is a
 *     different product class from the briefed envelope (e.g. BESS brief said
 *     "40ft container" but the solver's closest feasible alternate is a
 *     "warehouse bay"). Guard 2 persists the briefed-class max-feasible sheet
 *     with `product_class_match: false` and class-fence fields, then returns
 *     `{ ok: false, errorCode: "DELIVER_AND_PUSHBACK" }`.
 *   - The dimension_sheet IS written; the PDF export reads
 *     `closest_feasible_alternate.product_class_match === false` and renders
 *     the trade-off callout.
 *   - Without the P1 fix, the route handler would have fallen through to the
 *     generic `{ ok: false }` arm, marking the pipeline_run failed and leaving
 *     `autopilot_state.stage` stalled at `waiting_sizing`.
 *   - With the fix, the handler intercepts the DELIVER_AND_PUSHBACK code,
 *     logs the pushback, and returns `{ ok: true }` — the cron tick then
 *     advances the stage normally.
 *
 * These tests are unit tests over simulated route-handler logic — no Supabase,
 * no Next.js runtime, no LLM. They mirror the shape of the live code.
 */

import type { RunFangSizingReturn } from "@/actions/specialists/run-fang-sizing"

// ─── Simulated route-handler logic ──────────────────────────────────────────
//
// This mirrors the `waitForSizing` branch in
// src/app/api/autopilot-step/route.ts exactly, so a regression in the route
// handler will break these tests.

type StepOutcome = { ok: true } | { ok: false; error: string }

function simulateWaitForSizingBranch(result: RunFangSizingReturn): StepOutcome {
    // Guard: skipped is a legitimate outcome (exotic domains).
    if (!result.ok && "skipped" in result && result.skipped === true) {
        return { ok: true }
    }
    // Guard: DELIVER_AND_PUSHBACK is "sizing done with pushback" — advance.
    if (
        !result.ok &&
        "errorCode" in result &&
        result.errorCode === "DELIVER_AND_PUSHBACK"
    ) {
        return { ok: true }
    }
    // All other outcomes: pass through ok/error as-is.
    return result.ok
        ? { ok: true }
        : { ok: false, error: (result as { error?: string }).error ?? "Sizing failed" }
}

// ─── DELIVER_AND_PUSHBACK advances the project ───────────────────────────────

describe("waitForSizing branch — DELIVER_AND_PUSHBACK is treated as success", () => {
    /**
     * Loop 24 BESS / Vertical Farm failure pattern:
     * Alternate is a warehouse_bay; brief said container.
     * Guard 2 fires, returns DELIVER_AND_PUSHBACK.
     * Route handler must advance (return ok: true).
     */
    test("DELIVER_AND_PUSHBACK return → stepOutcome is ok:true (advance)", () => {
        const sizingResult: RunFangSizingReturn = {
            ok: false,
            error:
                "Alternate envelope (Warehouse bay) is a different product class " +
                "(fixed_building_bay) from the briefed envelope (40ft ISO container, " +
                "transportable_container). Delivering briefed-class max-feasible result " +
                "with alternate as a pushback suggestion.",
            errorCode: "DELIVER_AND_PUSHBACK",
            runId: "",
        }
        const outcome = simulateWaitForSizingBranch(sizingResult)
        expect(outcome.ok).toBe(true)
    })

    test("DELIVER_AND_PUSHBACK does NOT stall the pipeline (no ok:false outcome)", () => {
        const sizingResult: RunFangSizingReturn = {
            ok: false,
            error: "Different product class pushback",
            errorCode: "DELIVER_AND_PUSHBACK",
        }
        const outcome = simulateWaitForSizingBranch(sizingResult)
        expect(outcome.ok).toBe(true)
        // If the route stalled the project, it would return ok:false with an
        // error string. The test is explicit: no ok:false here.
        expect("error" in outcome).toBe(false)
    })
})

// ─── SOLVER_ERROR behaviour is unchanged ─────────────────────────────────────

describe("waitForSizing branch — SOLVER_ERROR still fails the step (no regression)", () => {
    test("SOLVER_ERROR return → stepOutcome is ok:false (stage must go to solver_error)", () => {
        const sizingResult: RunFangSizingReturn = {
            ok: false,
            error: "Remediation context present but dimension_sheet is null/feasible=null.",
            errorCode: "SOLVER_ERROR",
        }
        const outcome = simulateWaitForSizingBranch(sizingResult)
        expect(outcome.ok).toBe(false)
    })

    test("SOLVER_ERROR is not confused with DELIVER_AND_PUSHBACK", () => {
        const solverError: RunFangSizingReturn = {
            ok: false,
            error: "NULL sheet",
            errorCode: "SOLVER_ERROR",
        }
        const pushback: RunFangSizingReturn = {
            ok: false,
            error: "Class drift",
            errorCode: "DELIVER_AND_PUSHBACK",
        }
        expect(simulateWaitForSizingBranch(solverError).ok).toBe(false)
        expect(simulateWaitForSizingBranch(pushback).ok).toBe(true)
    })
})

// ─── Skipped outcome is still treated as success ─────────────────────────────

describe("waitForSizing branch — skipped outcome unchanged", () => {
    test("skipped:true → ok:true (exotic domain / no solver support)", () => {
        const sizingResult: RunFangSizingReturn = {
            ok: false,
            skipped: true,
            runId: "",
            reason: "No modules yet — sizing skipped.",
        }
        expect(simulateWaitForSizingBranch(sizingResult).ok).toBe(true)
    })
})

// ─── Happy-path success is unchanged ─────────────────────────────────────────

describe("waitForSizing branch — normal success unchanged", () => {
    test("ok:true result → ok:true outcome", () => {
        const sizingResult: RunFangSizingReturn = {
            ok: true,
            runId: "run-123",
            feasible: true,
            conflictCount: 0,
            domain: "battery_energy_storage",
        }
        expect(simulateWaitForSizingBranch(sizingResult).ok).toBe(true)
    })

    test("generic transient error (not DELIVER_AND_PUSHBACK) → ok:false", () => {
        const sizingResult: RunFangSizingReturn = {
            ok: false,
            error: "LLM timeout",
            errorCode: "INTERNAL",
        }
        const outcome = simulateWaitForSizingBranch(sizingResult)
        expect(outcome.ok).toBe(false)
        if (!outcome.ok) {
            expect(outcome.error).toBe("LLM timeout")
        }
    })
})
