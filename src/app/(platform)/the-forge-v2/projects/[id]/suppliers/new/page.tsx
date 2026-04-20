/**
 * @file suppliers/new/page.tsx — /the-forge-v2/projects/:id/suppliers/new
 *
 * @description "Find or add a supplier" — mockup-faithful port of
 * FORGE-MOCKUP-SUPPLIER-CREATE.html. Server component loads the project so
 * the breadcrumb + Mode-B modules multi-select can key off real modules.
 *
 * Submit mutation is NOT yet wired — the shell renders fully, Submit is
 * disabled with a tooltip pointing to the next-round mutation. No creation
 * path exists yet in `src/actions`; landing it is tracked separately so the
 * form UI can ship ahead of persistence.
 *
 * @related
 *   - View:   ./supplier-create-view.tsx
 *   - Styles: ./supplier-create-v2.css (scoped .sc2)
 *   - Mockup: FORGE-MOCKUP-SUPPLIER-CREATE.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { SupplierCreateView, type SupplierCreateViewProps } from "./supplier-create-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Find supplier · The Forge" }
    return { title: `Find supplier · ${r.project.name}` }
}

export default async function ForgeV2SupplierCreatePage({
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

    const viewProps: SupplierCreateViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        modules,
    }

    return <SupplierCreateView {...viewProps} />
}
