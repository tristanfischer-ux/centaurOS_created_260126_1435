/**
 * @file modules/page.tsx — /the-forge-v2/projects/:id/modules
 *
 * @description Module roster for a project: readiness chip per module,
 * failure-mode count, lead-time pill, mass-budget cell. Links to per-module
 * detail pages. Mockup ref: FORGE-MOCKUP-MODULES.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { AlertTriangle, ArrowRight, Clock, Boxes } from "lucide-react"

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
    if ("error" in result) return { title: "Modules · The Forge" }
    return { title: `Modules · ${result.project.name}` }
}

const STATUS_TONE: Record<CadLabModule['status'], { label: string; class: string }> = {
    pending:          { label: 'Pending',    class: 'bg-muted text-muted-foreground border-border' },
    researched:       { label: 'Researched', class: 'bg-electric-blue/10 text-electric-blue border-electric-blue/30' },
    interface_ready:  { label: 'Interface',  class: 'bg-status-warning-light text-status-warning border-status-warning/30' },
    specified:        { label: 'Specified',  class: 'bg-status-warning-light text-status-warning border-status-warning/30' },
    generated:        { label: 'Generated',  class: 'bg-status-success-light text-status-success border-status-success/30' },
    failed:           { label: 'Failed',     class: 'bg-destructive/10 text-destructive border-destructive/30' },
}

export default async function ForgeV2ModulesPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules = project.modules ?? []
    const massTotal = modules.reduce((sum, m) => sum + (m.estimatedMassKg ?? 0), 0)

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Modules" },
            ]}
            subtitle={`${modules.length} ${modules.length === 1 ? 'module' : 'modules'} · total estimated mass ${massTotal.toFixed(2)} kg`}
            primaryCta={{
                label: "Open CAD Lab",
                href: `/the-forge/cad-lab?project=${project.id}`,
            }}
        >
            {modules.length === 0 ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                            <Boxes className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">No modules yet</p>
                        <p className="text-xs text-muted-foreground max-w-sm">
                            Run decomposition in CAD Lab to break this concept into modules. Each module gets its own CAD pipeline + parts + review.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card className="rounded-xl border overflow-hidden">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_100px_100px_90px_90px_32px] gap-3 px-5 py-3 border-b border-border bg-muted/30 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                        <span>Module</span>
                        <span className="text-right">Mass</span>
                        <span className="text-right">Lead</span>
                        <span className="text-right">Failures</span>
                        <span className="text-right">Status</span>
                        <span />
                    </div>
                    {modules.map((m) => {
                        const tone = STATUS_TONE[m.status] ?? STATUS_TONE.pending
                        return (
                            <Link
                                key={m.id}
                                href={`/the-forge-v2/projects/${project.id}/modules/${m.id}`}
                                className="grid grid-cols-[1fr_100px_100px_90px_90px_32px] gap-3 px-5 py-4 items-center text-sm border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors group"
                            >
                                <div className="min-w-0">
                                    <div className="font-semibold text-foreground truncate group-hover:text-international-orange transition-colors">{m.name}</div>
                                    <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{m.purpose}</div>
                                </div>
                                <div className="text-right tabular-nums text-sm">
                                    {m.estimatedMassKg ? (
                                        <span>{m.estimatedMassKg.toFixed(2)} <span className="text-[10px] text-muted-foreground">kg</span></span>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </div>
                                <div className="text-right text-sm tabular-nums inline-flex items-center justify-end gap-1">
                                    {m.leadWeeks ? (
                                        <>
                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                            <span>{m.leadWeeks} <span className="text-[10px] text-muted-foreground">wk</span></span>
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </div>
                                <div className="text-right">
                                    {m.failureModes && m.failureModes.length > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-status-warning">
                                            <AlertTriangle className="h-3 w-3" />
                                            {m.failureModes.length}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground text-[11.5px]">0</span>
                                    )}
                                </div>
                                <div className="text-right">
                                    <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wide", tone.class)}>
                                        {tone.label}
                                    </Badge>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                            </Link>
                        )
                    })}
                </Card>
            )}
        </WorkspaceShell>
    )
}
