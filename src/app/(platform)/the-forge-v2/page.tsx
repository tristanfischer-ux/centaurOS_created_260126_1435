/**
 * @file page.tsx — /the-forge-v2 simplified landing.
 *
 * @description One input, one button, one promise: type what you want to
 * build, the Forge builds the plan. Past plans live underneath as a compact
 * list so founders can revisit anything they already ran.
 *
 * Replaces the earlier project grid + "New project" wizard flow. The wizard
 * still exists at /the-forge-v2/new for references-upload edge cases, but
 * this landing skips straight to autopilot — text in, PDF out.
 *
 * @related
 * - Input box:    ./_components/start-forge-box.tsx
 * - Action:       listCadLabProjects from @/actions/cad-lab-projects
 * - Running/plan: ./projects/[id]/page.tsx
 */

import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, CheckCircle2, Loader2, Hammer } from "lucide-react"

import { listCadLabProjects, type CadLabProjectSummary } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "./_components/workspace-shell"
import { StartForgeBox } from "./_components/start-forge-box"

export const metadata: Metadata = {
    title: "The Forge",
    description: "Describe what you want to build — the Forge drafts a full plan in about 20 minutes.",
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
            subtitle="Describe what you're building. The Forge drafts a full plan — brief, modules, bill of materials, cost, risks, suppliers — in about 20 minutes."
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

            {/* ─── Past plans (compact list) ───────────────────────────── */}
            {recent.length > 0 && (
                <section aria-labelledby="past-plans-heading" className="space-y-3">
                    <h2
                        id="past-plans-heading"
                        className="text-xs font-mono uppercase tracking-widest text-muted-foreground"
                    >
                        Past plans
                    </h2>
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
                                See all {projects.length} plans →
                            </Link>
                        </p>
                    )}
                </section>
            )}

            {recent.length === 0 && !loadError && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Hammer className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                    <span>No plans yet. Describe what you want to build above and the Forge takes it from there.</span>
                </div>
            )}
        </WorkspaceShell>
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
