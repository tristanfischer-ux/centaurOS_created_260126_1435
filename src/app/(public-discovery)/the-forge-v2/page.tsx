/**
 * @file (public-discovery)/the-forge-v2/page.tsx
 *
 * @description Anonymous /the-forge-v2 landing per RED-TEAM-PIVOT-PLAN
 * Tier 2 step 16. Mirrors the anonymous /investors pattern from commit
 * 4ca0f085.
 *
 * Unauthenticated visitors see:
 * - "You are browsing anonymously" banner
 * - Hero copy explaining the Forge value proposition
 * - The five demo project packs (real product output) from
 *   src/components/marketing/forge-demo-grid.tsx
 * - A "Start a project" textarea that triggers signup wall after 6 chars
 * - A blurred featured workspace preview with "Sign up to start your own"
 *
 * Authenticated visitors are served the real /the-forge-v2 landing via the
 * platform-mirrored layout chrome in (public-discovery)/layout.tsx.
 *
 * Deep-dive sub-routes (/the-forge-v2/projects/<id>/...) stay under
 * (platform) and require login.
 *
 * @security Public layout, no auth gate at route level.
 */

import type { Metadata } from "next"
import { listCadLabProjects, type CadLabProjectSummary } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Loader2, Hammer } from "lucide-react"
import { WorkspaceShell } from "../../(platform)/the-forge-v2/_components/workspace-shell"
import { StartForgeBox } from "../../(platform)/the-forge-v2/_components/start-forge-box"
import { AnonymousForgeView } from "./AnonymousForgeView"

export const metadata: Metadata = {
    title: "The Forge",
    description:
        "From a paragraph to a manufacturer shortlist. Twenty-minute first pass, hours of detail after.",
    openGraph: {
        title: "The Forge",
        description:
            "From a paragraph to a manufacturer shortlist. Twenty-minute first pass, hours of detail after.",
        type: "website",
    },
}

export const dynamic = "force-dynamic"

export default async function PublicForgeV2LandingPage(): Promise<React.ReactNode> {
    const supabaseAuth = await createClient()
    const {
        data: { user: authedUser },
    } = await supabaseAuth.auth.getUser()

    // ── Anonymous visitor ──────────────────────────────────────────────────
    if (!authedUser) {
        return <AnonymousForgeView />
    }

    // ── Authenticated visitor — mirror (platform)/the-forge-v2/page.tsx ────
    const result = await listCadLabProjects()
    const projects = "projects" in result ? result.projects : []
    const loadError = "error" in result

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
                        <p className="text-sm text-destructive">
                            Could not load your past plans. You can still start a new one below.
                        </p>
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
                                const { statusLabel, statusKind, href } =
                                    deriveProjectEntryState(
                                        p.id,
                                        p.status,
                                        p.autopilotState,
                                    )
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
                                                    <StatusPill
                                                        kind={statusKind}
                                                        label={statusLabel}
                                                    />
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                    {p.subject || "Untitled concept"}
                                                </p>
                                            </div>
                                            <time className="text-[11px] text-muted-foreground shrink-0 font-mono">
                                                {new Date(p.updatedAt).toLocaleDateString(
                                                    undefined,
                                                    {
                                                        day: "numeric",
                                                        month: "short",
                                                    },
                                                )}
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
                            <Link
                                href="/the-forge-v2/archive"
                                className="hover:text-international-orange transition-colors"
                            >
                                See all {projects.length} plans &rarr;
                            </Link>
                        </p>
                    )}
                </section>
            )}

            {recent.length === 0 && !loadError && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Hammer
                        className="h-4 w-4 text-muted-foreground/60"
                        aria-hidden="true"
                    />
                    <span>
                        No plans yet. Describe what you want to build above and the Forge
                        takes it from there.
                    </span>
                </div>
            )}
        </WorkspaceShell>
    )
}

// ─── Helpers (mirrored from (platform)/the-forge-v2/page.tsx) ───────────────

type StatusKind = "building" | "ready" | "draft"

function StatusPill({
    kind,
    label,
}: {
    kind: StatusKind
    label: string
}): React.ReactElement {
    const classes: Record<StatusKind, string> = {
        building:
            "bg-status-warning-light text-status-warning border-status-warning/30",
        ready: "bg-status-success-light text-status-success border-status-success/30",
        draft: "bg-muted text-muted-foreground border-border",
    }
    const Icon =
        kind === "building" ? Loader2 : kind === "ready" ? CheckCircle2 : null
    return (
        <Badge
            variant="outline"
            className={cn(
                "text-[10px] font-semibold uppercase tracking-wide shrink-0 gap-1",
                classes[kind],
            )}
        >
            {Icon && (
                <Icon
                    className={cn(
                        "h-3 w-3",
                        kind === "building" && "animate-spin",
                    )}
                    aria-hidden="true"
                />
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
    if (state && state.finished_at && !state.error) {
        return {
            statusLabel: "Ready",
            statusKind: "ready",
            href: `/the-forge-v2/projects/${projectId}/plan`,
        }
    }
    if (state && !state.finished_at) {
        return {
            statusLabel: "Building",
            statusKind: "building",
            href: `/the-forge-v2/projects/${projectId}`,
        }
    }
    return {
        statusLabel: projectStatus === "complete" ? "Ready" : "Draft",
        statusKind: projectStatus === "complete" ? "ready" : "draft",
        href: `/the-forge-v2/projects/${projectId}`,
    }
}
