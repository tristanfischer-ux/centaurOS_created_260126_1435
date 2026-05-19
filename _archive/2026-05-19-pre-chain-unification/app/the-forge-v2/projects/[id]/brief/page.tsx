/**
 * @file brief/page.tsx — /the-forge-v2/projects/:id/brief (V2 — mockup-faithful rebuild).
 *
 * @description Brief artefact — the anchor spec (intent · target markets ·
 * regulatory envelope · constraints) that every downstream artefact (BOM,
 * Suppliers, Risks, Cost) cites. Server component that loads the project
 * + ancillary data in parallel, then hands a typed props bundle to
 * BriefView for rendering. If a field does not exist in the schema yet
 * (see the schema-gaps list at the foot of this file) we pass `null` and
 * the view renders the neutral empty-state variant of that slot. We
 * NEVER synthesise the mockup's HAPS content — real or empty, never fake.
 *
 * Data sources, slot by slot:
 *   - project.name / project.subject              → breadcrumb + product line
 *   - project.research.designBrief.quantityTarget → Batch 1 constraint slot
 *   - modules[].estimatedMassKg (sum)             → Mass budget card
 *   - project.aiCostEstimates (sum totalPerUnit)  → All-in cost card
 *   - design_standards (aerospace/quality/reg...) → Regulatory posture grid
 *   - project.systemIllustrationUrl               → Concept render hero pane
 *   - project.designRevision + createdAt          → Revision history (1 row)
 *
 * Schema gaps that force empty states (TODO follow-up migrations):
 *   - projects.brief_locked_at column (lock chip + green banner state)
 *   - brief_revisions table (multi-row revision history)
 *   - designBrief.mission / targetCustomers / whyNow (narrative fields)
 *   - designBrief.constraints.{unitCostCeilingGbp, firstShipDate,
 *     maxMassKg, batchSize, markets, productionRegion}
 *   - designBrief.regulatory[] (structured posture per standard)
 *
 * If loadCadLabProject returns an error or null we 404 so bogus ids
 * don't leak project existence across foundries.
 *
 * @related
 *   - View:   ./brief-view.tsx
 *   - Styles: ./brief-v2.css (scoped .b2 — do NOT modify)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import {
    loadChaseRunStatus,
    runChaseResearch,
} from "@/actions/specialists/run-chase-research"
import { createClient } from "@/lib/supabase/server"

import { BriefView, type BriefRevisionRow, type BriefViewProps, type RegulatoryStandardRow } from "./brief-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Brief · The Forge",
    description: "The anchor spec — intent, target markets, regulatory envelope, constraints.",
}

export default async function ForgeV2BriefPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // Bind the Chase orchestrator to this project id so the client button
    // doesn't need to pass it explicitly. The `"use server"` boundary is
    // on run-chase-research.ts itself.
    async function runChaseAction(): Promise<
        { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
    > {
        "use server"
        const res = await runChaseResearch(id, "manual")
        if (res.ok) return { ok: true, runId: res.runId }
        return { ok: false, error: res.error, errorCode: res.errorCode }
    }

    // ── 1. Fetch project + ancillary data in parallel ──────────────────
    // loadCadLabProject enforces auth + foundry scoping inside withAuth.
    // design_standards is a public read so we can fire it in parallel.
    // If the project load fails we 404 after both settle — saves one
    // round-trip for the happy path without waiting on a failed query.
    const [loadResult, regulatoryStandards, revisions, chaseRunStatus] = await Promise.all([
        loadCadLabProject(id),
        safeRegulatoryStandards(),
        safeRevisionHistory(id),
        safeChaseRunStatus(id),
    ])
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // ── 3. Derived numbers off the project row ─────────────────────────
    const modules = project.modules ?? []

    // Mass budget — sum estimatedMassKg across modules when present.
    // Null if no module has a mass yet → card renders the "no modules"
    // empty state. Decimal arithmetic is fine for display (2 dp).
    const moduleMassesKg = modules
        .map((m) => (typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : null))
        .filter((v): v is number => v !== null)
    const totalMassKg = moduleMassesKg.length > 0
        ? moduleMassesKg.reduce((acc, v) => acc + v, 0)
        : null

    // All-in cost — sum AiCostEstimate.totalPerUnit across modules.
    // Null if nothing has been estimated yet.
    const costRows = Object.values(project.aiCostEstimates ?? {})
    const totalUnitCostGbp = costRows.length > 0
        ? costRows.reduce((acc, row) => acc + (typeof row?.totalPerUnit === "number" ? row.totalPerUnit : 0), 0)
        : null

    // Brief narrative + constraints — read from the V2 CadLabDesignBrief
    // shape (see migration 20260420100000_cad_lab_brief_lock). Each field
    // falls back to the neutral empty-state when not yet declared on the
    // brief so we never synthesise the mockup's HAPS example.
    const designBrief = project.research?.designBrief ?? null
    const quantityTarget = designBrief?.quantityTarget?.trim() || null
    const legacyBatchSize = quantityTarget

    const mission = designBrief?.mission?.trim() || null
    const targetCustomers = designBrief?.targetCustomers?.trim() || null
    const whyNow = designBrief?.whyNow?.trim() || null

    // Structured constraints → display strings. We keep formatting in the
    // server component so the view stays dumb and platform-agnostic.
    const c = designBrief?.constraints ?? null
    const unitCostCeilingGbp = typeof c?.unitCostCeilingGbp === "number" ? c.unitCostCeilingGbp : null
    const maxMassKg = typeof c?.maxMassKg === "number" ? c.maxMassKg : null
    const batchSize = typeof c?.batchSize === "number"
        ? String(c.batchSize)
        : legacyBatchSize
    const constraintsDisplay = {
        unitCostCeiling: unitCostCeilingGbp != null
            ? `£${unitCostCeilingGbp.toLocaleString("en-GB")}/unit`
            : null,
        firstShipDate: c?.firstShipDate ? formatDisplayDate(c.firstShipDate) : null,
        maxMass: maxMassKg != null ? `${maxMassKg.toFixed(1)} kg` : null,
        batchSize,
        markets: c?.markets && c.markets.length > 0 ? c.markets.join(" · ") : null,
        productionRegion: c?.productionRegion?.trim() || null,
    }

    // Regulatory posture: prefer per-project rows declared on the brief;
    // fall back to the generic engineering-library candidates so the card
    // never renders fully empty when a project hasn't declared its posture.
    const regulatoryFromBrief: RegulatoryStandardRow[] = (designBrief?.regulatory ?? [])
        .filter((r) => typeof r?.code === "string" && typeof r?.name === "string")
        .map((r) => ({
            code: r.code,
            name: r.name,
            summary: typeof r.summary === "string" ? r.summary : "",
            status: r.status ?? "not-started",
        }))
    const regulatory = regulatoryFromBrief.length > 0
        ? regulatoryFromBrief
        : regulatoryStandards

    const viewProps: BriefViewProps = {
        project: {
            id: project.id,
            name: project.name,
            subject: project.subject,
            designRevision: project.designRevision,
            createdAt: project.createdAt,
            systemIllustrationUrl: project.systemIllustrationUrl,
            conceptRenderUrl: project.conceptRenderUrl,
        },
        lockState: {
            isLocked: project.briefLockedAt !== null,
            lockedAt: project.briefLockedAt,
        },
        narrative: {
            mission,
            targetCustomers,
            whyNow,
        },
        constraints: constraintsDisplay,
        regulatory,
        cost: {
            totalUnitCostGbp,
            unitCostCeilingGbp,
        },
        mass: {
            totalMassKg,
            maxMassKg,
            moduleCount: modules.length,
        },
        revisions,
        chaseRun: {
            status: chaseRunStatus.status,
            startedAt: chaseRunStatus.startedAt ?? null,
            finishedAt: chaseRunStatus.finishedAt ?? null,
            errorCode: chaseRunStatus.errorCode ?? null,
            errorMessage: chaseRunStatus.errorMessage ?? null,
            reportChars: chaseRunStatus.reportChars ?? null,
        },
        hasResearchReport:
            typeof project.research?.report === "string"
                && project.research.report.trim().length >= 200,
        runChaseAction,
    }

    return <BriefView {...viewProps} />
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Fetches regulatory standards candidates for the Brief's regulatory
 * posture grid.
 *
 * Strategy: pull rows whose industry_domain is in a broad engineering
 * set (aerospace / quality / regulatory / safety). We cap at 6 rows
 * since the grid is a fixed 6-tile layout. If we get back 0 rows the
 * view renders a single full-span empty-state tile.
 *
 * Status is always "not-started" here because we do not yet track
 * per-project compliance status. Follow-up: once a
 * project_compliance_packet table exists, join on it and infer status
 * (met / in-progress / not-started).
 */
/**
 * Loads the brief revision history for this project, newest-first. The
 * newest row is flagged isCurrent: true so the view renders it with the
 * brand dot. Unknown / missing rows → empty array → view falls back to
 * the single-row "current · not yet locked" variant.
 */
async function safeChaseRunStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadChaseRunStatus>>> {
    try {
        return await loadChaseRunStatus(projectId)
    } catch (err) {
        console.error("[BRIEF-PAGE] chase-run status failed:", err)
        return { status: "not-started" }
    }
}

async function safeRevisionHistory(projectId: string): Promise<BriefRevisionRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("brief_revisions")
            .select("id, revision_label, summary, locked_at, created_at")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
        if (error || !data) return []
        return data.map((r, idx) => {
            const lockedAt = r.locked_at as string | null
            return {
                id: r.id as string,
                label: r.revision_label as string,
                summary: (r.summary as string | null) ?? "",
                at: lockedAt ?? (r.created_at as string),
                isCurrent: idx === 0,
                isLocked: lockedAt !== null,
            }
        })
    } catch (err) {
        console.error("[BRIEF-PAGE] revision history failed:", err)
        return []
    }
}

/** Formats an ISO date for display in the constraints grid — "Nov 2026" style. */
function formatDisplayDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
}

async function safeRegulatoryStandards(): Promise<RegulatoryStandardRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("design_standards")
            .select("standard_code, standard_name, summary, industry_domain")
            .in("industry_domain", ["aerospace", "quality", "regulatory", "safety"])
            .limit(6)
        if (error || !data) return []
        return data.map((r) => ({
            code: r.standard_code as string,
            name: r.standard_name as string,
            summary: typeof r.summary === "string"
                ? (r.summary.length > 96 ? `${r.summary.slice(0, 93)}…` : r.summary)
                : "",
            status: "not-started" as const,
        }))
    } catch (err) {
        console.error("[BRIEF-PAGE] regulatory standards failed:", err)
        return []
    }
}
