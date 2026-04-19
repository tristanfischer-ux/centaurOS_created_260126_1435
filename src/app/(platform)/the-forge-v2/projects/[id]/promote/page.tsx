/**
 * @file promote/page.tsx — /the-forge-v2/projects/:id/promote
 *
 * @description Action-intent page that explains what "Promote to Product" does
 * before the founder commits. Reads the CAD Lab project + any pre-existing
 * linked product (via `getProductByCadLabProjectId`) and renders a preview of
 * the product row that would be created — name, description, hero image, seeded
 * lifecycle (concept vs prototyping), and rollup unit cost.
 *
 * The wired-up action is `promoteFromCadLab` (src/actions/products.ts), which
 * is also fired automatically via `autoPromoteIfComplete` when a design reaches
 * `generated`. This page is the deliberate / pre-auto surface — it explains the
 * outcome before committing, so the decision stays legible for founders who
 * haven't hit "complete" yet. The primary CTA still routes to Products (since
 * autoPromote landed the row) rather than executing a mutation here — we do
 * not want a second promote path that can diverge from autoPromote.
 *
 * Mockup refs: FORGE-MOCKUP-PROMOTE.html, FORGE-MOCKUP-PROMOTE-TO-FORGE.html.
 */

import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ShieldCheck, ArrowRight, Sparkles, CheckCircle2, Circle } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { getProductByCadLabProjectId } from "@/actions/products"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Promote · The Forge" }
    return { title: `Promote · ${result.project.name}` }
}

export default async function ForgeV2PromotePage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const projectHref = `/the-forge-v2/projects/${project.id}`

    const linked = await getProductByCadLabProjectId(project.id)
    const existingProduct = "error" in linked ? null : linked.data

    const isComplete = project.stage === 'generated' || project.stage === 'complete'
    const targetLifecycle = isComplete ? 'prototyping' : 'concept'

    const costEstimates = project.aiCostEstimates ?? {}
    const rollupCogs = Object.values(costEstimates).reduce((sum: number, est) => {
        const v = (est as { totalCostPerUnit?: number })?.totalCostPerUnit
        return sum + (typeof v === 'number' ? v : 0)
    }, 0)
    const hasCogs = rollupCogs > 0

    const moduleTotal = (project.modules ?? []).length
    const readinessItems: Array<{ label: string; detail: string; done: boolean }> = [
        {
            label: 'Brief captured',
            detail: project.productOverview ? 'Product overview populated' : 'No overview — product description will be thin',
            done: Boolean(project.productOverview),
        },
        {
            label: 'Modules decomposed',
            detail: moduleTotal > 0 ? `${moduleTotal} modules ready for product-side rollup` : 'No modules yet — promote anyway or decompose first',
            done: moduleTotal > 0,
        },
        {
            label: 'Cost envelope seeded',
            detail: hasCogs ? `£${Math.round(rollupCogs).toLocaleString()}/unit rolls up to Product COGS` : 'No specialist cost estimates — Product starts without unit economics',
            done: hasCogs,
        },
        {
            label: 'Hero illustration',
            detail: project.systemIllustrationUrl ? 'Will seed the Product hero image' : 'No illustration — Product will render without hero',
            done: Boolean(project.systemIllustrationUrl),
        },
        {
            label: 'Design complete',
            detail: isComplete ? 'Lifecycle will start at prototyping' : 'Lifecycle will start at concept (earlier-stage row)',
            done: isComplete,
        },
    ]

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: projectHref },
                { label: "Promote to Product" },
            ]}
            subtitle="Create a Product row that carries this design into the commercial surface."
            maxWidth="narrow"
        >
            {/* Intent callout */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-international-orange mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-foreground">What promoting does</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Promoting creates a row in the <span className="font-semibold text-foreground">Products</span> surface, linked back to this Forge project. Products owns the commercial story (pricing, assumption tests, LOIs, market sizing); the Forge project keeps owning the build artefacts. Nothing in this workspace changes — the Forge project remains editable and canonical for engineering.
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">Reversible:</span> you can delete the Product row at any time; the Forge project is untouched.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* If already promoted: show linked product */}
            {existingProduct ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-5 px-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-status-success mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">Already linked to a Product</p>
                                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                                    This project is already promoted as <span className="font-semibold text-foreground">{existingProduct.name}</span>
                                    {' '}({existingProduct.lifecycle}). Changes to the Forge project flow through as build signals; Products owns market validation.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                            <Button asChild size="sm" variant="secondary">
                                <Link href={projectHref}>Back to project</Link>
                            </Button>
                            <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                <Link href={`/products/${existingProduct.id}`}>
                                    Open Product <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Preview card of the Product row that would be created */}
                    <section aria-labelledby="preview-heading" className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 rounded-full bg-international-orange" />
                            <Sparkles className="h-4 w-4 text-international-orange" />
                            <h2 id="preview-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                Preview · what the Product row will look like
                            </h2>
                        </div>
                        <Card className="rounded-xl border overflow-hidden">
                            {project.systemIllustrationUrl && (
                                <div className="aspect-[16/5] relative bg-muted">
                                    <Image
                                        src={project.systemIllustrationUrl}
                                        alt={`${project.name} hero`}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </div>
                            )}
                            <CardContent className="py-5 px-5 space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                            Product name
                                        </p>
                                        <p className="text-lg font-bold text-foreground leading-tight mt-0.5">
                                            {project.name}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-xs font-semibold bg-international-orange/10 text-international-orange border-international-orange/30 shrink-0">
                                        {targetLifecycle}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                        Description
                                    </p>
                                    <p className="text-sm text-foreground leading-relaxed mt-1">
                                        {project.productOverview ?? project.subject ?? (
                                            <span className="italic text-muted-foreground">No description — Products row will start empty.</span>
                                        )}
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
                                    <div>
                                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">Lifecycle seed</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5 capitalize">{targetLifecycle}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">Unit COGS</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">
                                            {hasCogs ? `£${Math.round(rollupCogs).toLocaleString()}` : '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">Link</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5">This Forge project</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* Readiness checklist */}
                    <section aria-labelledby="readiness-heading" className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 rounded-full bg-status-success" />
                            <h2 id="readiness-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                Readiness signals
                            </h2>
                        </div>
                        <Card className="rounded-xl border">
                            <CardContent className="py-4 px-5">
                                <ul className="space-y-0">
                                    {readinessItems.map((item, idx) => (
                                        <li key={idx} className={`flex items-start gap-3 py-3 ${idx < readinessItems.length - 1 ? 'border-b border-border/40' : ''}`}>
                                            {item.done ? (
                                                <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            ) : (
                                                <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                                                <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-0.5">{item.detail}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    </section>

                    {/* CTA strip — promote is handled by autoPromoteIfComplete on design
                        completion. We surface the intent + preview but do not run a
                        second mutation here, to avoid divergent paths. The CTA points
                        at Products where the row lands after auto-promote. */}
                    <Card className="rounded-xl border">
                        <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">
                                    Auto-promotion on completion
                                </p>
                                <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                                    Promotion runs automatically when this design reaches <span className="font-semibold">generated</span> status or an RFQ is created.
                                    {isComplete
                                        ? ' This design is ready — refresh in a few seconds or open Products to confirm.'
                                        : ' Complete the design (or issue an RFQ) to trigger automatic promotion.'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Button asChild size="sm" variant="secondary">
                                    <Link href={projectHref}>Back to project</Link>
                                </Button>
                                <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                    <Link href="/products">
                                        Open Products <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </WorkspaceShell>
    )
}
