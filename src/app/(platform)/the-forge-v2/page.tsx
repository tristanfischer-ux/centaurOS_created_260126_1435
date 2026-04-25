/**
 * @file page.tsx — /the-forge-v2 simplified landing.
 *
 * @description One input, one button, one promise: type what you want to
 * build, the Forge builds the plan. Below the input: "Examples to learn from"
 * (the five public demo packs) and "Your projects" (the founder's existing
 * cad_lab_projects list).
 *
 * Replaces the earlier project grid + "New project" wizard flow. The wizard
 * still exists at /the-forge-v2/new for references-upload edge cases, but
 * this landing skips straight to autopilot — text in, PDF out.
 *
 * @related
 * - Input box:      ./_components/start-forge-box.tsx
 * - Action:         listCadLabProjects from @/actions/cad-lab-projects
 * - Running/plan:   ./projects/[id]/page.tsx
 * - Demo metadata:  @/lib/forge/demo-projects
 */

import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { ArrowRight, CheckCircle2, Loader2, Hammer } from "lucide-react"

import { listCadLabProjects, type CadLabProjectSummary } from "@/actions/cad-lab-projects"
import { FORGE_DEMOS, type ForgeDemo } from "@/lib/forge/demo-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "./_components/workspace-shell"
import { StartForgeBox } from "./_components/start-forge-box"

export const metadata: Metadata = {
    title: "The Forge",
    description: "Describe what you want to build — the Forge drafts a first pass in twenty minutes, then the detail comes in over the hours after.",
}

export const dynamic = "force-dynamic"

export default async function ForgeV2LandingPage(): Promise<React.ReactNode> {
    const result = await listCadLabProjects()
    const projects = "projects" in result ? result.projects : []
    const loadError = "error" in result

    // Sort past plans most-recent first, cap at 10 rows on the landing. The
    // full archive lives at /the-forge-v2/archive (route already exists).
    const recent = [...projects]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 10)

    return (
        <WorkspaceShell
            subtitle="Describe what you're building. Twenty minutes for the first pass — brief, modules, bill of materials, cost, risks, suppliers — and hours of detail after."
            maxWidth="narrow"
        >
            {loadError && (
                <Card className="rounded-xl border-destructive/30">
                    <CardContent className="py-4">
                        <p className="text-sm text-destructive">Couldn&apos;t load your past plans. You can still start a new one below.</p>
                    </CardContent>
                </Card>
            )}

            {/* ─── Input: type, press, wait ────────────────────────────── */}
            <Card className="rounded-xl border bg-background shadow-sm">
                <CardContent className="py-6 sm:py-8">
                    <StartForgeBox />
                </CardContent>
            </Card>

            {/* ─── Saved folder ────────────────────────────────────────── */}
            <SavedFolder projects={projects} recent={recent} loadError={loadError} />
        </WorkspaceShell>
    )
}

// ─── SavedFolder ───────────────────────────────────────────────────────
// The "Saved projects" section below the start box. Two sub-sections:
//   1. "Examples to learn from" — the five public demo packs (read-only)
//   2. "Your projects"          — the founder's cad_lab_projects

interface SavedFolderProps {
    projects: CadLabProjectSummary[]
    recent: CadLabProjectSummary[]
    loadError: boolean
}

function SavedFolder({ projects, recent, loadError }: SavedFolderProps): React.ReactElement {
    return (
        <div className="space-y-8">
            {/* ── Examples to learn from ─────────────────────────────── */}
            <section aria-labelledby="examples-heading" className="space-y-3">
                <h2
                    id="examples-heading"
                    className="text-xs font-mono uppercase tracking-widest text-muted-foreground"
                >
                    Examples to learn from
                </h2>
                <p className="text-sm text-muted-foreground">
                    Five real Forge runs, full project packs. Read-only — open any one to see
                    exactly what the Forge produces before you start your own.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {FORGE_DEMOS.map((demo) => (
                        <DemoExampleCard key={demo.slug} demo={demo} />
                    ))}
                </div>
            </section>

            {/* ── Your projects ──────────────────────────────────────── */}
            <section aria-labelledby="your-projects-heading" className="space-y-3">
                <h2
                    id="your-projects-heading"
                    className="text-xs font-mono uppercase tracking-widest text-muted-foreground"
                >
                    Your projects
                </h2>

                {recent.length > 0 && (
                    <>
                        <Card className="rounded-xl overflow-hidden">
                            <ul className="divide-y divide-border">
                                {recent.map((p) => {
                                    const { statusLabel, statusKind, href } = deriveProjectEntryState(p.id, p.status, p.autopilotState)
                                    return (
                                        <li key={p.id}>
                                            <Link
                                                href={href}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-foreground truncate group-hover:text-international-orange transition-colors">
                                                            {p.name}
                                                        </span>
                                                        <StatusPill kind={statusKind} label={statusLabel} />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                        {p.subject || "Untitled concept"}
                                                    </p>
                                                </div>
                                                <time className="text-[11px] text-muted-foreground shrink-0 font-mono">
                                                    {new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                                </time>
                                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </Card>
                        {projects.length > recent.length && (
                            <p className="text-xs text-muted-foreground">
                                <Link href="/the-forge-v2/archive" className="hover:text-international-orange transition-colors">
                                    See all {projects.length} projects →
                                </Link>
                            </p>
                        )}
                    </>
                )}

                {recent.length === 0 && !loadError && (
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                        <Hammer className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                            No projects yet. Try the examples above to see what a finished pack looks
                            like, then start your own.
                        </span>
                    </div>
                )}

                {loadError && (
                    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                        <span>Couldn&apos;t load your projects. You can still start a new one above.</span>
                    </div>
                )}
            </section>
        </div>
    )
}

// ─── DemoExampleCard ───────────────────────────────────────────────────
// Compact card for the "Examples to learn from" grid on /the-forge-v2.
// Links to /forge/demos/<slug> — the public, no-login detail page.

function DemoExampleCard({ demo }: { demo: ForgeDemo }): React.ReactElement {
    const isOverBudget = demo.cost.headroomGbp < 0
    const pillToneClass = isOverBudget
        ? "bg-warning/10 text-warning border-warning/20"
        : "bg-success/10 text-success border-success/20"

    return (
        <Link
            href={`/forge/demos/${demo.slug}`}
            className="group block"
            aria-label={`View the ${demo.heading} demo pack`}
        >
            <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group-active:scale-[0.99]">
                {/* Cover thumbnail */}
                <div className="relative aspect-[3/2] w-full bg-muted overflow-hidden">
                    <Image
                        src={demo.coverPath}
                        alt={`Cover render of the ${demo.heading} project pack`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover object-top"
                    />
                </div>
                <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground leading-tight group-hover:text-international-orange transition-colors">
                            {demo.heading}
                        </h3>
                        <span
                            className={cn(
                                "inline-flex shrink-0 items-center px-1.5 py-0.5 rounded-full border text-[9px] font-mono uppercase tracking-widest",
                                pillToneClass,
                            )}
                        >
                            {demo.cost.headroomLabel}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                        {demo.subHeading}
                    </p>
                    <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground font-mono">
                        <span>{demo.stats.modules} modules</span>
                        <span aria-hidden="true">·</span>
                        <span>{demo.stats.bomRows} bill-of-materials rows</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-international-orange font-semibold group-hover:text-international-orange/80 transition-colors">
                        View pack
                        <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                    </span>
                </CardContent>
            </Card>
        </Link>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

type StatusKind = "building" | "ready" | "draft"

function StatusPill({ kind, label }: { kind: StatusKind; label: string }): React.ReactElement {
    const classes: Record<StatusKind, string> = {
        building: "bg-status-warning-light text-status-warning border-status-warning/30",
        ready: "bg-status-success-light text-status-success border-status-success/30",
        draft: "bg-muted text-muted-foreground border-border",
    }
    const Icon = kind === "building" ? Loader2 : kind === "ready" ? CheckCircle2 : null
    return (
        <Badge
            variant="outline"
            className={cn(
                "text-[10px] font-semibold uppercase tracking-wide shrink-0 gap-1",
                classes[kind],
            )}
        >
            {Icon && (
                <Icon className={cn("h-3 w-3", kind === "building" && "animate-spin")} aria-hidden="true" />
            )}
            {label}
        </Badge>
    )
}

function deriveProjectEntryState(
    projectId: string,
    projectStatus: string,
    state: CadLabProjectSummary["autopilotState"],
): { statusLabel: string; statusKind: StatusKind; href: string } {
    // Ready = autopilot finished with no error. Link direct to the plan.
    if (state && state.finished_at && !state.error) {
        return {
            statusLabel: "Ready",
            statusKind: "ready",
            href: `/the-forge-v2/projects/${projectId}/plan`,
        }
    }
    // Building = autopilot started but not finished. Link to the workspace
    // so the running state shows.
    if (state && !state.finished_at) {
        return {
            statusLabel: "Building",
            statusKind: "building",
            href: `/the-forge-v2/projects/${projectId}`,
        }
    }
    // Everything else — autopilot never started, or errored, or a pre-v2
    // project created the old way. Treat as a draft; the workspace page
    // handles the routing.
    return {
        statusLabel: projectStatus === "complete" ? "Ready" : "Draft",
        statusKind: projectStatus === "complete" ? "ready" : "draft",
        href: `/the-forge-v2/projects/${projectId}`,
    }
}
