/**
 * @file projects/[id]/page.tsx — /the-forge-v2/projects/:id project workspace.
 *
 * @description Project cockpit (V2). Server component that fetches all of the
 * data the WorkspaceView needs in parallel:
 *
 *   - loadCadLabProject(id)          → project row (name, subject, modules, …)
 *   - getProjectResumeState(id)      → amber / green "where you left off" card
 *   - getProjectActivityFeed(id, 7)  → recent activity timeline
 *   - engineering library counts     → material_properties / standard_hardware
 *                                       / process_capabilities / design_standards
 *
 * Empty-state policy (CRITICAL): if a data source does not exist yet (e.g. the
 * `risks`, `suppliers`, `engagements` tables), we pass `null` / `undefined`
 * to the view and the view renders the neutral empty-state variant of the
 * matching card. We do NOT synthesise mockup values ("7 suppliers",
 * "£172k/unit", etc.) — real or empty, never fake.
 *
 * If loadCadLabProject fails or returns null, we call Next's notFound() so
 * /the-forge-v2/projects/<bogus-id> → 404 as expected.
 *
 * @related
 *   - View:   ./workspace-view.tsx
 *   - Styles: ./workspace-v2.css (scoped .w2)
 */

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import {
    getProjectActivityFeed,
    getProjectResumeState,
    type ProjectActivityEvent,
    type ProjectResumeState,
} from "@/actions/project-workspace"
import { loadMaxRunStatus } from "@/actions/specialists/run-max-decomposition"
import { loadBomRunStatus } from "@/actions/specialists/run-bom-generator"
import { loadChaseRunStatus } from "@/actions/specialists/run-chase-research"
import { loadFinnRunStatus } from "@/actions/specialists/run-finn-cost"
import { loadBriefLockStatus } from "@/actions/brief-lock"
import { tickAutopilotStage } from "@/actions/forge-v2-autopilot"
import { tickImageRenderChain } from "@/actions/forge-v2-render-all-modules"
import { createClient } from "@/lib/supabase/server"

import { WorkspaceShell } from "../../_components/workspace-shell"
import { WorkspaceView, type TopMaterialRow, type TopProcessRow, type WorkspaceViewProps } from "./workspace-view"
import { RunningState } from "./_components/running-state"
import { NarrativeProgressView } from "./_components/narrative-progress-view"
import type { AutopilotStage } from "@/actions/forge-v2-autopilot"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Project · The Forge",
    description: "Project cockpit — health, artefacts, engineering intelligence, risks, and recent activity.",
}

export default async function ForgeV2ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // ── 1. Project record ────────────────────────────────────────────
    // withAuth enforces auth + foundry scoping. If the id is wrong or the
    // caller doesn't own it, we 404 rather than leak the existence of
    // projects in other foundries.
    const loadResult = await loadCadLabProject(id)
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // ── Founder-facing routing (replaces "drop them into the cockpit") ──
    // Tristan 2026-04-27: founders should see ONE simple flow — brief in,
    // narrative timeline of stages building, downloadable PDF at the end.
    // No module pages, no bill-of-materials tables, no specialist names
    // exposed inline. The legacy WorkspaceView cockpit is preserved below
    // as the fallback for pre-autopilot drafts (older 3-step wizard) but
    // any project that has run through autopilot lands on the narrative
    // progress view.
    //
    // INTENT (2026-04-27 night, fix #15): read autopilotState from the
    // already-loaded project (RLS-respecting; works for any foundry the
    // user is a member of) rather than calling loadAutopilotState() which
    // filters by active foundry only. The active-foundry filter caused
    // the page to fall through to the legacy WorkspaceView for users with
    // multi-foundry memberships even when they could see the project.
    const autopilotState = project.autopilotState
    if (autopilotState) {
        try {
            await tickAutopilotStage(id)
        } catch (err) {
            console.warn(
                "[WORKSPACE-PAGE] tickAutopilotStage (narrative-progress) failed (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }

        // Look up an existing PDF on the server so the page renders with
        // the download button visible immediately on completed runs (no
        // flash-of-empty-content while the first client poll lands).
        let initialPdfUrl: string | null = null
        let initialPdfName: string | null = null
        try {
            const supabase = await createClient()
            const { data: dl } = await supabase
                .from("report_downloads")
                .select("id, report_name, storage_path, expires_at, created_at")
                .ilike("report_source", "cad-lab%")
                .or(`storage_path.ilike.%${id}%,report_name.ilike.%${project.name ?? ""}%`)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            if (dl?.storage_path) {
                const { data: signed } = await supabase.storage
                    .from("reports")
                    .createSignedUrl(dl.storage_path, 60 * 30)
                if (signed?.signedUrl) {
                    initialPdfUrl = signed.signedUrl
                    initialPdfName = (dl.report_name as string | null) ?? "Plan.pdf"
                }
            }
        } catch (err) {
            console.warn(
                "[WORKSPACE-PAGE] initial PDF lookup failed (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }

        return (
            <WorkspaceShell
                crumbs={[
                    { label: "The Forge", href: "/the-forge-v2" },
                    { label: project.name },
                ]}
                maxWidth="narrow"
            >
                <NarrativeProgressView
                    projectId={id}
                    initialProjectName={project.name}
                    initialBriefSummary={project.subject ?? null}
                    initialStage={
                        autopilotState.finished_at
                            ? null
                            : (autopilotState.stage as AutopilotStage)
                    }
                    initialCompletedStages={
                        Array.isArray(autopilotState.completed_stages)
                            ? (autopilotState.completed_stages as AutopilotStage[])
                            : []
                    }
                    initialFinishedAt={autopilotState.finished_at ?? null}
                    initialErrorMessage={autopilotState.error ?? null}
                    initialPdfUrl={initialPdfUrl}
                    initialPdfName={initialPdfName}
                />
            </WorkspaceShell>
        )
    }

    // INTENT: nudge autopilot on every workspace page load. Every stepWaitForX
    // runner has its own self-healing check that fires the expected
    // pipeline_run if missing, so this is cheap + idempotent when autopilot
    // is already making progress but critical when the after()-chain dropped
    // silently mid-stage (observed 2026-04-23).
    //
    // AWAIT is critical: tickAutopilotStage wraps its work in withAuth, which
    // returns a Promise. The after() that schedules the stage re-entry is
    // INSIDE the withAuth callback. If we fire-and-forget the outer promise,
    // Next.js may complete the page render + tear down the container before
    // withAuth resolves — which means after() never runs, which means the
    // nudge is a no-op. Await unblocks the chain end-to-end.
    try {
        await tickAutopilotStage(id)
    } catch (err) {
        console.warn(
            "[WORKSPACE-PAGE] tickAutopilotStage failed (non-fatal):",
            err instanceof Error ? err.message : err,
        )
    }

    // INTENT: same nudge pattern for the per-module render chain. Vercel's
    // after() can drop scheduled stages on container teardown (observed
    // 2026-04-23 on HAPS eadae45d — chain completed 2/7 and rotted). This
    // re-fires renderNextModuleStage if the chain is stale. Cheap no-op when
    // chain is idle, null, or making progress.
    try {
        await tickImageRenderChain(id)
    } catch (err) {
        console.warn(
            "[WORKSPACE-PAGE] tickImageRenderChain failed (non-fatal):",
            err instanceof Error ? err.message : err,
        )
    }

    // ── 2. Derived data — parallelised, all failure-tolerant ─────────
    // Each call's failure mode is local: we swallow errors and fall back to
    // the empty-state shape so one broken source cannot take down the page.
    const [resumeState, activityEvents, engineeringCounts, topMaterials, topProcesses, supplierShortlist, maxRunStatus, bomRunStatus, chaseRunStatus, finnRunStatus, briefLockStatus] = await Promise.all([
        safeResume(id),
        safeActivity(id, 7),
        safeEngineeringCounts(),
        safeTopMaterials(),
        safeTopProcesses(),
        safeSupplierShortlist(id),
        safeMaxRunStatus(id),
        safeBomRunStatus(id),
        safeChaseRunStatus(id),
        safeFinnRunStatus(id),
        safeBriefLockStatus(id),
    ])

    // ── 3. Header-derived numbers that come straight off the project row
    const modules = project.modules ?? []
    const moduleCount = modules.length

    // INTENT: "top-level parts" in the header and the BOM card comes from the
    // sum of keyParts across all modules. This is the best approximation we
    // have until a dedicated parts table ships.
    const partCount = modules.reduce((acc, m) => acc + (m.keyParts?.length ?? 0), 0)

    // Cost: sum AiCostEstimate.totalPerUnit across modules when present.
    // Null if nothing has been estimated — so the health strip + cost card
    // render the "not yet estimated" empty state.
    const costEstimatesById = project.aiCostEstimates ?? {}
    const costRows = Object.values(costEstimatesById)
    const totalUnitCostGbp = costRows.length > 0
        ? costRows.reduce((acc, row) => acc + (typeof row?.totalPerUnit === "number" ? row.totalPerUnit : 0), 0)
        : null

    // Known challenges: flatten module failureModes + unknowns, keyed by
    // module name. Arrays are empty when modules haven't been decomposed yet.
    const knownFailureModes: Array<{ moduleName: string; text: string }> = []
    const openQuestions: Array<{ moduleName: string; text: string }> = []
    for (const m of modules) {
        for (const f of m.failureModes ?? []) {
            if (typeof f === "string" && f.trim()) knownFailureModes.push({ moduleName: m.name, text: f })
        }
        for (const q of m.unknowns ?? []) {
            if (typeof q === "string" && q.trim()) openQuestions.push({ moduleName: m.name, text: q })
        }
    }

    // Regulatory text: if the brief carries compliance notes use them, else
    // empty-state. We deliberately don't synthesise "AS9100 / EASA" —
    // that's the mockup's HAPS example.
    const complianceNotes = project.research?.designBrief?.complianceNotes?.trim() || null

    const viewProps: WorkspaceViewProps = {
        project: {
            id: project.id,
            name: project.name,
            subject: project.subject,
            status: project.status,
            designRevision: project.designRevision,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            systemIllustrationUrl: project.systemIllustrationUrl,
            conceptRenderUrl: project.conceptRenderUrl,
        },
        header: {
            moduleCount,
            partCount,
            quantityTarget: project.research?.designBrief?.quantityTarget?.trim() || null,
            complianceNotes,
        },
        resume: resumeState,
        activity: activityEvents,
        cost: {
            totalUnitCostGbp,
            unitCostCeilingGbp: null, // Not captured in CadLabDesignBrief today.
            moduleCount: costRows.length,
        },
        challenges: {
            failureModes: knownFailureModes,
            openQuestions,
        },
        engineering: engineeringCounts,
        topMaterials,
        topProcesses,
        suppliers: supplierShortlist,
        maxRun: {
            status: maxRunStatus.status,
            startedAt: maxRunStatus.startedAt ?? null,
            finishedAt: maxRunStatus.finishedAt ?? null,
            errorCode: maxRunStatus.errorCode ?? null,
            errorMessage: maxRunStatus.errorMessage ?? null,
        },
        bomRun: {
            status: bomRunStatus.status,
            startedAt: bomRunStatus.startedAt ?? null,
            finishedAt: bomRunStatus.finishedAt ?? null,
            errorCode: bomRunStatus.errorCode ?? null,
            errorMessage: bomRunStatus.errorMessage ?? null,
        },
        chaseRun: {
            status: chaseRunStatus.status,
            startedAt: chaseRunStatus.startedAt ?? null,
            finishedAt: chaseRunStatus.finishedAt ?? null,
            errorCode: chaseRunStatus.errorCode ?? null,
            errorMessage: chaseRunStatus.errorMessage ?? null,
        },
        finnRun: {
            status: finnRunStatus.status,
            startedAt: finnRunStatus.startedAt ?? null,
            finishedAt: finnRunStatus.finishedAt ?? null,
            errorCode: finnRunStatus.errorCode ?? null,
            errorMessage: finnRunStatus.errorMessage ?? null,
        },
        briefLock: {
            isLocked: briefLockStatus.isLocked,
            revisionLabel: briefLockStatus.revisionLabel,
            lockedAt: briefLockStatus.lockedAt,
        },
    }

    return <WorkspaceView {...viewProps} />
}

// ── Helpers ───────────────────────────────────────────────────────────

async function safeMaxRunStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadMaxRunStatus>>> {
    try {
        return await loadMaxRunStatus(projectId)
    } catch (err) {
        console.error("[WORKSPACE-PAGE] max-run status failed:", err)
        return { status: "not-started" }
    }
}

async function safeChaseRunStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadChaseRunStatus>>> {
    try {
        return await loadChaseRunStatus(projectId)
    } catch (err) {
        console.error("[WORKSPACE-PAGE] chase-run status failed:", err)
        return { status: "not-started" }
    }
}

async function safeBomRunStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadBomRunStatus>>> {
    try {
        return await loadBomRunStatus(projectId)
    } catch (err) {
        console.error("[WORKSPACE-PAGE] bom-run status failed:", err)
        return { status: "not-started" }
    }
}

async function safeFinnRunStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadFinnRunStatus>>> {
    try {
        return await loadFinnRunStatus(projectId)
    } catch (err) {
        console.error("[WORKSPACE-PAGE] finn-run status failed:", err)
        return { status: "not-started" }
    }
}

async function safeBriefLockStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadBriefLockStatus>>> {
    try {
        return await loadBriefLockStatus(projectId)
    } catch (err) {
        console.error("[WORKSPACE-PAGE] brief-lock status failed:", err)
        return {
            isLocked: false,
            lockedAt: null,
            lockedBy: null,
            revisionNumber: null,
            revisionLabel: null,
        }
    }
}

async function safeResume(projectId: string): Promise<ProjectResumeState> {
    try {
        const r = await getProjectResumeState(projectId)
        if ("error" in r) return { lastTouched: null, lastSurface: null, blocker: null }
        return r.state
    } catch (err) {
        console.error("[WORKSPACE-PAGE] resume-state failed:", err)
        return { lastTouched: null, lastSurface: null, blocker: null }
    }
}

async function safeActivity(projectId: string, limit: number): Promise<ProjectActivityEvent[]> {
    try {
        const r = await getProjectActivityFeed(projectId, limit)
        if ("error" in r) return []
        return r.events
    } catch (err) {
        console.error("[WORKSPACE-PAGE] activity-feed failed:", err)
        return []
    }
}

interface EngineeringCounts {
    materials: number
    hardware: number
    processes: number
    standards: number
}

async function safeEngineeringCounts(): Promise<EngineeringCounts> {
    try {
        const supabase = await createClient()
        const [m, h, p, s] = await Promise.all([
            supabase.from("material_properties").select("*", { count: "exact", head: true }),
            supabase.from("standard_hardware").select("*", { count: "exact", head: true }),
            supabase.from("process_capabilities").select("*", { count: "exact", head: true }),
            supabase.from("design_standards").select("*", { count: "exact", head: true }),
        ])
        return {
            materials: m.count ?? 0,
            hardware: h.count ?? 0,
            processes: p.count ?? 0,
            standards: s.count ?? 0,
        }
    } catch (err) {
        console.error("[WORKSPACE-PAGE] engineering counts failed:", err)
        return { materials: 0, hardware: 0, processes: 0, standards: 0 }
    }
}

async function safeTopMaterials(): Promise<TopMaterialRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("material_properties")
            .select("material_code, material_name, yield_strength_mpa, cost_per_kg_usd")
            .order("material_name", { ascending: true })
            .limit(3)
        if (error || !data) return []
        return data.map((r) => ({
            materialCode: r.material_code as string,
            materialName: r.material_name as string,
            yieldStrengthMpa: (r.yield_strength_mpa as number | null) ?? null,
            costPerKgUsd: (r.cost_per_kg_usd as number | null) ?? null,
        }))
    } catch (err) {
        console.error("[WORKSPACE-PAGE] top materials failed:", err)
        return []
    }
}

interface SupplierShortlistRow {
    name: string
    type: string | null
    modulesMatched: number
    rampRole: string
}

async function safeSupplierShortlist(projectId: string): Promise<SupplierShortlistRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("forge_supplier_shortlist")
            .select("supplier_name, supplier_type, module_ids, ramp_role, best_match_score")
            .eq("project_id", projectId)
            .order("best_match_score", { ascending: false })
        if (error || !data) return []
        return data.map((r) => ({
            name: r.supplier_name as string,
            type: (r.supplier_type as string | null) ?? null,
            modulesMatched: Array.isArray(r.module_ids) ? r.module_ids.length : 0,
            rampRole: (r.ramp_role as string) ?? "secondary",
        }))
    } catch (err) {
        console.error("[WORKSPACE-PAGE] supplier shortlist failed:", err)
        return []
    }
}

async function safeTopProcesses(): Promise<TopProcessRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("process_capabilities")
            .select("process_name, display_name, tolerance_typical_mm, min_wall_thickness_mm")
            .order("display_name", { ascending: true })
            .limit(16)
        if (error || !data) return []
        return data.map((r) => ({
            processName: r.process_name as string,
            displayName: r.display_name as string,
            toleranceTypicalMm: (r.tolerance_typical_mm as number | null) ?? null,
            minWallThicknessMm: (r.min_wall_thickness_mm as number | null) ?? null,
        }))
    } catch (err) {
        console.error("[WORKSPACE-PAGE] top processes failed:", err)
        return []
    }
}
