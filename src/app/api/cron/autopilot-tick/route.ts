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
    getProjectFoundryId,
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
import {
    checkFoundryCohortGate,
    advanceCohort,
    shouldScoreStage,
    MAX_SCORING_ATTEMPTS,
    FORGE_GUILD_COHORT_IDS,
    getCohortLeadingStage,
    getStageIndex,
} from "@/lib/forge-v2/stage-scoring"

export const dynamic = "force-dynamic"
export const maxDuration = 300

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
    // TERMINAL STAGES: 'done', 'failed', 'solver_error', 'preflight_blocked', 'gate_1_blocked'
    // 'solver_error' added 2026-04-29 (Loop 24 P0 gate-3 council R2 fix):
    // projects where Fang produced a NULL dimension_sheet are permanently blocked.
    // 'preflight_blocked' added 2026-04-29 (Gates Council R1+R2 P1):
    // projects where runPreflightOracle() found a physics violation before the
    // pipeline started. The brief is physically infeasible — the pipeline must
    // never fire for these projects. Verdict is in feasibility_verdict column.
    // 'gate_1_blocked' added 2026-04-29 (Gates Council R1 P2):
    // projects where gate1Check() found a ≥3× numeric mismatch between founder's
    // brief and Chase's structured extraction at brief-lock time. Founder must
    // confirm or revise before the pipeline can continue.
    const { data: projects, error } = await admin
        .from("cad_lab_projects")
        .select("id, autopilot_state")
        .not("autopilot_state", "is", null)
        .not("autopilot_state->>stage", "in", '("done","failed","solver_error","preflight_blocked","gate_1_blocked")')
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
            // 'preflight_blocked' added 2026-04-29: physics violation pre-pipeline.
            // 'gate_1_blocked' added 2026-04-29: numeric mismatch at brief-lock.
            if (state.stage === "done" || state.stage === "failed" || state.stage === "solver_error" || state.stage === "preflight_blocked" || state.stage === "gate_1_blocked") return false
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

        // TERMINAL stages: 'done', 'solver_error', 'preflight_blocked', 'gate_1_blocked'
        // are all terminal. 'failed' is excluded upstream by the DB query; the others
        // are excluded by the in-memory filter above. Belt-and-suspenders guard here
        // prevents accidental advance if a project somehow slips through.
        if (stage === "done" || stage === "solver_error" || stage === "preflight_blocked" || stage === "gate_1_blocked") {
            details.push({
                projectId: project.id,
                stage,
                action: "skip_terminal",
                ok: true,
            })
            skipped++
            continue
        }

        const config = STAGE_CONFIG[stage as Exclude<AutopilotStage, "done" | "failed" | "solver_error" | "preflight_blocked" | "waiting_max_redecomposition" | "gate_1_blocked">]
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

        // ── awaiting_gate: scoring done in autopilot-step, cron runs cohort check ──
        // Set by autopilot-step score_and_gate action when a project scores ≥8/10.
        // Cohort check is fast (DB queries only, no LLM calls) — safe in the cron.
        const autopilotStatus = (state as AutopilotState & { status?: string }).status
        if (autopilotStatus === "awaiting_gate" && shouldScoreStage(stage as AutopilotStage)) {
            const foundryId = await getProjectFoundryId(project.id)
            if (foundryId) {
                // ── Catch-up logic: if this project is BEHIND the cohort, advance individually ──
                // When a project was reset (e.g. stage_failed → re-run), it may be at an
                // earlier stage than the rest of the cohort. The cohort already passed this
                // stage, so the behind project should advance individually to catch up.
                // The cohort gate only holds projects at the LEADING stage.
                const isCohortProject = FORGE_GUILD_COHORT_IDS.includes(project.id)
                if (isCohortProject) {
                    const leadingStage = await getCohortLeadingStage()
                    if (leadingStage && getStageIndex(stage as AutopilotStage) < getStageIndex(leadingStage)) {
                        // This project is behind — advance individually to catch up
                        console.info(
                            `[autopilot-tick] CATCH-UP: project=${project.id} at ${stage} is behind leading stage ${leadingStage} — advancing individually`,
                        )
                        if (config.nextStage === "done") {
                            await markDone(project.id, stage)
                            details.push({ projectId: project.id, stage, action: "advance_done", ok: true })
                        } else {
                            await advance(project.id, stage, config.nextStage)
                            // Set status to idle so the cron runs the stage work.
                            // advance() preserves the existing status (awaiting_gate),
                            // but the project hasn't done work for the next stage yet.
                            const adminClient = createAdminClient()
                            const { data: freshProject } = await adminClient
                                .from("cad_lab_projects")
                                .select("autopilot_state")
                                .eq("id", project.id)
                                .maybeSingle()
                            if (freshProject?.autopilot_state) {
                                const freshState = freshProject.autopilot_state as AutopilotState
                                await adminClient
                                    .from("cad_lab_projects")
                                    .update({
                                        autopilot_state: {
                                            ...freshState,
                                            status: "idle",
                                            failed_stages: [],
                                            current_stage_attempts: 0,
                                        },
                                    } as unknown as never)
                                    .eq("id", project.id)
                            }
                            details.push({
                                projectId: project.id,
                                stage,
                                action: "advance" as TickAction,
                                ok: true,
                                reason: `catch-up advance: ${stage} → ${config.nextStage} (leading: ${leadingStage})`,
                            })
                        }
                        advanced++
                        continue
                    }
                }

                const cohort = await checkFoundryCohortGate(foundryId, stage as AutopilotStage)

                if (cohort.shouldResetAll) {
                    // Gate check failed — log and skip, do NOT reset the whole cohort.
                    // The gate will re-check on the next cron tick.
                    console.warn(
                        `[autopilot-tick] cohort gate failed at stage=${stage} (awaiting_gate) — skipping, will re-check next tick`,
                    )
                    details.push({
                        projectId: project.id,
                        stage,
                        action: "skip_running" as TickAction,
                        ok: false,
                        reason: `cohort gate: a project exhausted ${MAX_SCORING_ATTEMPTS} attempts — leaving projects at current stage`,
                    })
                    skipped++
                    continue
                }

                if (!cohort.allPassed) {
                    const failing = cohort.results
                        .filter((r) => !r.passed)
                        .map((r) => `${r.projectName}(${r.composite})`)
                        .join(", ")
                    console.info(
                        `[autopilot-tick] cohort gate HOLD project=${project.id} stage=${stage} — not all projects passed: ${failing}`,
                    )
                    details.push({
                        projectId: project.id,
                        stage,
                        action: "skip_running" as TickAction,
                        ok: false,
                        reason: `cohort gate: waiting for all projects to score ≥8/10 — failing: ${failing}`,
                    })
                    skipped++
                    continue
                }

                // ALL passed — advance the entire cohort atomically
                if (config.nextStage === "done") {
                    await markDone(project.id, stage)
                    details.push({ projectId: project.id, stage, action: "advance_done", ok: true })
                } else {
                    const cohortResult = await advanceCohort(foundryId, stage as AutopilotStage, config.nextStage as AutopilotStage)
                    details.push({
                        projectId: project.id,
                        stage,
                        action: "advance" as TickAction,
                        ok: cohortResult.ok,
                        reason: `cohort advance: ${cohortResult.advancedCount} projects ${stage} → ${config.nextStage}`,
                    })
                }
                advanced++
                continue
            }
        }

        // ── terminal_fail set by score_and_gate in autopilot-step ────────
        if (autopilotStatus === "terminal_fail") {
            console.error(
                `[autopilot-tick] terminal_fail detected for project=${project.id} stage=${stage} — triggering cohort reset`,
            )
            await recordFailure(
                project.id,
                stage,
                `Stage quality gate exhausted ${MAX_SCORING_ATTEMPTS} attempts without reaching 8/10 threshold`,
            )
            details.push({
                projectId: project.id,
                stage,
                action: "terminal_fail",
                ok: false,
                reason: `scoring exhausted: terminal_fail status set by score_and_gate`,
            })
            failed++
            // Mark ONLY this project as stage_failed — do NOT reset the entire cohort.
            const { error: sfErr } = await createAdminClient()
                .from("cad_lab_projects")
                .update({
                    autopilot_state: {
                        ...(state as Record<string, unknown>),
                        status: "stage_failed",
                    },
                } as never)
                .eq("id", project.id)
            if (sfErr) {
                console.error(`[autopilot-tick] Failed to set stage_failed for project=${project.id}:`, sfErr.message)
            } else {
                console.info(`[autopilot-tick] project=${project.id} marked stage_failed at stage=${stage}`)
            }
            continue
        }

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

            // ── Stage Scoring — dispatch to autopilot-step ───────────────
            // Scoring + 6-model council can take 2+ minutes, causing 504 timeouts.
            // Dispatch to autopilot-step (maxDuration=800) which sets status to
            // 'awaiting_gate' (pass), 'idle' (retry after council), or
            // 'terminal_fail' (exhausted). Cron handles cohort advance/reset above.
            if (shouldScoreStage(stage as AutopilotStage)) {
                const existingScores = (state as AutopilotState & { stage_scores?: Record<string, { passed: boolean }> }).stage_scores
                const alreadyScored = existingScores?.[stage]?.passed

                if (!alreadyScored) {
                    if (!renderSecret) {
                        details.push({
                            projectId: project.id,
                            stage,
                            action: "fire",
                            ok: false,
                            reason: "FORGE_RENDER_STAGE_SECRET missing — cannot dispatch score_and_gate",
                        })
                        failed++
                        continue
                    }

                    try {
                        await fetch(fireUrl, {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${renderSecret}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                projectId: project.id,
                                action: "score_and_gate",
                                stage,
                            }),
                            signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
                        })
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err)
                        const isExpectedAbort =
                            msg.toLowerCase().includes("aborted") ||
                            msg.includes("AbortError") ||
                            (err instanceof Error && err.name === "TimeoutError")
                        if (!isExpectedAbort) {
                            console.warn(
                                `[autopilot-tick] score_and_gate dispatch for ${project.id} unexpected error:`, msg,
                            )
                        }
                    }

                    console.info(
                        `[autopilot-tick] dispatched score_and_gate for project=${project.id} stage=${stage}`,
                    )
                    details.push({
                        projectId: project.id,
                        stage,
                        action: "skip_running" as TickAction,
                        ok: true,
                        reason: `score_and_gate dispatched to autopilot-step — waiting for awaiting_gate status`,
                    })
                    skipped++
                    continue
                }

                // alreadyScored=true: belt-and-suspenders if awaiting_gate wasn't set.
                const foundryId = await getProjectFoundryId(project.id)
                if (foundryId) {
                    const cohort = await checkFoundryCohortGate(foundryId, stage as AutopilotStage)
                    if (cohort.shouldResetAll) {
                        console.warn(`[autopilot-tick] cohort gate failed at stage=${stage} (belt-and-suspenders) — skipping, will re-check next tick`)
                        details.push({ projectId: project.id, stage, action: "skip_running" as TickAction, ok: false, reason: `cohort gate: a project failed — leaving projects at current stage` })
                        skipped++
                        continue
                    }
                    if (!cohort.allPassed) {
                        details.push({ projectId: project.id, stage, action: "skip_running" as TickAction, ok: false, reason: `cohort gate: waiting for all projects` })
                        skipped++
                        continue
                    }
                    if (config.nextStage === "done") {
                        await markDone(project.id, stage)
                        details.push({ projectId: project.id, stage, action: "advance_done", ok: true })
                    } else {
                        const cohortResult = await advanceCohort(foundryId, stage as AutopilotStage, config.nextStage as AutopilotStage)
                        details.push({ projectId: project.id, stage, action: "advance" as TickAction, ok: cohortResult.ok, reason: `cohort advance: ${cohortResult.advancedCount} projects ${stage} → ${config.nextStage}` })
                    }
                    advanced++
                    continue
                }
            }
            // ── end Stage Scoring dispatch ───────────────────────────────

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
            trackingRow.error_code !== "STALE_ABANDONED" &&
            trackingRow.error_code !== "RESET_SUPERSEDED"
        ) {
            // If the project was reset (current_stage_attempts=0), old failed
            // pipeline_runs from before the reset must not count against the
            // retry budget. Skip the failed-count guard, reset status to idle,
            // and let the next tick fire the specialist fresh.
            const stateObj = state as AutopilotState & { current_stage_attempts?: number }
            const wasReset = (stateObj.current_stage_attempts ?? 0) === 0

            // If the project was reset (current_stage_attempts=0), delete old
            // failed/error pipeline_runs BEFORE counting — stale rows from prior
            // cycles must not poison the retry-count guard.
            if (wasReset) {
                const { count: staleCount, error: delErr } = await createAdminClient()
                    .from("pipeline_runs")
                    .delete({ count: "exact" })
                    .eq("project_id", project.id)
                    .eq("specialist_id", AUTOPILOT_TRACKING_SPECIALIST)
                    .eq("stage", stage)
                    .in("status", ["failed", "error"])
                if (delErr) {
                    console.error(`[autopilot-tick] failed to delete stale pipeline_runs for project=${project.id} stage=${stage}:`, delErr.message)
                } else {
                    console.info(`[autopilot-tick] wasReset=true — deleted ${staleCount ?? 0} stale pipeline_runs for project=${project.id} stage=${stage}`)
                }
            }

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
            if (wasReset) {
                // Project was reset but stale pipeline_runs remain. Supersede
                // old failed runs so the next tick doesn't re-enter this block,
                // bump csa to 1 so wasReset=false on subsequent ticks, and fall
                // through to fire the stage immediately (no skip/continue).
                console.info(
                    `[autopilot-tick] wasReset=true for project=${project.id} stage=${stage} — superseding ${attempts} old failed runs, will fire stage`,
                )
                const adminClient = createAdminClient()
                await adminClient
                    .from("pipeline_runs")
                    .update({
                        error_code: "RESET_SUPERSEDED",
                        error_message: "Superseded by wasReset — old failed runs from before reset",
                    } as never)
                    .eq("project_id", project.id)
                    .eq("specialist_id", AUTOPILOT_TRACKING_SPECIALIST)
                    .eq("stage", stage)
                    .eq("status", "failed")
                await adminClient
                    .from("cad_lab_projects")
                    .update({
                        autopilot_state: {
                            ...(state as Record<string, unknown>),
                            status: "idle",
                            failed_stages: [],
                            current_stage_attempts: 1,
                        },
                    } as unknown as never)
                    .eq("id", project.id)
                // Fall through to fire logic below — do NOT continue/skip.
            }
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

                // Mark ONLY this project as stage_failed — do NOT reset the entire cohort.
                const { error: sfErr2 } = await createAdminClient()
                    .from("cad_lab_projects")
                    .update({
                        autopilot_state: {
                            ...(state as Record<string, unknown>),
                            status: "stage_failed",
                        },
                    } as never)
                    .eq("id", project.id)
                if (sfErr2) {
                    console.error(`[autopilot-tick] Failed to set stage_failed for project=${project.id}:`, sfErr2.message)
                } else {
                    console.info(`[autopilot-tick] project=${project.id} marked stage_failed at stage=${stage} attempts=${attempts}`)
                }

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
