/**
 * @file revisions/[revisionId]/page.tsx — /the-forge-v2/projects/:id/revisions/:revisionId
 *
 * @description Revision merge / diff view. For each module whose
 * `revisionNumber === N`, show a two-column "Before | After" diff of the
 * fields captured in `conceptSnapshot` (purpose, description, keyParts,
 * whyItMatters, failureModes, unknowns) vs the current module field values.
 * Added lines are highlighted with `bg-status-success-light`, removed lines
 * with `bg-destructive/10`.
 *
 * @related
 * - Data: loadCadLabProject from @/actions/cad-lab-projects
 * - Source fields: CadLabModule.conceptSnapshot vs current module fields
 * - Shell: ../../../../_components/workspace-shell (narrow width)
 * - Mockup: FORGE-MOCKUP-REVISION-MERGE.html
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    GitCompare,
    ArrowRight,
    AlertTriangle,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

/**
 * Supported string fields — single-value text diff.
 * Kept as keys of the conceptSnapshot shape so we stay in sync with the type.
 */
const STRING_FIELDS = ["purpose", "description", "whyItMatters"] as const
type StringFieldKey = typeof STRING_FIELDS[number]

/** Supported list fields — element-wise add/remove diff. */
const LIST_FIELDS = ["keyParts", "failureModes", "unknowns"] as const
type ListFieldKey = typeof LIST_FIELDS[number]

const FIELD_LABELS: Record<StringFieldKey | ListFieldKey, string> = {
    purpose: "Purpose",
    description: "Description",
    whyItMatters: "Why it matters",
    keyParts: "Key parts",
    failureModes: "Failure modes",
    unknowns: "Open questions",
}

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; revisionId: string }> },
): Promise<Metadata> {
    const { id, revisionId } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Revision · The Forge" }
    return { title: `Revision v${revisionId} · ${result.project.name}` }
}

export default async function ForgeV2RevisionMergePage({
    params,
}: {
    params: Promise<{ id: string; revisionId: string }>
}): Promise<React.ReactNode> {
    const { id, revisionId } = await params
    const revNumber = Number.parseInt(revisionId, 10)
    if (Number.isNaN(revNumber) || revNumber < 1) notFound()

    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []

    // Modules that landed at this specific revision
    const affected = modules.filter(m => (m.revisionNumber ?? 1) === revNumber)

    // Count source triggers for the summary strip
    const fromCheckpoint = affected.filter(m => m.lastRevisionSource === "checkpoint").length
    const fromReview = affected.filter(m => m.lastRevisionSource === "review").length

    return (
        <WorkspaceShell
            maxWidth="narrow"
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Revisions", href: `/the-forge-v2/projects/${project.id}/revisions` },
                { label: `rev ${revNumber}` },
            ]}
            subtitle={
                affected.length === 0
                    ? `No modules landed at revision v${revNumber}`
                    : `${affected.length} ${affected.length === 1 ? "module" : "modules"} changed at this revision`
            }
            secondary={
                <Badge variant="outline" className="text-xs font-semibold bg-international-orange/10 text-international-orange border-international-orange/30">
                    v{revNumber}
                </Badge>
            }
        >
            {/* Summary header */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-international-orange/10 shrink-0">
                                <GitCompare className="h-4.5 w-4.5 text-international-orange" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold text-foreground leading-tight">
                                    Revision v{revNumber} diff
                                </h2>
                                <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
                                    Before / after for each module that changed at this revision.
                                    Pre-revision values come from the module&apos;s <code className="font-mono text-[11.5px]">conceptSnapshot</code>;
                                    post-revision values are the module&apos;s current fields.
                                </p>
                            </div>
                        </div>
                        <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
                            <Link href={`/the-forge-v2/projects/${project.id}/revisions`}>
                                Back to revisions
                            </Link>
                        </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <SummaryTile label="Modules changed" value={String(affected.length)} />
                        <SummaryTile label="Triggered by checkpoint" value={String(fromCheckpoint)} />
                        <SummaryTile label="Triggered by review" value={String(fromReview)} />
                    </div>
                </CardContent>
            </Card>

            {/* Diff cards */}
            {affected.length === 0 ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-10 flex flex-col items-center text-center gap-3">
                        <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-muted">
                            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">No modules at this revision</p>
                        <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                            Either this revision number doesn&apos;t exist yet, or every module kept its prior
                            revision. Check the revisions list for available revisions.
                        </p>
                        <Link
                            href={`/the-forge-v2/projects/${project.id}/revisions`}
                            className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                        >
                            Back to revisions <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-5">
                    {affected.map(m => (
                        <ModuleDiffCard key={m.id} module={m} projectId={project.id} />
                    ))}
                </div>
            )}
        </WorkspaceShell>
    )
}

// ─── Sub-components ────────────────────────────────────────────────────

function SummaryTile({ label, value }: { label: string; value: string }): React.ReactElement {
    return (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
                {label}
            </p>
            <p className="text-lg font-bold text-foreground tabular-nums leading-tight mt-0.5">
                {value}
            </p>
        </div>
    )
}

function ModuleDiffCard({
    module: mod,
    projectId,
}: {
    module: CadLabModule
    projectId: string
}): React.ReactElement {
    const snap = mod.conceptSnapshot
    const hasSnapshot = !!snap

    return (
        <Card className="rounded-xl border">
            <CardContent className="py-5 px-5 space-y-4">
                {/* Module header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-foreground leading-tight">
                                {mod.name}
                            </h3>
                            {mod.lastRevisionSource && (
                                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-muted text-muted-foreground border-border">
                                    {mod.lastRevisionSource}
                                </Badge>
                            )}
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-1">
                            Module ID: <code className="font-mono text-[11.5px]">{mod.id}</code>
                        </p>
                    </div>
                    <Link
                        href={`/the-forge-v2/projects/${projectId}/modules/${mod.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-international-orange hover:underline shrink-0"
                    >
                        Open module <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                {!hasSnapshot ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                            No pre-revision snapshot stored for this module. It landed at
                            revision v{mod.revisionNumber ?? 1} without recording its prior state —
                            so a two-column diff isn&apos;t possible. Current values shown in the
                            module page.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {STRING_FIELDS.map(key => {
                            const before = snap![key] ?? ""
                            const after = (mod[key] ?? "") as string
                            if (before === after && !before) return null
                            return (
                                <StringDiffRow
                                    key={key}
                                    label={FIELD_LABELS[key]}
                                    before={before}
                                    after={after}
                                />
                            )
                        })}
                        {LIST_FIELDS.map(key => {
                            const before = (snap![key] ?? []) as string[]
                            const after = (mod[key] ?? []) as string[]
                            if (before.length === 0 && after.length === 0) return null
                            return (
                                <ListDiffRow
                                    key={key}
                                    label={FIELD_LABELS[key]}
                                    before={before}
                                    after={after}
                                />
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function StringDiffRow({
    label,
    before,
    after,
}: {
    label: string
    before: string
    after: string
}): React.ReactElement {
    const unchanged = before === after
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    {label}
                </h4>
                {unchanged && (
                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-muted text-muted-foreground border-border">
                        Unchanged
                    </Badge>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <DiffColumn header="Before" tone="removed" empty={before.length === 0}>
                    <pre className={cn(
                        "whitespace-pre-wrap text-sm font-sans text-foreground leading-relaxed",
                        !unchanged && before.length > 0 && "bg-destructive/10",
                        "rounded-md px-3 py-2",
                    )}>
                        {before || "—"}
                    </pre>
                </DiffColumn>
                <DiffColumn header="After" tone="added" empty={after.length === 0}>
                    <pre className={cn(
                        "whitespace-pre-wrap text-sm font-sans text-foreground leading-relaxed",
                        !unchanged && after.length > 0 && "bg-status-success-light",
                        "rounded-md px-3 py-2",
                    )}>
                        {after || "—"}
                    </pre>
                </DiffColumn>
            </div>
        </div>
    )
}

function ListDiffRow({
    label,
    before,
    after,
}: {
    label: string
    before: string[]
    after: string[]
}): React.ReactElement {
    const beforeSet = new Set(before)
    const afterSet = new Set(after)
    const added = after.filter(x => !beforeSet.has(x))
    const removed = before.filter(x => !afterSet.has(x))
    const unchanged = added.length === 0 && removed.length === 0

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    {label}
                </h4>
                {unchanged ? (
                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-muted text-muted-foreground border-border">
                        Unchanged
                    </Badge>
                ) : (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                        {added.length > 0 && <span className="text-status-success font-semibold">+{added.length}</span>}
                        {added.length > 0 && removed.length > 0 && " · "}
                        {removed.length > 0 && <span className="text-destructive font-semibold">−{removed.length}</span>}
                    </span>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <DiffColumn header="Before" tone="removed" empty={before.length === 0}>
                    <ul className="space-y-1">
                        {before.length === 0 ? (
                            <li className="text-xs text-muted-foreground italic px-3 py-2">—</li>
                        ) : (
                            before.map((item, idx) => {
                                const isRemoved = !afterSet.has(item)
                                return (
                                    <li key={`${idx}-${item}`}>
                                        <pre className={cn(
                                            "whitespace-pre-wrap text-sm font-sans text-foreground leading-relaxed rounded-md px-3 py-1.5",
                                            isRemoved && "bg-destructive/10",
                                        )}>
                                            {isRemoved ? `− ${item}` : `  ${item}`}
                                        </pre>
                                    </li>
                                )
                            })
                        )}
                    </ul>
                </DiffColumn>
                <DiffColumn header="After" tone="added" empty={after.length === 0}>
                    <ul className="space-y-1">
                        {after.length === 0 ? (
                            <li className="text-xs text-muted-foreground italic px-3 py-2">—</li>
                        ) : (
                            after.map((item, idx) => {
                                const isAdded = !beforeSet.has(item)
                                return (
                                    <li key={`${idx}-${item}`}>
                                        <pre className={cn(
                                            "whitespace-pre-wrap text-sm font-sans text-foreground leading-relaxed rounded-md px-3 py-1.5",
                                            isAdded && "bg-status-success-light",
                                        )}>
                                            {isAdded ? `+ ${item}` : `  ${item}`}
                                        </pre>
                                    </li>
                                )
                            })
                        )}
                    </ul>
                </DiffColumn>
            </div>
        </div>
    )
}

function DiffColumn({
    header,
    tone,
    empty,
    children,
}: {
    header: string
    tone: "added" | "removed"
    empty: boolean
    children: React.ReactNode
}): React.ReactElement {
    const labelClass = tone === "added" ? "text-status-success" : "text-destructive"
    return (
        <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
                <span className={cn("text-[10px] font-bold uppercase tracking-widest", labelClass)}>
                    {header}
                </span>
                {empty && (
                    <span className="text-[10px] text-muted-foreground italic">empty</span>
                )}
            </div>
            <div className="p-2">
                {children}
            </div>
        </div>
    )
}
