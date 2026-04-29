/**
 * @file gate-3.ts — Quality Gates v2.0 — Gate 3: Sizing Feasibility Check
 *
 * @description Deterministic gate that runs after `waiting_sizing` (Fang's
 * sizing solver) and before the pipeline advances to `waiting_layout`.
 *
 * ## What it checks
 *
 * Reads `cad_lab_projects.dimension_sheet` (a DimensionSheet JSONB) and
 * evaluates two independent conditions:
 *
 *   1. **INFEASIBLE-but-emitted (P0 FAIL)** — `feasible === false` AND
 *      `module_dimensions` is non-empty. The solver declared the configuration
 *      infeasible but emitted a dimensional layout anyway. This is the BESS v7
 *      failure pattern Tristan flagged ("INFEASIBLE-but-emitted") — a green
 *      layout badge coexisting with a FAIL verdict, misleading the founder.
 *      Gate 3 blocks hard on this.
 *
 *   2. **INFEASIBLE-and-empty (WARN)** — `feasible === false` AND
 *      `module_dimensions` is empty. The solver failed cleanly — no config
 *      emitted. The engine already surfaces this on the UI; Gate 3 records
 *      it as a WARN so the verdict trail shows the pipeline was aware.
 *
 *   3. **PASS** — `feasible === true` AND `module_dimensions` is non-empty.
 *      All modules have a feasible configuration.
 *
 * ## Remediation
 *
 * - **Attempt 1 (FAIL or WARN):** Re-fire Fang sizing with relaxed
 *   constraints. Injects a structured remediation context block listing the
 *   conflicts from `sheet.conflicts` + any `infeasibility_reasons` found on
 *   individual module dimensions. Max 2 total attempts.
 *
 * - **Attempt 2 (still failing):** Escalate to Max re-decompose. Re-fires
 *   Max for the infeasible configuration so it can produce alternative module
 *   decompositions — which then triggers Gate 2 → Gate 3 again on the new
 *   outputs. Per GLM 5.1's audit (spec "Critical state-machine rules" rule 1),
 *   the Max escalation counts as attempt 2, NOT a fresh attempt 1. The counter
 *   does not reset.
 *
 * ## No LLM calls
 *
 * This is a `deterministic` gate. Zero LLM calls — the verdict comes from
 * the solver status fields already on the persisted `dimension_sheet`.
 *
 * @see src/lib/forge-v2/stage-gates/types.ts   — DeterministicGate interface
 * @see src/lib/forge-v2/stage-gates/runner.ts  — runGate() orchestrator
 * @see src/lib/sizing/types.ts                  — DimensionSheet shape
 * @see src/actions/specialists/run-fang-sizing.ts — produces dimension_sheet
 *
 * FLOW: waiting_sizing → [Gate 3] → waiting_layout
 *       On FAIL attempt 1: → re-fire Fang sizing (relaxed)
 *       On FAIL attempt 2: → escalate to Max re-decompose
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { DimensionSheet } from "@/lib/sizing/types"
import type { DeterministicGate, DeterministicCheckResult, GateContext } from "./types"

// ── Gate input shape ────────────────────────────────────────────────────────

/**
 * The data Gate 3 reads from the DB. Narrow on purpose — only the fields
 * needed for the feasibility check, plus the project subject for the
 * remediation context message.
 */
interface Gate3Input {
    projectId: string
    subject: string
    /** Null when Fang sizing has not run yet or was skipped. Gate returns WARN. */
    dimensionSheet: DimensionSheet | null
    attempt: 1 | 2
}

// ── Check result detail ─────────────────────────────────────────────────────

/**
 * Extended check result carrying the extra fields needed to build the
 * remediation context when verdict is FAIL or WARN.
 */
interface Gate3CheckResult extends DeterministicCheckResult {
    /**
     * True when the solver returned feasible=false but still emitted a
     * non-empty module_dimensions map. This is the BESS v7 P0 pattern.
     */
    isInfeasibleButEmitted: boolean
    /**
     * True when the solver returned feasible=false and emitted no module
     * dimensions — clean solver failure, no misleading layout output.
     */
    isInfeasibleAndEmpty: boolean
    /**
     * Conflicts array from the dimension_sheet, used to build the
     * remediation context block injected into the Fang re-fire.
     */
    conflicts: string[]
    /**
     * Recommendations from the dimension_sheet — injected alongside
     * conflicts so the remediation pass knows what the solver suggested.
     */
    recommendations: string[]
}

// ── loadInput ──────────────────────────────────────────────────────────────

async function loadInput(ctx: GateContext): Promise<Gate3Input> {
    const admin = createAdminClient()

    // Race-condition guard (Loop 21 + 22 evidence): the autopilot tracking
    // row for waiting_sizing goes 'done' the moment Fang sizing's specialist
    // function returns, but the actual `dimension_sheet` JSONB write to
    // cad_lab_projects can land milliseconds AFTER on a separate transaction.
    // The cron handler immediately calls Gate 3, which reads dimension_sheet,
    // and the read can race the write.
    //
    // Mitigation: if the first read returns null, retry once after 1.5s.
    // Total worst-case latency added: 1.5s on the race-window cases.
    // PASS / non-null reads short-circuit immediately.
    let data: { subject: string | null; dimension_sheet: unknown } | null = null
    let error: { message: string } | null = null

    const firstRead = await admin
        .from("cad_lab_projects")
        .select("id, subject, dimension_sheet")
        .eq("id", ctx.projectId)
        .maybeSingle()
    data = firstRead.data as typeof data
    error = firstRead.error as typeof error

    if (!error && data && data.dimension_sheet == null) {
        // Retry once after 1.5s — covers the eventual-consistency window
        // between Fang sizing's tracking-row done-stamp and the JSONB write.
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const secondRead = await admin
            .from("cad_lab_projects")
            .select("id, subject, dimension_sheet")
            .eq("id", ctx.projectId)
            .maybeSingle()
        if (!secondRead.error && secondRead.data?.dimension_sheet != null) {
            data = secondRead.data as typeof data
        }
    }

    if (error) {
        console.warn(
            `[gate-3] loadInput failed for project=${ctx.projectId}:`,
            error.message,
        )
    }

    return {
        projectId: ctx.projectId,
        subject: (data?.subject as string | null) ?? "(unknown project)",
        dimensionSheet: (data?.dimension_sheet as DimensionSheet | null) ?? null,
        attempt: ctx.attempt,
    }
}

// ── check ──────────────────────────────────────────────────────────────────

function check(input: Gate3Input): Gate3CheckResult {
    const sheet = input.dimensionSheet

    // ── dimension_sheet missing entirely ───────────────────────────────────
    // Fang sizing has not run yet or was skipped (e.g. domain not recognised).
    // Treat as WARN — the pipeline may still be in progress on a slow tick.
    if (!sheet) {
        return {
            check_name: "sizing_feasibility",
            passed: false,
            actual: "dimension_sheet absent",
            expected: "dimension_sheet present with feasible=true",
            isInfeasibleButEmitted: false,
            isInfeasibleAndEmpty: false,
            conflicts: [],
            recommendations: [],
        }
    }

    const hasModuleDimensions =
        sheet.module_dimensions != null &&
        Object.keys(sheet.module_dimensions).length > 0

    // ── PASS ───────────────────────────────────────────────────────────────
    if (sheet.feasible && hasModuleDimensions) {
        return {
            check_name: "sizing_feasibility",
            passed: true,
            actual: "FEASIBLE",
            expected: "FEASIBLE",
            isInfeasibleButEmitted: false,
            isInfeasibleAndEmpty: false,
            conflicts: [],
            recommendations: [],
        }
    }

    // ── INFEASIBLE-but-emitted (P0) ────────────────────────────────────────
    // feasible===false but the solver still populated module_dimensions.
    // The BESS v7 pattern: the PDF showed a layout while the solver had
    // already flagged the configuration as impossible. Gate 3 must block hard.
    if (!sheet.feasible && hasModuleDimensions) {
        const moduleCount = Object.keys(sheet.module_dimensions).length

        return {
            check_name: "sizing_feasibility",
            passed: false,
            actual: `INFEASIBLE-but-emitted (${moduleCount} module(s) have dimensions despite solver infeasibility)`,
            expected: "FEASIBLE with module_dimensions populated",
            isInfeasibleButEmitted: true,
            isInfeasibleAndEmpty: false,
            // DEFENSIVE: conflicts/recommendations are typed as required string[] but
            // older solver output in the DB may omit them. Default to [] to prevent
            // buildRemediationContext from throwing on .length / .slice calls.
            conflicts: sheet.conflicts ?? [],
            recommendations: sheet.recommendations ?? [],
        }
    }

    // ── INFEASIBLE-and-empty (WARN) ────────────────────────────────────────
    // feasible===false AND no module dimensions. Solver failed cleanly —
    // nothing misleading in the output, but the pipeline cannot advance.
    return {
        check_name: "sizing_feasibility",
        passed: false,
        actual: "INFEASIBLE (no module dimensions emitted)",
        expected: "FEASIBLE with module_dimensions populated",
        isInfeasibleButEmitted: false,
        isInfeasibleAndEmpty: true,
        // DEFENSIVE: same null-safety as above.
        conflicts: sheet.conflicts ?? [],
        recommendations: sheet.recommendations ?? [],
    }
}

// ── Remediation context builder ─────────────────────────────────────────────

/**
 * Build the structured remediation context string injected into the
 * Fang re-fire request (attempt 1) or Max re-decompose request (attempt 2).
 *
 * This string is stored in `gate_verdicts.remediation_context_injected` for
 * audit and injected into the downstream action's `overrides` parameter.
 */
function buildRemediationContext(
    input: Gate3Input,
    result: Gate3CheckResult,
): string {
    const sheet = input.dimensionSheet!

    const conflictLines =
        result.conflicts.length > 0
            ? result.conflicts.map((c, i) => `  ${i + 1}. ${c}`).join("\n")
            : "  (no explicit conflict messages on sheet)"

    const recLines =
        result.recommendations.length > 0
            ? result.recommendations.slice(0, 3).map((r, i) => `  ${i + 1}. ${r}`).join("\n")
            : "  (no recommendations on sheet)"

    const pattern = result.isInfeasibleButEmitted
        ? "INFEASIBLE-but-emitted — solver declared infeasibility but still emitted module dimensions"
        : "INFEASIBLE-and-empty — solver declared infeasibility with no configuration emitted"

    const baseContext = [
        `Gate 3 sizing feasibility failure — ${pattern}.`,
        `Project: ${input.subject}`,
        // DEFENSIVE: rules_domain / rules_version / envelope may be absent on
        // dimension_sheets produced by older solver versions stored in the DB.
        `Domain: ${sheet.rules_domain ?? "(unknown)"} v${sheet.rules_version ?? "(unknown)"}`,
        `Envelope: ${sheet.envelope?.label ?? "(unknown)"}`,
        `Target: ${JSON.stringify(sheet.target ?? {})}`,
        "",
        "Solver conflicts:",
        conflictLines,
        "",
        "Solver recommendations:",
        recLines,
    ].join("\n")

    if (input.attempt === 1) {
        return [
            baseContext,
            "",
            "REMEDIATION REQUEST (attempt 1 — relax constraints):",
            "Re-run Fang sizing with relaxed constraints. Specifically:",
            "  • If the envelope is too small for the target, try the next-larger",
            "    standard envelope (e.g. 40ft ISO → 2×40ft or 53ft HC for BESS).",
            "  • If a target value is above the domain ceiling, reduce it to the",
            "    nearest feasible tier and surface the delta as a conflict on the sheet.",
            "  • Do NOT change the founder's brief — record adjustments in",
            "    research._brief_auto_adjustments so the PDF shows what was relaxed.",
            "  • Populate closest_feasible_alternate on the sheet so the PDF can",
            "    show ORIGINAL TARGET (INFEASIBLE) + CLOSEST FEASIBLE ALTERNATE side-by-side.",
        ].join("\n")
    }

    // attempt 2 → Max escalation
    return [
        baseContext,
        "",
        "REMEDIATION REQUEST (attempt 2 — escalate to Max re-decompose):",
        "Fang sizing failed on attempt 1 with relaxed constraints. Escalating to Max.",
        "Re-fire Max decomposition for this project so Max can propose alternative",
        "module breakdowns that fit within the envelope constraints. This will",
        "trigger Gate 2 (key-parts completeness) and Gate 3 again on the new modules.",
        "Do NOT reset the Gate 3 attempt counter — this escalation IS attempt 2.",
    ].join("\n")
}

// ── Remediation stage target ────────────────────────────────────────────────

/**
 * Returns the autopilot stage to re-fire based on attempt number.
 *
 * Attempt 1: re-fire Fang sizing (`waiting_sizing`)
 * Attempt 2: escalate to Max re-decompose (`waiting_max`) — per GLM 5.1
 *            audit rule 1: Max escalation IS attempt 2, counter does not reset.
 */
function remediationTargetStage(attempt: 1 | 2): string {
    return attempt === 1 ? "waiting_sizing" : "waiting_max"
}

// ── Gate severity ───────────────────────────────────────────────────────────

/**
 * Derive the P-level for a failed check.
 *
 * INFEASIBLE-but-emitted → P0 (misleading output reaches the founder / PDF)
 * INFEASIBLE-and-empty   → P1 (no misleading output, pipeline just cannot advance)
 * dimension_sheet absent → P1 (sizing may not have run yet)
 */
function gateSeverity(result: Gate3CheckResult): "P0" | "P1" | null {
    if (result.passed) return null
    return result.isInfeasibleButEmitted ? "P0" : "P1"
}

// ── Public gate export ──────────────────────────────────────────────────────

/**
 * gate3 — Deterministic sizing feasibility gate.
 *
 * Satisfies the `DeterministicGate<Gate3Input>` contract. Registered in
 * registry.ts under `waiting_sizing` by the main-thread merge commit.
 *
 * The runner calls `loadInput` then `check`. Remediation context is built
 * here (not in runner.ts) because it requires domain-level knowledge of the
 * dimension_sheet shape.
 *
 * Usage from registry.ts (after main-thread merge):
 *   import { gate3 } from "./gate-3"
 *   STAGE_GATE_MAP["waiting_sizing"] = gate3
 *
 * @see src/lib/forge-v2/stage-gates/registry.ts — registration point
 * @see src/lib/forge-v2/stage-gates/runner.ts   — execution orchestrator
 */
export const gate3: DeterministicGate<Gate3Input> = {
    kind: "deterministic",
    gateId: 3,
    name: "Sizing Feasibility Check",

    loadInput,

    check(input: Gate3Input): DeterministicCheckResult {
        const result = check(input)

        // Augment the base DeterministicCheckResult with remediation fields.
        // These are consumed by the cron handler when it decides whether to
        // re-fire Fang or escalate to Max.
        //
        // DECISION: We attach extra fields to the returned result rather than
        // having the runner call a second method. The runner signature only
        // requires DeterministicCheckResult, so we extend it. TypeScript
        // structural typing means the runner is unaware of the extra fields —
        // they are only consumed by the cron handler after it receives the
        // GateRunResult back from runGate().
        const extended = result as Gate3CheckResult & {
            remediationContext: string
            remediationTargetStage: string
            severity: "P0" | "P1" | null
        }
        extended.remediationContext = input.dimensionSheet
            ? buildRemediationContext(input, result as Gate3CheckResult)
            : "dimension_sheet absent — Fang sizing has not completed"
        extended.remediationTargetStage = remediationTargetStage(input.attempt)
        extended.severity = gateSeverity(result as Gate3CheckResult)

        return result
    },
}

// ── Re-export helpers for cron handler ─────────────────────────────────────

/**
 * Re-exported for use by the cron handler (autopilot-tick/route.ts) when it
 * needs to extract the remediation context from a Gate 3 verdict's check
 * result and decide between Fang re-fire and Max escalation.
 *
 * The cron handler reads `verdict_row.deterministic_result` from the DB row
 * (which stores the serialised `DeterministicCheckResult`) and can call
 * `isGate3InfeasibleButEmitted` to distinguish P0 from P1 without re-running
 * the check.
 */
export function isGate3InfeasibleButEmitted(
    result: DeterministicCheckResult,
): boolean {
    return result.actual.includes("INFEASIBLE-but-emitted")
}

export function isGate3InfeasibleAndEmpty(
    result: DeterministicCheckResult,
): boolean {
    return result.actual.includes("INFEASIBLE (no module dimensions emitted)")
}

export function gate3RemediationTargetStage(attempt: 1 | 2): string {
    return remediationTargetStage(attempt)
}
