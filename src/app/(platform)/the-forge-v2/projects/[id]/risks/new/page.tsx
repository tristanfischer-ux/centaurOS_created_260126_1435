/**
 * @file risks/new/page.tsx — /the-forge-v2/projects/:id/risks/new
 *
 * @description "Raise a risk" — mockup-faithful port of FORGE-MOCKUP-RISK-CREATE.html.
 * Server component loads the project so the breadcrumb + module selector can key
 * off the real module list from decomposition.
 *
 * Submit mutation is NOT yet wired — the form renders fully interactive, the
 * 5×5 Probability × Impact matrix is selectable, and Submit is disabled with
 * a tooltip pointing at the next migration. There is no `risks` table yet, so
 * nothing persists. Empty-state: if the project has zero modules, the module
 * selector is disabled with "Decompose the brief first".
 *
 * @related
 *   - View:   ./risk-create-view.tsx
 *   - Styles: ./risk-create-v2.css (scoped .rc2)
 *   - Mockup: FORGE-MOCKUP-RISK-CREATE.html
 *   - Parent: ../page.tsx + ../risks-view.tsx (risks list, separate owner)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { RiskCreateView, type RiskCreateViewProps } from "./risk-create-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Raise a risk · The Forge" }
    return { title: `Raise a risk · ${r.project.name}` }
}

export default async function ForgeV2RiskCreatePage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()
    const project = result.project

    const modules = (project.modules ?? []).map((m) => ({
        id: m.id,
        name: m.name,
    }))

    const viewProps: RiskCreateViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        modules,
    }

    return <RiskCreateView {...viewProps} />
}
