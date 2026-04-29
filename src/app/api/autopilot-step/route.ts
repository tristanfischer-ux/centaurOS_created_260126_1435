/**
 * @file route.ts — /api/autopilot-step
 *
 * @description Fire-only specialist invocation endpoint for the zero-wait
 * autopilot orchestrator (2026-04-25 rewrite).
 *
 * Triggered by the cron tick (`/api/cron/autopilot-tick`). For each
 * `{ projectId, step }` request:
 *
 *   1. INSERT a `pipeline_runs` autopilot tracking row
 *      `(project_id, specialist_id='autopilot', stage=<derived>, status='running')`
 *   2. Resolve `step` → specialist Background fn (per-step switch)
 *   3. Call the Background fn synchronously (foreground; uses this Lambda's
 *      full 300 s budget)
 *   4. UPDATE the tracking row to `'done'` (success) or `'failed'` (with
 *      error message)
 *   5. Return 200
 *
 * The cron tick reads only the autopilot tracking row to decide
 * advance / retry / terminal-fail. Specialists may also write their own
 * `pipeline_runs` rows (under their own specialist_id) — those remain for
 * cost / latency tracking but are not consulted by the orchestrator.
 *
 * No polling. No state mutation (cron owns `autopilot_state` writes). No
 * HTTP-hop chaining (cron is the only orchestrator).
 *
 * @related
 *   - Cron (orchestrator):  src/app/api/cron/autopilot-tick/route.ts
 *   - Stage map:            src/lib/forge-v2/stage-config.ts
 *   - Specialist helpers:   src/actions/specialists/*.ts
 */

import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import {
    getProjectFoundryId,
    type AutopilotState,
} from "@/actions/forge-v2-autopilot"
import {
    AUTOPILOT_TRACKING_SPECIALIST,
    STEP_TO_STAGE,
    isAutopilotStepName,
    type AutopilotStepName,
} from "@/lib/forge-v2/stage-config"

export const dynamic = "force-dynamic"
// Each fire gets a fresh Vercel Lambda with its own 800 s budget. Most
// specialists complete in 30-180 s; Chase research can spike to 9-12 min on
// aerospace/HAPS-class briefs (Loop 17 verification 2026-04-28 saw 3 consecutive
// SIGKILLs at the prior 300 s cap). Vercel Pro tier supports up to 900 s.
// Fang reviews are routed to Modal (FANG_VIA_MODAL flag) when their per-module
// runtime risks the cap; this Lambda budget covers everything else.
export const maxDuration = 800

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Minimum chars on `research.report` for Chase to count as substantive. */
const MIN_BRIEF_REPORT_CHARS = 200

interface AutopilotStepRequestBody {
    projectId?: unknown
    step?: unknown
}

function verifyStageSecret(req: Request): NextResponse | null {
    const secret = process.env.FORGE_RENDER_STAGE_SECRET
    if (!secret) {
        console.error(
            "[autopilot-step] FORGE_RENDER_STAGE_SECRET not configured",
        )
        return NextResponse.json(
            { error: "Autopilot step secret not configured" },
            { status: 503 },
        )
    }
    const authHeader = req.headers.get("authorization") || ""
    const expected = `Bearer ${secret}`
    if (
        authHeader.length !== expected.length ||
        !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
}

export async function POST(request: Request): Promise<NextResponse> {
    const authFailure = verifyStageSecret(request)
    if (authFailure) return authFailure

    let body: AutopilotStepRequestBody
    try {
        body = (await request.json()) as AutopilotStepRequestBody
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        )
    }

    const projectId = typeof body.projectId === "string" ? body.projectId : ""
    if (!projectId || !UUID_RE.test(projectId)) {
        return NextResponse.json(
            { error: "projectId must be a UUID string" },
            { status: 400 },
        )
    }

    const rawStep = typeof body.step === "string" ? body.step : ""
    if (!rawStep || !isAutopilotStepName(rawStep)) {
        return NextResponse.json(
            { error: "step must be a known autopilot stage name" },
            { status: 400 },
        )
    }
    const step: AutopilotStepName = rawStep
    const stage = STEP_TO_STAGE[step]

    const admin = createAdminClient()

    // Pre-flight: project must exist and have an active autopilot state.
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, foundry_id, autopilot_state")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr) {
        return NextResponse.json(
            { error: "Project lookup failed" },
            { status: 500 },
        )
    }
    if (!project) {
        return NextResponse.json(
            { error: "Project not found" },
            { status: 404 },
        )
    }
    const state = project.autopilot_state as AutopilotState | null
    if (!state || state.finished_at != null || state.stage === "done") {
        return NextResponse.json(
            { ok: true, ran: false, reason: "not_active" },
            { status: 200 },
        )
    }

    // ── 1. Insert tracking row (status=running) ─────────────────────
    // foundry_id is NOT NULL on pipeline_runs — must be included.
    const startedAt = new Date().toISOString()
    const { data: trackingInsert, error: insertErr } = await admin
        .from("pipeline_runs")
        .insert({
            project_id: projectId,
            foundry_id: project.foundry_id,
            specialist_id: AUTOPILOT_TRACKING_SPECIALIST,
            stage,
            status: "running",
            trigger: "auto.autopilot",
            started_at: startedAt,
        } as never)
        .select("id")
        .maybeSingle()

    if (insertErr || !trackingInsert) {
        // Best-effort: log and continue. Better to attempt the work than
        // silently abandon. The cron's stale-running detector will clean up.
        console.error(
            "[autopilot-step] tracking row insert failed:",
            insertErr?.message,
        )
    }
    const trackingId = trackingInsert?.id ?? null

    // ── 2. Run the specialist ───────────────────────────────────────
    let outcome: { ok: true } | { ok: false; error: string }
    try {
        outcome = await runStep(projectId, step, state)
    } catch (err) {
        outcome = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        }
    }

    // ── 3. Stamp tracking row to terminal status ────────────────────
    if (trackingId) {
        await admin
            .from("pipeline_runs")
            .update({
                status: outcome.ok ? "done" : "failed",
                error_message: outcome.ok ? null : outcome.error,
                error_code: outcome.ok ? null : "STEP_FAILED",
                finished_at: new Date().toISOString(),
            } as never)
            .eq("id", trackingId)
    }

    if (outcome.ok) {
        return NextResponse.json({ ok: true, ran: true, step }, { status: 200 })
    }
    return NextResponse.json(
        { ok: false, error: outcome.error, step },
        { status: 200 },
    )
}

// ─── Hard cap for Max-redecomposition retries ────────────────────────────────
// Council-calibrated 2026-04-29: unanimous vote for 3 across 6 frontier models.
// After this many redecomposition attempts the pipeline fails with a clear
// human-readable message rather than looping indefinitely.
const MAX_REDECOMPOSITION_ATTEMPTS = 3

// ─── Per-step specialist invocation ─────────────────────────────────────

async function runStep(
    projectId: string,
    step: AutopilotStepName,
    autopilotState: AutopilotState,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const foundryId = await getProjectFoundryId(projectId)
    if (!foundryId) {
        return { ok: false, error: "Project not found or has no foundry" }
    }

    switch (step) {
        case "waitForChase": {
            const { runChaseResearchBackground } = await import(
                "@/actions/specialists/run-chase-research"
            )
            const result = await runChaseResearchBackground(
                projectId,
                foundryId,
                null,
            )
            if (!result.ok) {
                return { ok: false, error: result.error ?? "Chase failed" }
            }
            // Post-check: research report must have substantive content.
            const reportLen = await readResearchReportChars(projectId)
            if (reportLen < MIN_BRIEF_REPORT_CHARS) {
                return {
                    ok: false,
                    error: `Chase finished but research report has only ${reportLen} chars (need ${MIN_BRIEF_REPORT_CHARS}+).`,
                }
            }
            return { ok: true }
        }

        case "waitForMax": {
            const { runMaxDecompositionBackground } = await import(
                "@/actions/specialists/run-max-decomposition"
            )
            const result = await runMaxDecompositionBackground(
                projectId,
                foundryId,
                null,
            )
            return result.ok
                ? { ok: true }
                : { ok: false, error: result.error ?? "Max failed" }
        }

        case "waitForMaxRedecomposition": {
            // Gates Council R1 P1 (2026-04-29): Max is re-fired after Fang sizing
            // Guard 3 detected a topology-level overflow. The remediation context
            // is already stashed at gate_remediation_context.waiting_max by
            // triggerRemediation (called in the waitForSizing branch above).
            // runMaxDecompositionBackground reads + clears it via
            // consumeRemediationContext at the start of its prompt-building step,
            // prepending the structured override block that tells Max what
            // structural change to make.
            //
            // TOPOLOGY-DRIFT DISCLOSURE (Item 10, council-calibrated 2026-04-29):
            // When Max produces a substantially different decomposition after
            // redecomposition, the founder needs to know. We capture the module
            // count before running Max, compare after, and flag substantial drift
            // (>20% module count change or any module count change at all) as a
            // warning in the autopilot_state.
            //
            // The trigger string is deliberately "auto.brief-lock" (the same as
            // first-pass) so the pipeline_runs record looks identical to a normal
            // Max run — the remediation context in the prompt is the signal.

            // ── Snapshot module count BEFORE redecomposition ─────────
            const admin = createAdminClient()
            const { data: preRedecomp } = await admin
                .from("cad_lab_projects")
                .select("modules")
                .eq("id", projectId)
                .maybeSingle()
            const modulesBefore = (preRedecomp?.modules as Array<{ id: string; name?: string }> | null) ?? []
            const moduleCountBefore = modulesBefore.length
            const moduleNamesBefore = new Set(modulesBefore.map((m) => (m.name ?? "").toLowerCase().trim()))

            const { runMaxDecompositionBackground } = await import(
                "@/actions/specialists/run-max-decomposition"
            )
            const result = await runMaxDecompositionBackground(
                projectId,
                foundryId,
                null,
            )
            if (!result.ok) {
                return { ok: false, error: result.error ?? "Max redecomposition failed" }
            }

            // ── Snapshot module count AFTER and compute topology drift ─
            const { data: postRedecomp } = await admin
                .from("cad_lab_projects")
                .select("modules")
                .eq("id", projectId)
                .maybeSingle()
            const modulesAfter = (postRedecomp?.modules as Array<{ id: string; name?: string }> | null) ?? []
            const moduleCountAfter = modulesAfter.length
            const moduleNamesAfter = new Set(modulesAfter.map((m) => (m.name ?? "").toLowerCase().trim()))

            // Jaccard similarity of module name sets: intersection / union
            const intersection = [...moduleNamesBefore].filter((n) => moduleNamesAfter.has(n))
            const union = new Set([...moduleNamesBefore, ...moduleNamesAfter])
            const jaccardSimilarity = union.size > 0 ? intersection.length / union.size : 1
            const jaccardDistance = 1 - jaccardSimilarity

            // Module count % change
            const countDeltaPct =
                moduleCountBefore > 0
                    ? Math.abs(moduleCountAfter - moduleCountBefore) / moduleCountBefore
                    : 0

            // Council-calibrated drift threshold: Jaccard distance > 0.35 OR
            // module count changes by > 20%.
            const DRIFT_JACCARD_THRESHOLD = 0.35
            const DRIFT_COUNT_PCT_THRESHOLD = 0.20

            const isDriftSubstantial =
                jaccardDistance > DRIFT_JACCARD_THRESHOLD ||
                countDeltaPct > DRIFT_COUNT_PCT_THRESHOLD

            const attemptNum = autopilotState.redecomposition_attempts ?? 0

            if (isDriftSubstantial) {
                console.warn(
                    `[autopilot-step] waitForMaxRedecomposition: TOPOLOGY DRIFT DETECTED for project=${projectId} ` +
                    `(attempt ${attemptNum}/${MAX_REDECOMPOSITION_ATTEMPTS}). ` +
                    `Modules before: ${moduleCountBefore}, after: ${moduleCountAfter}. ` +
                    `Jaccard distance: ${jaccardDistance.toFixed(2)}, count delta: ${(countDeltaPct * 100).toFixed(0)}%.`,
                )
                // Write the drift disclosure into autopilot_state so it surfaces in the UI.
                const driftNote =
                    `Topology drift (attempt ${attemptNum}/${MAX_REDECOMPOSITION_ATTEMPTS}): ` +
                    `module count changed from ${moduleCountBefore} to ${moduleCountAfter} ` +
                    `(${countDeltaPct > 0 ? "+" : ""}${Math.round((moduleCountAfter - moduleCountBefore))} modules, ` +
                    `Jaccard distance ${jaccardDistance.toFixed(2)}). ` +
                    `The revised decomposition differs substantially from the original brief. ` +
                    `Review the Modules page to confirm the new architecture matches your intent.`

                await admin
                    .from("cad_lab_projects")
                    .update({
                        autopilot_state: {
                            ...autopilotState,
                            topology_drift_note: driftNote,
                        },
                    } as never)
                    .eq("id", projectId)
            } else {
                console.log(
                    `[autopilot-step] waitForMaxRedecomposition: no substantial drift for project=${projectId} ` +
                    `(modules: ${moduleCountBefore} → ${moduleCountAfter}, Jaccard distance: ${jaccardDistance.toFixed(2)})`,
                )
            }

            console.log(
                `[autopilot-step] waitForMaxRedecomposition: Max redecomposition succeeded for project=${projectId} ` +
                `(${result.moduleCount} modules, drift: ${isDriftSubstantial ? "SUBSTANTIAL" : "minor"})`,
            )
            return { ok: true }
        }

        case "waitForSizing": {
            const { runFangSizingBackground } = await import(
                "@/actions/specialists/run-fang-sizing"
            )
            const result = await runFangSizingBackground(projectId, foundryId)
            // Sizing has a `skipped: true` legitimate outcome for exotic
            // domains (e.g. HAPS stratospheric platform — no solver
            // support). Treat as advance, not failure.
            if (
                !result.ok &&
                "skipped" in result &&
                result.skipped === true
            ) {
                return { ok: true }
            }
            // DELIVER_AND_PUSHBACK (Loop 24 Gate-3 class-fence):
            // Guard 2 in run-fang-sizing.ts already persisted the
            // briefed-class max-feasible dimension_sheet with
            // `product_class_match: false` and the class-fence fields.
            // The alternate envelope is a different product class — we
            // cannot retry sizing with it without changing the brief.
            // The data IS there for the PDF to render the trade-off
            // callout, so we treat this as "sizing done" and allow the
            // autopilot to advance to the next stage normally.
            if (
                !result.ok &&
                "errorCode" in result &&
                result.errorCode === "DELIVER_AND_PUSHBACK"
            ) {
                console.log(
                    `[autopilot-step] sizing complete with class-drift pushback for project=${projectId} — advancing`,
                )
                return { ok: true }
            }
            // NEEDS_MAX_REDECOMPOSITION (Gates Council R1 P1 + Item 10 calibration):
            // Guard 3 in run-fang-sizing.ts fired — the solver's
            // recommendations contain a topology-level structural change
            // (split into 2 modules, externalise a skid, etc.). Re-sizing
            // the same module layout is futile; Max must redecompose with
            // the solver's structural guidance as a hard override.
            //
            // HARD RETRY CAP (Item 10, council-calibrated 2026-04-29):
            // Without a cap, a brief whose envelope is fundamentally too tight
            // for the target capacity would loop indefinitely:
            //   Fang → NEEDS_MAX_REDECOMPOSITION → Max → Fang → repeat.
            // The council (6 models, unanimous) recommends a cap of 3.
            // On cap-exceeded: fail the project with a clear human-readable
            // message; do NOT proceed with a known-infeasible decomposition.
            //
            // The remediation context is stashed by triggerRemediation into
            // gate_remediation_context.waiting_max so the next Max run picks
            // it up via consumeRemediationContext. The autopilot stage is set
            // to 'waiting_max_redecomposition' (TRANSITIONAL — not terminal).
            // After Max produces a new decomposition the pipeline continues
            // from waiting_sizing → waiting_layout → … normally.
            if (
                !result.ok &&
                "errorCode" in result &&
                result.errorCode === "NEEDS_MAX_REDECOMPOSITION"
            ) {
                // ── Retry-cap guard ──────────────────────────────────────
                const attemptsSoFar = autopilotState.redecomposition_attempts ?? 0
                if (attemptsSoFar >= MAX_REDECOMPOSITION_ATTEMPTS) {
                    const capMsg =
                        `Max-redecomposition retry cap reached (${MAX_REDECOMPOSITION_ATTEMPTS} attempts). ` +
                        `The sizing solver repeatedly found that the module decomposition cannot fit ` +
                        `within the briefed envelope. This usually means the target capacity, power, ` +
                        `or performance specification cannot be achieved within the specified physical ` +
                        `constraints. Please revise the brief — either increase the envelope size, ` +
                        `reduce the target specification, or accept a multi-unit system. ` +
                        `(Error from last sizing attempt: ${result.error ?? "topology overflow"})`
                    console.error(
                        `[autopilot-step] NEEDS_MAX_REDECOMPOSITION: cap reached after ${attemptsSoFar} attempts for project=${projectId}`,
                    )
                    return { ok: false, error: capMsg }
                }

                const waitingMaxContext =
                    (result as unknown as { _waitingMaxContext?: string })._waitingMaxContext ?? null
                if (waitingMaxContext) {
                    const { triggerRemediation } = await import(
                        "@/lib/forge-v2/stage-gates/remediation"
                    )
                    const remResult = await triggerRemediation(
                        projectId,
                        "waiting_max_redecomposition",
                        waitingMaxContext,
                    )
                    if (!remResult.ok) {
                        console.error(
                            `[autopilot-step] NEEDS_MAX_REDECOMPOSITION: triggerRemediation failed for project=${projectId}:`,
                            remResult.error,
                        )
                        return {
                            ok: false,
                            error:
                                `Max redecomposition remediation trigger failed: ${remResult.error ?? "unknown"}. ` +
                                `Original sizing error: ${result.error ?? "topology overflow"}`,
                        }
                    }

                    // ── Increment attempt counter in autopilot_state ─────
                    // This is a best-effort update — if it fails the cap guard
                    // reads 0 next time (same as first attempt), which just means
                    // one extra retry. Not worth failing the whole redecomposition
                    // trigger over this.
                    const newAttemptCount = attemptsSoFar + 1
                    const admin = createAdminClient()
                    const { error: stateUpdateErr } = await admin
                        .from("cad_lab_projects")
                        .update({
                            autopilot_state: {
                                ...autopilotState,
                                redecomposition_attempts: newAttemptCount,
                            },
                        } as never)
                        .eq("id", projectId)
                    if (stateUpdateErr) {
                        console.warn(
                            `[autopilot-step] NEEDS_MAX_REDECOMPOSITION: failed to increment attempt counter for project=${projectId} (non-fatal):`,
                            stateUpdateErr.message,
                        )
                    }

                    console.log(
                        `[autopilot-step] NEEDS_MAX_REDECOMPOSITION: remediation triggered for project=${projectId} ` +
                        `— attempt ${newAttemptCount}/${MAX_REDECOMPOSITION_ATTEMPTS}, stage reset to waiting_max_redecomposition`,
                    )
                    // triggerRemediation already reset autopilot_state.stage via the
                    // apply_gate_remediation PG function. The cron will pick up
                    // waiting_max_redecomposition on the next tick and fire Max.
                    // Return ok:true so the cron tick marks this sizing run done.
                    return { ok: true }
                }
                // Fallback: no context stashed — still fail the step so the
                // founder sees it rather than silently advancing with bad topology.
                console.error(
                    `[autopilot-step] NEEDS_MAX_REDECOMPOSITION: no _waitingMaxContext in result for project=${projectId}`,
                )
                return { ok: false, error: result.error ?? "Topology overflow: Max redecomposition required but context missing" }
            }
            return result.ok
                ? { ok: true }
                : { ok: false, error: result.error ?? "Sizing failed" }
        }

        case "waitForLayout": {
            const { runFangLayoutBackground } = await import(
                "@/actions/specialists/run-fang-layout"
            )
            const result = await runFangLayoutBackground(projectId, foundryId, null)
            // Layout has the same skipped-outcome pattern as Sizing.
            if (
                !result.ok &&
                "skipped" in result &&
                result.skipped === true
            ) {
                return { ok: true }
            }
            return result.ok
                ? { ok: true }
                : { ok: false, error: result.error ?? "Layout failed" }
        }

        case "waitForBom": {
            const { runBomGeneratorBackground } = await import(
                "@/actions/specialists/run-bom-generator"
            )
            const result = await runBomGeneratorBackground(
                projectId,
                foundryId,
                null,
            )
            if (!result.ok) {
                return { ok: false, error: result.error ?? "BOM failed" }
            }
            // BOM is a 3-stage distributed pipeline: skeleton → batches →
            // merge. runBomGeneratorBackground only kicks off the generator;
            // the skeleton stage was previously fired via after() inside
            // run-bom-generator.ts. The new architecture owns the chain
            // here so dual-trigger races can't happen. Skeleton stage uses
            // its own internal after()-cascade to fire batch + merge; we
            // await skeleton synchronously, batch + merge propagate via
            // skeleton's own state machine and the cron picks up failures.
            const { runBomSkeletonStage } = await import("@/actions/bom")
            try {
                await runBomSkeletonStage(projectId)
            } catch (err) {
                return {
                    ok: false,
                    error:
                        err instanceof Error
                            ? `BOM skeleton stage failed: ${err.message}`
                            : "BOM skeleton stage failed",
                }
            }
            return { ok: true }
        }

        case "waitForFinn": {
            const { runFinnCostBackground } = await import(
                "@/actions/specialists/run-finn-cost"
            )
            const result = await runFinnCostBackground(
                projectId,
                foundryId,
                null,
            )
            return result.ok
                ? { ok: true }
                : { ok: false, error: result.error ?? "Finn failed" }
        }

        case "generateIllustration": {
            const [
                { generateSystemIllustrationForProjectBackground },
                { generateConceptRenderForProjectBackground },
            ] = await Promise.all([
                import("@/actions/forge-v2-generate-system-illustration"),
                import("@/actions/forge-v2-generate-concept-render"),
            ])
            const [systemRes, conceptRes] = await Promise.allSettled([
                generateSystemIllustrationForProjectBackground(
                    projectId,
                    foundryId,
                ),
                generateConceptRenderForProjectBackground(projectId, foundryId),
            ])
            // System illustration is the load-bearing one; concept render
            // failure is non-fatal (matches existing stepGenerateIllustration
            // behaviour). Fail only if system render hard-failed.
            if (systemRes.status === "rejected") {
                return {
                    ok: false,
                    error: `System illustration threw: ${
                        systemRes.reason instanceof Error
                            ? systemRes.reason.message
                            : String(systemRes.reason)
                    }`,
                }
            }
            if (!systemRes.value.ok) {
                return {
                    ok: false,
                    error:
                        systemRes.value.error ?? "System illustration failed",
                }
            }
            if (conceptRes.status === "rejected") {
                console.warn(
                    "[autopilot-step] concept render threw (non-fatal):",
                    conceptRes.reason instanceof Error
                        ? conceptRes.reason.message
                        : conceptRes.reason,
                )
            } else if (!conceptRes.value.ok) {
                console.warn(
                    "[autopilot-step] concept render error (non-fatal):",
                    conceptRes.value.error,
                )
            }

            // Kick off per-module renders parallel-fire-and-forget. They run
            // during supplier-match + Fang-review stages and are awaited
            // by the PDF stage at the end. Failures here are non-fatal.
            try {
                const { startRenderAllRemainingModuleImagesBackground } =
                    await import("@/actions/forge-v2-render-all-modules")
                await startRenderAllRemainingModuleImagesBackground(
                    projectId,
                    foundryId,
                )
            } catch (err) {
                console.warn(
                    "[autopilot-step] per-module render queue failed (non-fatal):",
                    err instanceof Error ? err.message : err,
                )
            }

            // ── Cross-modal consistency gate (council R1 P1) ──────────
            //
            // Runs AFTER illustration generation, BEFORE supplier matching.
            // Catches BOM-vs-module divergences before the engine spends
            // time matching suppliers for parts that don't actually exist.
            //
            // Loop 24 evidence: BOM count and keyParts count diverged on
            // 4 of 5 demos. Vertical Farm showed 4 tiers in illustration
            // but 6 in BOM; Desalination CIP module missing from BOM but
            // cost persisted in waterfall.
            //
            // When blockers are found the step returns ok:false so the
            // autopilot stops at generating_illustration and the founder
            // sees the inconsistency rather than a fabricated supplier
            // shortlist for parts that don't exist.
            try {
                const { runCrossModalCheck } = await import(
                    "@/lib/forge-v2/cross-modal-consistency"
                )
                const cmAdmin = createAdminClient()
                const { data: cmProject } = await cmAdmin
                    .from("cad_lab_projects")
                    .select("modules, spatial_plan, ai_cost_estimates, system_illustration_url")
                    .eq("id", projectId)
                    .maybeSingle()

                if (cmProject) {
                    // Pull parts for BOM count by module.
                    const { data: cmParts } = await cmAdmin
                        .from("parts")
                        .select("source_module_id")
                        .eq("cad_lab_project_id", projectId)
                    const bomPartCountByModuleId: Record<string, number> = {}
                    for (const p of cmParts ?? []) {
                        const mid = typeof p.source_module_id === "string"
                            ? p.source_module_id : null
                        if (!mid) continue
                        bomPartCountByModuleId[mid] = (bomPartCountByModuleId[mid] ?? 0) + 1
                    }

                    // Finn total from ai_cost_estimates.
                    const aiEst = cmProject.ai_cost_estimates as Record<string, unknown> | null
                    let finnTotal: number | null = null
                    if (aiEst && typeof aiEst === "object") {
                        let s = 0; let any = false
                        for (const v of Object.values(aiEst)) {
                            if (v && typeof v === "object") {
                                const obj = v as { totalPerUnit?: unknown; totalGbp?: unknown }
                                const t = typeof obj.totalPerUnit === "number" ? obj.totalPerUnit
                                    : typeof obj.totalGbp === "number" ? obj.totalGbp : null
                                if (t !== null && t > 0) { s += t; any = true }
                            }
                        }
                        if (any) finnTotal = s
                    }

                    const rawModules = (Array.isArray(cmProject.modules) ? cmProject.modules : []) as Array<Record<string, unknown>>
                    const spatialPlan = cmProject.spatial_plan as Record<string, unknown> | null
                    const fangPlacements: Record<string, number> | null = (() => {
                        if (!spatialPlan || typeof spatialPlan !== "object") return null
                        const pl = (spatialPlan as Record<string, unknown>).placements
                        if (!pl || typeof pl !== "object" || Array.isArray(pl)) return null
                        const r: Record<string, number> = {}
                        for (const [k, v] of Object.entries(pl as Record<string, unknown>)) {
                            if (typeof v === "number") r[k] = v
                            else if (v && typeof v === "object") {
                                const c = (v as Record<string, unknown>).count
                                if (typeof c === "number") r[k] = c
                            }
                        }
                        return Object.keys(r).length > 0 ? r : null
                    })()

                    const cmVerdict = runCrossModalCheck({
                        modules: rawModules.map((m) => ({
                            id: typeof m.id === "string" ? m.id : String(m.id ?? ""),
                            name: typeof m.name === "string" ? m.name : null,
                            keyParts: Array.isArray(m.keyParts) ? m.keyParts as unknown[] : null,
                        })),
                        bomPartCountByModuleId,
                        canonicalBomTotalGbp: null, // BOM dedup total not available here; cost check runs in proofreader
                        finnModuleTotalGbp: finnTotal,
                        fangLayoutPlacementsByModuleId: fangPlacements,
                        systemIllustrationUrl:
                            typeof cmProject.system_illustration_url === "string"
                                ? cmProject.system_illustration_url : null,
                    })

                    if (!cmVerdict.passed) {
                        const summary = cmVerdict.blockers
                            .slice(0, 3)
                            .map((b) => `[${b.axis}] ${b.explanation}`)
                            .join(" | ")
                        console.warn(
                            `[autopilot-step] cross-modal gate FAILED for project=${projectId}: ${summary}`,
                        )
                        return {
                            ok: false,
                            error:
                                `Cross-modal consistency gate: ${cmVerdict.blockers.length} blocker(s) found. ` +
                                `Fix the BOM-vs-module divergences before supplier matching. ` +
                                summary,
                        }
                    }
                    console.info(
                        `[autopilot-step] cross-modal gate PASSED for project=${projectId} (${cmVerdict.warnings.length} warning(s))`,
                    )
                }
            } catch (cmErr) {
                // Non-fatal: log and continue. The proofreader runs the same
                // check and will surface blockers in the verdict. The gate
                // here is an early-stop optimisation, not a hard dependency.
                console.warn(
                    "[autopilot-step] cross-modal gate threw (non-fatal):",
                    cmErr instanceof Error ? cmErr.message : cmErr,
                )
            }

            return { ok: true }
        }

        case "matchSuppliers": {
            const { matchSuppliersForProjectBackground } = await import(
                "@/actions/forge-v2-supplier-match"
            )
            const result = await matchSuppliersForProjectBackground(
                projectId,
                foundryId,
            )
            return result.ok
                ? { ok: true }
                : {
                      ok: false,
                      error: result.error ?? "Supplier match failed",
                  }
        }

        case "runFangReviews": {
            return await runFangReviewsForAllModules(projectId, foundryId)
        }

        case "runProofreader": {
            const { runProofreaderBackground } = await import(
                "@/actions/specialists/run-proofreader"
            )
            const result = await runProofreaderBackground(
                projectId,
                foundryId,
                null,
            )
            // Proofreader is non-blocking by design (Phase 1) — it appends
            // findings to a JSONB column the PDF appendix renders. A
            // failure here should NOT block PDF emission. Log + advance.
            if (!result.ok) {
                console.warn(
                    "[autopilot-step] proofreader failed (non-blocking):",
                    result.error,
                )
            }
            return { ok: true }
        }

        case "generatePdf": {
            // Brief render-readiness wait — gives per-module renders that
            // were kicked off in `generateIllustration` time to land before
            // PDF gen. Cap 90s; PDF degrades gracefully on missing renders.
            await waitForRenders(projectId, 90_000)
            const { exportProjectPdfBackground } = await import(
                "@/actions/export-project-pdf"
            )
            const result = await exportProjectPdfBackground(
                projectId,
                foundryId,
            )
            if (!result.ok) {
                return {
                    ok: false,
                    error: result.error ?? "PDF export failed",
                }
            }

            // exportProjectPdfBackground only PRODUCES the bytes — it doesn't
            // write them anywhere. The previous (deleted) stepGeneratePdf
            // wrote to storage + report_downloads inline; the zero-wait
            // rewrite dropped that step on the floor. Restored 2026-04-25
            // NIGHT after Loop 2 regen revealed PDFs marked done but no
            // storage rows. (Diagnosed by querying report_downloads — empty
            // since 16:36 today despite multiple generating_pdf done rows.)
            const admin = createAdminClient()
            const STORAGE_BUCKET = "report-downloads"
            try {
                // Look up foundry slug for the storage prefix — matches the
                // `forge-guild/<projectId>/...` pattern observed in prior
                // production rows.
                const { data: foundryRow } = await admin
                    .from("foundries")
                    .select("slug")
                    .eq("id", foundryId)
                    .maybeSingle()
                const foundrySlug =
                    typeof foundryRow?.slug === "string" && foundryRow.slug.length > 0
                        ? foundryRow.slug
                        : foundryId
                const storagePath = `${foundrySlug}/${projectId}/${result.filename}`
                const pdfBytes = Buffer.from(result.base64, "base64")

                const { error: uploadErr } = await admin.storage
                    .from(STORAGE_BUCKET)
                    .upload(storagePath, pdfBytes, {
                        contentType: "application/pdf",
                        upsert: true,
                    })
                if (uploadErr) {
                    return {
                        ok: false,
                        error: `Storage upload failed: ${uploadErr.message}`,
                    }
                }

                // Resolve foundry-owner profile_id for the report_downloads
                // row (the table requires non-null profile_id; autopilot
                // runs with no user session, so foundry-owner is the
                // canonical author).
                const { data: foundryOwner } = await admin
                    .from("foundries")
                    .select("owner_id")
                    .eq("id", foundryId)
                    .maybeSingle()
                const profileId = foundryOwner?.owner_id ?? null

                const { error: insertErr } = await admin
                    .from("report_downloads")
                    .insert({
                        foundry_id: foundryId,
                        profile_id: profileId,
                        report_name: result.filename.replace(/\.pdf$/i, ""),
                        report_source: "cad-lab",
                        file_format: "pdf",
                        file_size_bytes: result.sizeBytes,
                        storage_path: storagePath,
                    } as never)
                if (insertErr) {
                    // Soft fail — the PDF IS in storage; the row is the
                    // index for the Downloads tab to find it. Log + return ok
                    // so the autopilot stamps done; the row can be backfilled.
                    console.warn(
                        "[autopilot-step] report_downloads insert failed:",
                        insertErr.message,
                    )
                }
                return { ok: true }
            } catch (err) {
                return {
                    ok: false,
                    error:
                        err instanceof Error
                            ? `PDF persist failed: ${err.message}`
                            : "PDF persist failed",
                }
            }
        }
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function readResearchReportChars(projectId: string): Promise<number> {
    const admin = createAdminClient()
    const { data } = await admin
        .from("cad_lab_projects")
        .select("research")
        .eq("id", projectId)
        .maybeSingle()
    const research = data?.research as { report?: string } | null
    const report = research?.report
    return typeof report === "string" ? report.length : 0
}

async function runFangReviewsForAllModules(
    projectId: string,
    foundryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const admin = createAdminClient()
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("modules")
        .eq("id", projectId)
        .maybeSingle()
    const modules = (project?.modules ?? []) as Array<{ id: string }>
    if (modules.length === 0) {
        return { ok: false, error: "No modules to review (modules is empty)" }
    }

    // ── Per-module idempotency guard (council-confirmed 2026-04-26 NIGHT) ──
    // Production credit-burn observed: Sentinel ran 254 fang reviews for 7
    // modules (36x duplication), Desal 224 for 9 (25x), BESS 87 for 8 (10x).
    // Cron stale-detector re-fires the autopilot stage every 9 min; this
    // function used to iterate ALL modules every fire with no dedup against
    // existing pipeline_runs rows. Each cycle = full re-run = thousands of
    // £ in Anthropic credits over a few hours.
    //
    // Fix per GPT-5.5 council consult: skip modules that already have a
    // terminal pipeline_runs row (status='done') OR an in-flight one
    // (status='running' AND started_at < 15 min ago).
    //
    // Loop 26 P0 — Bug B (idempotency): 'failed' is now RETRIABLE (bounded).
    // With Bug A fixed, double-empty reviews write a 'failed' row instead of
    // 'done'. If we treat 'failed' as terminal here, those modules are silently
    // abandoned and the coverage gate blocks forever. Instead, count 'failed'
    // rows per module: if count < 2, re-dispatch; if count >= 2, treat as
    // terminal (cap at 2 retries to prevent runaway credit burn).
    const { data: existingFangRows } = await admin
        .from("pipeline_runs")
        .select("input_ref, status, started_at")
        .eq("project_id", projectId)
        .eq("specialist_id", "vp-manufacturing")
        .eq("stage", "module.review.fang")
        .order("started_at", { ascending: false })
    const recentRunningCutoffMs = Date.now() - 15 * 60 * 1000
    // Count 'failed' rows per module so we can cap retries.
    const moduleFailedCount = new Map<string, number>()
    const moduleIdsAlreadyTerminalOrRecent = new Set<string>()
    // L9-FANG-IDEMPOTENCY (2026-04-27): the L8-P9 idempotency guard read
    // `row.input_ref?.module_id` (snake_case) but the field is persisted
    // as `moduleId` (camelCase). Field-name mismatch caused this Set to
    // be empty on every fanout, so every module was re-fired and the
    // parallelism cap kept picking the same first 2 alphabetically while
    // 4 modules never got past NONE. Verified on Hedgerow 2026-04-27 —
    // running_fang_reviews failed 6× over 60min with only 2 of 8 modules
    // ever completing. Read both spellings for back-compat.
    for (const row of (existingFangRows ?? []) as Array<{
        input_ref: { moduleId?: string; module_id?: string } | null
        status: string
        started_at: string | null
    }>) {
        const mid = row.input_ref?.moduleId ?? row.input_ref?.module_id
        if (!mid) continue
        if (row.status === "done") {
            moduleIdsAlreadyTerminalOrRecent.add(mid)
            continue
        }
        if (row.status === "failed") {
            // Accumulate failed count — the terminal decision is made after
            // we know the total count for each module.
            moduleFailedCount.set(mid, (moduleFailedCount.get(mid) ?? 0) + 1)
            continue
        }
        if (
            row.status === "running" &&
            row.started_at &&
            Date.parse(row.started_at) > recentRunningCutoffMs
        ) {
            moduleIdsAlreadyTerminalOrRecent.add(mid)
        }
    }
    // Modules with >= 2 failed rows have exhausted their retry budget — treat
    // as terminal so we don't burn credits indefinitely.
    const FANG_MAX_RETRIES = 2
    for (const [mid, count] of moduleFailedCount.entries()) {
        if (count >= FANG_MAX_RETRIES) {
            moduleIdsAlreadyTerminalOrRecent.add(mid)
        }
        // count < FANG_MAX_RETRIES → module stays eligible for re-dispatch
    }
    const modulesToReview = modules.filter(
        (m) => !moduleIdsAlreadyTerminalOrRecent.has(m.id),
    )
    if (modulesToReview.length === 0) {
        // Every module already has a terminal or recent-running fang row.
        // Stage is effectively complete — return ok so the autopilot
        // advances past running_fang_reviews instead of looping forever.
        console.info(
            `[autopilot-step:fang-reviews] all ${modules.length} modules already terminal/running — advancing without re-firing`,
        )
        return { ok: true }
    }
    console.info(
        `[autopilot-step:fang-reviews] firing ${modulesToReview.length} of ${modules.length} modules (${modules.length - modulesToReview.length} already terminal/running)`,
    )

    // Route to Modal when FANG_VIA_MODAL=true; otherwise use the legacy path.
    // Both functions have identical signatures — same args, same return type.
    const fangViaModal =
        (process.env.FANG_VIA_MODAL ?? "").trim().toLowerCase() === "true" ||
        (process.env.FANG_VIA_MODAL ?? "").trim().toLowerCase() === "1" ||
        (process.env.FANG_VIA_MODAL ?? "").trim().toLowerCase() === "on"

    const reviewFn = fangViaModal
        ? (await import("@/actions/specialists/run-fang-review-via-modal"))
              .runFangReviewBackgroundViaModal
        : (await import("@/actions/specialists/run-fang-review"))
              .runFangReviewBackground

    console.info(
        `[autopilot-step:fang-reviews] dispatch path: ${fangViaModal ? "Modal (FANG_VIA_MODAL=true)" : "legacy Vercel"}`,
    )

    const CONCURRENCY = 2
    const results: Array<PromiseSettledResult<{ ok: boolean; error?: string }>> =
        []
    for (let i = 0; i < modulesToReview.length; i += CONCURRENCY) {
        const batch = modulesToReview.slice(i, i + CONCURRENCY)
        const settled = await Promise.allSettled(
            batch.map((m) =>
                reviewFn(
                    projectId,
                    m.id,
                    foundryId,
                    null,
                    "auto.supplier-match-complete",
                ),
            ),
        )
        results.push(...settled)
    }

    const failed = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok),
    )

    // Loop 26 P0 — Bug B (post-fanout coverage check):
    // Re-query pipeline_runs to see the actual state after this dispatch batch.
    // We use the real DB state rather than the in-memory settled results because:
    // (a) some modules may have been terminal BEFORE this batch (already counted
    //     by the idempotency guard), and (b) the in-memory results only cover
    //     modulesToReview, not all modules.
    //
    // IMPORTANT: return ok:true even when modules are unreviewed (as long as it
    // isn't a catastrophic all-failed case). The feasibility gate in
    // compute-verdict.ts already has a fang_review_coverage BLOCKER check that
    // will catch any unreviewed modules — blocking here would prevent the
    // proofreader from ever running, which is where coverage data is assembled
    // and fed to the verdict. Logging the gap here makes it observable in Vercel
    // logs without stalling the pipeline.
    const { data: postFanoutRows } = await admin
        .from("pipeline_runs")
        .select("input_ref, status, output_ref")
        .eq("project_id", projectId)
        .eq("specialist_id", "vp-manufacturing")
        .eq("stage", "module.review.fang")
        .order("started_at", { ascending: false })

    const moduleStatusMap = new Map<string, { status: string; hasContent: boolean }>()
    for (const row of (postFanoutRows ?? []) as Array<{
        input_ref: { moduleId?: string; module_id?: string } | null
        status: string
        output_ref: Record<string, unknown> | null
    }>) {
        const mid = row.input_ref?.moduleId ?? row.input_ref?.module_id
        if (!mid || moduleStatusMap.has(mid)) continue // keep most recent
        const issueCount = typeof row.output_ref?.issueCount === "number" ? row.output_ref.issueCount : 0
        const doubleEmpty = row.output_ref?.doubleEmpty === true
        moduleStatusMap.set(mid, {
            status: row.status,
            hasContent: row.status === "done" && !doubleEmpty && issueCount > 0,
        })
    }

    const unreviewedModules = modules.filter(m => {
        const entry = moduleStatusMap.get(m.id)
        if (!entry) return true // never dispatched
        if (entry.status === "failed") return true
        if (entry.status === "done" && !entry.hasContent) return true
        return false
    })

    if (unreviewedModules.length > 0) {
        console.warn(
            `[autopilot-step:fang-reviews] ${unreviewedModules.length} of ${modules.length} modules lack a successful review: ${unreviewedModules.map(m => m.id).join(", ")}`,
        )
        // Return ok:true to advance — the feasibility gate (compute-verdict.ts)
        // already has a fang_review_coverage BLOCKER check that will catch this.
        // Blocking here would prevent the proofreader from ever running, which
        // is where coverage data is assembled and fed to the verdict.
    }

    const allFailed = failed.length === modulesToReview.length && modulesToReview.length === modules.length
    if (allFailed) {
        return { ok: false, error: `All ${modules.length} Fang reviews failed` }
    }
    return { ok: true }
}

async function waitForRenders(
    projectId: string,
    maxMs: number,
): Promise<void> {
    const admin = createAdminClient()
    const POLL_MS = 5_000
    const startedAt = Date.now()
    while (Date.now() - startedAt < maxMs) {
        const { data } = await admin
            .from("cad_lab_projects")
            .select("modules")
            .eq("id", projectId)
            .maybeSingle()
        const mods = (data?.modules ?? []) as Array<{
            imageUrl?: string | null
            imageStatus?: string | null
        }>
        if (mods.length === 0) return
        const ready = mods.filter(
            (m) => typeof m.imageUrl === "string" && m.imageUrl.length > 0,
        ).length
        const inFlight = mods.filter(
            (m) =>
                m.imageStatus === "generating" || m.imageStatus === "pending",
        ).length
        if (ready === mods.length || inFlight === 0) return
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
}
