/**
 * @file operations/page.tsx — /the-forge-v2/projects/:id/operations
 *
 * @description Project-level Operations surface: the build sequence and
 * assembly-instructions view. If any module has a `steps` / `sequence` /
 * `assembly_order` authoring payload in its JSONB (`code` or `result`
 * metadata), render the ordered sequence. Otherwise show a deliberate
 * empty state with a CTA back to the CAD Lab where build-order authoring
 * will ship in a later PR.
 *
 * Mockup reference: FORGE-MOCKUP-OPERATIONS.html. NB: the mockup depicts
 * the foundry-level retention surface; this project-level drill-in keeps
 * the same visual language (step-row card, project breadcrumb, artefact
 * chips) but narrows the scope to one product's build order.
 *
 * @related
 * - Action: loadCadLabProject from @/actions/cad-lab-projects
 * - Shell: ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    Wrench,
    ListOrdered,
    Layers,
    ArrowRight,
    CircleDot,
    ClipboardList,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Operations · The Forge" }
    return {
        title: `Operations · ${result.project.name}`,
        description: `Build sequence and assembly instructions for ${result.project.name}.`,
    }
}

// ─── Step extraction ────────────────────────────────────────────────
//
// Build-order authoring is not yet a first-class column on cad_lab_projects
// or cad_lab_modules. Until the dedicated store ships we opportunistically
// look for a `steps` / `sequence` / `assembly_order` array inside each
// module's `code` or `result` JSONB blob so we can render anything the
// authoring flow may already persist informally.

interface BuildStep {
    label: string
    detail?: string
}

function extractSteps(module: CadLabModule): BuildStep[] {
    const candidates: unknown[] = [
        (module as unknown as { steps?: unknown }).steps,
        (module as unknown as { sequence?: unknown }).sequence,
        (module as unknown as { assembly_order?: unknown }).assembly_order,
        (module.result as unknown as { steps?: unknown } | undefined)?.steps,
        (module.result as unknown as { assemblySequence?: unknown } | undefined)?.assemblySequence,
    ]

    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) continue
        const steps: BuildStep[] = []
        for (const entry of candidate) {
            if (typeof entry === "string" && entry.trim().length > 0) {
                steps.push({ label: entry.trim() })
            } else if (entry && typeof entry === "object") {
                const rec = entry as Record<string, unknown>
                const label = typeof rec.label === "string" ? rec.label
                    : typeof rec.name === "string" ? rec.name
                    : typeof rec.title === "string" ? rec.title
                    : null
                if (!label) continue
                const detail = typeof rec.detail === "string" ? rec.detail
                    : typeof rec.description === "string" ? rec.description
                    : undefined
                steps.push({ label, detail })
            }
        }
        if (steps.length > 0) return steps
    }
    return []
}

export default async function ForgeV2OperationsPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []

    const modulesWithSteps = modules
        .map(m => ({ module: m, steps: extractSteps(m) }))
        .filter(entry => entry.steps.length > 0)

    const totalSteps = modulesWithSteps.reduce((sum, e) => sum + e.steps.length, 0)
    const hasSequence = modulesWithSteps.length > 0

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Operations" },
            ]}
            subtitle="Build sequence · assembly instructions"
        >
            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <SummaryTile
                    icon={Layers}
                    label="Modules"
                    value={modules.length > 0 ? String(modules.length) : "—"}
                    detail={modules.length === 0 ? "Decompose the concept to begin" : `${modulesWithSteps.length} with build order`}
                />
                <SummaryTile
                    icon={ListOrdered}
                    label="Ordered steps"
                    value={totalSteps > 0 ? String(totalSteps) : "—"}
                    detail={totalSteps > 0 ? "Across all authored modules" : "No build-order authoring yet"}
                />
                <SummaryTile
                    icon={ClipboardList}
                    label="Assembly doc"
                    value={hasSequence ? "Draft" : "Pending"}
                    detail={hasSequence ? "Derived from module authoring" : "Ships with build-order editor"}
                />
            </div>

            {hasSequence ? (
                <section aria-labelledby="build-sequence-heading" className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-international-orange" />
                        <ListOrdered className="h-4 w-4 text-international-orange" />
                        <h2 id="build-sequence-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Build sequence · {totalSteps} ordered steps across {modulesWithSteps.length} modules
                        </h2>
                    </div>
                    <div className="space-y-4">
                        {modulesWithSteps.map(({ module, steps }, moduleIdx) => (
                            <Card key={module.id} className="rounded-xl border">
                                <CardContent className="py-5 px-5">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline" className="text-[10.5px] font-semibold uppercase tracking-wide bg-international-orange/10 text-international-orange border-international-orange/30">
                                                    Module {moduleIdx + 1}
                                                </Badge>
                                                <h3 className="text-base font-semibold text-foreground tracking-tight">{module.name}</h3>
                                            </div>
                                            <p className="text-[12.5px] text-muted-foreground line-clamp-2">{module.purpose}</p>
                                        </div>
                                        <Link
                                            href={`/the-forge-v2/projects/${project.id}/modules/${module.id}`}
                                            className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-semibold text-international-orange hover:underline"
                                        >
                                            Open module <ArrowRight className="h-3 w-3" />
                                        </Link>
                                    </div>
                                    <ol className="space-y-0">
                                        {steps.map((step, i) => (
                                            <li
                                                key={i}
                                                className={cn(
                                                    "flex items-start gap-3 py-2.5",
                                                    i < steps.length - 1 && "border-b border-border/40",
                                                )}
                                            >
                                                <span className="flex items-center justify-center w-7 h-7 rounded-md bg-international-orange/10 text-international-orange text-[11px] font-bold tabular-nums shrink-0">
                                                    {i + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground leading-tight">{step.label}</p>
                                                    {step.detail && (
                                                        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{step.detail}</p>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>
            ) : (
                <Card className="rounded-xl border border-dashed bg-gradient-to-br from-international-orange/[0.03] to-muted/30">
                    <CardContent className="py-10 px-6 flex flex-col items-center text-center gap-4">
                        <span className="flex items-center justify-center w-14 h-14 rounded-full bg-international-orange/10 text-international-orange">
                            <ListOrdered className="h-6 w-6" />
                        </span>
                        <div className="max-w-lg space-y-2">
                            <h2 className="text-lg font-semibold text-foreground tracking-tight">
                                Build-order authoring ships in a later PR
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Once modules are decomposed and geometry is stable, you&apos;ll
                                author the assembly sequence — step order, torque specs, fixture
                                callouts — and roll it up here as the project-level build
                                instructions.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button asChild size="sm" variant="outline">
                                <Link href={`/the-forge-v2/projects/${project.id}/modules`}>
                                    Review modules
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Module preview — what the build sequence will span once authored */}
            {modules.length > 0 && (
                <section aria-labelledby="ops-modules-heading" className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-international-orange" />
                        <Layers className="h-4 w-4 text-international-orange" />
                        <h2 id="ops-modules-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Modules the build order will span
                        </h2>
                    </div>
                    <Card className="rounded-xl border">
                        <CardContent className="py-4 px-5">
                            <ul className="space-y-0">
                                {modules.map((m, idx) => (
                                    <li
                                        key={m.id}
                                        className={cn(
                                            "flex items-start gap-3 py-2.5",
                                            idx < modules.length - 1 && "border-b border-border/40",
                                        )}
                                    >
                                        <CircleDot className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <Link
                                                href={`/the-forge-v2/projects/${project.id}/modules/${m.id}`}
                                                className="text-sm font-semibold text-foreground hover:text-international-orange transition-colors"
                                            >
                                                {m.name}
                                            </Link>
                                            <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{m.purpose}</p>
                                        </div>
                                        <span className="text-[10.5px] text-muted-foreground uppercase tracking-wide shrink-0">
                                            {m.leadWeeks ? `${m.leadWeeks}w lead` : "no lead"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </section>
            )}
        </WorkspaceShell>
    )
}

// ─── Sub-components ───────────────────────────────────────────────────

function SummaryTile({
    icon: Icon,
    label,
    value,
    detail,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
    detail: string
}): React.ReactElement {
    return (
        <Card className="rounded-xl border">
            <CardContent className="py-4 px-4">
                <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-9 h-9 rounded-md bg-international-orange/10 text-international-orange shrink-0">
                        <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
                            {label}
                        </p>
                        <p className="text-xl font-bold text-foreground tabular-nums leading-tight">{value}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{detail}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
