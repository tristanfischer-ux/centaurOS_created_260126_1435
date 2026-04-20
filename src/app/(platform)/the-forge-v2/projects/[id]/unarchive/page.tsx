/**
 * @file unarchive/page.tsx — /the-forge-v2/projects/:id/unarchive
 *
 * @description Action-intent page for unarchiving a Forge project — the
 * inverse of /archive. Frames unarchive as forward motion (restoring work),
 * not a cautionary act: the primary button is brand-orange, the copy leads
 * with what happens, not what could go wrong.
 *
 * Two empty-state branches per the brief:
 *   - Project is archived (archived_at !== null) → render the confirmation
 *     card with "Unarchive" action.
 *   - Project is already active → render an "Already active" state with a
 *     link back to the workspace. No action needed.
 *
 * `archived_at` is not currently surfaced by `loadCadLabProject` (the shape
 * predates the column landing). Rather than extend that central payload in
 * a parallel-agent wave, we query the column here directly. RLS enforces
 * foundry scoping on the SELECT, mirroring how the rest of the page tree
 * reads the same table.
 *
 * Mockup ref: FORGE-MOCKUP-UNARCHIVE.html.
 *
 * @related
 *   - Action:  unarchiveCadLabProject in src/actions/cad-lab-projects.ts
 *   - Inverse: ../archive/page.tsx
 *   - View:    ./unarchive-view.tsx
 *   - Styles:  ./unarchive-v2.css (scoped .uar2)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { UnarchiveView, type UnarchiveViewProps } from "./unarchive-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) {
        return { title: "Unarchive · The Forge" }
    }
    return { title: `Unarchive · ${result.project.name}` }
}

export default async function ForgeV2UnarchivePage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // ── 1. Load project shape + archive state in parallel ─────────────
    const [loadResult, archiveState] = await Promise.all([
        loadCadLabProject(id),
        safeReadArchiveState(id),
    ])
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // ── 2. Compose view props ─────────────────────────────────────────
    const viewProps: UnarchiveViewProps = {
        project: {
            id: project.id,
            name: project.name,
            subject: project.subject,
        },
        archivedAt: archiveState.archivedAt,
    }

    return <UnarchiveView {...viewProps} />
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Reads the archive state for a single project — returns null-safe values
 * on any failure so the page still renders (the view copes with an unknown
 * archive state by presenting the confirmation branch in the simple case).
 *
 * RLS on `cad_lab_projects` enforces foundry scoping on the SELECT, so this
 * is safe to call without an explicit foundry filter.
 */
async function safeReadArchiveState(
    projectId: string,
): Promise<{ archivedAt: string | null }> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("cad_lab_projects")
            .select("archived_at")
            .eq("id", projectId)
            .maybeSingle()
        if (error || !data) return { archivedAt: null }
        return { archivedAt: (data.archived_at as string | null) ?? null }
    } catch (err) {
        console.error("[UNARCHIVE-PAGE] archive state read failed:", err)
        return { archivedAt: null }
    }
}
