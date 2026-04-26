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
// Each fire gets a fresh Vercel Lambda with its own 300 s budget. Most
// specialists complete in 30-180 s; Fang reviews fan-out can take ~120 s.
export const maxDuration = 300

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
        outcome = await runStep(projectId, step)
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

// ─── Per-step specialist invocation ─────────────────────────────────────

async function runStep(
    projectId: string,
    step: AutopilotStepName,
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
            return result.ok
                ? { ok: true }
                : { ok: false, error: result.error ?? "Sizing failed" }
        }

        case "waitForLayout": {
            const { runFangLayoutBackground } = await import(
                "@/actions/specialists/run-fang-layout"
            )
            const result = await runFangLayoutBackground(projectId, foundryId)
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

    const { runFangReviewBackground } = await import(
        "@/actions/specialists/run-fang-review"
    )

    // Parallel fan-out with a bounded concurrency. Loop 8 fix
    // (Tristan-flagged 2026-04-26): dropped 4 → 2. With 4 projects
    // parallel-regenerating + 7-9 modules each, CONCURRENCY=4 produced
    // 16+ in-flight claude-opus-4-7 calls, breaching the org-level
    // Anthropic rate limit and triggering 429s that cascaded into
    // terminal "All N Fang reviews failed" — Sentinel + Desal hit
    // this 6+ times in a single regen loop. CONCURRENCY=2 caps the
    // multi-project burst at 8, well within headroom.
    // Signature: runFangReviewBackground(projectId, moduleId, foundryId,
    //            userId, trigger?). userId is null for system-fired runs
    //            (autopilot has no user session at this point — column is
    //            nullable).
    const CONCURRENCY = 2
    const results: Array<PromiseSettledResult<{ ok: boolean; error?: string }>> =
        []
    for (let i = 0; i < modules.length; i += CONCURRENCY) {
        const batch = modules.slice(i, i + CONCURRENCY)
        const settled = await Promise.allSettled(
            batch.map((m) =>
                runFangReviewBackground(
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
    if (failed.length === modules.length) {
        // Every module failed — terminal. Otherwise, accept partial success
        // (better some Risks/Specialists data than none).
        return {
            ok: false,
            error: `All ${modules.length} Fang reviews failed`,
        }
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
