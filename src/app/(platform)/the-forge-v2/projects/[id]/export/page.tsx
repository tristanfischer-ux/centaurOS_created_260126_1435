/**
 * @file export/page.tsx — /the-forge-v2/projects/:id/export
 *
 * Export artefact — mockup-faithful port of FORGE-MOCKUP-EXPORT.html.
 * Server component reads the project, derives counts (modules, parts,
 * cost roll-up) and hands a typed props bundle to ExportView.
 *
 * Empty-state policy: no export actions exist yet. Every CTA on the
 * page is disabled with a `title` tooltip explaining what ships next.
 * We never fake past-export entries — history card renders the real
 * empty state until a project_exports table lands.
 *
 * @related
 *   - View:   ./export-view.tsx
 *   - Styles: ./export-v2.css (scoped .ex2)
 *   - Mockup: FORGE-MOCKUP-EXPORT.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { ExportView, type ExportViewProps } from "./export-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Export · The Forge" }
    return { title: `Export · ${r.project.name}` }
}

export default async function ForgeV2ExportPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []
    const estimatesById = project.aiCostEstimates ?? {}

    // ── Counts ──────────────────────────────────────────────────────────
    const moduleCount = modules.length
    const partsCount = modules.reduce((acc, m) => acc + (m.keyParts?.length ?? 0), 0)

    // ── Cost roll-up — module-level AI estimate sum (may be null) ──────
    let costTotalGbp: number | null = null
    for (const m of modules) {
        const est = estimatesById[m.id]
        if (est && typeof est.totalPerUnit === "number") {
            costTotalGbp = (costTotalGbp ?? 0) + est.totalPerUnit
        }
    }

    // ── Brief-declared ceiling — used to tag the preview line ─────────
    const ceilingGbp =
        project.research?.designBrief?.constraints?.unitCostCeilingGbp ?? null

    // ── Brief mission — optional one-liner for the preview summary ────
    const briefMission =
        project.research?.designBrief?.mission?.trim() ||
        project.subject?.trim() ||
        null

    const viewProps: ExportViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        counts: {
            modules: moduleCount,
            parts: partsCount,
        },
        cost: {
            totalGbp: costTotalGbp,
            ceilingGbp,
        },
        preview: {
            briefMission,
        },
    }

    return <ExportView {...viewProps} />
}
