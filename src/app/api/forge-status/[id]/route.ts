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
    /** One-line outcome per completed stage shown inline on the timeline row. */
    stageOutcomes: Partial<Record<AutopilotStage, string>>
    /** Longer detail per completed stage shown inside the glimpse modal. */
    stageDetails: Partial<Record<AutopilotStage, string>>
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
        // INTENT: also fetch the columns that let us produce per-stage outcome
        // summaries — research, modules, ai_cost_estimates, forge_supplier_shortlist
        // count comes from a separate query below (no FK join here).
        const { data: project, error: projectError } = await admin
            .from("cad_lab_projects")
            .select("id, name, subject, foundry_id, autopilot_state, research, modules, ai_cost_estimates")
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

        // 6. Build per-stage outcome snippets from the project's actual data.
        // These appear as one-line summaries on the timeline row (done state)
        // and longer detail inside the click-to-glimpse modal.
        const stageOutcomes: Partial<Record<AutopilotStage, string>> = {}
        const stageDetails: Partial<Record<AutopilotStage, string>> = {}

        try {
            // INTENT: only compute outcomes for completed stages — avoids
            // attempting to read data that hasn't been written yet.
            const completedSet = new Set<string>(completedStages)

            // Supplier count — needed for matching_suppliers outcome
            let supplierCount = 0
            if (completedSet.has("matching_suppliers")) {
                try {
                    const { count } = await admin
                        .from("forge_supplier_shortlist")
                        .select("id", { count: "exact", head: true })
                        .eq("project_id", projectId)
                    supplierCount = count ?? 0
                } catch {
                    // non-fatal
                }
            }

            const research = project.research as Record<string, unknown> | null
            const modules = (project.modules as Array<Record<string, unknown>> | null) ?? []
            const costEstimates = project.ai_cost_estimates as Record<string, Record<string, unknown>> | null

            // waiting_chase — regulatory standards count + reference models
            if (completedSet.has("waiting_chase") && research) {
                const designBrief = research.designBrief as Record<string, unknown> | null
                const refModels = research.referenceModels as Array<{ name: string }> | null
                const refCount = Array.isArray(refModels) ? refModels.length : 0
                const reportText = typeof research.report === "string" ? research.report : ""
                // Rough count: "regulatory" mentions in the research report
                const regMatches = reportText.match(/\b(regulation|standard|directive|compliance|certification|approval|BS EN|ISO|IEC|CE marking)\b/gi)
                const regCount = regMatches ? Math.min(new Set(regMatches.map(s => s.toLowerCase())).size, 12) : 0
                if (regCount > 0 || refCount > 0) {
                    stageOutcomes.waiting_chase = [
                        regCount > 0 ? `${regCount} regulatory reference${regCount !== 1 ? "s" : ""} identified` : null,
                        refCount > 0 ? `${refCount} comparable product${refCount !== 1 ? "s" : ""} researched` : null,
                    ].filter(Boolean).join(" · ")
                } else {
                    stageOutcomes.waiting_chase = "Research complete"
                }
                // Detail: first ~300 chars of the report
                if (reportText) {
                    stageDetails.waiting_chase = reportText.slice(0, 300).trim() + (reportText.length > 300 ? "…" : "")
                }
                // compliance notes from design brief
                const complianceNotes = typeof (designBrief?.complianceNotes) === "string"
                    ? (designBrief.complianceNotes as string).trim()
                    : null
                if (complianceNotes) {
                    stageDetails.waiting_chase = complianceNotes.slice(0, 300) + (complianceNotes.length > 300 ? "…" : "")
                }
            }

            // locking_brief
            if (completedSet.has("locking_brief")) {
                stageOutcomes.locking_brief = "Brief locked as a structured engineering specification"
                if (research?.designBrief) {
                    const brief = research.designBrief as Record<string, unknown>
                    const parts = [
                        typeof brief.quantityTarget === "string" ? `Quantity: ${brief.quantityTarget}` : null,
                        typeof brief.geographyTarget === "string" ? `Market: ${brief.geographyTarget}` : null,
                    ].filter(Boolean)
                    if (parts.length > 0) stageDetails.locking_brief = parts.join("\n")
                }
            }

            // waiting_max — module count
            if (completedSet.has("waiting_max") && modules.length > 0) {
                stageOutcomes.waiting_max = `${modules.length} module${modules.length !== 1 ? "s" : ""} identified`
                const moduleNames = modules
                    .slice(0, 6)
                    .map(m => typeof m.name === "string" ? m.name : "")
                    .filter(Boolean)
                if (moduleNames.length > 0) {
                    stageDetails.waiting_max = moduleNames.join(", ") +
                        (modules.length > 6 ? ` + ${modules.length - 6} more` : "")
                }
            }

            // waiting_sizing
            if (completedSet.has("waiting_sizing") && modules.length > 0) {
                stageOutcomes.waiting_sizing = `${modules.length} module${modules.length !== 1 ? "s" : ""} sized against the brief`
            }

            // waiting_layout
            if (completedSet.has("waiting_layout")) {
                stageOutcomes.waiting_layout = "Physical layout confirmed — no clashes"
            }

            // waiting_bom — part count
            if (completedSet.has("waiting_bom") && modules.length > 0) {
                const partCount = modules.reduce((acc, m) => {
                    const kp = m.keyParts as unknown[]
                    return acc + (Array.isArray(kp) ? kp.length : 0)
                }, 0)
                stageOutcomes.waiting_bom = partCount > 0
                    ? `${partCount} part${partCount !== 1 ? "s" : ""} across ${modules.length} module${modules.length !== 1 ? "s" : ""}`
                    : "Bill of materials drafted"
            }

            // waiting_finn — total cost
            if (completedSet.has("waiting_finn") && costEstimates) {
                const rows = Object.values(costEstimates)
                const totalCost = rows.reduce((acc, row) => {
                    const val = typeof row?.totalPerUnit === "number" ? row.totalPerUnit : 0
                    return acc + val
                }, 0)
                if (totalCost > 0) {
                    const formatted = totalCost >= 1_000_000
                        ? `£${(totalCost / 1_000_000).toFixed(2)}M`
                        : totalCost >= 1_000
                            ? `£${(totalCost / 1_000).toFixed(0)}k`
                            : `£${totalCost.toFixed(0)}`
                    stageOutcomes.waiting_finn = `Unit cost rolled up: ${formatted}`
                    stageDetails.waiting_finn = `Total per unit: ${formatted} across ${rows.length} module${rows.length !== 1 ? "s" : ""}`
                } else {
                    stageOutcomes.waiting_finn = "Cost waterfall complete"
                }
            }

            // generating_illustration
            if (completedSet.has("generating_illustration")) {
                stageOutcomes.generating_illustration = "Hero illustration generated for the report cover"
            }

            // matching_suppliers
            if (completedSet.has("matching_suppliers")) {
                stageOutcomes.matching_suppliers = supplierCount > 0
                    ? `${supplierCount} supplier${supplierCount !== 1 ? "s" : ""} matched to the bill of materials`
                    : "Supplier shortlist complete"
            }

            // running_fang_reviews — module review count
            if (completedSet.has("running_fang_reviews") && modules.length > 0) {
                stageOutcomes.running_fang_reviews = `${modules.length} module${modules.length !== 1 ? "s" : ""} reviewed for engineering assumptions and risks`
            }

            // proofreading
            if (completedSet.has("proofreading")) {
                stageOutcomes.proofreading = "Report read end-to-end — contradictions resolved, numbers reconciled"
            }

            // generating_pdf
            if (completedSet.has("generating_pdf") || pdfUrl) {
                stageOutcomes.generating_pdf = "PDF report compiled and ready to download"
            }

        } catch (err) {
            console.warn("[FORGE-STATUS] stage outcomes computation failed (non-fatal):", err instanceof Error ? err.message : err)
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
            stageOutcomes,
            stageDetails,
        }

        return NextResponse.json(response)
    })
}
