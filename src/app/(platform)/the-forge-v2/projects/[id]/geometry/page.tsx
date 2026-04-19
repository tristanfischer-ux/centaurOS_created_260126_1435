/**
 * @file geometry/page.tsx — /the-forge-v2/projects/:id/geometry
 *
 * @description Project-level Geometry surface: a summary card with the
 * integrated-assembly STEP/STL download links (when present) plus a grid
 * of module cards showing generated CAD thumbnails, status, and deep
 * links into the CAD Lab. Mockup reference: FORGE-MOCKUP-GEOMETRY.html.
 *
 * @related
 * - Action: loadCadLabProject from @/actions/cad-lab-projects
 * - Shell: ../../../_components/workspace-shell
 */

import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    Boxes,
    FileDown,
    Wrench,
    ArrowRight,
    Ruler,
    ImageIcon,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Geometry · The Forge" }
    return {
        title: `Geometry · ${result.project.name}`,
        description: `CAD assembly and per-module geometry for ${result.project.name}.`,
    }
}

const STATUS_TONE: Record<CadLabModule["status"], { label: string; class: string }> = {
    pending:         { label: "Pending",    class: "bg-muted text-muted-foreground border-border" },
    researched:      { label: "Researched", class: "bg-electric-blue/10 text-electric-blue border-electric-blue/30" },
    interface_ready: { label: "Interface",  class: "bg-status-warning-light text-status-warning border-status-warning/30" },
    specified:       { label: "Specified",  class: "bg-status-warning-light text-status-warning border-status-warning/30" },
    generated:       { label: "Generated",  class: "bg-status-success-light text-status-success border-status-success/30" },
    failed:          { label: "Failed",     class: "bg-destructive/10 text-destructive border-destructive/30" },
}

function hasModuleGeometry(m: CadLabModule): boolean {
    return !!(m.imageUrl || m.result?.stepUrl || m.result?.stlUrl)
}

export default async function ForgeV2GeometryPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []

    const modulesWithGeometry = modules.filter(hasModuleGeometry)
    const moduleGeometryCount = modulesWithGeometry.length
    const hasIntegratedAssembly = !!project.integratedAssemblyStepUrl || !!project.integratedAssemblyStlUrl
    const hasAnyGeometry = hasIntegratedAssembly || moduleGeometryCount > 0

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Geometry" },
            ]}
            subtitle="Integrated assembly · module STEP/STL · CAD deep links"
            primaryCta={{
                label: "Open CAD Lab",
                href: `/the-forge/cad-lab?project=${project.id}`,
                icon: <Wrench className="h-3.5 w-3.5" />,
            }}
        >
            {/* Integrated assembly summary */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                            <span className="flex items-center justify-center w-10 h-10 rounded-md bg-international-orange/10 text-international-orange shrink-0">
                                <Boxes className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-base font-semibold text-foreground tracking-tight">
                                    Integrated system assembly
                                </h2>
                                <p className="text-[12.5px] text-muted-foreground mt-0.5">
                                    Unified STEP / STL generated once every module has geometry.
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {hasIntegratedAssembly ? (
                                        <>
                                            {project.integratedAssemblyStepUrl && (
                                                <Badge variant="outline" className="text-[10.5px] font-medium bg-status-success-light text-status-success border-status-success/30">
                                                    STEP ready
                                                </Badge>
                                            )}
                                            {project.integratedAssemblyStlUrl && (
                                                <Badge variant="outline" className="text-[10.5px] font-medium bg-status-success-light text-status-success border-status-success/30">
                                                    STL ready
                                                </Badge>
                                            )}
                                            <Badge variant="outline" className="text-[10.5px] font-medium bg-international-orange/10 text-international-orange border-international-orange/30">
                                                rev {project.designRevision}
                                            </Badge>
                                        </>
                                    ) : (
                                        <Badge variant="outline" className="text-[10.5px] font-medium bg-muted text-muted-foreground border-border">
                                            Not yet assembled
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {project.integratedAssemblyStepUrl && (
                                <Button asChild size="sm" variant="outline" className="gap-1.5">
                                    <a href={project.integratedAssemblyStepUrl} download>
                                        <FileDown className="h-3.5 w-3.5" />
                                        STEP
                                    </a>
                                </Button>
                            )}
                            {project.integratedAssemblyStlUrl && (
                                <Button asChild size="sm" variant="outline" className="gap-1.5">
                                    <a href={project.integratedAssemblyStlUrl} download>
                                        <FileDown className="h-3.5 w-3.5" />
                                        STL
                                    </a>
                                </Button>
                            )}
                            <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                <Link href={`/the-forge/cad-lab?project=${project.id}`}>
                                    <Wrench className="h-3.5 w-3.5" />
                                    Open in CAD Lab
                                </Link>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Module geometry grid */}
            {modules.length > 0 ? (
                <section aria-labelledby="module-geometry-heading" className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-international-orange" />
                        <Ruler className="h-4 w-4 text-international-orange" />
                        <h2 id="module-geometry-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Module geometry · {moduleGeometryCount} of {modules.length} with CAD output
                        </h2>
                    </div>
                    {moduleGeometryCount === 0 && (
                        <Card className="rounded-xl border border-dashed bg-muted/30">
                            <CardContent className="py-6 px-5 text-center text-sm text-muted-foreground">
                                No module has generated geometry yet. Run the CAD pipeline per module from the CAD Lab.
                            </CardContent>
                        </Card>
                    )}
                    {moduleGeometryCount > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {modules.map(m => (
                                <ModuleGeometryCard key={m.id} module={m} projectId={project.id} />
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <Card className="rounded-xl border border-dashed bg-gradient-to-br from-international-orange/[0.03] to-muted/30">
                    <CardContent className="py-10 px-6 flex flex-col items-center text-center gap-4">
                        <span className="flex items-center justify-center w-14 h-14 rounded-full bg-international-orange/10 text-international-orange">
                            <Boxes className="h-6 w-6" />
                        </span>
                        <div className="max-w-lg space-y-2">
                            <h2 className="text-lg font-semibold text-foreground tracking-tight">
                                Geometry arrives once the concept is decomposed
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Decompose your product into modules in the CAD Lab. Each module can then run
                                the research → interface → generate pipeline and produces a STEP/STL plus an
                                engineering illustration you&apos;ll see here.
                            </p>
                        </div>
                        <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                            <Link href={`/the-forge/cad-lab?project=${project.id}`}>
                                <Wrench className="h-3.5 w-3.5" />
                                Open CAD Lab
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!hasAnyGeometry && modules.length > 0 && (
                <p className="text-[12px] text-muted-foreground italic">
                    No module has generated geometry yet — nothing has been rolled up into an integrated
                    assembly.
                </p>
            )}
        </WorkspaceShell>
    )
}

// ─── Module card ───────────────────────────────────────────────────

function ModuleGeometryCard({
    module,
    projectId,
}: {
    module: CadLabModule
    projectId: string
}): React.ReactElement {
    const tone = STATUS_TONE[module.status] ?? STATUS_TONE.pending
    const thumbSrc = module.imageUrl ?? null

    return (
        <Card className={cn(
            "rounded-xl border overflow-hidden flex flex-col",
            "transition-all hover:shadow-md hover:-translate-y-0.5",
        )}>
            <div className="aspect-[4/3] relative bg-foundry-900 border-b border-border/50 flex items-center justify-center">
                {thumbSrc ? (
                    <Image
                        src={thumbSrc}
                        alt={`${module.name} geometry`}
                        fill
                        className="object-cover"
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 33vw"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-[11px]">No render yet</span>
                    </div>
                )}
                <div className="absolute top-2 left-2">
                    <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wide", tone.class)}>
                        {tone.label}
                    </Badge>
                </div>
            </div>
            <CardContent className="py-4 px-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground tracking-tight min-w-0">{module.name}</h3>
                </div>
                <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed mb-3 flex-1">
                    {module.purpose}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {module.result?.stepUrl && (
                        <Badge variant="outline" className="text-[10px] font-medium bg-status-success-light text-status-success border-status-success/30">
                            STEP
                        </Badge>
                    )}
                    {module.result?.stlUrl && (
                        <Badge variant="outline" className="text-[10px] font-medium bg-status-success-light text-status-success border-status-success/30">
                            STL
                        </Badge>
                    )}
                    {module.result?.massGrams && (
                        <Badge variant="outline" className="text-[10px] font-medium bg-electric-blue/10 text-electric-blue border-electric-blue/30">
                            {(module.result.massGrams / 1000).toFixed(2)} kg
                        </Badge>
                    )}
                </div>
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                    <Link
                        href={`/the-forge-v2/projects/${projectId}/modules/${module.id}`}
                        className="text-[11.5px] font-semibold text-muted-foreground hover:text-international-orange transition-colors"
                    >
                        Module detail
                    </Link>
                    <Link
                        href={`/the-forge/cad-lab?project=${projectId}&module=${module.id}`}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-international-orange hover:underline"
                    >
                        Open CAD Lab <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}
