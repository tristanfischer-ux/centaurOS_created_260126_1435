/**
 * @file validate/experiments/[experimentId]/page.tsx
 *   — /the-forge-v2/projects/:id/validate/experiments/:experimentId
 *
 * @description Experiment Detail artefact — mockup-faithful port of
 * FORGE-MOCKUP-EXPERIMENT-DETAIL.html. Server component reads the parent
 * project and hands a typed props bundle to ExperimentDetailView.
 *
 * Data contract: the `experiments` table does not exist yet. The route param
 * `experimentId` is accepted and surfaced in the view as a scoping identifier,
 * but no row is fetched — the view renders the full mockup layout with
 * honest empty slots ("—" / "Not yet captured. Log experiment results via
 * the validation flow.") instead of 404-ing on a missing row. Mockup
 * specifics (RecycloPack / £299 / 70% yes / R3 / R4 / 07 Feb) are NEVER
 * fabricated — they live in the HTML mockup only.
 *
 * @related
 *   - View:   ./experiment-detail-view.tsx
 *   - Styles: ./experiment-detail-v2.css (scoped .ed2)
 *   - Mockup: FORGE-MOCKUP-EXPERIMENT-DETAIL.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { ExperimentDetailView } from "./experiment-detail-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; experimentId: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Experiment · The Forge" }
    return { title: `Experiment · ${r.project.name}` }
}

export default async function ForgeV2ExperimentDetailPage({
    params,
}: {
    params: Promise<{ id: string; experimentId: string }>
}): Promise<React.ReactNode> {
    const { id, experimentId } = await params
    const result = await loadCadLabProject(id)
    // Parent project must exist — if it doesn't, the whole sub-tree is a 404.
    // The experiment row itself does not need to exist (no `experiments` table
    // yet); the view handles the empty state itself.
    if ("error" in result || !result.project) notFound()
    const project = result.project

    return (
        <ExperimentDetailView
            project={{
                id: project.id,
                name: project.name,
            }}
            experimentId={experimentId}
        />
    )
}
