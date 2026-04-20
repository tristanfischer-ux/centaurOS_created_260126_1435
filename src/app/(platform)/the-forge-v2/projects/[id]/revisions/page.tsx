/**
 * @file revisions/page.tsx — /the-forge-v2/projects/:id/revisions
 *
 * @description Revisions artefact — mockup-faithful port of
 * FORGE-MOCKUP-REVISIONS.html. Server component reads the project and every
 * row in `brief_revisions` for that project, ordered newest-first, then hands
 * a typed props bundle to RevisionsView.
 *
 * Empty-state policy: if `brief_revisions` is empty for this project the view
 * renders an empty-state card pointing at brief-lock. Per-part diff visibility
 * (parts changed, mass impact, supplier swaps) is not in today's data
 * contract — RevisionsView renders honest "—" placeholders for those tiles
 * rather than synthesising mockup specifics.
 *
 * @related
 *   - View:   ./revisions-view.tsx
 *   - Styles: ./revisions-v2.css (scoped .rv2)
 *   - Mockup: FORGE-MOCKUP-REVISIONS.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { RevisionsView, type RevisionRow } from "./revisions-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Revisions · The Forge" }
    return { title: `Revisions · ${r.project.name}` }
}

export default async function ForgeV2RevisionsPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()
    const project = result.project

    // ── brief_revisions — newest first ───────────────────────────
    // RLS scopes this automatically to the viewer's foundry. We intentionally
    // swallow a read failure as an empty list so the empty-state card shows
    // instead of a 500. Errors are logged server-side for triage.
    const revisions = await loadBriefRevisions(id)

    return (
        <RevisionsView
            project={{
                id: project.id,
                name: project.name,
                designRevision: project.designRevision,
            }}
            revisions={revisions}
        />
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function loadBriefRevisions(projectId: string): Promise<RevisionRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("brief_revisions")
            .select("*")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
        if (error || !data) {
            if (error) console.error("[REVISIONS-PAGE] brief_revisions read failed:", error.message)
            return []
        }
        return data.map((row) => ({
            id: row.id,
            revisionNumber: row.revision_number,
            revisionLabel: row.revision_label,
            summary: row.summary ?? "",
            lockedAt: row.locked_at,
            createdAt: row.created_at,
        }))
    } catch (err) {
        console.error("[REVISIONS-PAGE] brief_revisions read threw:", err)
        return []
    }
}
