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
import type { CadLabModule } from "@/lib/cad-lab-types"

import {
    RevisionsView,
    type RevisionRow,
    type ChangeListModule,
} from "./revisions-view"

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

    // ── Change-list grouping — subsystem cards built from the project's
    // module list. Per-part diffs don't exist in the schema today, so each
    // module card renders an honest empty state listing the *current* parts
    // rather than a fabricated added/modified/removed diff. Once the diff
    // engine ships, populate `changes` on each ChangeListModule and the UI
    // will render add/modify/remove rows. Until then the cards document
    // "this is what the current revision declares" so founders know what
    // will participate in future diffs.
    const changeListModules = normaliseModulesForChangeList(project.modules)

    return (
        <RevisionsView
            project={{
                id: project.id,
                name: project.name,
                designRevision: project.designRevision,
            }}
            revisions={revisions}
            changeListModules={changeListModules}
        />
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Maps the raw JSONB modules array on `cad_lab_projects.modules` into the
 * ChangeListModule rows the view renders as subsystem cards. Per-part
 * deltas (added / modified / removed with mass + cost) are not yet tracked
 * in the schema — the UI renders an honest empty state inside each card
 * listing the current `keyParts` so founders can see what the future diff
 * engine will compare against.
 */
function normaliseModulesForChangeList(
    modules: CadLabModule[] | null,
): ChangeListModule[] {
    if (!modules || modules.length === 0) return []
    return modules.map((m, i) => ({
        id: m.id,
        // Module numbering mirrors the mockup's "M1 · Upper Fuselage" header.
        code: `M${i + 1}`,
        name: m.name,
        purpose: m.purpose ?? "",
        keyParts: Array.isArray(m.keyParts) ? m.keyParts : [],
        estimatedMassKg:
            typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : null,
    }))
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
