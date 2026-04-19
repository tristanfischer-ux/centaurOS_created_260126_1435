/**
 * @file brief/page.tsx — /the-forge-v2/projects/:id/brief
 *
 * @description Server shell for the brief authoring surface. Loads the project
 * via `loadCadLabProject`, renders the standard WorkspaceShell chrome, and
 * delegates the editable narrative + lock flow to the `BriefEditor` client
 * component. Keeping metadata + data-fetch server-side lets the interactive
 * surface stay lean on initial payload while still deep-linking cleanly.
 *
 * Mockup refs: FORGE-MOCKUP-BRIEF.html, FORGE-MOCKUP-BRIEF-LOCK.html.
 *
 * TODO (deferred migration): a `brief_locked_at timestamptz` column on
 * `cad_lab_projects` + matching `lockCadLabBrief(projectId)` /
 * `unlockCadLabBrief(projectId)` server actions are queued but not applied
 * this session — other pending migrations are stacked locally and pushing
 * would apply them all. Until the column ships, lock state lives in
 * BriefEditor's local React state; `initialLockedAt` is always `null` here.
 */

import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { WorkspaceShell } from "../../../_components/workspace-shell"

import { BriefEditor } from "./_components/brief-editor"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Brief · The Forge" }
    return { title: `Brief · ${result.project.name}` }
}

export default async function ForgeV2BriefPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const designBrief = project.research?.designBrief ?? null
    const overview = project.productOverview
    const projectHref = `/the-forge-v2/projects/${project.id}`
    const hasContent = (overview && overview.trim().length > 0) || designBrief !== null

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: projectHref },
                { label: "Brief" },
            ]}
            subtitle={hasContent ? "Intent · markets · regulatory envelope" : "Run research to seed a brief"}
            maxWidth="narrow"
        >
            <BriefEditor
                projectId={project.id}
                projectHref={projectHref}
                initialOverview={overview}
                designBrief={designBrief}
                initialLockedAt={null}
            />
        </WorkspaceShell>
    )
}
