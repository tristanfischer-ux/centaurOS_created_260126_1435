/**
 * @file revisions/page.tsx — /the-forge-v2/projects/:id/revisions
 *
 * @description Vertical timeline of every revision of a project. Revision 1
 * is the original decomposition; revisions 2+ are interesting because they
 * carry a conceptSnapshot diff. For each revision N we list the modules
 * whose `revisionNumber === N` plus what triggered them
 * (`lastRevisionSource: 'checkpoint' | 'review'`). Clicking a revision
 * drills into the merge/diff view.
 *
 * @related
 * - Data: loadCadLabProject from @/actions/cad-lab-projects — reads
 *   project.designRevision + modules[*].revisionNumber + lastRevisionSource
 * - Shell: ../../../_components/workspace-shell
 * - Detail: ./[revisionId]/page.tsx
 * - Mockup: FORGE-MOCKUP-REVISIONS.html
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    GitBranch,
    ArrowRight,
    CheckCircle2,
    MessageSquare,
    AlertTriangle,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Revisions · The Forge" }
    return { title: `Revisions · ${result.project.name}` }
}

export default async function ForgeV2RevisionsPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []
    const currentRev = project.designRevision ?? 1

    // Group modules by revisionNumber. Revision 1 counts too (origin), but we
    // highlight only revisions >= 2 in the timeline since those are the ones
    // that carry a meaningful diff vs the original decomposition.
    const revMap = new Map<number, CadLabModule[]>()
    for (const m of modules) {
        const rev = m.revisionNumber ?? 1
        const bucket = revMap.get(rev) ?? []
        bucket.push(m)
        revMap.set(rev, bucket)
    }

    // Revisions to display — newest first, origin last.
    const revisionsDesc = Array.from(revMap.keys()).sort((a, b) => b - a)
    const interestingRevs = revisionsDesc.filter(r => r >= 2)
    const hasRevisions = interestingRevs.length > 0

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Revisions" },
            ]}
            subtitle={
                hasRevisions
                    ? `${interestingRevs.length} ${interestingRevs.length === 1 ? "revision" : "revisions"} past the original · now at v${currentRev}`
                    : "Project is still on the original decomposition"
            }
            secondary={
                <Badge variant="outline" className="text-xs font-semibold bg-international-orange/10 text-international-orange border-international-orange/30">
                    v{currentRev}
                </Badge>
            }
        >
            {!hasRevisions ? (
                <EmptyState projectId={project.id} />
            ) : (
                <ol className="relative space-y-5 pl-8 before:absolute before:left-[15px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-border">
                    {interestingRevs.map(rev => {
                        const revModules = revMap.get(rev) ?? []
                        const isCurrent = rev === currentRev
                        const checkpointModules = revModules.filter(m => m.lastRevisionSource === "checkpoint")
                        const reviewModules = revModules.filter(m => m.lastRevisionSource === "review")
                        const unlabelledModules = revModules.filter(m => !m.lastRevisionSource)

                        return (
                            <li key={rev} className="relative">
                                {/* Timeline dot */}
                                <span
                                    aria-hidden
                                    className={cn(
                                        "absolute -left-7 top-3 w-3 h-3 rounded-full ring-4 ring-background",
                                        isCurrent ? "bg-international-orange" : "bg-muted-foreground/60",
                                    )}
                                />

                                <Card className={cn(
                                    "rounded-xl border",
                                    isCurrent && "border-international-orange/40",
                                )}>
                                    <CardContent className="py-5 px-5 space-y-4">
                                        {/* Revision header */}
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <GitBranch className={cn(
                                                        "h-4 w-4 shrink-0",
                                                        isCurrent ? "text-international-orange" : "text-muted-foreground",
                                                    )} />
                                                    <h2 className="text-lg font-bold text-foreground leading-tight">
                                                        Revision v{rev}
                                                    </h2>
                                                    {isCurrent && (
                                                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-international-orange/10 text-international-orange border-international-orange/30">
                                                            Current
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-[12.5px] text-muted-foreground mt-1">
                                                    {revModules.length} {revModules.length === 1 ? "module" : "modules"} landed at this revision
                                                </p>
                                            </div>
                                            <Link
                                                href={`/the-forge-v2/projects/${project.id}/revisions/${rev}`}
                                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-international-orange hover:underline shrink-0"
                                            >
                                                View diff
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Link>
                                        </div>

                                        {/* Trigger breakdown */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <TriggerChip
                                                icon={CheckCircle2}
                                                label="Checkpoint"
                                                count={checkpointModules.length}
                                                tone="info"
                                                helpText="Pre-gen decomposition sign-off"
                                            />
                                            <TriggerChip
                                                icon={MessageSquare}
                                                label="Review"
                                                count={reviewModules.length}
                                                tone="warning"
                                                helpText="Post-gen specialist review"
                                            />
                                            {unlabelledModules.length > 0 && (
                                                <TriggerChip
                                                    icon={AlertTriangle}
                                                    label="Manual"
                                                    count={unlabelledModules.length}
                                                    tone="muted"
                                                    helpText="No trigger recorded"
                                                />
                                            )}
                                        </div>

                                        {/* Module list */}
                                        <div>
                                            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                                                Modules at v{rev}
                                            </h3>
                                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                {revModules.map(m => (
                                                    <li key={m.id}>
                                                        <Link
                                                            href={`/the-forge-v2/projects/${project.id}/modules/${m.id}`}
                                                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-background hover:bg-muted/40 transition-colors"
                                                        >
                                                            <span className="text-sm font-semibold text-foreground truncate min-w-0">
                                                                {m.name}
                                                            </span>
                                                            {m.lastRevisionSource && (
                                                                <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
                                                                    {m.lastRevisionSource}
                                                                </span>
                                                            )}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </CardContent>
                                </Card>
                            </li>
                        )
                    })}

                    {/* Origin marker */}
                    <li className="relative">
                        <span
                            aria-hidden
                            className="absolute -left-7 top-3 w-3 h-3 rounded-full ring-4 ring-background bg-muted-foreground/40"
                        />
                        <Card className="rounded-xl border border-dashed">
                            <CardContent className="py-4 px-5 flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground">Revision v1 · original decomposition</p>
                                    <p className="text-[12px] text-muted-foreground mt-0.5">
                                        The baseline. All modules started here before any revision was applied.
                                    </p>
                                </div>
                                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-muted text-muted-foreground border-border shrink-0">
                                    Origin
                                </Badge>
                            </CardContent>
                        </Card>
                    </li>
                </ol>
            )}
        </WorkspaceShell>
    )
}

// ─── Sub-components ────────────────────────────────────────────────────

type TriggerTone = "info" | "warning" | "muted"

function TriggerChip({
    icon: Icon,
    label,
    count,
    tone,
    helpText,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    count: number
    tone: TriggerTone
    helpText: string
}): React.ReactElement {
    const iconClass =
        tone === "info" ? "text-status-info" :
        tone === "warning" ? "text-status-warning" :
        "text-muted-foreground"
    const bgClass =
        tone === "info" ? "bg-status-info-light" :
        tone === "warning" ? "bg-status-warning-light" :
        "bg-muted"
    return (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-background">
            <span className={cn("flex items-center justify-center w-8 h-8 rounded-md shrink-0", bgClass)}>
                <Icon className={cn("h-4 w-4", iconClass)} />
            </span>
            <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
                    {label}
                </p>
                <p className="text-lg font-bold tabular-nums leading-tight text-foreground">
                    {count}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {helpText}
                </p>
            </div>
        </div>
    )
}

function EmptyState({ projectId }: { projectId: string }): React.ReactElement {
    return (
        <Card className="rounded-xl border">
            <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                    <GitBranch className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="max-w-sm space-y-2">
                    <p className="text-sm font-semibold text-foreground">No revisions yet</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        A revision is created when a specialist checkpoint or review triggers a
                        re-decomposition. The project is still on the original layout.
                    </p>
                </div>
                <Link
                    href={`/the-forge-v2/projects/${projectId}/modules`}
                    className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                >
                    Back to modules <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </CardContent>
        </Card>
    )
}
