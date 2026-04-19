/**
 * @file cost/page.tsx — /the-forge-v2/projects/:id/cost
 *
 * @description Cost rollup by module. Reads aiCostEstimates JSONB. Shows
 * per-module cost with mass + material + process context when available.
 *
 * Mockup ref: FORGE-MOCKUP-COST.html / FORGE-MOCKUP-EMPTY-COST.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { PoundSterling, ArrowRight, TrendingUp } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Cost · The Forge" }
    return { title: `Cost · ${result.project.name}` }
}

export default async function ForgeV2CostPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules = project.modules ?? []
    const costEstimates = project.aiCostEstimates ?? {}

    interface Row {
        moduleId: string
        moduleName: string
        estimate: number | null
        mass: number | null
        override: number | null
    }
    const rows: Row[] = modules.map(m => {
        const est = costEstimates[m.id] as { totalCostPerUnit?: number } | undefined
        const override = m.costOverrides?.totalPerUnit ?? null
        return {
            moduleId: m.id,
            moduleName: m.name,
            estimate: typeof est?.totalCostPerUnit === 'number' ? est.totalCostPerUnit : null,
            mass: m.estimatedMassKg ?? null,
            override,
        }
    })
    const totalAllIn = rows.reduce((sum, r) => sum + (r.override ?? r.estimate ?? 0), 0)
    const hasEstimates = rows.some(r => r.estimate !== null || r.override !== null)

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Cost" },
            ]}
            subtitle={hasEstimates ? `£${Math.round(totalAllIn).toLocaleString()}/unit rolled up from ${rows.filter(r => r.estimate !== null).length} estimates` : "No cost estimates yet"}
        >
            {!hasEstimates ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                            <PoundSterling className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="max-w-sm space-y-2">
                            <p className="text-sm font-semibold text-foreground">No cost estimates yet</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Run specialist cost reviews per module in CAD Lab. Each review produces a material + labour estimate that rolls up here.
                            </p>
                        </div>
                        <Link
                            href={`/the-forge/cad-lab?project=${project.id}`}
                            className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                        >
                            Open CAD Lab <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Headline */}
                    <Card className="rounded-xl border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                        <CardContent className="py-4 px-5 flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10 text-international-orange">
                                <TrendingUp className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange mb-0.5">Unit cost (all-in)</p>
                                <p className="text-2xl font-bold text-foreground tabular-nums">£{Math.round(totalAllIn).toLocaleString()}<span className="text-sm text-muted-foreground font-medium"> /unit</span></p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">Rolled up across {rows.length} modules · ±20% confidence band</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-xl border overflow-hidden">
                        <div className="grid grid-cols-[1fr_120px_120px_120px_32px] gap-3 px-5 py-3 border-b border-border bg-muted/30 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                            <span>Module</span>
                            <span className="text-right">Mass</span>
                            <span className="text-right">Estimate</span>
                            <span className="text-right">Override</span>
                            <span />
                        </div>
                        {rows.map((r) => (
                            <Link
                                key={r.moduleId}
                                href={`/the-forge-v2/projects/${project.id}/modules/${r.moduleId}`}
                                className="grid grid-cols-[1fr_120px_120px_120px_32px] gap-3 px-5 py-3 items-center text-sm border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors group"
                            >
                                <span className="font-medium text-foreground truncate group-hover:text-international-orange transition-colors">{r.moduleName}</span>
                                <span className="text-right tabular-nums text-muted-foreground">{r.mass ? `${r.mass.toFixed(2)} kg` : '—'}</span>
                                <span className="text-right tabular-nums font-semibold text-foreground">
                                    {r.estimate !== null ? `£${Math.round(r.estimate).toLocaleString()}` : <span className="text-muted-foreground font-normal">—</span>}
                                </span>
                                <span className="text-right tabular-nums">
                                    {r.override !== null ? (
                                        <Badge variant="outline" className="text-[10.5px] bg-electric-blue/10 text-electric-blue border-electric-blue/30">
                                            £{Math.round(r.override).toLocaleString()}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                            </Link>
                        ))}
                    </Card>
                </>
            )}
        </WorkspaceShell>
    )
}
