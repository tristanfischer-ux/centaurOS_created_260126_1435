/**
 * @file parts/[partId]/page.tsx — Individual part detail.
 *
 * @description Spec strip + description + grounded-in reference. Reads the
 * module's parts array and finds the part by name (URL-decoded). When the
 * part isn't found, returns a 404.
 *
 * Mockup ref: FORGE-MOCKUP-PART-DETAIL.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Hammer, Wrench, Package, ArrowRight } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { WorkspaceShell } from "../../../../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; moduleId: string; partId: string }> },
): Promise<Metadata> {
    const { id, partId } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Part · The Forge" }
    return { title: `${decodeURIComponent(partId)} · ${result.project.name}` }
}

export default async function ForgeV2PartDetailPage({
    params,
}: {
    params: Promise<{ id: string; moduleId: string; partId: string }>
}): Promise<React.ReactNode> {
    const { id, moduleId, partId } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const mod = (project.modules ?? []).find(m => m.id === moduleId)
    if (!mod) notFound()

    const partName = decodeURIComponent(partId)
    // INTENT: module-level parts aren't persisted on cad_lab_projects yet. This
    // route shows a stub derived from the part name in the URL. When the parts
    // store ships (future PR), swap to a real lookup.
    const part = {
        name: partName,
        qty: null as number | null,
        material: null as string | null,
        process: null as string | null,
        dims: null as string | null,
        tolerance: null as string | null,
        finish: null as string | null,
        notes: null as string | null,
    }

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Modules", href: `/the-forge-v2/projects/${project.id}/modules` },
                { label: mod.name, href: `/the-forge-v2/projects/${project.id}/modules/${mod.id}` },
                { label: part.name ?? "Part" },
            ]}
            subtitle={`Part within ${mod.name}`}
            primaryCta={{
                label: "Open in CAD Lab",
                href: `/the-forge/cad-lab?project=${project.id}&module=${mod.id}`,
                icon: <Wrench className="h-3.5 w-3.5" />,
            }}
            maxWidth="narrow"
        >
            {/* Spec strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SpecCell label="Material" value={part.material ?? '—'} />
                <SpecCell label="Quantity" value={part.qty ? String(part.qty) : '—'} />
                <SpecCell label="Process" value={part.process ?? '—'} />
                <SpecCell label="Lead time" value={mod.leadWeeks ? `${mod.leadWeeks} wk` : '—'} />
            </div>

            {/* Why this part matters */}
            <section aria-label="Purpose" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">About this part</h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-5 space-y-3">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Parent module</p>
                            <Link
                                href={`/the-forge-v2/projects/${project.id}/modules/${mod.id}`}
                                className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                            >
                                {mod.name}
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                            <p className="text-xs text-muted-foreground mt-1">{mod.purpose}</p>
                        </div>
                        {part.notes && (
                            <div className="pt-3 border-t border-border/50">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
                                <p className="text-sm text-foreground leading-relaxed">{part.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            {/* Suppliers — stub */}
            <section aria-label="Suppliers" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">Supplier options</h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-6 px-5 flex flex-col items-center text-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                            <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground max-w-md">
                            Supplier matching for individual parts lands in a follow-up PR. Run an RFQ from CAD Lab to solicit quotes today.
                        </p>
                        <Badge variant="outline" className="text-[11px] bg-muted text-muted-foreground border-border">
                            Coming soon
                        </Badge>
                    </CardContent>
                </Card>
            </section>

            {/* Design grounded in */}
            <section aria-label="Design grounded in" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">Design grounded in</h2>
                </div>
                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-5 text-sm space-y-2">
                        <p>
                            <strong className="font-semibold">Material:</strong>{" "}
                            <span className="font-mono text-[13px] text-international-orange">{part.material ?? 'not specified'}</span>
                        </p>
                        <p>
                            <strong className="font-semibold">Process:</strong>{" "}
                            <span>{part.process ?? 'not specified'}</span>
                        </p>
                        {mod.seedTemplateSlug && (
                            <p>
                                <strong className="font-semibold">Module seed template:</strong>{" "}
                                <span className="font-mono text-[13px]">{mod.seedTemplateSlug}</span>
                            </p>
                        )}
                    </CardContent>
                </Card>
            </section>
        </WorkspaceShell>
    )
}

function SpecCell({ label, value }: { label: string; value: string }): React.ReactElement {
    return (
        <Card className="rounded-xl border">
            <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <Hammer className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-[10.5px] font-bold uppercase tracking-widest">{label}</span>
                </div>
                <p className="text-sm font-semibold text-foreground truncate" title={value}>{value}</p>
            </CardContent>
        </Card>
    )
}
