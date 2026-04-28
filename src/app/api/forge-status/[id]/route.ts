/**
 * @file forge-status/[id]/route.ts — JSON status endpoint for the founder-facing progress page.
 *
 * @description Reads the authoritative engine state for one project and
 * returns a small JSON payload that the NarrativeProgressView client
 * polls every few seconds. Hides every internal table name, specialist
 * name, pipeline_run row, and engine plumbing detail. Returns:
 *
 *   - projectName  — what to put in the heading
 *   - currentStage — the in-flight stage key (or null if finished)
 *   - completedStages — array of completed stage keys (in order)
 *   - finishedAt — ISO timestamp when autopilot wrapped, or null
 *   - errorMessage — gentle string if the engine hit a hard stop, else null
 *   - pdfUrl — signed download URL when a PDF is ready, else null
 *   - pdfName — friendly filename when pdfUrl is set
 *
 * Auth: foundry-scoped via withAuth. A founder of a different foundry
 * receives 404, never the existence of the project.
 *
 * Cron-tick nudge: every poll fires a cheap tickAutopilotStage call to
 * keep the pipeline moving forward. Idempotent and self-healing.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import {
    loadAutopilotState,
    tickAutopilotStage,
    type AutopilotStage,
    type AutopilotState,
} from "@/actions/forge-v2-autopilot"
import {
    STAGE_CONFIG,
    AUTOPILOT_TRACKING_SPECIALIST,
    STALE_RUNNING_MS,
} from "@/lib/forge-v2/stage-config"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SIGNED_URL_TTL_SECONDS = 60 * 30 // 30 minutes

const PARAMS_SCHEMA = z.object({
    id: z.string().regex(UUID_RE, "invalid project id"),
})

interface SuccessResponse {
    projectName: string
    briefSummary: string | null
    currentStage: AutopilotStage | null
    completedStages: AutopilotStage[]
    finishedAt: string | null
    startedAt: string | null
    errorMessage: string | null
    pdfUrl: string | null
    pdfName: string | null
    pdfExpiresAt: string | null
}

interface ErrorResponse {
    error: string
}

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
    const params = await context.params
    const parsed = PARAMS_SCHEMA.safeParse(params)
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid project id" }, { status: 400 })
    }
    const projectId = parsed.data.id

    return withAuth(async ({ foundryId }) => {
        const admin = createAdminClient()

        // 1. Load the project with foundry guard. 404 if not ours.
        const { data: project, error: projectError } = await admin
            .from("cad_lab_projects")
            .select("id, name, subject, foundry_id, autopilot_state")
            .eq("id", projectId)
            .maybeSingle()

        if (projectError || !project || project.foundry_id !== foundryId) {
            return NextResponse.json({ error: "not found" }, { status: 404 })
        }

        // 2. Status-read tick (idempotent no-op in the cron architecture).
        try {
            await tickAutopilotStage(projectId)
        } catch (err) {
            console.warn(
                "[FORGE-STATUS] tickAutopilotStage failed (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }

        // 2b. Fallback dispatch — fire the autopilot step directly when there
        // is no recent tracking row. This makes the polling endpoint act as a
        // cron surrogate on preview deployments where Vercel crons don't run.
        // The autopilot-step endpoint inserts a 'running' row immediately, so
        // concurrent fires (cron + poll) are safe: the second fire sees the
        // running row, skips, and returns. AbortSignal.timeout(2000) mirrors
        // the cron's fire pattern — the receiving Lambda continues for 800s.
        try {
            const autopilotState = (project.autopilot_state as AutopilotState | null) ?? null
            if (autopilotState && !autopilotState.finished_at && autopilotState.stage !== "done" && autopilotState.stage !== "failed") {
                const stage = autopilotState.stage as AutopilotStage
                const config = STAGE_CONFIG[stage as Exclude<AutopilotStage, "done" | "failed">]
                if (config && config.kind === "fire") {
                    const { data: trackingRow } = await admin
                        .from("pipeline_runs")
                        .select("id, status, started_at")
                        .eq("project_id", projectId)
                        .eq("specialist_id", AUTOPILOT_TRACKING_SPECIALIST)
                        .eq("stage", stage)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle()

                    const shouldFire = !trackingRow ||
                        (trackingRow.status === "running" &&
                            Date.now() - Date.parse(trackingRow.started_at) > STALE_RUNNING_MS) ||
                        trackingRow.status === "failed"

                    if (shouldFire) {
                        const renderSecret = process.env.FORGE_RENDER_STAGE_SECRET ?? ""
                        if (renderSecret) {
                            const proto = _request.headers.get("x-forwarded-proto") ?? "https"
                            const host =
                                _request.headers.get("x-forwarded-host") ??
                                _request.headers.get("host") ??
                                "fractionalforge.app"
                            const fireUrl = `${proto}://${host}/api/autopilot-step`
                            void fetch(fireUrl, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${renderSecret}`,
                                },
                                body: JSON.stringify({ projectId, step: config.fireStep }),
                                signal: AbortSignal.timeout(2_000),
                            }).catch(() => {
                                // fire-and-forget; Lambda continues independently
                            })
                        }
                    }
                }
            }
        } catch (err) {
            console.warn(
                "[FORGE-STATUS] fallback dispatch failed (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }

        // 3. Re-load autopilot state after the tick so the response reflects
        // any movement that just happened.
        const state = await loadAutopilotState(projectId)

        const finishedAt = state?.finished_at ?? null
        const stage: AutopilotStage | null =
            state && !finishedAt ? state.stage : null
        const completedStages: AutopilotStage[] = Array.isArray(
            state?.completed_stages,
        )
            ? (state!.completed_stages as AutopilotStage[])
            : []
        const startedAt = state?.started_at ?? null

        // 4. Errors — surface as a soft message without exposing stack traces.
        let errorMessage: string | null = null
        if (state?.error) {
            const raw = state.error
            errorMessage =
                raw.length > 240 ? `${raw.slice(0, 240)}…` : raw
        }

        // 5. PDF download — look up the latest report_downloads row
        // for this project and generate a fresh signed URL.
        let pdfUrl: string | null = null
        let pdfName: string | null = null
        let pdfExpiresAt: string | null = null
        try {
            const { data: dl } = await admin
                .from("report_downloads")
                .select(
                    "id, report_name, storage_path, expires_at, created_at",
                )
                .eq("foundry_id", foundryId)
                .ilike("report_source", "cad-lab%")
                .or(`report_name.ilike.%${project.name ?? ""}%,storage_path.ilike.%${projectId}%`)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            if (dl && dl.storage_path) {
                const { data: signed } = await admin.storage
                    .from("reports")
                    .createSignedUrl(
                        dl.storage_path,
                        SIGNED_URL_TTL_SECONDS,
                    )
                if (signed?.signedUrl) {
                    pdfUrl = signed.signedUrl
                    pdfName = (dl.report_name as string | null) ?? "Plan.pdf"
                    pdfExpiresAt = (dl.expires_at as string | null) ?? null
                }
            }
        } catch (err) {
            console.warn(
                "[FORGE-STATUS] PDF lookup failed (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }

        const response: SuccessResponse = {
            projectName: (project.name as string | null) ?? "Your plan",
            briefSummary:
                typeof project.subject === "string" && project.subject.trim()
                    ? project.subject.trim().slice(0, 280)
                    : null,
            currentStage: stage,
            completedStages,
            finishedAt,
            startedAt,
            errorMessage,
            pdfUrl,
            pdfName,
            pdfExpiresAt,
        }

        return NextResponse.json(response)
    })
}
