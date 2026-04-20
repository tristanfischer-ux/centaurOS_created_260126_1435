/**
 * @file page.tsx — /the-forge-v2 Workspace landing.
 *
 * @description Entry point for The Forge v2. Lists all CAD Lab projects for
 * the foundry and offers paths into existing projects or creation of new ones.
 * Empty state leads users to "Start from a description" — the current v1
 * pipeline flow. Projects link to /the-forge-v2/projects/[id] for the
 * 9-artefact detail view.
 *
 * Gated behind `new_forge_experience` feature flag via sidebar href rewrite
 * — /the-forge remains the canonical path until the flag flip (Phase 1 PR #12).
 *
 * @related
 * - Mockup: FORGE-MOCKUP-WORKSPACE.html (project-header + health-strip + artefact-grid)
 * - Action: listCadLabProjects from @/actions/cad-lab-projects
 * - Shell: ./_components/workspace-shell.tsx
 */

import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { Plus, Sparkles, ArrowRight, Layers, Hammer } from "lucide-react"

import { listCadLabProjects } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "./_components/workspace-shell"

export const metadata: Metadata = {
    title: "The Forge · Workspace",
    description: "Your hardware projects — from concept through design, supplier selection, and launch.",
}

export const dynamic = "force-dynamic"

const STAGE_TONE: Record<string, { label: string; class: string }> = {
    draft:            { label: "Draft",        class: "bg-muted text-muted-foreground border-border" },
    researched:       { label: "Researched",   class: "bg-electric-blue/10 text-electric-blue border-electric-blue/30" },
    interface_ready:  { label: "Building",     class: "bg-status-warning-light text-status-warning border-status-warning/30" },
    generated:        { label: "Generated",    class: "bg-status-success-light text-status-success border-status-success/30" },
    complete:         { label: "Complete",     class: "bg-status-success-light text-status-success border-status-success/30" },
}

export default async function ForgeV2WorkspacePage(): Promise<React.ReactNode> {
    const result = await listCadLabProjects()
    const projects = "projects" in result ? result.projects : []
    const loadError = "error" in result

    return (
        <WorkspaceShell
            subtitle="Your hardware projects — from concept through design, supplier selection, and launch."
            primaryCta={{ label: "New project", href: "/the-forge-v2/new", icon: <Plus className="h-3.5 w-3.5" /> }}
        >
            {loadError && (
                <Card className="rounded-xl border-destructive/30">
                    <CardContent className="py-4">
                        <p className="text-sm text-destructive">Couldn&apos;t load your projects. Please refresh the page.</p>
                    </CardContent>
                </Card>
            )}

            {/* Empty state — no projects yet */}
            {projects.length === 0 && !loadError && (
                <Card className="rounded-xl border bg-gradient-to-br from-background to-international-orange/[0.03]">
                    <CardContent className="py-14 flex flex-col items-center text-center gap-5">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-international-orange/10">
                            <Hammer className="h-7 w-7 text-international-orange" />
                        </div>
                        <div className="max-w-md space-y-2">
                            <h2 className="text-xl font-semibold text-foreground tracking-tight">Start your first Forge project</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Describe what you want to build and The Forge decomposes it into modules, researches materials, matches suppliers, and tracks cost &amp; risk from concept through launch.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                <Link href="/the-forge-v2/new"><Sparkles className="h-3.5 w-3.5" /> Start from a description</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Project grid */}
            {projects.length > 0 && (
                <>
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                            {projects.length === 1 ? "1 project" : `${projects.length} projects`}
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map((p) => {
                            const stage = STAGE_TONE[p.stage] ?? STAGE_TONE.draft
                            return (
                                <Link
                                    key={p.id}
                                    href={`/the-forge-v2/projects/${p.id}`}
                                    className="group rounded-xl border bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden"
                                >
                                    {/* Thumbnail */}
                                    <div className="aspect-[16/7] bg-gradient-to-br from-international-orange/[0.04] to-muted flex items-center justify-center overflow-hidden">
                                        {p.systemIllustrationUrl ? (
                                            <Image
                                                src={p.systemIllustrationUrl}
                                                alt={`${p.name} system illustration`}
                                                width={560}
                                                height={245}
                                                className="w-full h-full object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <Hammer className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className="p-5 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="text-sm font-semibold text-foreground tracking-tight truncate group-hover:text-international-orange transition-colors">
                                                {p.name}
                                            </h3>
                                            <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wide shrink-0", stage.class)}>
                                                {stage.label}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                            {p.subject || "Untitled concept"}
                                        </p>
                                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                            <span className="text-[11px] text-muted-foreground">
                                                Updated {new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                            </span>
                                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                                        </div>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                </>
            )}
        </WorkspaceShell>
    )
}
