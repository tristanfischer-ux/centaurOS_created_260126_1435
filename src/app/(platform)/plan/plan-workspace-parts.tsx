/**
 * @file plan-workspace-parts.tsx — Sub-components for the Plan workspace.
 *
 * @description Extracted from plan-workspace.tsx to keep the root file
 * under 300 lines. Pure presentation — server-component safe.
 * Consumed exclusively by plan-workspace.tsx.
 */

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    Sparkles,
    Target,
    CalendarClock,
    Inbox,
    Activity,
    History as HistoryIcon,
    HeartPulse,
    Plus,
    CheckCircle2,
    Circle,
    ArrowRight,
} from "lucide-react"

import type {
    StrategicGoalRow,
    DisproveAssumptionRow,
    GutcheckSessionRow,
    HistoryEntryRow,
    GoalState,
    AssumptionState,
} from "@/types/plan"

export interface PlanWorkspaceObjective {
    id: string
    title: string
    status: string | null
    strategic_goal_id: string | null
}

export interface PlanWorkspaceTask {
    id: string
    title: string
    status: string | null
    strategic_goal_id: string | null
    is_pinned: boolean
    horizon: string | null
    due_date: string | null
}

/* ──────────────────────────────────────────────────────────────────────── */

const GOAL_STATE_CHIP: Record<GoalState, { label: string; classes: string }> = {
    draft: { label: "Draft", classes: "bg-muted text-muted-foreground" },
    active: { label: "Active", classes: "bg-muted text-foreground" },
    on_track: { label: "On track", classes: "bg-emerald-100 text-emerald-800" },
    at_risk: { label: "At risk", classes: "bg-amber-100 text-amber-800" },
    off_track: { label: "Off track", classes: "bg-rose-100 text-rose-800" },
    killed: { label: "Killed", classes: "bg-muted text-muted-foreground line-through" },
    pivoted: { label: "Pivoted", classes: "bg-sky-100 text-sky-800" },
    completed: { label: "Completed", classes: "bg-emerald-100 text-emerald-800" },
}

const ASSUMPTION_DOT: Record<AssumptionState, string> = {
    holding: "bg-emerald-500",
    slipping: "bg-amber-500",
    broken: "bg-rose-500",
    unknown: "bg-muted-foreground/40",
}

export function daysUntil(isoDate: string | null): { label: string; overdue: boolean } {
    if (!isoDate) return { label: "—", overdue: false }
    const target = new Date(isoDate + "T00:00:00Z").getTime()
    const now = Date.now()
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24))
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true }
    if (diff === 0) return { label: "today", overdue: false }
    if (diff === 1) return { label: "1 day", overdue: false }
    if (diff <= 60) return { label: `${diff} days`, overdue: false }
    return { label: new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }), overdue: false }
}

export function relativeTime(iso: string | null): string {
    if (!iso) return ""
    const ts = new Date(iso).getTime()
    const diff = Math.max(0, Date.now() - ts)
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
}

/* ──────────────────────────────────────────────────────────────────────── */

export function StrategyHeader({
    foundryName,
    foundryPurpose,
}: {
    foundryName: string | null
    foundryPurpose: string | null
}) {
    return (
        <div className="pb-6 border-b border-border">
            <div className="flex items-start gap-4">
                <div className="h-10 w-1 rounded-full bg-international-orange shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        Strategy
                    </div>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                        {foundryName ?? "Your foundry"}
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-3xl">
                        {foundryPurpose && foundryPurpose.trim().length > 0
                            ? foundryPurpose
                            : "Your foundry purpose hasn't been set yet. A clear purpose anchors every Strategic Goal."}
                    </p>
                </div>
                <Button variant="outline" size="sm" disabled title="Coming soon">
                    Edit purpose
                </Button>
            </div>
        </div>
    )
}

export function EmptyGoalsState() {
    return (
        <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center text-center py-12 px-6">
                <div className="h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center mb-4">
                    <Target className="h-6 w-6 text-international-orange" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No Strategic Goals yet</h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                    Pin up to three goals to the top of Plan. Each one carries a disprove test so assumptions get challenged, not rehearsed.
                </p>
                <Button asChild className="mt-4 bg-international-orange hover:bg-international-orange-hover text-white">
                    <Link href="/plan/goal/new">
                        <Plus className="h-4 w-4 mr-1.5" />
                        Create your first Strategic Goal
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}

export function PinnedGoalCard({
    goal,
    assumptions,
    objectives,
}: {
    goal: StrategicGoalRow
    assumptions: DisproveAssumptionRow[]
    objectives: PlanWorkspaceObjective[]
}) {
    const chip = GOAL_STATE_CHIP[goal.state] ?? GOAL_STATE_CHIP.active
    const milestone = daysUntil(goal.milestone_date)
    const sorted = [...assumptions].sort((a, b) => a.order_index - b.order_index).slice(0, 3)

    return (
        <Card className="group hover:border-international-orange/50 transition-colors">
            <CardContent className="p-5">
                <Link href={`/plan/goal/${goal.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                                {goal.quarter}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${chip.classes}`}>
                                {chip.label}
                            </span>
                        </div>
                        <span
                            className={`text-[11px] font-medium tabular-nums ${
                                milestone.overdue ? "text-rose-600" : "text-muted-foreground"
                            }`}
                            aria-label={`Milestone in ${milestone.label}`}
                        >
                            <CalendarClock className="h-3 w-3 inline mr-1" />
                            {milestone.label}
                        </span>
                    </div>

                    <h3 className="mt-2 text-base font-semibold text-foreground line-clamp-2 group-hover:text-international-orange transition-colors">
                        {goal.title}
                    </h3>

                    {sorted.length > 0 && (
                        <ul className="mt-3 space-y-1.5" aria-label="Disprove assumptions">
                            {sorted.map((a) => (
                                <li key={a.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                                    <span
                                        className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${ASSUMPTION_DOT[a.current_state] ?? ASSUMPTION_DOT.unknown}`}
                                        aria-label={a.current_state}
                                    />
                                    <span className="line-clamp-1">{a.assumption}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                            {objectives.length} {objectives.length === 1 ? "objective" : "objectives"}
                        </span>
                        <span className="text-international-orange font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            Open <ArrowRight className="h-3 w-3 inline" />
                        </span>
                    </div>
                </Link>
            </CardContent>
        </Card>
    )
}

export function PinnedGoalsGrid({
    goals,
    assumptionsByGoalId,
    objectivesByGoalId,
}: {
    goals: StrategicGoalRow[]
    assumptionsByGoalId: Record<string, DisproveAssumptionRow[]>
    objectivesByGoalId: Record<string, PlanWorkspaceObjective[]>
}) {
    if (goals.length === 0) return <EmptyGoalsState />

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pinned Strategic Goals</h2>
                {goals.length < 3 && (
                    <Button asChild variant="ghost" size="sm" className="text-xs">
                        <Link href="/plan/goal/new">
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Pin another
                        </Link>
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goals.map((g) => (
                    <PinnedGoalCard
                        key={g.id}
                        goal={g}
                        assumptions={assumptionsByGoalId[g.id] ?? []}
                        objectives={objectivesByGoalId[g.id] ?? []}
                    />
                ))}
            </div>
        </div>
    )
}

export function ThisWeekBand({ tasks }: { tasks: PlanWorkspaceTask[] }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">This Week</h2>
                <span className="text-xs text-muted-foreground">{tasks.length} pinned</span>
            </div>
            <Card>
                <CardContent className="p-0 divide-y divide-border">
                    {tasks.length === 0 ? (
                        <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                            Nothing pinned for this week yet. Pin a task from any Strategic Goal to surface it here.
                        </div>
                    ) : (
                        tasks.map((t) => {
                            const done = t.status === "done" || t.status === "completed"
                            const due = daysUntil(t.due_date)
                            return (
                                <Link
                                    key={t.id}
                                    href={`/plan/task/${t.id}`}
                                    className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                                >
                                    {done ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                    ) : (
                                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                                    )}
                                    <span
                                        className={`flex-1 text-sm truncate ${
                                            done ? "line-through text-muted-foreground" : "text-foreground"
                                        }`}
                                    >
                                        {t.title}
                                    </span>
                                    {t.due_date && (
                                        <span
                                            className={`text-[11px] tabular-nums ${
                                                due.overdue ? "text-rose-600" : "text-muted-foreground"
                                            }`}
                                        >
                                            {due.label}
                                        </span>
                                    )}
                                </Link>
                            )
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function SignalSlot({
    title,
    icon: Icon,
    children,
}: {
    title: string
    icon: React.ComponentType<{ className?: string }>
    children: React.ReactNode
}) {
    return (
        <Card className="flex flex-col">
            <CardContent className="p-4 flex flex-col gap-2 h-full">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {title}
                </div>
                <div className="flex-1 text-sm text-foreground">{children}</div>
            </CardContent>
        </Card>
    )
}

export function SignalRail({
    pendingGutchecks,
    recentHistory,
    pinnedGoals,
}: {
    pendingGutchecks: GutcheckSessionRow[]
    recentHistory: HistoryEntryRow[]
    pinnedGoals: StrategicGoalRow[]
}) {
    const latestGutcheck = pendingGutchecks[0] ?? null
    const recentChange = recentHistory[0] ?? null

    const atRiskCount = pinnedGoals.filter((g) => g.state === "at_risk" || g.state === "off_track").length
    const onTrackCount = pinnedGoals.filter((g) => g.state === "on_track" || g.state === "completed").length
    const healthLabel =
        pinnedGoals.length === 0
            ? "No pinned goals"
            : atRiskCount > 0
              ? `${atRiskCount} needing attention`
              : `${onTrackCount} on track`

    return (
        <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Signal rail</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SignalSlot title="Waiting on you" icon={Inbox}>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                        Specialist drafts and reviews will surface here once actions are created.
                    </p>
                </SignalSlot>

                <SignalSlot title="Mid-quarter gutcheck" icon={Activity}>
                    {latestGutcheck ? (
                        <Link
                            href={`/plan/goal/${latestGutcheck.goal_id}?gutcheck=${latestGutcheck.id}`}
                            className="block text-international-orange hover:underline"
                        >
                            <span className="font-medium">Decision needed</span>
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                                Fired {relativeTime(latestGutcheck.fired_at)}
                            </span>
                        </Link>
                    ) : (
                        <p className="text-muted-foreground text-xs leading-relaxed">No gutchecks pending.</p>
                    )}
                </SignalSlot>

                <SignalSlot title="Recently changed" icon={HistoryIcon}>
                    {recentChange ? (
                        <div>
                            <div className="font-medium line-clamp-2">{recentChange.title}</div>
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                                {relativeTime(recentChange.created_at)}
                            </span>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-xs leading-relaxed">No recent activity yet.</p>
                    )}
                </SignalSlot>

                <SignalSlot title="Health snapshot" icon={HeartPulse}>
                    <div className="font-medium text-foreground">{healthLabel}</div>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                        {pinnedGoals.length} pinned · {pinnedGoals.length > 0 ? "Q this quarter" : "—"}
                    </span>
                </SignalSlot>
            </div>
        </div>
    )
}
