/**
 * @file modules/[moduleId]/page.tsx — /the-forge-v2/projects/:id/modules/:moduleId
 *
 * @description Module detail page — 10 sections per Tristan's verbal-depth
 * preservation rule (cross-phase):
 *   1. Description (paragraph)
 *   2. Why this module matters
 *   3. Inputs (list)
 *   4. Outputs (list)
 *   5. Key components (aka keyParts)
 *   6. Failure modes
 *   7. Unknowns (open questions)
 *   8. Lead time (pill)
 *   9. Design grounded in (material / template / mirrored-of references)
 *   10. Parts table (rolled up from module.result.parts)
 *
 * Fields map 1:1 to CadLabModule (src/lib/cad-lab-types.ts:330).
 *
 * Mockup ref: FORGE-MOCKUP-MODULE-DETAIL.html.
 */

import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    AlertTriangle,
    ArrowRight,
    HelpCircle,
    Clock,
    Layers,
    Wrench,
    ArrowLeftRight,
    Hammer,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; moduleId: string }> },
): Promise<Metadata> {
    const { id, moduleId } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Module · The Forge" }
    const mod = (result.project.modules ?? []).find(m => m.id === moduleId)
    return { title: `${mod?.name ?? 'Module'} · ${result.project.name}` }
}

const STATUS_TONE: Record<CadLabModule['status'], { label: string; class: string }> = {
    pending:          { label: 'Pending',    class: 'bg-muted text-muted-foreground border-border' },
    researched:       { label: 'Researched', class: 'bg-electric-blue/10 text-electric-blue border-electric-blue/30' },
    interface_ready:  { label: 'Interface',  class: 'bg-status-warning-light text-status-warning border-status-warning/30' },
    specified:        { label: 'Specified',  class: 'bg-status-warning-light text-status-warning border-status-warning/30' },
    generated:        { label: 'Generated',  class: 'bg-status-success-light text-status-success border-status-success/30' },
    failed:           { label: 'Failed',     class: 'bg-destructive/10 text-destructive border-destructive/30' },
}

export default async function ForgeV2ModuleDetailPage({
    params,
}: {
    params: Promise<{ id: string; moduleId: string }>
}): Promise<React.ReactNode> {
    const { id, moduleId } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const mod = (project.modules ?? []).find(m => m.id === moduleId)
    if (!mod) notFound()

    const tone = STATUS_TONE[mod.status] ?? STATUS_TONE.pending
    // INTENT: module-level parts data isn't persisted in cad_lab_projects today.
    // Parts surface here once a dedicated parts store ships (future PR). For now
    // we render the Parts section as an empty state with a CAD Lab deep-link.
    const parts: Array<{ name?: string; qty?: number; material?: string; process?: string }> = []
    const sectionIndex = [
        { id: 'description',  label: 'Description' },
        { id: 'why-it-matters',label: 'Why this module matters' },
        { id: 'inputs-outputs',label: 'Inputs & outputs' },
        { id: 'key-components', label: 'Key components' },
        { id: 'failure-modes',label: 'Failure modes' },
        { id: 'unknowns',     label: 'Unknowns' },
        { id: 'lead-time',    label: 'Lead time' },
        { id: 'grounded-in',  label: 'Design grounded in' },
        { id: 'parts',        label: 'Parts' },
    ]

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Modules", href: `/the-forge-v2/projects/${project.id}/modules` },
                { label: mod.name },
            ]}
            subtitle={mod.purpose}
            secondary={
                <Badge variant="outline" className={cn("text-[11px] font-semibold uppercase tracking-wide", tone.class)}>
                    {tone.label}
                </Badge>
            }
            primaryCta={{
                label: "Open CAD Lab",
                href: `/the-forge/cad-lab?project=${project.id}&module=${mod.id}`,
                icon: <Wrench className="h-3.5 w-3.5" />,
            }}
            maxWidth="narrow"
        >
            {/* Sticky in-page nav — pinned below header */}
            <nav aria-label="Module sections" className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
                {sectionIndex.map(s => (
                    <a key={s.id} href={`#${s.id}`} className="text-[11px] text-muted-foreground hover:text-international-orange transition-colors px-2 py-1 rounded-md hover:bg-muted">
                        {s.label}
                    </a>
                ))}
            </nav>

            {/* Module hero — blueprint image + stats strip */}
            {mod.imageUrl && (
                <div className="rounded-xl border bg-muted overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/40">
                        <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Module blueprint
                        </span>
                        {mod.imageModelUsed && (
                            <span className="text-[10px] text-muted-foreground/70">{mod.imageModelUsed}</span>
                        )}
                    </div>
                    <div className="aspect-[5/3] relative bg-foundry-50">
                        <Image
                            src={mod.imageUrl}
                            alt={`${mod.name} blueprint`}
                            fill
                            className="object-contain"
                            unoptimized
                        />
                    </div>
                </div>
            )}

            {/* Stats strip — mass / lead time / revision */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                    icon={<Hammer className="h-4 w-4" />}
                    label="Status"
                    value={tone.label}
                />
                <StatCard
                    icon={<Layers className="h-4 w-4" />}
                    label="Mass"
                    value={mod.estimatedMassKg ? `${mod.estimatedMassKg.toFixed(2)} kg` : '—'}
                />
                <StatCard
                    icon={<Clock className="h-4 w-4" />}
                    label="Lead time"
                    value={mod.leadWeeks ? `${mod.leadWeeks} wk` : '—'}
                />
                <StatCard
                    icon={<ArrowLeftRight className="h-4 w-4" />}
                    label="Revision"
                    value={mod.revisionNumber ? `v${mod.revisionNumber}` : 'v1'}
                />
            </div>

            {/* 1. Description */}
            <Section id="description" label="Description">
                {mod.description ? (
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{mod.description}</p>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No description yet. Regenerate or author in CAD Lab.</p>
                )}
            </Section>

            {/* 2. Why this module matters */}
            <Section id="why-it-matters" label="Why this module matters">
                {mod.whyItMatters ? (
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{mod.whyItMatters}</p>
                ) : (
                    <p className="text-sm text-muted-foreground italic">Mission-relevance not authored yet.</p>
                )}
            </Section>

            {/* 3 + 4. Inputs / Outputs */}
            <Section id="inputs-outputs" label="Inputs & outputs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Inputs</h3>
                        {mod.inputs && mod.inputs.length > 0 ? (
                            <ul className="space-y-1.5">
                                {mod.inputs.map((i, idx) => (
                                    <li key={idx} className="text-sm text-foreground inline-flex items-start gap-2 w-full">
                                        <span className="text-electric-blue mt-0.5">→</span>
                                        <span className="flex-1">{i}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">No inputs declared.</p>
                        )}
                    </div>
                    <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Outputs</h3>
                        {mod.outputs && mod.outputs.length > 0 ? (
                            <ul className="space-y-1.5">
                                {mod.outputs.map((o, idx) => (
                                    <li key={idx} className="text-sm text-foreground inline-flex items-start gap-2 w-full">
                                        <span className="text-international-orange mt-0.5">→</span>
                                        <span className="flex-1">{o}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">No outputs declared.</p>
                        )}
                    </div>
                </div>
            </Section>

            {/* 5. Key components */}
            <Section id="key-components" label="Key components">
                {mod.keyParts && mod.keyParts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                        {mod.keyParts.map((k, idx) => (
                            <Badge key={idx} variant="outline" className="text-[12px] bg-muted text-foreground border-border">
                                {k}
                            </Badge>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No key components declared.</p>
                )}
            </Section>

            {/* 6. Failure modes */}
            <Section id="failure-modes" label="Failure modes">
                {mod.failureModes && mod.failureModes.length > 0 ? (
                    <ul className="space-y-2">
                        {mod.failureModes.map((f, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                <AlertTriangle className="h-4 w-4 text-status-warning mt-0.5 shrink-0" />
                                <span>{f}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No failure modes declared. Run specialist review to surface them.</p>
                )}
            </Section>

            {/* 7. Unknowns */}
            <Section id="unknowns" label="Unknowns">
                {mod.unknowns && mod.unknowns.length > 0 ? (
                    <ul className="space-y-2">
                        {mod.unknowns.map((u, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                <HelpCircle className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                <span>{u}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No open questions recorded.</p>
                )}
            </Section>

            {/* 8. Lead time */}
            <Section id="lead-time" label="Lead time">
                {mod.leadWeeks ? (
                    <div className="inline-flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                        <Clock className="h-4 w-4 text-international-orange" />
                        <span className="text-sm">
                            <strong className="font-semibold">{mod.leadWeeks} weeks</strong>
                            <span className="text-muted-foreground"> · from RFQ to receipt</span>
                        </span>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">Lead-time estimate pending supplier selection.</p>
                )}
            </Section>

            {/* 9. Design grounded in */}
            <Section id="grounded-in" label="Design grounded in">
                <div className="space-y-2 text-sm text-foreground">
                    {mod.seedTemplateSlug && (
                        <p>
                            <strong className="font-semibold">Seed template:</strong>{" "}
                            <span className="font-mono text-[12.5px] text-international-orange">{mod.seedTemplateSlug}</span>
                        </p>
                    )}
                    {mod.mirrorOf && (
                        <p>
                            <strong className="font-semibold">Mirrors:</strong>{" "}
                            <Link
                                href={`/the-forge-v2/projects/${project.id}/modules/${mod.mirrorOf}`}
                                className="text-international-orange hover:underline font-medium"
                            >
                                {mod.mirrorOf}
                            </Link>
                        </p>
                    )}
                    {mod.templateMatchResult?.referenceTemplates && mod.templateMatchResult.referenceTemplates.length > 0 && (
                        <div>
                            <p className="font-semibold mb-1">Reference templates:</p>
                            <ul className="space-y-1 ml-2">
                                {mod.templateMatchResult.referenceTemplates.slice(0, 3).map((r, idx) => (
                                    <li key={idx} className="text-xs text-muted-foreground">
                                        <span className="font-mono">{r.slug}</span> · {r.name} <span className="text-[10px]">({(r.score * 100).toFixed(0)}%)</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {!mod.seedTemplateSlug && !mod.mirrorOf && !mod.templateMatchResult && (
                        <p className="text-muted-foreground italic">No template grounding yet.</p>
                    )}
                </div>
            </Section>

            {/* 10. Parts */}
            <Section id="parts" label={`Parts${parts.length > 0 ? ` (${parts.length})` : ''}`}>
                {parts.length > 0 ? (
                    <Card className="rounded-xl border overflow-hidden">
                        <div className="grid grid-cols-[1fr_100px_140px_140px_32px] gap-3 px-4 py-2.5 border-b border-border bg-muted/30 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                            <span>Part</span>
                            <span className="text-right">Qty</span>
                            <span>Material</span>
                            <span>Process</span>
                            <span />
                        </div>
                        {parts.map((p, idx) => (
                            <Link
                                key={idx}
                                href={`/the-forge-v2/projects/${project.id}/modules/${mod.id}/parts/${encodeURIComponent(p.name ?? String(idx))}`}
                                className="grid grid-cols-[1fr_100px_140px_140px_32px] gap-3 px-4 py-3 items-center text-sm border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors group"
                            >
                                <span className="font-medium text-foreground group-hover:text-international-orange transition-colors truncate">
                                    {p.name ?? `Part ${idx + 1}`}
                                </span>
                                <span className="text-right tabular-nums text-muted-foreground">
                                    {p.qty ?? '—'}
                                </span>
                                <span className="text-muted-foreground truncate">{p.material ?? '—'}</span>
                                <span className="text-muted-foreground truncate">{p.process ?? '—'}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                            </Link>
                        ))}
                    </Card>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No parts generated yet. Run CAD generation in CAD Lab.</p>
                )}
            </Section>
        </WorkspaceShell>
    )
}

// ─── Section wrapper ────────────────────────────────────────────────

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }): React.ReactElement {
    return (
        <section id={id} aria-labelledby={`${id}-heading`} className="space-y-3 scroll-mt-24">
            <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-international-orange" />
                <h2 id={`${id}-heading`} className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                    {label}
                </h2>
            </div>
            <Card className="rounded-xl border">
                <CardContent className="py-4 px-5">
                    {children}
                </CardContent>
            </Card>
        </section>
    )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }): React.ReactElement {
    return (
        <Card className="rounded-xl border">
            <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <span className="text-muted-foreground">{icon}</span>
                    <span className="text-[10.5px] font-bold uppercase tracking-widest">{label}</span>
                </div>
                <p className="text-base font-semibold text-foreground tabular-nums">{value}</p>
            </CardContent>
        </Card>
    )
}
