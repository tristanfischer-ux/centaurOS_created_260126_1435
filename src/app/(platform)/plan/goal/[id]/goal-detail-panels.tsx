"use client"

/**
 * @file goal-detail-panels.tsx — DisproveTest / Team / Objectives / Activity
 * panels for the Strategic Goal drill-in. Split from `goal-detail-parts.tsx`
 * to keep each file under 300 lines.
 */
import Link from "next/link"
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Circle,
    ListChecks,
    ShieldAlert,
    Target,
    Users,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
    DisproveAssumptionRow,
    HistoryEntryRow,
} from "@/types/plan"
import {
    ASSUMPTION_META,
    historyDateLabel,
    memberInitials,
    memberLabel,
    type GoalDetailObjective,
    type JoinedTeamAssignment,
} from "./goal-detail-shared"

function historyIcon(type: HistoryEntryRow["entry_type"]) {
    switch (type) {
        case "pressure_test":
            return ShieldAlert
        case "goal_pinned":
        case "goal_state_changed":
            return Target
        case "gutcheck_outcome":
            return AlertTriangle
        case "update_sent":
            return ListChecks
        default:
            return Circle
    }
}

export function DisproveTestPanel({
    assumptions,
    onCycle,
}: {
    assumptions: DisproveAssumptionRow[]
    onCycle: (id: string) => void
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg">Disprove test</CardTitle>
                <span className="text-xs text-muted-foreground">Click an assumption to cycle its state</span>
            </CardHeader>
            <CardContent className="space-y-3">
                {assumptions.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        No disprove assumptions yet. Add up to three claims you&rsquo;ll try to break.
                    </p>
                ) : (
                    assumptions.map((a) => {
                        const meta = ASSUMPTION_META[a.current_state]
                        const Icon = meta.icon
                        return (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => onCycle(a.id)}
                                className={cn(
                                    "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/40",
                                    meta.className,
                                )}
                            >
                                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">{a.assumption}</p>
                                    <p className="mt-1 text-xs uppercase tracking-wide opacity-80">
                                        {meta.label}
                                        {a.last_refreshed_at
                                            ? ` · refreshed ${historyDateLabel(a.last_refreshed_at)}`
                                            : ""}
                                    </p>
                                </div>
                            </button>
                        )
                    })
                )}
            </CardContent>
        </Card>
    )
}

export function TeamPanel({ teamAssignments }: { teamAssignments: JoinedTeamAssignment[] }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-4 w-4" /> Goal team
                </CardTitle>
            </CardHeader>
            <CardContent>
                {teamAssignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No one assigned yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {teamAssignments.map((a) => {
                            const label = memberLabel(a)
                            const initials = memberInitials(label)
                            const gradient = a.fractional?.avatar_gradient
                            return (
                                <li key={a.id} className="flex items-center gap-3">
                                    <div
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                        style={{
                                            background:
                                                gradient ??
                                                "linear-gradient(135deg, var(--color-accent), var(--color-primary))",
                                        }}
                                        aria-hidden
                                    >
                                        {initials}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{label}</p>
                                        <p className="truncate text-xs capitalize text-muted-foreground">
                                            {a.role_on_goal} · {a.assignee_type}
                                        </p>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

export function ObjectivesPanel({
    objectives,
    expandedIds,
    onToggle,
}: {
    objectives: GoalDetailObjective[]
    expandedIds: Set<string>
    onToggle: (id: string) => void
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <ListChecks className="h-4 w-4" /> Objectives
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                    {objectives.length} objective{objectives.length === 1 ? "" : "s"}
                </span>
            </CardHeader>
            <CardContent className="space-y-2">
                {objectives.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        No objectives linked yet. Link one from the Plan workspace to break this Goal into work.
                    </p>
                ) : (
                    objectives.map((o) => {
                        const expanded = expandedIds.has(o.id)
                        return (
                            <div key={o.id} className="rounded-md border border-border">
                                <button
                                    type="button"
                                    onClick={() => onToggle(o.id)}
                                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
                                    aria-expanded={expanded}
                                >
                                    {expanded ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{o.title}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {o.tasks.length} task{o.tasks.length === 1 ? "" : "s"}
                                            {o.status ? ` · ${o.status}` : ""}
                                        </p>
                                    </div>
                                    {typeof o.progress === "number" ? (
                                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                            {Math.round(o.progress)}%
                                        </span>
                                    ) : null}
                                </button>
                                {expanded && o.tasks.length > 0 ? (
                                    <ul className="divide-y divide-border border-t border-border">
                                        {o.tasks.map((t) => (
                                            <li
                                                key={t.id}
                                                className="flex items-center gap-3 p-3 pl-10 text-sm"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={t.status === "done" || t.status === "completed"}
                                                    readOnly
                                                    className="h-4 w-4 rounded border-input accent-accent"
                                                    aria-label={`Task: ${t.title}`}
                                                />
                                                <Link
                                                    href={`/plan/task/${t.id}`}
                                                    className="min-w-0 flex-1 truncate hover:underline"
                                                >
                                                    {t.title}
                                                </Link>
                                                {t.end_date ? (
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        due{" "}
                                                        {new Date(t.end_date).toLocaleDateString(undefined, {
                                                            day: "numeric",
                                                            month: "short",
                                                        })}
                                                    </span>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        )
                    })
                )}
            </CardContent>
        </Card>
    )
}

export function ActivityPanel({ history }: { history: HistoryEntryRow[] }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg">Activity</CardTitle>
            </CardHeader>
            <CardContent>
                {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
                ) : (
                    <ol className="space-y-3">
                        {history.map((h) => {
                            const Icon = historyIcon(h.entry_type)
                            return (
                                <li key={h.id} className="flex gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1 rounded-md border border-border bg-card/50 p-3">
                                        <p className="text-sm font-medium">{h.title}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {historyDateLabel(h.created_at)}
                                            {h.actor_type ? ` · ${h.actor_type}` : ""}
                                        </p>
                                        {h.body ? (
                                            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">
                                                {h.body}
                                            </p>
                                        ) : null}
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                )}
            </CardContent>
        </Card>
    )
}
