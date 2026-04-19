/**
 * @file risks/page.tsx — /the-forge-v2/projects/:id/risks
 *
 * @description Risk register view — sources from module failureModes + unknowns
 * declared during decomposition. Dedicated risk entity lands in a later PR;
 * this view aggregates what's already captured.
 *
 * Mockup ref: FORGE-MOCKUP-RISKS.html / FORGE-MOCKUP-EMPTY-RISKS.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { AlertTriangle, HelpCircle, ArrowRight } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Risks · The Forge" }
    return { title: `Risks · ${result.project.name}` }
}

export default async function ForgeV2RisksPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules = project.modules ?? []

    const failureModes = modules.flatMap(m => (m.failureModes ?? []).map(fm => ({ module: m, text: fm })))
    const unknowns = modules.flatMap(m => (m.unknowns ?? []).map(u => ({ module: m, text: u })))
    const totalSignals = failureModes.length + unknowns.length

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Risks" },
            ]}
            subtitle={totalSignals === 0 ? "No risk signals yet" : `${failureModes.length} failure modes · ${unknowns.length} open questions`}
        >
            {totalSignals === 0 ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-status-success-light">
                            <AlertTriangle className="h-6 w-6 text-status-success" />
                        </div>
                        <div className="max-w-sm space-y-2">
                            <p className="text-sm font-semibold text-foreground">No risks declared yet</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Risks surface as modules are decomposed and reviewed. Dedicated risk authoring ships in a later PR — for now, add failure modes and unknowns per module.
                            </p>
                        </div>
                        <Link
                            href={`/the-forge-v2/projects/${project.id}/modules`}
                            className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                        >
                            Open modules <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <section aria-label="Failure modes">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-5 rounded-full bg-status-warning" />
                            <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                Failure modes ({failureModes.length})
                            </h2>
                        </div>
                        {failureModes.length === 0 ? (
                            <Card className="rounded-xl border"><CardContent className="py-6"><p className="text-sm text-muted-foreground italic text-center">No failure modes recorded.</p></CardContent></Card>
                        ) : (
                            <ul className="space-y-2">
                                {failureModes.map((f, idx) => (
                                    <li key={idx}>
                                        <Link
                                            href={`/the-forge-v2/projects/${project.id}/modules/${f.module.id}#failure-modes`}
                                            className="block rounded-xl border bg-background hover:bg-muted/30 hover:shadow-sm transition-all p-4 group"
                                        >
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 text-status-warning mt-0.5 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm text-foreground leading-relaxed">{f.text}</p>
                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                        <span className="font-semibold group-hover:text-international-orange transition-colors">{f.module.name}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                    <section aria-label="Unknowns">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-5 rounded-full bg-electric-blue" />
                            <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                Open questions ({unknowns.length})
                            </h2>
                        </div>
                        {unknowns.length === 0 ? (
                            <Card className="rounded-xl border"><CardContent className="py-6"><p className="text-sm text-muted-foreground italic text-center">No open questions recorded.</p></CardContent></Card>
                        ) : (
                            <ul className="space-y-2">
                                {unknowns.map((u, idx) => (
                                    <li key={idx}>
                                        <Link
                                            href={`/the-forge-v2/projects/${project.id}/modules/${u.module.id}#unknowns`}
                                            className="block rounded-xl border bg-background hover:bg-muted/30 hover:shadow-sm transition-all p-4 group"
                                        >
                                            <div className="flex items-start gap-2">
                                                <HelpCircle className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm text-foreground leading-relaxed">{u.text}</p>
                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                        <span className="font-semibold group-hover:text-international-orange transition-colors">{u.module.name}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </WorkspaceShell>
    )
}
