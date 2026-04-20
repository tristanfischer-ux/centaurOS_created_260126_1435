/**
 * @file export/page.tsx — /the-forge-v2/projects/:id/export
 *
 * @description Export surface. Lists everything the project can export —
 * system illustration, per-module blueprints, integrated STEP/STL, BOM CSV,
 * and a stubbed "investor deck" button — with real download links where a
 * URL is on file, disabled rows otherwise. Deck generation is a stub (surface
 * a toast / disabled CTA) until the export spine ships.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-EXPORT.html
 * - Data:   loadCadLabProject from @/actions/cad-lab-projects
 * - Shell:  ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    FileOutput,
    ArrowLeft,
    Download,
    Image as ImageIcon,
    Layers,
    Boxes,
    ListChecks,
    Sparkles,
    ExternalLink,
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
    if ("error" in result) return { title: "Export · The Forge" }
    return {
        title: `Export · ${result.project.name}`,
        description: "Download illustrations, blueprints, STEP/STL assemblies, and the BOM CSV.",
    }
}

interface ExportItem {
    key: string
    icon: React.ComponentType<{ className?: string }>
    title: string
    sub: string
    href: string | null
    filename?: string
    tone: "sky" | "lime" | "purple" | "teal"
}

export default async function ForgeV2ExportPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []

    // System illustration (single, if generated)
    const systemIllustration: ExportItem = {
        key: "system-illustration",
        icon: ImageIcon,
        title: "System illustration",
        sub: project.systemIllustrationUrl
            ? `Hero render, design rev v${project.designRevision}.`
            : "Not generated yet — runs after decomposition.",
        href: project.systemIllustrationUrl ?? null,
        tone: "sky",
    }

    // Per-module blueprints (take the module's image / blueprint URL where available)
    const moduleBlueprints: ExportItem[] = modules.map(m => {
        // Module illustrations live under a few possible fields depending on generation path.
        const maybeUrl = (m as unknown as { illustrationUrl?: string | null; imageUrl?: string | null }).illustrationUrl
            ?? (m as unknown as { illustrationUrl?: string | null; imageUrl?: string | null }).imageUrl
            ?? null
        return {
            key: `module-${m.id}`,
            icon: Layers,
            title: `Module blueprint — ${m.name}`,
            sub: maybeUrl
                ? `${m.estimatedMassKg ? `${m.estimatedMassKg} kg · ` : ""}illustration available.`
                : "Illustration pending — generates from CAD Lab.",
            href: typeof maybeUrl === "string" ? maybeUrl : null,
            tone: "lime",
        }
    })

    // Integrated STEP / STL
    const stepItem: ExportItem = {
        key: "integrated-step",
        icon: Boxes,
        title: "Integrated assembly (STEP)",
        sub: project.integratedAssemblyStepUrl
            ? "STEP file of the full assembly, all modules merged."
            : "Not available yet — integrates after all modules generate.",
        href: project.integratedAssemblyStepUrl ?? null,
        filename: `${project.name}-assembly.step`,
        tone: "purple",
    }
    const stlItem: ExportItem = {
        key: "integrated-stl",
        icon: Boxes,
        title: "Integrated assembly (STL)",
        sub: project.integratedAssemblyStlUrl
            ? "STL mesh of the full assembly — good for previews."
            : "Not available yet.",
        href: project.integratedAssemblyStlUrl ?? null,
        filename: `${project.name}-assembly.stl`,
        tone: "purple",
    }

    // BOM CSV — stub for now; list it as an item even without a URL.
    const bomCount = modules.reduce((sum, m) => sum + (m.keyParts?.length ?? 0), 0)
    const bomItem: ExportItem = {
        key: "bom-csv",
        icon: ListChecks,
        title: "Bill of materials (CSV)",
        sub: bomCount > 0
            ? `${bomCount} key component${bomCount === 1 ? "" : "s"} across ${modules.filter(m => (m.keyParts?.length ?? 0) > 0).length} modules.`
            : "No parts declared yet. Run module decomposition first.",
        href: null, // CSV generator ships with the BOM spine
        tone: "teal",
    }

    const items: ExportItem[] = [
        systemIllustration,
        ...moduleBlueprints.slice(0, 8), // cap display; user can browse modules page for the rest
        stepItem,
        stlItem,
        bomItem,
    ]

    const availableCount = items.filter(i => i.href).length
    const backHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: backHref },
                { label: "Export" },
            ]}
            subtitle={`${availableCount} of ${items.length} export${items.length === 1 ? "" : "s"} ready to download.`}
            maxWidth="narrow"
        >
            {/* Checklist */}
            <Card className="rounded-xl border">
                <CardContent className="py-0 px-0">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <FileOutput className="h-4 w-4 text-international-orange" />
                            Exportable artefacts
                        </h2>
                        <Badge variant="outline" className="text-[10.5px] bg-muted/50 text-muted-foreground">
                            {availableCount} ready
                        </Badge>
                    </div>
                    <ul className="divide-y divide-border/60">
                        {items.map(item => (
                            <li key={item.key} className="flex items-start gap-3 px-6 py-3">
                                <div className={cn(
                                    "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
                                    item.tone === "sky" && "bg-sky-50 text-sky-700",
                                    item.tone === "lime" && "bg-lime-50 text-lime-700",
                                    item.tone === "purple" && "bg-purple-50 text-purple-700",
                                    item.tone === "teal" && "bg-teal-50 text-teal-700",
                                )}>
                                    <item.icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">
                                        {item.title}
                                    </p>
                                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                                        {item.sub}
                                    </p>
                                </div>
                                <div className="shrink-0 flex items-center">
                                    {item.href ? (
                                        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                                            <a href={item.href} download={item.filename} target="_blank" rel="noopener noreferrer">
                                                <Download className="h-3.5 w-3.5" />
                                                Download
                                            </a>
                                        </Button>
                                    ) : (
                                        <Badge variant="outline" className="text-[10.5px] bg-muted/40 text-muted-foreground">
                                            Pending
                                        </Badge>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            {/* Investor deck stub */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-international-orange" />
                            Generate an investor deck
                        </p>
                        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                            Assembles the brief, hero render, BOM totals, risks, and cost posture into a
                            board-ready PDF. Lands with the export spine.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        className="gap-1.5 text-xs bg-international-orange hover:bg-international-orange/90 text-white shrink-0"
                        disabled
                        title="Coming soon"
                    >
                        <FileOutput className="h-3.5 w-3.5" />
                        Coming soon
                    </Button>
                </CardContent>
            </Card>

            {/* Cross-links */}
            <Card className="rounded-xl border">
                <CardContent className="py-4 px-6 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                        Looking for something else? Raw STEP / STL per module lives on the
                        Geometry page; the BOM CSV generator will surface on the BOM artefact
                        page.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                            <Link href={`/the-forge-v2/projects/${project.id}/geometry`}>
                                Open Geometry
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                            <Link href={`/the-forge-v2/projects/${project.id}/bom`}>
                                Open BOM
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Back link */}
            <div className="flex items-center justify-start pt-1">
                <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Link href={backHref}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to project
                    </Link>
                </Button>
            </div>
        </WorkspaceShell>
    )
}
