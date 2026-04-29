/**
 * @file route.ts — /api/cron/autopilot-tick
 *
 * @description Zero-wait cron orchestrator for the ForgeOS autopilot.
 * Vercel cron hits this every minute. The handler is the SINGLE
 * orchestrator: it advances `cad_lab_projects.autopilot_state.stage`,
 * fires specialists fire-and-forget, never waits.
 *
 * ## Per-project decision tree
 *
 * For each active project (autopilot_state.stage NOT IN ('done','failed')):
 * (`finished_at` is intentionally NOT part of the active filter — see the
 *  comment in the lookup query for why.)
 *
 *  1. If `STAGE_CONFIG[stage].kind === "synchronous"` (only `locking_brief`
 *     today): run the work inline (small DB ops), then `advance()` or
 *     `recordFailure()`. Same tick.
 *
 *  2. Else (fire stage): query `pipeline_runs` for the autopilot tracking
 *     row matching (project, 'autopilot', stage), most recent first.
 *
 *     - status='done'      → `advance()` (or `markDone()` if last stage)
 *     - status='running'   → if age < 5 min, skip; if older, mark
 *                            STALE_ABANDONED and fall through to fire
 *     - status='failed'    → count historical failed rows for this stage;
 *                            if < maxAttempts, fire (retry); else
 *                            `recordFailure()` (terminal)
 *     - no row             → fire (first attempt)
 *
 * Fire = `await fetch('/api/autopilot-step', { signal: AbortSignal.timeout(2000) })`.
 * The cron's HTTP connection drops at 2 s but the receiving Lambda runs
 * to completion in its own 300 s container — Vercel does not tie Lambda
 * lifetime to client connection. The fire endpoint inserts the
 * `pipeline_runs` running row immediately, so the next cron tick sees
 * it and skips re-firing.
 *
 * ## Why this exists (history)
 *
 * Earlier orchestrator architecture: `after(() => dispatchAutopilotStep)`
 * → `stepWaitForX` polling loop holding a Vercel function open for 240 s.
 * Frontier-model architectural review on 2026-04-25 (Gemini 3.1 Pro +
 * GPT-5.5) diagnosed the polling-on-serverless shape as the root cause
 * of 9+ documented orchestration bugs. This is the rewrite.
 *
 * @related
 *  - Stage map:        src/lib/forge-v2/stage-config.ts
 *  - Fire endpoint:    src/app/api/autopilot-step/route.ts
 *  - State helpers:    src/actions/forge-v2-autopilot.ts (advance, recordFailure, markDone, lockBriefSynchronously)
 *  - Cron auth:        src/lib/security/cron-auth.ts
 *  - Vercel cron cfg:  vercel.json
 */

import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { verifyCronSecret } from "@/lib/security/cron-auth"
import {
    advance,
    recordFailure,
    markDone,
    lockBriefSynchronously,
    type AutopilotStage,
    type AutopilotState,
} from "@/actions/forge-v2-autopilot"
import {
    STAGE_CONFIG,
    AUTOPILOT_TRACKING_SPECIALIST,
    STALE_RUNNING_MS,
    FIRE_TIMEOUT_MS,
    MAX_PROJECTS_PER_TICK,
} from "@/lib/forge-v2/stage-config"
// Quality Gates v2.0 — flag-gated (ENABLE_QUALITY_GATES=false by default)
// Phase 2 sub-agents fill in STAGE_GATE_MAP entries; until they do, this is
// a no-op even when the flag is true.
import { runGate, markUncertainty } from "@/lib/forge-v2/stage-gates/runner"
import { STAGE_GATE_MAP } from "@/lib/forge-v2/stage-gates/registry"
import { triggerRemediation } from "@/lib/forge-v2/stage-gates/remediation"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type TickAction =
    | "advance"
    | "advance_done"
    | "fire"
    | "fire_retry"
    | "fire_after_stale"
    | "skip_running"
    | "skip_no_config"
    | "skip_terminal"
    | "synchronous_ok"
    | "synchronous_fail"
    | "terminal_fail"
    | "gate_remediation"

interface TickDetail {
    projectId: string
    stage: string
    action: TickAction
    ok: boolean
    reason?: string
}

interface TickResult {
    advanced: number
    fired: number
    skipped: number
    failed: number
    details: TickDetail[]
}

/** GET /api/cron/autopilot-tick — Bearer CRON_SECRET. Vercel cron-injected. */
export async function GET(request: Request): Promise<NextResponse> {
    const authFailure = verifyCronSecret(request)
    if (authFailure) return authFailure

    const result = await tickOnce(request)
    console.info(
        `[autopilot-tick] advanced=${result.advanced} fired=${result.fired} ` +
            `skipped=${result.skipped} failed=${result.failed}`,
    )
    return NextResponse.json({ ok: true, pass: result }, { status: 200 })
}

async function tickOnce(request: Request): Promise<TickResult> {
    const admin = createAdminClient()
    const details: TickDetail[] = []
    let advanced = 0
    let fired = 0
    let skipped = 0
    let failed = 0

    // Active projects only — filter by `stage` (not `finished_at`).
    //
    // The previous filter `.is("autopilot_state->>finished_at", null)` was
    // semantically wrong: `recordFailure()` stamps `finished_at` whenever a
    // stage exhausts its retries, even mid-pipeline. That made every project
    // that hit retry-exhaustion permanently invisible to the cron — the
    // root cause of "wedged" demos diagnosed 2026-04-28. The correct
    // condition for "active" is `stage NOT IN ('done', 'failed')`, which is
    // the canonical end-of-pipeline check from the plan.
    // TERMINAL STAGES: 'done', 'failed', 'solver_error'
    // 'solver_error' added 2026-04-29 (Loop 24 P0 gate-3 council R2 fix):
    // projects where Fang produced a NULL dimension_sheet are permanently
    // blocked from advancing. They must NOT re-fire matching_suppliers or
    // generating_illustration. The UI surfaces a structured error instead.
    const { data: projects, error } = await admin
        .from("cad_lab_projects")
        .select("id, autopilot_state")
        .not("autopilot_state", "is", null)
        .not("autopilot_state->>stage", "in", '("done","failed","solver_error")')
        .not("autopilot_state->>started_at", "is", null)
        .order("updated_at", { ascending: false })
        .limit(MAX_PROJECTS_PER_TICK * 2)

    if (error) {
        console.error("[autopilot-tick] project lookup failed:", error.message)
        return { advanced: 0, fired: 0, skipped: 0, failed: 0, details: [] }
    }

    const active = (projects ?? [])
        .filter((p) => {
            const state = p.autopilot_state as AutopilotState | null
            if (!state) return false
            if (!state.started_at) return false
            // TERMINAL stages — must be kept in sync with the DB filter above.
            // 'solver_error' added 2026-04-29: NULL dimension_sheet hard-block.
            if (state.stage === "done" || state.stage === "failed" || state.stage === "solver_error") return false
            return true
        })
        .slice(0, MAX_PROJECTS_PER_TICK)

    // Pre-compute the fire URL + bearer secret once. The cron's per-project
    // fire is awaited with a 2 s abort signal; receiving Lambda continues
    // independently for its full 300 s budget (Vercel client-disconnect
    // semantics — see memory `forgeos_vercel_after_silent_drop.md`).
    const proto = request.headers.get("x-forwarded-proto") ?? "https"
    const host =
        request.headers.get("x-forwarded-host") ??
        request.headers.get("host") ??
        "fractionalforge.app"
    const fireUrl = `${proto}://${host}/api/autopilot-step`
    const renderSecret = process.env.FORGE_RENDER_STAGE_SECRET ?? ""

    if (!renderSecret) {
        console.error(
            "[autopilot-tick] FORGE_RENDER_STAGE_SECRET is empty — cannot fire stages",
        )
        // Still process synchronous (locking_brief) projects; fire stages
        // will be skipped with the secret-missing reason.
    }

    for (const project of active) {
        const state = project.autopilot_state as AutopilotState
        const stage = state.stage as AutopilotStage

        // TERMINAL stages: 'done' and 'solver_error' are both terminal.
        // 'failed' is excluded upstream by the DB query; 'solver_error'
        // is excluded by the in-memory filter above, but belt-and-suspenders
        // guard here prevents accidental advance if a project somehow slips
        // through (e.g. stale STAGE_CONFIG lookup returns undefined).
        if (stage === "done" || stage === "solver_error") {
            details.push({
                projectId: project.id,
                stage,
                action: "skip_terminal",
                ok: true,
            })
            skipped++
            continue
        }

        const config = STAGE_CONFIG[stage as Exclude<AutopilotStage, "done" | "failed">]
        if (!config) {
            details.push({
                projectId: project.id,
                stage,
                action: "skip_no_config",
                ok: false,
                reason: `no STAGE_CONFIG for ${stage}`,
            })
            skipped++
            continue
        }

        // ── Synchronous stages (locking_brief) ──────────────────────
        if (config.kind === "synchronous") {
            try {
                const result = await lockBriefSynchronously(project.id)
                if (result.ok) {
                    await advance(project.id, stage, config.nextStage)
                    details.push({
                        projectId: project.id,
                        stage,
                        action: "synchronous_ok",
                        ok: true,
                    })
                    advanced++
                } else {
                    await recordFailure(project.id, stage, result.error)
                    details.push({
                        projectId: project.id,
                        stage,
                        action: "synchronous_fail",
                        ok: false,
                        reason: result.error,
                    })
                    failed++
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                await recordFailure(project.id, stage, msg)
                details.push({
                    projectId: project.id,
                    stage,
                    action: "synchronous_fail",
                    ok: false,
                    reason: msg,
                })
                failed++
            }
            continue
        }

        // ── Fire stages ────────────────────────────────────────────
        // Most-recent autopilot tracking row for this (project, stage).
        const { data: trackingRow } = await admin
            .from("pipeline_runs")
            .select("id, status, started_at, error_code, error_message")
            .eq("project_id", project.id)
            .eq("specialist_id", AUTOPILOT_TRACKING_SPECIALIST)
            .eq("stage", stage)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (trackingRow?.status === "done") {
            // ── Quality Gate hook (flag-gated, default off) ──────────────
            // Runs AFTER the stage is done, BEFORE advancing to the next
            // stage. No-op when ENABLE_QUALITY_GATES !== 'true'.
            // DECISION: gates are async / fire-and-forget relative to the
            // autopilot advance — they write to gate_verdicts but do not
            // block the tick's HTTP response. A FAIL verdict leaves
            // autopilot_state.stage where it is (no advance), so the next
            // tick re-evaluates whether to advance or re-fire.
            if (process.env.ENABLE_QUALITY_GATES === "true") {
                const gateForThisStage = STAGE_GATE_MAP[stage as AutopilotStage]
                if (gateForThisStage) {
                    // Read current pipeline_run_iteration from autopilot_state
                    // (falls back to 1 for projects that pre-date this field)
                    const pipelineIteration =
                        (state as AutopilotState & { pipeline_run_iteration?: number })
                            .pipeline_run_iteration ?? 1

                    const gateResult = await runGate(
                        gateForThisStage,
                        project.id,
                        stage,
                        pipelineIteration,
                    )

                    if (gateResult.verdict === "FAIL" && gateResult.attempts_remaining > 0) {
                        // ── Gate Iteration Loop — re-fire upstream specialist ──
                        //
                        // The verdict row persisted by runGate() carries
                        // `remediation_target_stage` + `remediation_context_injected`
                        // when the gate implementation populated them (Gates 2 and 3
                        // always do; Gates 5 and 6 will follow). When both are present,
                        // we trigger the full remediation sequence:
                        //   1. Stash context at gate_remediation_context.<targetStage>
                        //   2. Supersede stale pipeline_runs for targetStage
                        //   3. Reset autopilot_state.stage to targetStage
                        // The next cron tick sees the reset stage and re-fires the
                        // specialist. The specialist reads + clears gate_remediation_context
                        // at the top of its prompt-building step.
                        //
                        // When the gate did NOT populate remediation fields (e.g. a WARN
                        // verdict surfaced with no context, or the gate implementation is
                        // not yet fully wired), we fall back to the original skip_running
                        // behaviour — leave the autopilot at the current stage and let
                        // the next tick re-evaluate. This preserves backward compatibility
                        // for projects mid-pipeline.

                        const verdictRow = gateResult.verdict_row
                        const remediationTargetStage = verdictRow?.remediation_target_stage ?? null
                        const remediationContext = verdictRow?.remediation_context_injected ?? null

                        if (remediationTargetStage && remediationContext) {
                            // Full remediation path — stash, supersede, reset stage.
                            const remResult = await triggerRemediation(
                                project.id,
                                remediationTargetStage,
                                remediationContext,
                                verdictRow?.id,
                            )

                            if (remResult.ok) {
                                details.push({
                                    projectId: project.id,
                                    stage,
                                    action: "gate_remediation" as TickAction,
                                    ok: true,
                                    reason: `gate_${gateForThisStage.gateId} FAIL attempt=${gateResult.fail_count} → remediation fired, stage reset to ${remediationTargetStage}`,
                                })
                                // Count as a fire (we triggered a re-run) not a skip.
                                fired++
                            } else {
                                // Remediation failed — fall back to skip_running so the
                                // next tick re-tries. Log the error for visibility.
                                console.error(
                                    `[autopilot-tick] gate_${gateForThisStage.gateId} remediation failed for project=${project.id}:`,
                                    remResult.error,
                                )
                                details.push({
                                    projectId: project.id,
                                    stage,
                                    action: "skip_running" as TickAction,
                                    ok: false,
                                    reason: `gate_${gateForThisStage.gateId} FAIL — remediation trigger failed: ${remResult.error}`,
                                })
                                skipped++
                            }
                        } else {
                            // Gate did not populate remediation fields — old skip_running
                            // behaviour. Leave stage unchanged; next tick re-evaluates.
                            details.push({
                                projectId: project.id,
                                stage,
                                action: "skip_running" as TickAction,
                                ok: false,
                                reason: `gate_${gateForThisStage.gateId} FAIL attempt=${gateResult.fail_count}/${2 - gateResult.attempts_remaining + gateResult.fail_count} — no remediation context (gate not fully wired)`,
                            })
                            skipped++
                        }
                        continue
                    }

                    if (gateResult.verdict === "FAIL" && gateResult.attempts_remaining === 0) {
                        // Exhausted attempts — allow advance but stamp uncertainty marker
                        await markUncertainty(project.id, gateForThisStage, gateResult)
                        console.warn(
                            `[autopilot-tick] gate_${gateForThisStage.gateId} FAIL after max attempts ` +
                                `project=${project.id} — advancing with uncertainty marker`,
                        )
                    }
                }
            }
            // ── end Quality Gate hook ────────────────────────────────────

            if (config.nextStage === "done") {
                await markDone(project.id, stage)
                details.push({
                    projectId: project.id,
                    stage,
                    action: "advance_done",
                    ok: true,
                })
            } else {
                await advance(project.id, stage, config.nextStage)
                details.push({
                    projectId: project.id,
                    stage,
                    action: "advance",
                    ok: true,
                })
            }
            advanced++
            continue
        }

        if (trackingRow?.status === "running") {
            const age = Date.now() - new Date(trackingRow.started_at).getTime()
            // L9-FANG-STALE (2026-04-27): per-stage threshold override.
            // running_fang_reviews fanout takes 12-24min on 8-module
            // projects; the 9-min default fires STALE_ABANDONED mid-fanout
            // and refires runFangReviewsForAllModules, burning Sonnet
            // credits on still-running modules. Stage-specific overrides
            // give honest fanouts headroom.
            const stageStaleMs =
                config.kind === "fire" && typeof config.staleMsOverride === "number"
                    ? config.staleMsOverride
                    : STALE_RUNNING_MS
            if (age < stageStaleMs) {
                details.push({
                    projectId: project.id,
                    stage,
                    action: "skip_running",
                    ok: true,
                    reason: `running for ${Math.round(age / 1000)}s`,
                })
                skipped++
                continue
            }
            // Stale — orphaned by a SIGKILLed Lambda. Mark and re-fire.
            await admin
                .from("pipeline_runs")
                .update({
                    status: "failed",
                    error_code: "STALE_ABANDONED",
                    error_message: `Tracking row stale (${Math.round(age / 1000)}s > ${Math.round(stageStaleMs / 1000)}s threshold)`,
                    finished_at: new Date().toISOString(),
                } as never)
                .eq("id", trackingRow.id)
            // Fall through to fire below.
        }

        if (
            trackingRow?.status === "failed" &&
            trackingRow.error_code !== "STALE_ABANDONED"
        ) {
            // Real failure (not just stale). Check attempt count: how many
            // failed rows already exist for this (project, stage)?
            const { count: failedCount } = await admin
                .from("pipeline_runs")
                .select("id", { count: "exact", head: true })
                .eq("project_id", project.id)
                .eq("specialist_id", AUTOPILOT_TRACKING_SPECIALIST)
                .eq("stage", stage)
                .eq("status", "failed")

            const attempts = failedCount ?? 0
            if (attempts >= config.maxAttempts) {
                await recordFailure(
                    project.id,
                    stage,
                    trackingRow.error_message ??
                        `Stage failed after ${attempts} attempts`,
                )
                details.push({
                    projectId: project.id,
                    stage,
                    action: "terminal_fail",
                    ok: false,
                    reason: `${attempts} >= ${config.maxAttempts}`,
                })
                failed++
                continue
            }
            // Else: fall through to fire (retry).
        }

        // ── No row, or stale-just-marked, or failed-with-retries-left: fire ─
        if (!renderSecret) {
            details.push({
                projectId: project.id,
                stage,
                action: "fire",
                ok: false,
                reason: "FORGE_RENDER_STAGE_SECRET missing",
            })
            failed++
            continue
        }

        const fireAction: TickAction =
            trackingRow?.status === "failed"
                ? "fire_retry"
                : trackingRow?.status === "running"
                  ? "fire_after_stale"
                  : "fire"

        try {
            await fetch(fireUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${renderSecret}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    projectId: project.id,
                    step: config.fireStep,
                }),
                signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
            })
        } catch (err) {
            // Expected: AbortError after FIRE_TIMEOUT_MS. The receiving
            // Lambda is running. Only log unexpected (DNS/connect) errors.
            const msg = err instanceof Error ? err.message : String(err)
            const isExpectedAbort =
                msg.toLowerCase().includes("aborted") ||
                msg.includes("AbortError") ||
                (err instanceof Error && err.name === "TimeoutError")
            if (!isExpectedAbort) {
                console.warn(
                    `[autopilot-tick] fire ${config.fireStep} for ${project.id} unexpected error:`,
                    msg,
                )
            }
        }

        details.push({
            projectId: project.id,
            stage,
            action: fireAction,
            ok: true,
        })
        fired++
    }

    return { advanced, fired, skipped, failed, details }
}
