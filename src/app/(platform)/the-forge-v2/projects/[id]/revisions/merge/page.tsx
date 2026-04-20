/**
 * @file revisions/merge/page.tsx — /the-forge-v2/projects/:id/revisions/merge
 *
 * @description Revision-merge cockpit — mockup-faithful port of
 * FORGE-MOCKUP-REVISION-MERGE.html. Server component reads the project and
 * every row in `brief_revisions` for that project, ordered newest-first, then
 * resolves the source/target pair from `?from=<N>&to=<N>` (defaults to the two
 * most recent revisions if the params are absent).
 *
 * Empty-state policy: if fewer than 2 revisions exist, the view renders a card
 * pointing at `/fork`. The merge mutation itself is not wired yet —
 * the primary CTA is disabled with "Merge mutation ships next round" per the
 * brief. Per-artefact diffs, conflict counts, cost reconciliation and
 * supplier re-quotes are NOT in today's data contract; RevisionMergeView
 * renders honest "not yet wired" placeholders rather than synthesising mockup
 * specifics.
 *
 * @related
 *   - View:   ./revision-merge-view.tsx
 *   - Styles: ./revision-merge-v2.css (scoped .rm2)
 *   - Mockup: FORGE-MOCKUP-REVISION-MERGE.html
 *   - Sibling list page: ../page.tsx (Revisions list)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { RevisionMergeView, type RevisionRow } from "./revision-merge-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Merge revision · The Forge" }
    return { title: `Merge revision · ${r.project.name}` }
}

export default async function ForgeV2RevisionMergePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactNode> {
    const { id } = await params
    const sp = await searchParams

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()
    const project = result.project

    // ── brief_revisions — newest first ───────────────────────────
    // RLS scopes this automatically to the viewer's foundry. Read failures
    // downgrade to an empty list so the view's empty-state card renders
    // instead of a 500. Errors are logged server-side for triage.
    const revisions = await loadBriefRevisions(id)

    const fromRevision = parseRevisionNumber(sp.from)
    const toRevision = parseRevisionNumber(sp.to)

    return (
        <RevisionMergeView
            project={{
                id: project.id,
                name: project.name,
                designRevision: project.designRevision,
            }}
            revisions={revisions}
            fromRevision={fromRevision}
            toRevision={toRevision}
        />
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Parse a `?from=` or `?to=` query param into a positive integer revision
 * number, or null if it's absent/invalid. Accepts first value of a repeated
 * param and ignores non-numeric input.
 */
function parseRevisionNumber(
    raw: string | string[] | undefined,
): number | null {
    if (raw == null) return null
    const v = Array.isArray(raw) ? raw[0] : raw
    if (!v) return null
    const n = Number.parseInt(v, 10)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
}

async function loadBriefRevisions(projectId: string): Promise<RevisionRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("brief_revisions")
            .select("*")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
        if (error || !data) {
            if (error) console.error("[REVISION-MERGE-PAGE] brief_revisions read failed:", error.message)
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
        console.error("[REVISION-MERGE-PAGE] brief_revisions read threw:", err)
        return []
    }
}
