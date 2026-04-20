/**
 * @file launch/page.tsx — /the-forge-v2/projects/:id/launch
 *
 * @description Launch / Handoff artefact — mockup-faithful port of
 * FORGE-MOCKUP-LAUNCH-HANDOFF.html. Server component loads the project,
 * aggregates the readiness state for each launch gate (brief locked,
 * modules specified, reviews landed, cost estimated, risks logged,
 * suppliers shortlisted, CAD uploaded, regulatory declared), and hands
 * a typed props bundle to LaunchHandoffView.
 *
 * Launch is the "hand the project off to the launch team / manufacturing
 * partner" surface — a deliberate, reviewed checklist that summarises
 * everything an external party needs to take over: brief, BOM, cost,
 * suppliers, compliance, CAD files, test plan.
 *
 * Empty-state policy: every gate row and side-card stat is driven by what
 * is actually in the project payload. When data doesn't exist (CAD files,
 * regulatory posture, cost ceiling, first-ship date) we render an honest
 * empty caption, never the mockup's fabricated HAPS / Astra / £148,240
 * example content.
 *
 * @related
 *   - View:   ./launch-handoff-view.tsx
 *   - Styles: ./launch-handoff-v2.css (scoped .lh2)
 *   - Mockup: FORGE-MOCKUP-LAUNCH-HANDOFF.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import {
    LaunchHandoffView,
    type LaunchGateRow,
    type LaunchHandoffViewProps,
} from "./launch-handoff-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Launch · The Forge" }
    return { title: `Launch · ${r.project.name}` }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

/** Best-effort shortlist row count — returns 0 on any failure. */
async function countShortlistedSuppliers(projectId: string): Promise<number> {
    try {
        const supabase = await createClient()
        const { count, error } = await supabase
            .from("forge_supplier_shortlist")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
        if (error) return 0
        return count ?? 0
    } catch {
        return 0
    }
}

/** Best-effort CAD file count — returns 0 on any failure. */
async function countCadFiles(projectId: string): Promise<number> {
    try {
        const supabase = await createClient()
        const { count, error } = await supabase
            .from("cad_lab_project_files")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
        if (error) return 0
        return count ?? 0
    } catch {
        return 0
    }
}

// ─── Page ───────────────────────────────────────────────────────────────

export default async function ForgeV2LaunchPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // ── Parallel side-fetches (each swallows errors → 0) ────────
    const [supplierCount, cadFileCount] = await Promise.all([
        countShortlistedSuppliers(id),
        countCadFiles(id),
    ])

    // ── Brief-derived data ──────────────────────────────────────
    const designBrief = project.research?.designBrief ?? null
    const briefLocked = project.briefLockedAt !== null
    const constraints = designBrief?.constraints ?? null
    const unitCostCeilingGbp =
        typeof constraints?.unitCostCeilingGbp === "number" ? constraints.unitCostCeilingGbp : null
    const firstShipDateIso = constraints?.firstShipDate ?? null
    const quantityTarget =
        typeof designBrief?.quantityTarget === "string" && designBrief.quantityTarget.trim().length > 0
            ? designBrief.quantityTarget.trim()
            : null
    const regulatoryCount = Array.isArray(designBrief?.regulatory)
        ? designBrief.regulatory.filter(
              (r) => r && typeof r.code === "string" && r.code.trim().length > 0,
          ).length
        : 0

    // ── Module / parts aggregates ───────────────────────────────
    const moduleCount = modules.length
    const specifiedOrGenerated = modules.filter(
        (m) => m.status === "generated" || m.status === "specified" || m.status === "interface_ready",
    ).length
    const partCount = modules.reduce(
        (acc, m) => acc + (Array.isArray(m.keyParts) ? m.keyParts.length : 0),
        0,
    )

    // ── Reviews / cost / risks rollups ──────────────────────────
    const reviews = project.reviews ?? {}
    const reviewCount = Object.values(reviews).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0,
    )
    const costEstimates = project.aiCostEstimates ?? {}
    const costCount = Object.keys(costEstimates).length
    const failureModeCount = modules.reduce(
        (acc, m) => acc + (Array.isArray(m.failureModes) ? m.failureModes.length : 0),
        0,
    )
    const unknownCount = modules.reduce(
        (acc, m) => acc + (Array.isArray(m.unknowns) ? m.unknowns.length : 0),
        0,
    )

    // ── Derive gate states + blocker list ───────────────────────
    const gates: LaunchGateRow[] = [
        {
            id: "brief",
            label: "Brief locked",
            sub: briefLocked
                ? "Brief has been locked as the anchor spec for this revision."
                : "Brief is still in draft — lock it in the Brief-lock flow before shipping.",
            state: briefLocked ? "green" : "red",
            by: briefLocked ? "Founder signoff" : "pending",
        },
        {
            id: "modules",
            label: "Modules specified",
            sub:
                moduleCount === 0
                    ? "No modules generated yet — decompose the concept first."
                    : specifiedOrGenerated === moduleCount
                      ? `${moduleCount} module${moduleCount === 1 ? "" : "s"} specified or generated.`
                      : `${specifiedOrGenerated} of ${moduleCount} modules specified or generated.`,
            state:
                moduleCount === 0
                    ? "red"
                    : specifiedOrGenerated === moduleCount
                      ? "green"
                      : "amber",
            by: "Jian · VP Engineering",
        },
        {
            id: "reviews",
            label: "Specialist reviews",
            sub:
                reviewCount === 0
                    ? "No specialist reviews yet — each module should carry at least one verdict."
                    : reviewCount < moduleCount
                      ? `${reviewCount} review${reviewCount === 1 ? "" : "s"} across ${moduleCount} module${moduleCount === 1 ? "" : "s"} · coverage incomplete.`
                      : `${reviewCount} review${reviewCount === 1 ? "" : "s"} across ${moduleCount} module${moduleCount === 1 ? "" : "s"}.`,
            state:
                reviewCount === 0
                    ? "red"
                    : reviewCount < moduleCount
                      ? "amber"
                      : "green",
            by: "Specialist roster",
        },
        {
            id: "cost",
            label: "Cost estimates",
            sub:
                costCount === 0
                    ? "No cost estimates yet — unit economics aren't rolled up."
                    : costCount < moduleCount
                      ? `${costCount} of ${moduleCount} modules costed.`
                      : `${costCount} module${costCount === 1 ? "" : "s"} costed.`,
            state:
                costCount === 0
                    ? "red"
                    : costCount < moduleCount
                      ? "amber"
                      : "green",
            by: "Finn · Finance",
        },
        {
            id: "risks",
            label: "Risks logged",
            sub:
                failureModeCount + unknownCount === 0
                    ? "No failure modes or unknowns declared — either uncommonly clean or under-scrutinised."
                    : `${failureModeCount} failure mode${failureModeCount === 1 ? "" : "s"} + ${unknownCount} open question${unknownCount === 1 ? "" : "s"} captured.`,
            state: failureModeCount + unknownCount === 0 ? "amber" : "green",
            by: "Engineering lead",
        },
        {
            id: "suppliers",
            label: "Suppliers shortlisted",
            sub:
                supplierCount === 0
                    ? "No suppliers shortlisted yet — open the Suppliers artefact to shortlist."
                    : `${supplierCount} supplier${supplierCount === 1 ? "" : "s"} on the project shortlist.`,
            state: supplierCount === 0 ? "red" : "green",
            by: "Chase · Supply",
        },
        {
            id: "cad",
            label: "CAD geometry uploaded",
            sub:
                cadFileCount === 0
                    ? "No geometry uploaded yet. Upload CAD in the Geometry artefact so the handoff package includes files."
                    : `${cadFileCount} file${cadFileCount === 1 ? "" : "s"} uploaded.`,
            state: cadFileCount === 0 ? "amber" : "green",
            by: "auto",
        },
        {
            id: "regulatory",
            label: "Regulatory posture declared",
            sub:
                regulatoryCount === 0
                    ? "No regulatory items declared. Declare per-project posture in the Brief so compliance transfers cleanly."
                    : `${regulatoryCount} standard${regulatoryCount === 1 ? "" : "s"} declared in the brief.`,
            state: regulatoryCount === 0 ? "amber" : "green",
            by: "Leo · Legal",
        },
        {
            id: "cost-ceiling",
            label: "Cost ceiling set",
            sub:
                unitCostCeilingGbp == null
                    ? "No unit cost ceiling declared. Set it in the Brief constraints so Operations can track variance."
                    : `£${unitCostCeilingGbp.toLocaleString("en-GB")} per unit declared in the brief.`,
            state: unitCostCeilingGbp == null ? "amber" : "green",
            by: "Finn · Finance",
        },
        {
            id: "ship-date",
            label: "Target first-ship date",
            sub:
                firstShipDateIso == null
                    ? "No target first-ship date declared. Set it in the Brief constraints so the warranty clock can start."
                    : `Target first-ship date: ${new Date(firstShipDateIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`,
            state: firstShipDateIso == null ? "amber" : "green",
            by: "Founder",
        },
    ]

    // ── Blockers: only red gates are hard blockers (amber = partial) ──
    const blockers = gates.filter((g) => g.state === "red").map((g) => g.label)
    const isReady = blockers.length === 0 && gates.every((g) => g.state !== "red")

    const viewProps: LaunchHandoffViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        isReady,
        blockers,
        gates,
        snapshot: {
            currentRevision: designRevisionToLetter(project.designRevision),
            moduleCount,
            partCount: partCount > 0 ? partCount : null,
            supplierCount,
            cadFileCount,
            regulatoryCount,
            unitCostCeilingGbp,
            firstShipDateIso,
            quantityTarget,
        },
    }

    return <LaunchHandoffView {...viewProps} />
}
