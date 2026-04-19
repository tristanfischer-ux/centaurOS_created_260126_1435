/**
 * @file brief/page.tsx — /the-forge-v2/projects/:id/brief
 *
 * @description Design brief view — product overview + design-brief fields from
 * research output. Read-only today; authoring / brief-lock ship in follow-up.
 *
 * Mockup ref: FORGE-MOCKUP-BRIEF.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { FileText, ArrowRight, Sparkles } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Brief · The Forge" }
    return { title: `Brief · ${result.project.name}` }
}

export default async function ForgeV2BriefPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const designBrief = project.research?.designBrief
    const overview = project.productOverview

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Brief" },
            ]}
            subtitle={overview ? "Intent · markets · regulatory envelope" : "Run research to seed a brief"}
            maxWidth="narrow"
        >
            {!overview && !designBrief ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="max-w-sm space-y-2">
                            <p className="text-sm font-semibold text-foreground">No brief captured yet</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                The brief seeds automatically from research and decomposition. Run the pipeline in CAD Lab to populate it, then edit here in a future release.
                            </p>
                        </div>
                        <Link
                            href={`/the-forge/cad-lab?project=${project.id}`}
                            className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                        >
                            <Sparkles className="h-3.5 w-3.5" /> Open CAD Lab <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {overview && (
                        <section aria-label="Product overview" className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-5 rounded-full bg-international-orange" />
                                <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">Product overview</h2>
                            </div>
                            <Card className="rounded-xl border">
                                <CardContent className="py-4 px-5">
                                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{overview}</p>
                                </CardContent>
                            </Card>
                        </section>
                    )}
                    {designBrief && (
                        <section aria-label="Design brief" className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-5 rounded-full bg-international-orange" />
                                <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">Design brief</h2>
                            </div>
                            <Card className="rounded-xl border">
                                <CardContent className="py-4 px-5">
                                    <pre className="whitespace-pre-wrap text-[13px] text-foreground font-sans leading-relaxed">
                                        {JSON.stringify(designBrief, null, 2)}
                                    </pre>
                                </CardContent>
                            </Card>
                        </section>
                    )}
                </>
            )}
        </WorkspaceShell>
    )
}
