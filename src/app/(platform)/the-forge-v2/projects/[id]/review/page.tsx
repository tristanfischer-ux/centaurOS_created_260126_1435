/**
 * @file review/page.tsx — /the-forge-v2/projects/:id/review
 *
 * @description Specialist review roster for a project. Groups specialist
 * reviews per module, shows verdicts, comments, unresolved blockers, and
 * recommendations. Left column lists every module with a review roster; right
 * column shows the selected module's review detail. Links back to each
 * module's #failure-modes anchor so the founder can jump to the source.
 *
 * @related
 * - Data: loadCadLabProject from @/actions/cad-lab-projects — reads
 *   project.reviews: Record<moduleId, SpecialistReview[]>
 * - Type: SpecialistReview in @/lib/cad-lab-types
 * - Shell: ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    CheckCircle2,
    AlertTriangle,
    MessageSquare,
    Users,
    ArrowRight,
    Clock,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CadLabModule, SpecialistReview, ReviewVerdict } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Review · The Forge" }
    return { title: `Review · ${result.project.name}` }
}

/** ----------------------------------------------------------------
 *  Verdict helpers
 *  ----------------------------------------------------------------
 *  SpecialistReview.verdict is "pass" | "warn" | "fail". We translate
 *  to semantic tokens only — no raw palette colours.
 */

function verdictTone(verdict: ReviewVerdict): {
    icon: React.ComponentType<{ className?: string }>
    label: string
    badgeClass: string
    dotClass: string
    textClass: string
} {
    if (verdict === "pass") {
        return {
            icon: CheckCircle2,
            label: "Pass",
            badgeClass: "bg-status-success-light text-status-success border-status-success/30",
            dotClass: "bg-status-success",
            textClass: "text-status-success",
        }
    }
    if (verdict === "warn") {
        return {
            icon: AlertTriangle,
            label: "Warn",
            badgeClass: "bg-status-warning-light text-status-warning border-status-warning/30",
            dotClass: "bg-status-warning",
            textClass: "text-status-warning",
        }
    }
    return {
        icon: AlertTriangle,
        label: "Fail",
        badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
        dotClass: "bg-destructive",
        textClass: "text-destructive",
    }
}

/** Worst verdict across a roster — used for the per-module roll-up chip. */
function rollupVerdict(reviews: SpecialistReview[]): ReviewVerdict | null {
    if (reviews.length === 0) return null
    if (reviews.some(r => r.verdict === "fail")) return "fail"
    if (reviews.some(r => r.verdict === "warn")) return "warn"
    return "pass"
}

/** Count unresolved blockers (critical-severity issues) across reviews. */
function countBlockers(reviews: SpecialistReview[]): number {
    return reviews.reduce(
        (sum, r) => sum + r.issues.filter(i => i.severity === "critical").length,
        0,
    )
}

export default async function ForgeV2ReviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams?: Promise<{ module?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const selected = (await searchParams)?.module
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const modules: CadLabModule[] = project.modules ?? []
    const reviewMap: Record<string, SpecialistReview[]> = (project.reviews ?? {}) as Record<string, SpecialistReview[]>

    // Only show modules that actually have reviews logged.
    const reviewedModules = modules.filter(m => {
        const r = reviewMap[m.id]
        return Array.isArray(r) && r.length > 0
    })

    // Totals across the whole project
    const totalReviews = Object.values(reviewMap).reduce(
        (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
        0,
    )
    const totalBlockers = Object.values(reviewMap).reduce(
        (sum, list) => sum + (Array.isArray(list) ? countBlockers(list) : 0),
        0,
    )
    const totalWarns = Object.values(reviewMap).reduce(
        (sum, list) => Array.isArray(list)
            ? sum + list.filter(r => r.verdict === "warn").length
            : sum,
        0,
    )

    // Selected module (or first reviewed module by default)
    const selectedModule = reviewedModules.find(m => m.id === selected) ?? reviewedModules[0] ?? null
    const selectedReviews: SpecialistReview[] = selectedModule
        ? (reviewMap[selectedModule.id] ?? [])
        : []

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Review" },
            ]}
            subtitle={
                reviewedModules.length === 0
                    ? "No specialist reviews have run on this project yet"
                    : `${totalReviews} specialist ${totalReviews === 1 ? "review" : "reviews"} across ${reviewedModules.length} ${reviewedModules.length === 1 ? "module" : "modules"}`
            }
        >
            {reviewedModules.length === 0 ? (
                <EmptyState projectId={project.id} />
            ) : (
                <>
                    {/* Summary strip — verdict mix across the project */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SummaryTile
                            label="Reviews"
                            value={String(totalReviews)}
                            detail={`across ${reviewedModules.length} modules`}
                            accentClass="border-t-international-orange"
                        />
                        <SummaryTile
                            label="Blockers"
                            value={String(totalBlockers)}
                            detail={totalBlockers === 0 ? "None raised" : "Critical issues"}
                            accentClass={totalBlockers > 0 ? "border-t-destructive" : "border-t-muted-foreground/40"}
                        />
                        <SummaryTile
                            label="Warnings"
                            value={String(totalWarns)}
                            detail={totalWarns === 0 ? "None raised" : "Warn verdicts"}
                            accentClass={totalWarns > 0 ? "border-t-status-warning" : "border-t-muted-foreground/40"}
                        />
                        <SummaryTile
                            label="Current revision"
                            value={`v${project.designRevision}`}
                            detail={project.designRevision > 1 ? "Revised" : "Original decomposition"}
                            accentClass="border-t-international-orange"
                        />
                    </div>

                    {/* Two-column: module roster left, review detail right. */}
                    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
                        {/* Roster */}
                        <aside aria-label="Modules with reviews" className="space-y-2">
                            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                                Modules reviewed
                            </h2>
                            <ul className="space-y-1.5">
                                {reviewedModules.map(m => {
                                    const reviews = reviewMap[m.id] ?? []
                                    const roll = rollupVerdict(reviews)
                                    const isActive = selectedModule?.id === m.id
                                    return (
                                        <li key={m.id}>
                                            <Link
                                                href={`/the-forge-v2/projects/${project.id}/review?module=${encodeURIComponent(m.id)}`}
                                                className={cn(
                                                    "block rounded-lg border p-3 transition-colors",
                                                    isActive
                                                        ? "border-international-orange bg-international-orange/[0.06]"
                                                        : "border-border bg-background hover:bg-muted/40",
                                                )}
                                                aria-current={isActive ? "true" : undefined}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-semibold text-foreground truncate">
                                                        {m.name}
                                                    </span>
                                                    {roll && (
                                                        <span
                                                            className={cn("w-2 h-2 rounded-full shrink-0", verdictTone(roll).dotClass)}
                                                            aria-hidden
                                                        />
                                                    )}
                                                </div>
                                                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                                                    {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
                                                    {countBlockers(reviews) > 0 && (
                                                        <span className="text-destructive font-semibold"> · {countBlockers(reviews)} blocker{countBlockers(reviews) === 1 ? "" : "s"}</span>
                                                    )}
                                                </p>
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </aside>

                        {/* Detail column */}
                        <section aria-label="Selected module reviews" className="space-y-4 min-w-0">
                            {selectedModule && (
                                <Card className="rounded-xl border">
                                    <CardContent className="py-4 px-5 flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                                                Module
                                            </p>
                                            <h2 className="text-lg font-bold text-foreground leading-tight">
                                                {selectedModule.name}
                                            </h2>
                                            <p className="text-[12.5px] text-muted-foreground mt-1 line-clamp-2">
                                                {selectedModule.purpose}
                                            </p>
                                        </div>
                                        <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
                                            <Link href={`/the-forge-v2/projects/${project.id}/modules/${selectedModule.id}#failure-modes`}>
                                                Open module
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}

                            {selectedReviews.map((review, idx) => (
                                <ReviewCard
                                    key={`${review.specialistId}-${idx}`}
                                    review={review}
                                    projectId={project.id}
                                    moduleId={selectedModule?.id ?? ""}
                                />
                            ))}
                        </section>
                    </div>
                </>
            )}
        </WorkspaceShell>
    )
}

// ─── Sub-components ────────────────────────────────────────────────────

function SummaryTile({
    label,
    value,
    detail,
    accentClass,
}: {
    label: string
    value: string
    detail: string
    accentClass: string
}): React.ReactElement {
    return (
        <Card className={cn("rounded-xl border border-t-[3px]", accentClass)}>
            <CardContent className="py-4 px-4">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    {label}
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums leading-tight">
                    {value}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{detail}</p>
            </CardContent>
        </Card>
    )
}

function ReviewCard({
    review,
    projectId,
    moduleId,
}: {
    review: SpecialistReview
    projectId: string
    moduleId: string
}): React.ReactElement {
    const tone = verdictTone(review.verdict)
    const Icon = tone.icon
    const blockers = review.issues.filter(i => i.severity === "critical")
    const warnings = review.issues.filter(i => i.severity === "warning")
    const info = review.issues.filter(i => i.severity === "info")
    const reviewedAt = review.reviewedAt ? new Date(review.reviewedAt) : null

    return (
        <Card className="rounded-xl border">
            <CardContent className="py-5 px-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                        <span className={cn(
                            "inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0",
                            review.verdict === "pass" && "bg-status-success-light",
                            review.verdict === "warn" && "bg-status-warning-light",
                            review.verdict === "fail" && "bg-destructive/10",
                        )}>
                            <Icon className={cn("h-4.5 w-4.5", tone.textClass)} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-foreground">
                                    {review.specialistName || review.specialistId}
                                </h3>
                                <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-widest", tone.badgeClass)}>
                                    {tone.label}
                                </Badge>
                            </div>
                            <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
                                {review.summary}
                            </p>
                        </div>
                    </div>
                    {reviewedAt && !Number.isNaN(reviewedAt.getTime()) && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums shrink-0">
                            <Clock className="h-3 w-3" />
                            {reviewedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                    )}
                </div>

                {/* Unresolved blockers */}
                {blockers.length > 0 && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <h4 className="text-[11px] font-bold uppercase tracking-widest text-destructive mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {blockers.length} unresolved blocker{blockers.length === 1 ? "" : "s"}
                        </h4>
                        <ul className="space-y-2">
                            {blockers.map((issue, idx) => (
                                <li key={idx} className="text-[13px] leading-relaxed">
                                    <span className="font-semibold text-foreground">{issue.category}:</span>{" "}
                                    <span className="text-foreground">{issue.message}</span>
                                    {issue.suggestion && (
                                        <span className="block text-[12px] text-muted-foreground mt-0.5">
                                            Suggested fix: {issue.suggestion}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Warnings */}
                {warnings.length > 0 && (
                    <div className="rounded-lg border border-status-warning/30 bg-status-warning-light p-3">
                        <h4 className="text-[11px] font-bold uppercase tracking-widest text-status-warning mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                        </h4>
                        <ul className="space-y-2">
                            {warnings.map((issue, idx) => (
                                <li key={idx} className="text-[13px] leading-relaxed">
                                    <span className="font-semibold text-foreground">{issue.category}:</span>{" "}
                                    <span className="text-foreground">{issue.message}</span>
                                    {issue.suggestion && (
                                        <span className="block text-[12px] text-muted-foreground mt-0.5">
                                            Suggested fix: {issue.suggestion}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Info-level comments */}
                {info.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                        <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {info.length} note{info.length === 1 ? "" : "s"}
                        </h4>
                        <ul className="space-y-1.5">
                            {info.map((issue, idx) => (
                                <li key={idx} className="text-[13px] leading-relaxed text-foreground">
                                    <span className="font-semibold">{issue.category}:</span> {issue.message}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Recommendations */}
                {review.recommendations.length > 0 && (
                    <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            Recommendations ({review.recommendations.length})
                        </h4>
                        <ul className="space-y-1.5">
                            {review.recommendations.map((rec, idx) => (
                                <li key={idx} className="text-[13px] leading-relaxed text-foreground flex items-start gap-2">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-international-orange shrink-0" aria-hidden />
                                    <span>{rec}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Jump-to-module footer */}
                {moduleId && (
                    <div className="pt-3 border-t border-border">
                        <Link
                            href={`/the-forge-v2/projects/${projectId}/modules/${moduleId}#failure-modes`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-international-orange hover:underline"
                        >
                            Jump to module failure modes
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function EmptyState({ projectId }: { projectId: string }): React.ReactElement {
    return (
        <Card className="rounded-xl border">
            <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="max-w-sm space-y-2">
                    <p className="text-sm font-semibold text-foreground">No specialist reviews yet</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Reviews populate once a specialist runs over a module — manufacturability,
                        engineering soundness, system integration, or supply chain. Kick one off from
                        the module&apos;s page or in CAD Lab.
                    </p>
                </div>
                <Link
                    href={`/the-forge-v2/projects/${projectId}/modules`}
                    className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                >
                    Open modules <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </CardContent>
        </Card>
    )
}
