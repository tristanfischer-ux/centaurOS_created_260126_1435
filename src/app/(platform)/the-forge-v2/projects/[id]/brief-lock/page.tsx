/**
 * @file brief-lock/page.tsx — /the-forge-v2/projects/:id/brief-lock
 *
 * @description Terminal confirmation surface for locking the brief. Shows the
 * current brief content, what ownership flips (Products → Forge), the pre-lock
 * checklist (derived from project state), and the lock CTA. The lock itself is
 * stubbed — persistence requires the `brief_locked_at` column migration which
 * is deferred. Local-state lock feedback lives in the `LockButton` client
 * component.
 *
 * Mockup ref: FORGE-MOCKUP-BRIEF-LOCK.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Lock, ShieldCheck, CheckCircle2, Circle, ArrowRight } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { WorkspaceShell } from "../../../_components/workspace-shell"

import { LockButton } from "./_components/lock-button"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Lock brief · The Forge" }
    return { title: `Lock brief · ${result.project.name}` }
}

export default async function ForgeV2BriefLockPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const projectHref = `/the-forge-v2/projects/${project.id}`
    const briefHref = `${projectHref}/brief`

    const modules = project.modules ?? []
    const moduleTotal = modules.length
    const costEstimates = project.aiCostEstimates ?? {}
    const overviewWordCount = project.productOverview ? String(project.productOverview).split(/\s+/).filter(Boolean).length : 0

    const checklist: Array<{ label: string; detail: string; done: boolean }> = [
        {
            label: 'Product overview captured',
            detail: overviewWordCount > 0 ? `${overviewWordCount} words in the narrative` : 'No overview yet — author the brief first',
            done: overviewWordCount > 0,
        },
        {
            label: 'Design brief attached',
            detail: project.research?.designBrief ? 'Research stage produced a structured design brief' : 'No design brief — run research on the project',
            done: Boolean(project.research?.designBrief),
        },
        {
            label: 'Modules decomposed',
            detail: moduleTotal > 0 ? `${moduleTotal} modules define the system architecture` : 'No modules yet — decomposition defines what the brief is for',
            done: moduleTotal > 0,
        },
        {
            label: 'Cost envelope seeded',
            detail: Object.keys(costEstimates).length > 0 ? `${Object.keys(costEstimates).length} module cost estimates rolled up` : 'No cost estimates — the brief anchors a cost ceiling after lock',
            done: Object.keys(costEstimates).length > 0,
        },
        {
            label: 'Founder review',
            detail: 'You confirm the current brief is the version that anchors every downstream artefact',
            done: false,
        },
    ]

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: projectHref },
                { label: "Brief", href: briefHref },
                { label: "Lock brief" },
            ]}
            subtitle="Terminal handoff — the brief becomes the canonical record that everything anchors to."
            maxWidth="narrow"
        >
            {/* Terminal callout */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <Lock className="h-5 w-5 text-international-orange mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-foreground">Locking the brief is the handoff contract</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            After lock, the brief becomes read-only. BOM, Suppliers, Risks, and Cost anchor to this revision. Every subsequent edit routes through a new revision (A → B → C) with an explicit diff audit trail. To change direction, open a Fork — the locked brief stays as provenance.
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">Cannot be undone without a fork.</span> Fork is cheap; unlock is expensive because it detaches every downstream artefact.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Current brief preview */}
            <section aria-labelledby="brief-preview" className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-international-orange" />
                        <h2 id="brief-preview" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Brief you&apos;re about to lock
                        </h2>
                    </div>
                    <Badge variant="outline" className="text-xs font-semibold bg-international-orange/10 text-international-orange border-international-orange/30">
                        rev {project.designRevision}
                    </Badge>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-5 px-5 space-y-4">
                        <div>
                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">Project</p>
                            <p className="text-lg font-bold text-foreground leading-tight mt-0.5">{project.name}</p>
                            {project.subject && (
                                <p className="text-sm text-muted-foreground mt-1">{project.subject}</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">Product overview</p>
                            {project.productOverview ? (
                                <p className="text-sm text-foreground leading-relaxed mt-1 whitespace-pre-wrap">{project.productOverview}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground italic mt-1">
                                    No overview yet — locking without a body freezes an empty record. Author the brief first.
                                </p>
                            )}
                        </div>
                        <div className="pt-2 border-t border-border">
                            <Link
                                href={briefHref}
                                className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                            >
                                Edit the brief before locking <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Ownership flip */}
            <section aria-labelledby="ownership-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-electric-blue" />
                    <ShieldCheck className="h-4 w-4 text-electric-blue" />
                    <h2 id="ownership-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Ownership flips from hypothesis to build
                    </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <OwnerCol
                        label="Stays in Products"
                        title="Read-only provenance"
                        items={['Market sizing', 'Customer segments', 'Competitive landscape', 'LOI pipeline', 'Interview transcripts']}
                    />
                    <OwnerCol
                        label="Crosses into Forge"
                        title="Becomes editable here"
                        items={['Target cost → cost ceiling', 'Key requirements → brief artefact', 'Customer LOIs → target customers', 'Lifecycle → prototyping', 'Regulatory envelope']}
                        emphasis
                    />
                    <OwnerCol
                        label="Born in Forge"
                        title="Initialises empty"
                        items={['BOM', 'Suppliers & RFQ', 'Risk register', 'Revision tree (rev A first)', 'Launch checklist']}
                    />
                </div>
            </section>

            {/* Pre-lock checklist */}
            <section aria-labelledby="pre-lock" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-status-success" />
                    <h2 id="pre-lock" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Pre-lock checklist
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-4">
                        <ul className="space-y-0">
                            {checklist.map((item, idx) => (
                                <li key={idx} className={`flex items-start gap-3 py-3 ${idx < checklist.length - 1 ? 'border-b border-border/40' : ''}`}>
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

            {/* Lock CTA (client component) */}
            <LockButton projectHref={projectHref} briefHref={briefHref} />
        </WorkspaceShell>
    )
}

function OwnerCol({ label, title, items, emphasis = false }: { label: string; title: string; items: string[]; emphasis?: boolean }): React.ReactElement {
    return (
        <Card className={`rounded-xl border ${emphasis ? 'border-international-orange/50 bg-international-orange/[0.03]' : ''}`}>
            <CardContent className="py-4 px-4 space-y-2">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
                <ul className="space-y-1 pt-2">
                    {items.map((item, idx) => (
                        <li key={idx} className="text-[12.5px] text-foreground leading-relaxed flex items-start gap-2">
                            <span className={`mt-2 w-1 h-1 rounded-full shrink-0 ${emphasis ? 'bg-international-orange' : 'bg-muted-foreground/60'}`} />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    )
}
