/**
 * @file bom/page.tsx — /the-forge-v2/projects/:id/bom
 *
 * @description Bill of Materials: rolls up every part from every module into
 * one searchable list. Groups by material when possible. Empty state when
 * modules haven't generated parts yet.
 *
 * Mockup ref: FORGE-MOCKUP-BOM.html / FORGE-MOCKUP-EMPTY-BOM.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ListChecks, ArrowRight } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "BOM · The Forge" }
    return { title: `BOM · ${result.project.name}` }
}

export default async function ForgeV2BomPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules = project.modules ?? []

    // INTENT: module-level parts aren't persisted yet in cad_lab_projects. The
    // BOM rollup ships once a dedicated parts store lands (future PR). For now
    // we surface modules as BOM-worthy entities with their mass + key parts.
    interface Row { name: string; qty: number | null; material: string | null; process: string | null; moduleName: string; moduleId: string }
    const rows: Row[] = modules.flatMap(m => (m.keyParts ?? []).map(kp => ({
        name: kp,
        qty: null,
        material: null,
        process: null,
        moduleName: m.name,
        moduleId: m.id,
    })))
    void modules // reserved for when parts persist per-module
    const materialCount = 0

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "BOM" },
            ]}
            subtitle={rows.length === 0 ? "Bill of materials — no parts yet" : `${rows.length} parts · ${materialCount} materials across ${modules.length} modules`}
        >
            {rows.length === 0 ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                            <ListChecks className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="max-w-sm space-y-2">
                            <p className="text-sm font-semibold text-foreground">No parts in the BOM yet</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Parts populate after each module&apos;s CAD generation. Run the pipeline in CAD Lab to get started.
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
                <Card className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-[1fr_100px_150px_150px_1fr_32px] gap-3 px-5 py-3 border-b border-border bg-muted/30 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                        <span>Part</span>
                        <span className="text-right">Qty</span>
                        <span>Material</span>
                        <span>Process</span>
                        <span>Module</span>
                        <span />
                    </div>
                    {rows.map((r, idx) => (
                        <Link
                            key={`${r.moduleId}-${r.name}-${idx}`}
                            href={`/the-forge-v2/projects/${project.id}/modules/${r.moduleId}/parts/${encodeURIComponent(r.name)}`}
                            className="grid grid-cols-[1fr_100px_150px_150px_1fr_32px] gap-3 px-5 py-3 items-center text-sm border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors group"
                        >
                            <span className="font-medium text-foreground truncate group-hover:text-international-orange transition-colors">{r.name}</span>
                            <span className="text-right tabular-nums text-muted-foreground">{r.qty ?? '—'}</span>
                            <span className="text-muted-foreground truncate">
                                {r.material ? (
                                    <Badge variant="outline" className="text-[10.5px] font-mono bg-international-orange/10 text-international-orange border-international-orange/30">
                                        {r.material}
                                    </Badge>
                                ) : '—'}
                            </span>
                            <span className="text-muted-foreground truncate">{r.process ?? '—'}</span>
                            <span className="text-muted-foreground truncate text-[12px]">{r.moduleName}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                        </Link>
                    ))}
                </Card>
            )}
        </WorkspaceShell>
    )
}
