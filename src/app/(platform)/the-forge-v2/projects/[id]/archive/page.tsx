/**
 * @file archive/page.tsx — /the-forge-v2/projects/:id/archive
 *
 * @description Action-intent page for archiving a Forge project. Frames
 * archiving as a discipline signal, not a failure — captures a reason, a
 * lesson-learned note, and preserves all primary research. No `archiveCadLabProject`
 * action exists yet; `deleteCadLabProject` exists but the mockup is explicit
 * that archive is not delete. The CTA stays disabled until a soft-archive
 * column ships, while the page still teaches the discipline.
 *
 * Mockup ref: FORGE-MOCKUP-ARCHIVE-PRODUCT.html.
 */

import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ShieldCheck, AlertTriangle } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { WorkspaceShell } from "../../../_components/workspace-shell"
import { ArchiveButton } from "./_components/archive-button"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Archive · The Forge" }
    return { title: `Archive · ${result.project.name}` }
}

interface ReasonRow { label: string; detail: string }

const REASONS: ReasonRow[] = [
    { label: 'Market too small', detail: 'SAM below the viable threshold — size the gap explicitly (e.g. £18m vs £50m needed).' },
    { label: "Unit economics don't work", detail: 'COGS above price × margin with no credible path to the crossover.' },
    { label: 'No credible moat', detail: 'Incumbents too entrenched, differentiation not defensible.' },
    { label: 'Team capability gap', detail: "Capability we won't realistically close within 12 months." },
    { label: 'Timing wrong', detail: 'Market not ready, or already mature and commoditised.' },
    { label: 'Superseded by another design', detail: 'A stronger hypothesis took the slot. Name the supersedor below.' },
    { label: 'Founder focus reallocated', detail: "The design is fine — you're choosing not to pursue it now." },
    { label: 'Other', detail: 'Free-text reason below. Be specific so the lesson is legible later.' },
]

export default async function ForgeV2ArchivePage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const projectHref = `/the-forge-v2/projects/${project.id}`

    const moduleTotal = (project.modules ?? []).length
    const checkpointCount = project.checkpoints ? Object.keys(project.checkpoints).length : 0
    const reviewCount = project.reviews ? Object.values(project.reviews).reduce((sum: number, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : 0

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: projectHref },
                { label: "Archive" },
            ]}
            subtitle="A disciplined kill is a stronger signal than a silent stall."
            maxWidth="narrow"
        >
            {/* Reassurance — archive is not destruction */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-international-orange mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-foreground">Archiving moves the project to Archive. It does not delete anything.</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Every artefact — brief, modules, failure modes, specialist reviews, cost estimates, RFQ drafts — persists. You can restore from Archive at any time. Archived projects stay searchable and referenceable from future projects as prior art.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Reason selector (stub) */}
            <section aria-labelledby="reason-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <h2 id="reason-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Why are you archiving? <span className="text-destructive">Required</span>
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-4">
                        <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-3">
                            The reason feeds the lessons-learned registry. Specific beats general — &quot;market too small&quot; is weaker than &quot;SAM of £18m below our £50m threshold&quot;.
                        </p>
                        <ul className="space-y-0">
                            {REASONS.map((reason, idx) => (
                                <li key={idx} className={`flex items-start gap-3 py-3 ${idx < REASONS.length - 1 ? 'border-b border-border/40' : ''}`}>
                                    <span className="mt-1 flex items-center justify-center w-4 h-4 rounded-full border-2 border-border shrink-0" aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-foreground">{reason.label}</p>
                                        <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-0.5">{reason.detail}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </section>

            {/* Lesson learned */}
            <section aria-labelledby="lesson-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-status-success" />
                    <h2 id="lesson-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        What did you learn?
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-4 space-y-2">
                        <Label htmlFor="archive-lesson">Lesson (optional but strongly recommended)</Label>
                        <Textarea
                            id="archive-lesson"
                            rows={5}
                            placeholder="e.g. SAM came in at £18m after 4 county-level interviews re-priced the unit down to £60. Lesson: in smallholder ag, the price ceiling is 0.5–1% of annual income, not willingness-to-pay. Next project should explore a service, not a device."
                            disabled
                        />
                        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                            Goes into the lessons-learned registry and appears as referenceable context in future projects. Most of the value of killing a hypothesis is the lesson, not the kill.
                        </p>
                    </CardContent>
                </Card>
            </section>

            {/* What is preserved */}
            <section aria-labelledby="preserve-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-electric-blue" />
                    <h2 id="preserve-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        What stays searchable
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-5">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <PreserveItem label="Brief" value={project.productOverview ? '1 version' : '—'} />
                            <PreserveItem label="Modules" value={moduleTotal > 0 ? `${moduleTotal}` : '—'} />
                            <PreserveItem label="Specialist reviews" value={reviewCount > 0 ? `${reviewCount}` : '—'} />
                            <PreserveItem label="Checkpoints" value={checkpointCount > 0 ? `${checkpointCount}` : '—'} />
                            <PreserveItem label="Design revision" value={`rev ${project.designRevision}`} />
                            <PreserveItem label="Linked RFQ" value={project.linkedRfqId ? '1' : '—'} />
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Side-effect list */}
            <section aria-labelledby="effects-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-status-warning" />
                    <AlertTriangle className="h-4 w-4 text-status-warning" />
                    <h2 id="effects-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        What changes after archiving
                    </h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-5">
                        <ul className="space-y-2 text-sm text-foreground leading-relaxed">
                            <li className="flex items-start gap-2">
                                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" />
                                <span>Workspace list <span className="font-semibold">hides this project</span> by default.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" />
                                <span>No specialist resurfaces it in suggestions or roll-ups.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" />
                                <span>Project appears in the <span className="font-semibold">Archive</span> tab (collapsed by default, expandable).</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" />
                                <span>Any future project referencing this one&apos;s evidence sees <span className="italic">(archived YYYY-MM-DD)</span> next to the citation.</span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </section>

            {/* CTA — real archiveCadLabProject call */}
            <ArchiveButton projectId={project.id} projectHref={projectHref} initialArchivedAt={project.archivedAt} />
        </WorkspaceShell>
    )
}

function PreserveItem({ label, value }: { label: string; value: string }): React.ReactElement {
    return (
        <div className="rounded-lg border border-border/60 bg-background p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">{value}</p>
        </div>
    )
}
