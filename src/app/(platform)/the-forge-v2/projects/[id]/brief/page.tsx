/**
 * @file brief/page.tsx — /the-forge-v2/projects/:id/brief
 *
 * @description Mounts the interactive Brief editor (productOverview authoring +
 * lock / unlock lifecycle). The route was missing: the BriefEditor component and
 * its save / lock / unlock server actions already existed and were wired to
 * Supabase, but nothing rendered them — so /brief 404'd and every "Brief" link
 * across the workspace dead-ended. This page loads the project (auth + foundry
 * scoping enforced inside loadCadLabProject's withAuth) and renders the editor
 * with the five props it needs, all read straight off the project row.
 *
 * Mirrors the sibling ../fork/page.tsx load pattern (force-dynamic + notFound on
 * a missing / cross-tenant project).
 *
 * @related
 *   - Editor:  ./_components/brief-editor.tsx (BriefEditor)
 *   - Display: ./brief-view.tsx (read-only artefact page — not yet routed)
 *   - Actions: saveCadLabProductOverview / lockCadLabBrief / unlockCadLabBrief
 *              in @/actions/cad-lab-projects
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { BriefEditor } from "./_components/brief-editor"

export const dynamic = "force-dynamic"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) {
        return { title: "Brief · The Forge" }
    }
    return { title: `Brief · ${result.project.name}` }
}

export default async function ForgeV2BriefPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) {
        notFound()
    }
    const project = result.project

    return (
        <div className="mx-auto w-full max-w-4xl px-6 py-8">
            <BriefEditor
                projectId={project.id}
                projectHref={`/the-forge-v2/projects/${project.id}`}
                initialOverview={project.productOverview}
                designBrief={project.research?.designBrief ?? null}
                initialLockedAt={project.briefLockedAt}
            />
        </div>
    )
}
