/**
 * @file projects/[id]/page.tsx — /the-forge-v2/projects/:id project detail.
 *
 * @description Project cockpit: hero illustration + health strip + 9-artefact
 * grid (Define cluster — Brief · Modules · BOM; Deliver cluster — Suppliers ·
 * Cost · Risks; Integrate cluster — Geometry · Operations · Outputs). Each
 * artefact card is colour-coded by state and links to its drill-in route.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-WORKSPACE.html (health-strip + artefact-grid)
 * - Action: loadCadLabProject from @/actions/cad-lab-projects
 * - Cards: ../../_components/artefact-card.tsx
 * - Shell: ../../_components/workspace-shell.tsx
 */

import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    FileText,
    Layers,
    ListChecks,
    Truck,
    PoundSterling,
    AlertTriangle,
    Boxes,
    Wrench,
    FileOutput,
    ArrowRight,
    Sparkles,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../_components/workspace-shell"
import { ArtefactCard, type ArtefactState } from "../../_components/artefact-card"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Project · The Forge" }
    return {
        title: `${result.project.name} · The Forge`,
        description: result.project.subject,
    }
}

export default async function ForgeV2ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []

    // ── Derived state ────────────────────────────────────────────────

    const moduleTotal = modules.length
    const moduleStable = modules.filter(m => m.status === 'generated' || m.status === 'specified' || m.status === 'interface_ready').length
    const modulePending = modules.filter(m => m.status === 'pending' || m.status === 'researched').length
    const moduleBlocked = modules.filter(m => m.status === 'failed').length
    const moduleFailureModeCount = modules.reduce((sum, m) => sum + (m.failureModes?.length ?? 0), 0)
    const moduleUnknownCount = modules.reduce((sum, m) => sum + (m.unknowns?.length ?? 0), 0)

    const massTotal = modules.reduce((sum, m) => sum + (m.estimatedMassKg ?? 0), 0)

    // INTENT: module-level parts aren't persisted yet. We surface module
    // keyParts as BOM-like signals until a dedicated parts store ships.
    const bomCount = modules.reduce((sum, m) => sum + (m.keyParts?.length ?? 0), 0)

    // Cost rollup from aiCostEstimates
    const costEstimates = project.aiCostEstimates ?? {}
    const totalUnitCost = Object.values(costEstimates).reduce((sum: number, est) => {
        const v = (est as { totalCostPerUnit?: number })?.totalCostPerUnit
        return sum + (typeof v === 'number' ? v : 0)
    }, 0)
    const costCeiling = null // target_unit_cost_gbp lives on the project row but isn't in CadLabProjectData — add later.
    const costOver = costCeiling !== null && totalUnitCost > costCeiling
    const costHasEstimates = Object.keys(costEstimates).length > 0

    // Reviews / risks — use failure modes + unknowns as proxy risk signals until
    // a dedicated risk register ships in a later PR.
    const riskSignals = moduleFailureModeCount + moduleUnknownCount
    const blockingRisks = moduleBlocked // proxy for blocking risks

    // Artefact states — green/amber/red/grey.
    const briefState: ArtefactState = project.productOverview ? 'green' : 'amber'
    const modulesState: ArtefactState =
        moduleTotal === 0 ? 'grey' :
        moduleBlocked > 0 ? 'red' :
        modulePending > 0 ? 'amber' : 'green'
    const bomState: ArtefactState =
        bomCount === 0 ? 'grey' :
        bomCount < 5 ? 'amber' : 'green'
    const suppliersState: ArtefactState = 'grey' // Supplier awards not yet tracked in cad_lab_projects; stub state.
    const costState: ArtefactState =
        !costHasEstimates ? 'grey' :
        costOver ? 'red' :
        totalUnitCost > 0 ? 'amber' : 'grey'
    const risksState: ArtefactState =
        blockingRisks > 0 ? 'red' :
        riskSignals > 0 ? 'amber' :
        moduleTotal > 0 ? 'green' : 'grey'
    const geometryState: ArtefactState = project.integratedAssemblyStepUrl ? 'green' : 'grey'
    const operationsState: ArtefactState = 'grey'
    const outputsState: ArtefactState =
        project.integratedAssemblyStepUrl || project.systemIllustrationUrl ? 'amber' : 'grey'

    const stageLabel =
        project.stage === 'complete' ? 'Complete' :
        project.stage === 'generated' ? 'Generated' :
        project.stage === 'interface_ready' ? 'Building' :
        project.stage === 'researched' ? 'Researched' : 'Draft'

    return (
        <WorkspaceShell
            crumbs={[{ label: "Workspace", href: "/the-forge-v2" }, { label: project.name }]}
            subtitle={project.subject}
            secondary={
                <Badge variant="outline" className="text-xs font-semibold bg-international-orange/10 text-international-orange border-international-orange/30">
                    {stageLabel}
                </Badge>
            }
            primaryCta={{
                label: "Open CAD Lab",
                href: `/the-forge/cad-lab?project=${project.id}`,
                icon: <Wrench className="h-3.5 w-3.5" />,
            }}
        >
            {/* Hero illustration */}
            {project.systemIllustrationUrl && (
                <div className="rounded-xl border bg-gradient-to-br from-electric-blue/[0.04] to-muted overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/50 bg-muted/30">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                            System illustration
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                            rev {project.designRevision}
                        </span>
                    </div>
                    <div className="aspect-[1000/330] relative bg-foundry-900">
                        <Image
                            src={project.systemIllustrationUrl}
                            alt={`${project.name} system illustration`}
                            fill
                            className="object-cover"
                            unoptimized
                            priority
                        />
                    </div>
                </div>
            )}

            {/* Health strip — 4 cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <HealthCard
                    state={modulesState}
                    label="Modules"
                    value={moduleTotal > 0 ? `${moduleStable}` : '—'}
                    suffix={moduleTotal > 0 ? ` of ${moduleTotal}` : ''}
                    detail={moduleTotal === 0 ? 'Not yet decomposed' : `${modulePending} pending · ${moduleBlocked} blocked`}
                />
                <HealthCard
                    state={massTotal > 0 ? 'amber' : 'grey'}
                    label="Mass budget"
                    value={massTotal > 0 ? massTotal.toFixed(2) : '—'}
                    suffix={massTotal > 0 ? ' kg' : ''}
                    detail={massTotal > 0 ? `Across ${modules.filter(m => m.estimatedMassKg).length} modules` : 'Per-module estimate pending'}
                />
                <HealthCard
                    state={costState}
                    label="Unit cost"
                    value={totalUnitCost > 0 ? `£${Math.round(totalUnitCost).toLocaleString()}` : '—'}
                    suffix={totalUnitCost > 0 ? '/unit' : ''}
                    detail={totalUnitCost === 0 ? 'Cost estimates pending' : 'All-in per-unit projection'}
                />
                <HealthCard
                    state={risksState}
                    label="Risk signals"
                    value={riskSignals > 0 ? String(riskSignals) : '0'}
                    detail={blockingRisks > 0 ? `${blockingRisks} blocking` : riskSignals === 0 ? 'None tracked' : 'Failure modes + unknowns'}
                />
            </div>

            {/* Resumed card — when the project was recently updated */}
            <ResumedBanner project={project} />

            {/* ─── DEFINE cluster ─── */}
            <section aria-labelledby="define-heading" className="space-y-3">
                <h2 id="define-heading" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Define — what you&apos;re making
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ArtefactCard
                        icon={FileText}
                        title="Brief"
                        subtitle="Intent · target markets · regulatory envelope"
                        body={project.productOverview ? (
                            <span className="line-clamp-3">{project.productOverview}</span>
                        ) : (
                            <span className="text-muted-foreground italic">No brief captured yet. Seeds from your research.</span>
                        )}
                        chips={[
                            project.productOverview
                                ? { label: `${String(project.productOverview).split(/\s+/).length} words`, tone: 'info' }
                                : { label: 'Draft', tone: 'muted' },
                            project.research?.designBrief ? { label: 'Design brief attached', tone: 'success' } : null,
                        ].filter(Boolean) as Array<{ label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'muted' }>}
                        footerLabel="Open Brief"
                        grounding={`rev ${project.designRevision}`}
                        state={briefState}
                        href={`/the-forge-v2/projects/${project.id}/brief`}
                    />
                    <ArtefactCard
                        icon={Layers}
                        title="Modules"
                        subtitle="Decomposition · interfaces · failure modes"
                        body={moduleTotal > 0 ? (
                            <>
                                <strong>{moduleTotal} modules</strong>
                                {moduleFailureModeCount > 0 && <>, {moduleFailureModeCount} failure modes</>}
                                {moduleUnknownCount > 0 && <>, {moduleUnknownCount} open questions</>}
                                .
                            </>
                        ) : (
                            <span className="text-muted-foreground italic">Run decomposition to break your concept into modules.</span>
                        )}
                        chips={moduleTotal > 0 ? [
                            { label: `${moduleStable} stable`, tone: 'success' },
                            modulePending > 0 ? { label: `${modulePending} pending`, tone: 'warning' } : null,
                            moduleBlocked > 0 ? { label: `${moduleBlocked} failed`, tone: 'danger' } : null,
                        ].filter(Boolean) as Array<{ label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> : [{ label: 'Not started', tone: 'muted' }]}
                        footerLabel="Open Modules"
                        grounding={project.checkpoints ? `${Object.keys(project.checkpoints).length} specialist reviews` : undefined}
                        state={modulesState}
                        href={`/the-forge-v2/projects/${project.id}/modules`}
                    />
                    <ArtefactCard
                        icon={ListChecks}
                        title="BOM"
                        subtitle="Parts · qty · material · tolerance · cost"
                        body={bomCount > 0 ? (
                            <><strong>{bomCount} key components</strong> listed across {modules.filter(m => (m.keyParts?.length ?? 0) > 0).length} modules.</>
                        ) : (
                            <span className="text-muted-foreground italic">Generate module parts to populate the bill of materials.</span>
                        )}
                        chips={bomCount > 0 ? [
                            { label: `${bomCount} parts`, tone: 'info' },
                        ] : [{ label: 'Empty', tone: 'muted' }]}
                        footerLabel="Open BOM"
                        state={bomState}
                        href={`/the-forge-v2/projects/${project.id}/bom`}
                    />
                </div>
            </section>

            {/* ─── DELIVER cluster ─── */}
            <section aria-labelledby="deliver-heading" className="space-y-3">
                <h2 id="deliver-heading" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Deliver — who builds it · how much · what breaks
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ArtefactCard
                        icon={Truck}
                        title="Suppliers"
                        subtitle="Lifecycle · NDA · RFQ · quotes · awards"
                        body={<span className="text-muted-foreground italic">Supplier awards land in a follow-up PR. RFQs can already be created from CAD Lab.</span>}
                        chips={[
                            project.linkedRfqId ? { label: '1 RFQ linked', tone: 'info' } : { label: 'No RFQs yet', tone: 'muted' },
                        ]}
                        footerLabel="Open Suppliers"
                        state={suppliersState}
                        href={`/the-forge-v2/projects/${project.id}/suppliers`}
                    />
                    <ArtefactCard
                        icon={PoundSterling}
                        title="Cost"
                        subtitle="Unit · landed · tooling · labour"
                        body={totalUnitCost > 0 ? (
                            <><strong>£{Math.round(totalUnitCost).toLocaleString()}/unit</strong> all-in, rolled up from {Object.keys(costEstimates).length} modules.</>
                        ) : (
                            <span className="text-muted-foreground italic">Specialist cost estimates run per module — none yet.</span>
                        )}
                        chips={totalUnitCost > 0 ? [
                            { label: `${Object.keys(costEstimates).length} estimates`, tone: 'info' },
                            { label: '±20% band', tone: 'warning' },
                        ] : [{ label: 'Empty', tone: 'muted' }]}
                        footerLabel="Open Cost"
                        state={costState}
                        href={`/the-forge-v2/projects/${project.id}/cost`}
                    />
                    <ArtefactCard
                        icon={AlertTriangle}
                        title="Risks"
                        subtitle="Failure modes · unknowns · mitigations"
                        body={riskSignals > 0 ? (
                            <><strong>{moduleFailureModeCount} failure modes</strong> + <strong>{moduleUnknownCount} open questions</strong> declared across modules.</>
                        ) : (
                            <span className="text-muted-foreground italic">No risks declared yet — add via module decomposition or direct entry.</span>
                        )}
                        chips={riskSignals > 0 ? [
                            { label: `${moduleFailureModeCount} modes`, tone: 'warning' },
                            { label: `${moduleUnknownCount} open`, tone: 'info' },
                        ] : [{ label: 'Empty', tone: 'muted' }]}
                        footerLabel="Open Risks"
                        state={risksState}
                        href={`/the-forge-v2/projects/${project.id}/risks`}
                    />
                </div>
            </section>

            {/* ─── INTEGRATE cluster ─── */}
            <section aria-labelledby="integrate-heading" className="space-y-3">
                <h2 id="integrate-heading" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Integrate — how it comes together
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ArtefactCard
                        icon={Boxes}
                        title="Geometry"
                        subtitle="CAD models · assemblies · step files"
                        body={project.integratedAssemblyStepUrl ? (
                            <>Integrated assembly available. Each module&apos;s generated STEP/STL in CAD Lab.</>
                        ) : (
                            <span className="text-muted-foreground italic">Module geometry generates in CAD Lab once decomposition completes.</span>
                        )}
                        chips={project.integratedAssemblyStepUrl ? [
                            { label: 'Integrated STEP', tone: 'success' },
                        ] : [{ label: 'Pending', tone: 'muted' }]}
                        footerLabel="Open CAD Lab"
                        grounding={project.integratedAssemblyStlUrl ? 'STL + STEP ready' : undefined}
                        state={geometryState}
                        href={`/the-forge/cad-lab?project=${project.id}`}
                    />
                    <ArtefactCard
                        icon={Wrench}
                        title="Operations"
                        subtitle="Build sequence · assembly instructions"
                        body={<span className="text-muted-foreground italic">Build-order authoring ships in a later PR.</span>}
                        chips={[{ label: 'Coming soon', tone: 'muted' }]}
                        footerLabel="Placeholder"
                        state={operationsState}
                        href={`/the-forge-v2/projects/${project.id}`}
                    />
                    <ArtefactCard
                        icon={FileOutput}
                        title="Outputs"
                        subtitle="Exports · handoff packages · investor deck"
                        body={project.systemIllustrationUrl || project.integratedAssemblyStepUrl ? (
                            <>Hero illustration + integrated assembly available for export.</>
                        ) : (
                            <span className="text-muted-foreground italic">Generate exports after modules are stable.</span>
                        )}
                        chips={[
                            project.systemIllustrationUrl ? { label: 'System render', tone: 'success' } : null,
                            project.integratedAssemblyStepUrl ? { label: 'STEP assembly', tone: 'success' } : null,
                            !project.systemIllustrationUrl && !project.integratedAssemblyStepUrl ? { label: 'Empty', tone: 'muted' } : null,
                        ].filter(Boolean) as Array<{ label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'muted' }>}
                        footerLabel="Open Outputs"
                        state={outputsState}
                        href={`/agents/artifacts`}
                    />
                </div>
            </section>

            {/* Footer — link to modules list */}
            {moduleTotal > 0 && (
                <div className="pt-2">
                    <Link
                        href={`/the-forge-v2/projects/${project.id}/modules`}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-international-orange hover:underline"
                    >
                        Browse all {moduleTotal} modules
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            )}
        </WorkspaceShell>
    )
}

// ─── Sub-components ───────────────────────────────────────────────────

function HealthCard({
    state,
    label,
    value,
    suffix,
    detail,
}: {
    state: ArtefactState
    label: string
    value: string | number
    suffix?: string
    detail: string
}): React.ReactElement {
    const borderClass = {
        green: 'border-t-status-success',
        amber: 'border-t-status-warning',
        red: 'border-t-destructive',
        grey: 'border-t-muted-foreground/40',
    }[state]
    return (
        <Card className={cn("rounded-xl border border-t-[3px]", borderClass)}>
            <CardContent className="py-4 px-4">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    {label}
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums leading-tight">
                    {value}
                    {suffix && <span className="text-sm font-medium text-muted-foreground">{suffix}</span>}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{detail}</p>
            </CardContent>
        </Card>
    )
}

function ResumedBanner({ project }: { project: { updatedAt: string; stage: string; productOverview: string | null } }): React.ReactElement | null {
    const updatedDate = new Date(project.updatedAt)
    const hoursSince = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60)
    // Only show if updated within the last 72 hours
    if (hoursSince > 72) return null
    return (
        <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
            <CardContent className="py-4 px-5 flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-international-orange mt-0.5 shrink-0" />
                <div className="flex-1 text-sm text-foreground leading-relaxed">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange mb-1">
                        Where you left off
                    </p>
                    {project.productOverview ? (
                        <p className="line-clamp-2"><strong className="font-semibold">Current stage:</strong> {project.stage}. {project.productOverview}</p>
                    ) : (
                        <p>Project is at stage <strong className="font-semibold">{project.stage}</strong>. Continue in CAD Lab to advance.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
