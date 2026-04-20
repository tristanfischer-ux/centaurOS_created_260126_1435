/**
 * @file revisions/[revisionId]/page.tsx — /the-forge-v2/projects/:id/revisions/:revisionId
 *
 * @description Per-revision detail view — honest empty state.
 *
 * This route was originally scaffolded as a two-column "before | after" diff
 * based on `cad_lab_projects.modules[].conceptSnapshot` vs current module
 * fields (derived-from-project-history). Since then, the revisions data model
 * has moved to the `brief_revisions` table (see `../page.tsx` + `../merge/page.tsx`),
 * and the real per-revision drill-in is `/revisions/merge?from=X&to=Y`.
 *
 * There is no canonical "revision detail" page in today's data contract —
 * the module-history synthesis doesn't line up with `brief_revisions` rows.
 * Rather than throw at render time or fabricate a diff against stale fields,
 * this page renders an honest "Revision detail — not yet wired" state and
 * points users back to the revisions list (and to merge, if they want the diff).
 *
 * The route is kept so that any stale inbound links (bookmarks, old emails,
 * screenshot agents) resolve to a real page instead of the 500 error boundary.
 *
 * @related
 *   - List:  ../page.tsx (brief_revisions, newest first)
 *   - Merge: ../merge/page.tsx (from/to diff view using brief_revisions)
 */

import Link from "next/link"
import type { Metadata } from "next"
import { GitCompare, ArrowRight } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { WorkspaceShell } from "../../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; revisionId: string }> },
): Promise<Metadata> {
    try {
        const { id, revisionId } = await params
        const result = await loadCadLabProject(id)
        if ("error" in result) return { title: "Revision · The Forge" }
        return { title: `Revision ${revisionId} · ${result.project.name}` }
    } catch {
        return { title: "Revision · The Forge" }
    }
}

export default async function ForgeV2RevisionDetailPage({
    params,
}: {
    params: Promise<{ id: string; revisionId: string }>
}): Promise<React.ReactNode> {
    const { id, revisionId } = await params

    // Resolve the project — if it can't be loaded, still render an honest
    // empty state (with generic crumbs) rather than throwing. Links back to
    // the revisions list use the raw id param so they remain navigable even
    // when the loader returns an error.
    const result = await loadCadLabProject(id)
    const project = "error" in result ? null : result.project
    const projectId = project?.id ?? id
    const projectName = project?.name ?? "Project"

    // Best-effort label. `revisionId` is a free-form URL segment — could be a
    // number ("2"), a label ("rev-a"), or anything else. Never parseInt-throw.
    const safeLabel = typeof revisionId === "string" && revisionId.trim().length > 0
        ? revisionId.trim()
        : "—"

    return (
        <WorkspaceShell
            maxWidth="narrow"
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: projectName, href: `/the-forge-v2/projects/${projectId}` },
                { label: "Revisions", href: `/the-forge-v2/projects/${projectId}/revisions` },
                { label: `rev ${safeLabel}` },
            ]}
            subtitle="Revision detail"
            secondary={
                <Badge
                    variant="outline"
                    className="text-xs font-semibold bg-international-orange/10 text-international-orange border-international-orange/30"
                >
                    {safeLabel}
                </Badge>
            }
        >
            {/* Honest empty-state card — per-revision detail isn't wired */}
            <Card className="rounded-xl border">
                <CardContent className="py-10 px-5 flex flex-col items-center text-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-international-orange/10">
                        <GitCompare className="h-5 w-5 text-international-orange" />
                    </div>
                    <div className="space-y-2 max-w-lg">
                        <h2 className="text-lg font-bold text-foreground leading-tight">
                            Revision detail — not yet wired
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            A per-revision detail page isn&apos;t in today&apos;s data contract.
                            Revisions are tracked in <code className="font-mono text-[12.5px]">brief_revisions</code>,
                            and the real drill-in is the revision-merge view — it renders a
                            from/to diff between any two locked revisions.
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            The revisions list is the canonical revision history today. Use
                            the merge view when you need to compare two specific revisions
                            side by side.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <Link href={`/the-forge-v2/projects/${projectId}/revisions`}>
                                Back to revisions
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                        <Button
                            asChild
                            size="sm"
                            className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white"
                        >
                            <Link href={`/the-forge-v2/projects/${projectId}/revisions/merge`}>
                                Open merge view
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </WorkspaceShell>
    )
}
