/**
 * @file launch/page.tsx — /the-forge-v2/projects/:id/launch
 *
 * @description Launch checklist + handoff package preview. Reads the project
 * and derives a launch-readiness state for each gate (brief captured, modules
 * generated, specialist reviews completed, cost estimates present, risks
 * logged, suppliers / RFQ matched). Each item lights green / amber / red
 * based on what's actually in the project. The primary CTA "Ship handoff
 * package" is stubbed — handoff package generation lives in a later PR.
 *
 * Mockup refs: FORGE-MOCKUP-LAUNCH.html, FORGE-MOCKUP-LAUNCH-HANDOFF.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Rocket, CheckCircle2, AlertTriangle, Circle, ArrowRight, Package } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Launch · The Forge" }
    return { title: `Launch · ${result.project.name}` }
}

type GateState = 'green' | 'amber' | 'red'

interface Gate {
    label: string
    detail: string
    state: GateState
    owner: string
}

const STATE_STYLES = {
    green: { badge: 'Ready', tone: 'bg-status-success-light text-status-success border-status-success/30', Icon: CheckCircle2, iconClass: 'text-status-success' },
    amber: { badge: 'Partial', tone: 'bg-international-orange/10 text-international-orange border-international-orange/30', Icon: AlertTriangle, iconClass: 'text-status-warning' },
    red: { badge: 'Blocker', tone: 'bg-destructive/10 text-destructive border-destructive/30', Icon: Circle, iconClass: 'text-destructive' },
} as const

export default async function ForgeV2LaunchPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const projectHref = `/the-forge-v2/projects/${project.id}`

    const modules = project.modules ?? []
    const moduleTotal = modules.length
    const moduleGenerated = modules.filter(m => m.status === 'generated' || m.status === 'specified' || m.status === 'interface_ready').length

    const briefState: GateState = project.productOverview ? 'green' : 'red'

    const modulesState: GateState =
        moduleTotal === 0 ? 'red' :
        moduleGenerated === moduleTotal ? 'green' : 'amber'

    const reviewCount = project.reviews ? Object.values(project.reviews).reduce((sum: number, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : 0
    const reviewsState: GateState =
        reviewCount === 0 ? 'red' :
        reviewCount < moduleTotal ? 'amber' : 'green'

    const costEstimates = project.aiCostEstimates ?? {}
    const costCount = Object.keys(costEstimates).length
    const costState: GateState =
        costCount === 0 ? 'red' :
        costCount < moduleTotal ? 'amber' : 'green'

    const failureModeCount = modules.reduce((sum, m) => sum + (m.failureModes?.length ?? 0), 0)
    const unknownCount = modules.reduce((sum, m) => sum + (m.unknowns?.length ?? 0), 0)
    const riskState: GateState =
        failureModeCount + unknownCount === 0 ? 'amber' : 'green'

    const suppliersState: GateState =
        project.linkedRfqId ? 'green' : 'amber'

    const outputsReady = Boolean(project.integratedAssemblyStepUrl) && Boolean(project.systemIllustrationUrl)
    const outputsState: GateState =
        outputsReady ? 'green' :
        project.systemIllustrationUrl || project.integratedAssemblyStepUrl ? 'amber' : 'red'

    const gates: Gate[] = [
        {
            label: 'Brief captured',
            detail: project.productOverview ? `${String(project.productOverview).split(/\s+/).length} words of product overview.` : 'No product overview yet — author the brief before shipping.',
            state: briefState,
            owner: 'Founder',
        },
        {
            label: 'Modules generated',
            detail: moduleTotal === 0 ? 'Run decomposition to define the system architecture.' : `${moduleGenerated} of ${moduleTotal} modules generated or specified.`,
            state: modulesState,
            owner: 'Jian · VP Engineering',
        },
        {
            label: 'Specialist reviews',
            detail: reviewCount === 0 ? 'No reviews yet — each module should carry at least one specialist verdict.' : `${reviewCount} reviews across ${moduleTotal || '—'} modules.`,
            state: reviewsState,
            owner: 'Specialist roster',
        },
        {
            label: 'Cost estimates',
            detail: costCount === 0 ? 'No cost estimates yet — rolls up the unit economics.' : `${costCount} of ${moduleTotal || '—'} modules costed.`,
            state: costState,
            owner: 'Finn · Finance',
        },
        {
            label: 'Risks logged',
            detail: failureModeCount + unknownCount === 0 ? 'No failure modes or unknowns declared — either uncommonly clean or under-scrutinised.' : `${failureModeCount} failure modes + ${unknownCount} open questions captured.`,
            state: riskState,
            owner: 'Engineering lead',
        },
        {
            label: 'Suppliers / RFQ matched',
            detail: project.linkedRfqId ? 'RFQ linked — supplier matching in motion.' : 'No RFQ linked yet — run supplier match or create an RFQ from CAD Lab.',
            state: suppliersState,
            owner: 'Chase · Supply',
        },
        {
            label: 'Integrated outputs',
            detail: outputsReady ? 'System illustration + integrated assembly both ready for handoff.' : project.integratedAssemblyStepUrl || project.systemIllustrationUrl ? 'Partial — one of illustration / STEP missing.' : 'Generate hero illustration and integrated STEP before shipping.',
            state: outputsState,
            owner: 'Tool pipeline',
        },
    ]

    const blockers = gates.filter(g => g.state === 'red').length
    const partial = gates.filter(g => g.state === 'amber').length
    const ready = gates.filter(g => g.state === 'green').length
    const allGreen = ready === gates.length

    const stageReady = project.stage === 'generated' || project.stage === 'complete'

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: projectHref },
                { label: "Launch" },
            ]}
            subtitle={allGreen ? "All gates green — handoff package ready to ship." : `${blockers} blocker${blockers === 1 ? '' : 's'} · ${partial} partial · ${ready} ready`}
            maxWidth="narrow"
        >
            {/* Readiness hero */}
            <Card className={`rounded-xl border border-l-[3px] ${allGreen ? 'border-l-status-success' : blockers > 0 ? 'border-l-destructive' : 'border-l-international-orange'}`}>
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <Rocket className={`h-5 w-5 mt-0.5 shrink-0 ${allGreen ? 'text-status-success' : blockers > 0 ? 'text-destructive' : 'text-international-orange'}`} />
                    <div className="space-y-1.5 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                            {allGreen
                                ? 'Clear to ship — the handoff package can be generated.'
                                : stageReady
                                    ? 'Design stage ready, but launch gates still have gaps.'
                                    : 'Launch is a deliberate handoff — the design stage needs to reach generated first.'}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Launching freezes the current revision as the &quot;as-designed&quot; record and generates a handoff package (brief, modules, BOM rollup, cost rollup, risks register, supplier roster, integrated outputs). The Forge project stays browseable as a permanent build-time record; future edits flow through as new revisions.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Gate summary strip */}
            <div className="grid grid-cols-3 gap-3">
                <SummaryTile label="Ready" value={ready} tone="green" />
                <SummaryTile label="Partial" value={partial} tone="amber" />
                <SummaryTile label="Blockers" value={blockers} tone="red" />
            </div>

            {/* Gate checklist */}
            <section aria-labelledby="gates-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <h2 id="gates-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Pre-launch gates
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-4">
                        <ul className="space-y-0">
                            {gates.map((gate, idx) => {
                                const style = STATE_STYLES[gate.state]
                                const Icon = style.Icon
                                return (
                                    <li key={idx} className={`flex items-start gap-3 py-3 ${idx < gates.length - 1 ? 'border-b border-border/40' : ''}`}>
                                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.iconClass}`} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-foreground">{gate.label}</p>
                                                <Badge variant="outline" className={`text-[10px] font-semibold ${style.tone}`}>
                                                    {style.badge}
                                                </Badge>
                                            </div>
                                            <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-0.5">{gate.detail}</p>
                                            <p className="text-[11px] text-muted-foreground/80 mt-1">Owner · {gate.owner}</p>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </CardContent>
                </Card>
            </section>

            {/* Handoff package preview */}
            <section aria-labelledby="package-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-status-success" />
                    <Package className="h-4 w-4 text-status-success" />
                    <h2 id="package-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Handoff package
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-5">
                        <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-3">
                            On ship, ForgeOS compiles a read-only snapshot bundling every artefact at the current revision. Distributable to manufacturing partners, investors, and auditors.
                        </p>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground">
                            <PackageItem label="Brief (rev A)" note="Locked narrative + key requirements" />
                            <PackageItem label="Modules" note={`${moduleTotal} modules with interfaces and failure modes`} />
                            <PackageItem label="BOM rollup" note="Key parts per module" />
                            <PackageItem label="Cost rollup" note={costCount > 0 ? `${costCount} module estimates` : 'Pending'} />
                            <PackageItem label="Risk register" note={`${failureModeCount + unknownCount} items`} />
                            <PackageItem label="Integrated outputs" note={outputsReady ? 'Illustration + STEP' : 'Partial'} />
                        </ul>
                    </CardContent>
                </Card>
            </section>

            {/* CTA strip — stub */}
            <Card className="rounded-xl border bg-muted/30">
                <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <Badge variant="outline" className="text-[10px] font-semibold bg-international-orange/10 text-international-orange border-international-orange/30">
                            Coming soon
                        </Badge>
                        <p className="text-sm font-semibold text-foreground mt-1">
                            Handoff package generation lands in a later PR
                        </p>
                        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                            Close the remaining gates above. Shipping will flip the project to a read-only &quot;as-designed&quot; record and bundle the handoff package for download.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button asChild size="sm" variant="secondary">
                            <Link href={projectHref}>Back to project</Link>
                        </Button>
                        <Button size="sm" disabled className="gap-1.5">
                            <Rocket className="h-3.5 w-3.5" />
                            Ship handoff package
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </WorkspaceShell>
    )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' }): React.ReactElement {
    const border = tone === 'green' ? 'border-t-status-success' : tone === 'amber' ? 'border-t-status-warning' : 'border-t-destructive'
    const text = tone === 'green' ? 'text-status-success' : tone === 'amber' ? 'text-status-warning' : 'text-destructive'
    return (
        <Card className={`rounded-xl border border-t-[3px] ${border}`}>
            <CardContent className="py-4 px-4">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold tabular-nums mt-0.5 ${text}`}>{value}</p>
            </CardContent>
        </Card>
    )
}

function PackageItem({ label, note }: { label: string; note: string }): React.ReactElement {
    return (
        <li className="rounded-lg border border-border/60 bg-background p-3">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">{note}</p>
        </li>
    )
}
