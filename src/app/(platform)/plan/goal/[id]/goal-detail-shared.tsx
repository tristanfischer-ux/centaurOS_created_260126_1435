"use client"

/**
 * @file goal-detail-shared.tsx — Types, helpers, and the hero header for the
 * Strategic Goal drill-in. The remaining panels live in
 * `./goal-detail-panels.tsx`. Split apart only to keep files under 300 lines.
 */
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    Circle,
    Pencil,
    ShieldAlert,
    Target,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { MigratedPill } from "@/components/plan/MigratedPill"
import type {
    AssumptionState,
    GoalState,
    GoalTeamAssignmentRow,
    GutcheckSessionRow,
    StrategicGoalRow,
} from "@/types/plan"

export type GoalDetailObjective = {
    id: string
    title: string
    description: string | null
    status: string | null
    progress: number | null
    end_date: string | null
    tasks: Array<{
        id: string
        title: string
        status: string | null
        progress: number | null
        end_date: string | null
        assignee_id: string | null
    }>
}

export type JoinedTeamAssignment = GoalTeamAssignmentRow & {
    user: { id: string; full_name: string | null; avatar_url: string | null } | null
    fractional:
        | { id: string; display_name: string; avatar_gradient: string | null; specialisation: string }
        | null
    specialist: { specialist_key: string; display_name: string; title: string } | null
}

type StateChipVariant = "success" | "warning" | "destructive" | "secondary" | "outline"

const STATE_META: Record<GoalState, { label: string; variant: StateChipVariant }> = {
    draft: { label: "Draft", variant: "outline" },
    active: { label: "Active", variant: "secondary" },
    on_track: { label: "On track", variant: "success" },
    at_risk: { label: "At risk", variant: "warning" },
    off_track: { label: "Off track", variant: "destructive" },
    killed: { label: "Killed", variant: "outline" },
    pivoted: { label: "Pivoted", variant: "outline" },
    completed: { label: "Completed", variant: "success" },
}

export const ASSUMPTION_META: Record<
    AssumptionState,
    { label: string; className: string; icon: typeof Circle }
> = {
    holding: {
        label: "Holding",
        className: "border-status-success-light bg-status-success-light/40 text-status-success-dark",
        icon: CheckCircle2,
    },
    slipping: {
        label: "Slipping",
        className: "border-status-warning-light bg-status-warning-light/40 text-status-warning-dark",
        icon: AlertTriangle,
    },
    broken: {
        label: "Broken",
        className: "border-destructive/40 bg-destructive/10 text-destructive",
        icon: ShieldAlert,
    },
    unknown: {
        label: "Unknown",
        className: "border-border bg-muted/40 text-muted-foreground",
        icon: Circle,
    },
}

export const ASSUMPTION_CYCLE: AssumptionState[] = ["holding", "slipping", "broken", "unknown"]

export function formatMilestone(dateIso: string): { label: string; daysAway: number } {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(`${dateIso}T00:00:00`)
    const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
    const pretty = target.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    const suffix =
        days === 0
            ? " · today"
            : days > 0
              ? ` · ${days} day${days === 1 ? "" : "s"} to go`
              : ` · ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past`
    return { label: `${pretty}${suffix}`, daysAway: days }
}

export function memberLabel(a: JoinedTeamAssignment): string {
    if (a.user) return a.user.full_name ?? "Team member"
    if (a.fractional) return a.fractional.display_name
    if (a.specialist) return a.specialist.display_name
    return "Unassigned"
}

export function memberInitials(label: string): string {
    return label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
}

export function historyDateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    })
}

export function GoalHeroHeader({
    goal,
    milestoneLabel,
    pendingGutcheck,
}: {
    goal: StrategicGoalRow
    milestoneLabel: string
    pendingGutcheck: GutcheckSessionRow | null
}) {
    const stateMeta = STATE_META[goal.state] ?? STATE_META.active
    return (
        <Card>
            <CardHeader className="gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={stateMeta.variant} size="md" className="rounded-full">
                                {stateMeta.label}
                            </Badge>
                            <Badge variant="outline" size="md" className="rounded-full font-mono">
                                {goal.quarter}
                            </Badge>
                            {goal.is_pinned && goal.pin_order ? (
                                <Badge variant="brand" size="md" className="rounded-full">
                                    Pinned #{goal.pin_order}
                                </Badge>
                            ) : null}
                            <MigratedPill
                                sourceObjectiveId={goal.source_objective_id}
                                createdAt={goal.created_at}
                            />
                        </div>
                        <CardTitle className="text-2xl sm:text-3xl">{goal.title}</CardTitle>
                        {goal.description ? (
                            <p className="max-w-3xl text-sm text-muted-foreground">{goal.description}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-4 w-4" /> {milestoneLabel}
                            </span>
                            {goal.purpose_connection ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <Target className="h-4 w-4" /> {goal.purpose_connection}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="secondary" size="sm" className="gap-1.5">
                            <Pencil className="h-4 w-4" /> Edit Goal
                        </Button>
                        <Button variant="default" size="sm" className="gap-1.5" data-action="open-pressure-test">
                            <ShieldAlert className="h-4 w-4" /> Pressure-test
                        </Button>
                    </div>
                </div>
                {pendingGutcheck ? (
                    <div className="flex items-start gap-3 rounded-md border border-status-warning-light bg-status-warning-light/30 p-3 text-sm text-status-warning-dark">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                            <p className="font-semibold">Gutcheck waiting on a decision</p>
                            <p className="text-status-warning-dark/80">
                                Fired {historyDateLabel(pendingGutcheck.fired_at)} ·{" "}
                                {pendingGutcheck.triggered_by === "cron_week6"
                                    ? "week-6 auto"
                                    : pendingGutcheck.triggered_by}
                            </p>
                        </div>
                    </div>
                ) : null}
            </CardHeader>
        </Card>
    )
}
