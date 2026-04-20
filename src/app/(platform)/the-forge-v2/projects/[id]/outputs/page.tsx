/**
 * @file outputs/page.tsx — /the-forge-v2/projects/:id/outputs
 *
 * @description Project-level Outputs surface: every exportable artefact
 * produced by the project — hero illustration, integrated STEP/STL,
 * per-module blueprints, and a placeholder tile for the investor deck
 * that ships later. Mockup reference: FORGE-MOCKUP-EXPORT.html.
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
    FileOutput,
    FileDown,
    Presentation,
    Image as ImageLucide,
    Boxes,
    ArrowRight,
    Sparkles,
    Package,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../_components/workspace-shell"
import { InvestorDeckButton } from "./_components/investor-deck-button"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Outputs · The Forge" }
    return {
        title: `Outputs · ${result.project.name}`,
        description: `Exports and deliverables for ${result.project.name}.`,
    }
}

// ─── Artefact item model ───────────────────────────────────────────

interface ArtefactItem {
    key: string
    kind: "hero" | "step" | "stl" | "module-blueprint" | "investor-deck"
    title: string
    subtitle: string
    thumbSrc?: string | null
    downloadHref?: string | null
    linkHref?: string
    sizeLabel?: string
    ready: boolean
    icon: React.ComponentType<{ className?: string }>
    extraBadge?: string
}

function buildArtefactList(
    project: { id: string; name: string; designRevision: number; systemIllustrationUrl: string | null; integratedAssemblyStepUrl: string | null; integratedAssemblyStlUrl: string | null },
    modules: CadLabModule[],
): ArtefactItem[] {
    const items: ArtefactItem[] = []

    // Hero illustration
    items.push({
        key: "hero",
        kind: "hero",
        title: "System hero illustration",
        subtitle: project.systemIllustrationUrl ? `rev ${project.designRevision} · publish-ready render` : "Generated once the concept is stable",
        thumbSrc: project.systemIllustrationUrl,
        downloadHref: project.systemIllustrationUrl,
        ready: !!project.systemIllustrationUrl,
        icon: ImageLucide,
        extraBadge: project.systemIllustrationUrl ? "PNG" : undefined,
    })

    // Integrated assembly STEP
    items.push({
        key: "assembly-step",
        kind: "step",
        title: "Integrated assembly · STEP",
        subtitle: project.integratedAssemblyStepUrl ? "Neutral-format CAD for procurement and DfM review" : "Rolls up once every module has geometry",
        downloadHref: project.integratedAssemblyStepUrl,
        ready: !!project.integratedAssemblyStepUrl,
        icon: Boxes,
        extraBadge: project.integratedAssemblyStepUrl ? "STEP" : undefined,
    })

    // Integrated assembly STL
    items.push({
        key: "assembly-stl",
        kind: "stl",
        title: "Integrated assembly · STL",
        subtitle: project.integratedAssemblyStlUrl ? "Mesh export for viewers, 3D print, and visualisation" : "Available alongside STEP once modules merge",
        downloadHref: project.integratedAssemblyStlUrl,
        ready: !!project.integratedAssemblyStlUrl,
        icon: Package,
        extraBadge: project.integratedAssemblyStlUrl ? "STL" : undefined,
    })

    // Per-module blueprints
    for (const m of modules) {
        const hasImage = !!m.imageUrl
        const hasStep = !!m.result?.stepUrl
        const hasStl = !!m.result?.stlUrl
        if (!hasImage && !hasStep && !hasStl) continue

        items.push({
            key: `module-${m.id}`,
            kind: "module-blueprint",
            title: `Module blueprint · ${m.name}`,
            subtitle: m.purpose || "Per-module engineering illustration and geometry",
            thumbSrc: m.imageUrl ?? null,
            downloadHref: m.imageUrl ?? m.result?.stepUrl ?? m.result?.stlUrl ?? null,
            linkHref: `/the-forge-v2/projects/${project.id}/modules/${m.id}`,
            ready: hasImage || hasStep || hasStl,
            icon: ImageLucide,
            extraBadge: hasStep ? "STEP" : hasStl ? "STL" : "Render",
        })
    }

    // Investor-facing handoff document (Markdown export of brief + modules + risks).
    // Wired to exportProjectHandoffMarkdown action.
    items.push({
        key: "investor-deck",
        kind: "investor-deck",
        title: "Investor handoff (Markdown)",
        subtitle: "Auto-assembled from brief + modules + risks · ready for any deck tool",
        ready: true,
        icon: Presentation,
        extraBadge: "MD",
    })

    return items
}

export default async function ForgeV2OutputsPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []

    const artefacts = buildArtefactList(project, modules)
    const readyCount = artefacts.filter(a => a.ready).length
    const moduleBlueprintCount = artefacts.filter(a => a.kind === "module-blueprint").length

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Outputs" },
            ]}
            subtitle="Hero render · integrated STEP/STL · module blueprints · investor deck"
        >
            {/* Summary tile */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-md bg-international-orange/10 text-international-orange shrink-0">
                        <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange mb-1">
                            Export gallery
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">
                            <strong className="font-semibold tabular-nums">{readyCount} of {artefacts.length}</strong> artefacts ready.{" "}
                            {moduleBlueprintCount > 0
                                ? <>Per-module blueprints cover <strong>{moduleBlueprintCount}</strong> of {modules.length} modules.</>
                                : <>Module blueprints appear as each module finishes generation.</>
                            }
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Gallery grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {artefacts.map(a => (
                    <ArtefactTile key={a.key} artefact={a} projectId={project.id} />
                ))}
            </div>
        </WorkspaceShell>
    )
}

// ─── Tile component ────────────────────────────────────────────────

function ArtefactTile({ artefact, projectId }: { artefact: ArtefactItem; projectId: string }): React.ReactElement {
    const Icon = artefact.icon
    const pillTone = artefact.ready
        ? "bg-status-success-light text-status-success border-status-success/30"
        : artefact.kind === "investor-deck"
            ? "bg-purple-100 text-purple-700 border-purple-300"
            : "bg-muted text-muted-foreground border-border"
    const pillLabel = artefact.ready ? "Ready" : artefact.kind === "investor-deck" ? "Coming soon" : "Pending"
    return (
        <Card className={cn(
            "rounded-xl border overflow-hidden flex flex-col",
            "transition-all hover:shadow-md hover:-translate-y-0.5",
        )}>
            {/* Thumbnail strip */}
            <div className="aspect-[4/3] relative bg-foundry-900 border-b border-border/50 flex items-center justify-center overflow-hidden">
                {artefact.thumbSrc ? (
                    <Image
                        src={artefact.thumbSrc}
                        alt={artefact.title}
                        fill
                        className="object-cover"
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 33vw"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Icon className="h-8 w-8" />
                        <span className="text-[11px]">{artefact.ready ? "No preview" : "Not generated yet"}</span>
                    </div>
                )}
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wide", pillTone)}>
                        {pillLabel}
                    </Badge>
                    {artefact.extraBadge && artefact.ready && (
                        <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide bg-international-orange/10 text-international-orange border-international-orange/30">
                            {artefact.extraBadge}
                        </Badge>
                    )}
                </div>
            </div>
            {/* Body */}
            <CardContent className="py-4 px-4 flex-1 flex flex-col">
                <div className="flex items-start gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground tracking-tight min-w-0 line-clamp-2">{artefact.title}</h3>
                </div>
                <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed mb-3 flex-1">
                    {artefact.subtitle}
                </p>
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                    {artefact.linkHref && (
                        <Link
                            href={artefact.linkHref}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground hover:text-international-orange transition-colors"
                        >
                            Detail <ArrowRight className="h-3 w-3" />
                        </Link>
                    )}
                    {artefact.kind === "investor-deck" ? (
                        <InvestorDeckButton projectId={projectId} />
                    ) : artefact.ready && artefact.downloadHref ? (
                        <Button asChild size="sm" variant="outline" className="gap-1.5 ml-auto">
                            <a href={artefact.downloadHref} download>
                                <FileDown className="h-3.5 w-3.5" />
                                Download
                            </a>
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 ml-auto"
                            disabled
                            aria-disabled="true"
                            title="This artefact has not been generated yet"
                        >
                            <FileDown className="h-3.5 w-3.5" />
                            Pending
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
