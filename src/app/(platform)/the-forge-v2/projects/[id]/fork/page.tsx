/**
 * @file fork/page.tsx — /the-forge-v2/projects/:id/fork
 *
 * @description Action-intent page that explains what a Fork is, previews the
 * variant's inherit-vs-rework delta, and captures variant name + market + why.
 * No fork action exists yet — the CTA is disabled with deliberate "coming soon"
 * tone. The page teaches the concept (forking preserves the artefact spine
 * across variants) so the founder can reason about whether to Fork, Archive,
 * or open a new project, even before the mutation is wired.
 *
 * Mockup ref: FORGE-MOCKUP-FORK.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { GitFork, ArrowRight, Boxes, Layers, Users, FileText, ListChecks, Truck, AlertTriangle, PoundSterling, Rocket } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Fork · The Forge" }
    return { title: `Fork · ${result.project.name}` }
}

interface SpineItem { icon: React.ComponentType<{ className?: string }>; title: string; detail: string; mode: 'carry' | 'rework' | 'new' }

const SPINE: SpineItem[] = [
    { icon: Layers, title: 'Modules', detail: 'Structure carries — same decomposition as parent', mode: 'carry' },
    { icon: Boxes, title: 'Geometry', detail: 'CAD spine carries — parameters re-evaluated for variant', mode: 'carry' },
    { icon: Users, title: 'Specialists', detail: 'Roster carries — add domain-specific advisors as needed', mode: 'carry' },
    { icon: FileText, title: 'Brief', detail: 'New — variant writes its own requirements envelope', mode: 'new' },
    { icon: ListChecks, title: 'BOM', detail: 'Reworked — deltas land here; shared parts stay linked', mode: 'rework' },
    { icon: Truck, title: 'Suppliers', detail: 'Reworked — re-filter for variant market constraints', mode: 'rework' },
    { icon: AlertTriangle, title: 'Risks', detail: 'New — variant-specific failure modes and unknowns', mode: 'new' },
    { icon: PoundSterling, title: 'Cost', detail: 'Reworked — new ceiling, new variance tolerance', mode: 'rework' },
    { icon: Rocket, title: 'Launch', detail: 'New — different gate, different target customer', mode: 'new' },
]

const MODE_STYLES = {
    carry: { badge: 'Carries forward', tone: 'bg-status-success-light text-status-success border-status-success/30' },
    rework: { badge: 'Reworks', tone: 'bg-international-orange/10 text-international-orange border-international-orange/30' },
    new: { badge: 'New', tone: 'bg-electric-blue/10 text-electric-blue border-electric-blue/30' },
} as const

export default async function ForgeV2ForkPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const projectHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: projectHref },
                { label: "Fork" },
            ]}
            subtitle="Create a variant — same spine, new market, fresh requirements."
            maxWidth="narrow"
        >
            {/* Intent callout */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <GitFork className="h-5 w-5 text-international-orange mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-foreground">What forking does</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Forking creates a new Forge project that inherits this project&apos;s Modules, Geometry, and Specialist roster. Brief, BOM, Suppliers, Risks, Cost, and Launch are re-authored for the new variant. The parent project stays untouched — both live as sibling records.
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">Use Fork when:</span> same product, different market (defence, maritime, export-grade, cold-weather). Use a new project when the design spine changes.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Fork type picker — visual only (disabled stub) */}
            <section aria-labelledby="fork-kind" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <h2 id="fork-kind" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Fork kind
                    </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Card className="rounded-xl border opacity-70">
                        <CardContent className="py-4 px-4 space-y-1.5">
                            <p className="text-sm font-semibold text-foreground">Minor revision</p>
                            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                                Same product, same market. Incremental change — tolerance tightening, supplier swap. Carries 95%+ of BOM.
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="rounded-xl border-2 border-international-orange/50">
                        <CardContent className="py-4 px-4 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">Variant</p>
                                <Badge variant="outline" className="text-[10px] font-semibold bg-international-orange/10 text-international-orange border-international-orange/30">
                                    Default
                                </Badge>
                            </div>
                            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                                Same product spine, new market. Re-runs Brief, BOM deltas, Risks, Suppliers, Cost. E.g. maritime, cold-weather, export-grade.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* Variant form (stub) */}
            <section aria-labelledby="variant-form" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <h2 id="variant-form" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Variant details
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-5 px-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="fork-name">Variant name</Label>
                            <Input
                                id="fork-name"
                                placeholder={`${project.name} v1.1`}
                                defaultValue=""
                                disabled
                            />
                            <p className="text-[11.5px] text-muted-foreground">Shown in the workspace alongside the parent.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fork-market">Target market</Label>
                            <Input
                                id="fork-market"
                                placeholder="e.g. Maritime — NATO STANAG 4569, saltwater exposure, GPS-denied nav"
                                disabled
                            />
                            <p className="text-[11.5px] text-muted-foreground">Drives supplier filters, regulatory envelope, risk register defaults.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fork-why">Why fork</Label>
                            <Textarea
                                id="fork-why"
                                placeholder="Customer ask, pilot commitment, or compliance driver. Specific enough that the fork justifies itself six months from now."
                                rows={4}
                                disabled
                            />
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Spine preview */}
            <section aria-labelledby="spine-preview" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-status-success" />
                    <h2 id="spine-preview" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        What carries · what reworks · what is new
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-4">
                        <ul className="space-y-0">
                            {SPINE.map((item, idx) => {
                                const style = MODE_STYLES[item.mode]
                                const Icon = item.icon
                                return (
                                    <li key={idx} className={`flex items-start gap-3 py-3 ${idx < SPINE.length - 1 ? 'border-b border-border/40' : ''}`}>
                                        <span className="flex items-center justify-center w-8 h-8 rounded-md bg-muted text-muted-foreground shrink-0">
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                                                <Badge variant="outline" className={`text-[10px] font-semibold ${style.tone}`}>
                                                    {style.badge}
                                                </Badge>
                                            </div>
                                            <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-0.5">{item.detail}</p>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </CardContent>
                </Card>
            </section>

            {/* CTA strip — disabled, coming soon */}
            <Card className="rounded-xl border bg-muted/30">
                <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Forking lands in a later PR</p>
                        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                            The fork mutation — carrying Modules + Geometry forward, scaffolding a new Brief and empty BOM — is not wired yet. For now, open a fresh project and reference this one by hand.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button asChild size="sm" variant="secondary">
                            <Link href={projectHref}>Back to project</Link>
                        </Button>
                        <Button size="sm" disabled className="gap-1.5">
                            Create variant <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </WorkspaceShell>
    )
}
