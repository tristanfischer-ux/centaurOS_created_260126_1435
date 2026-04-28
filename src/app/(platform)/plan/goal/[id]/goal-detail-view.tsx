"use client"

/**
 * @file goal-detail-view.tsx — Client orchestrator for the Strategic Goal
 * drill-in.
 *
 * Owns: local optimistic state for assumption cycling, objective expansion
 * state, and the top-level layout. Presentational pieces live in
 * `./goal-detail-parts.tsx`. Server-side persistence of assumption state
 * changes is owned by Agent B.4 (see TODO below).
 *
 * Reference mockup: PLAN-MOCKUP-GOAL.html. Schema: PLAN-SCHEMA.md §§1, 2, 8, 9, 11.
 */
import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import type {
    DisproveAssumptionRow,
    GutcheckSessionRow,
    HistoryEntryRow,
    StrategicGoalRow,
} from "@/types/plan"
import {
    ASSUMPTION_CYCLE,
    formatMilestone,
    GoalHeroHeader,
    type GoalDetailObjective,
    type JoinedTeamAssignment,
} from "./goal-detail-shared"
import {
    ActivityPanel,
    DisproveTestPanel,
    ObjectivesPanel,
    TeamPanel,
} from "./goal-detail-panels"

export type { GoalDetailObjective } from "./goal-detail-shared"

interface Props {
    goal: StrategicGoalRow
    assumptions: DisproveAssumptionRow[]
    teamAssignments: JoinedTeamAssignment[]
    objectives: GoalDetailObjective[]
    history: HistoryEntryRow[]
    pendingGutcheck: GutcheckSessionRow | null
}

export function GoalDetailView({
    goal,
    assumptions,
    teamAssignments,
    objectives,
    history,
    pendingGutcheck,
}: Props) {
    const milestone = useMemo(() => formatMilestone(goal.milestone_date), [goal.milestone_date])

    // Local optimistic state for assumption edits — server persistence is
    // TODO for Agent B.4 via `setAssumptionState({ assumptionId, state, source:'founder' })`.
    const [localAssumptions, setLocalAssumptions] = useState(assumptions)
    const [expandedObjectiveIds, setExpandedObjectiveIds] = useState<Set<string>>(
        () => new Set(objectives.slice(0, 1).map((o) => o.id)),
    )

    const cycleAssumption = (id: string) => {
        setLocalAssumptions((prev) =>
            prev.map((a) => {
                if (a.id !== id) return a
                const nextIdx = (ASSUMPTION_CYCLE.indexOf(a.current_state) + 1) % ASSUMPTION_CYCLE.length
                return { ...a, current_state: ASSUMPTION_CYCLE[nextIdx] }
            }),
        )
    }

    const toggleObjective = (id: string) => {
        setExpandedObjectiveIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
            <Link
                href="/plan"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ChevronRight className="h-4 w-4 rotate-180" /> Back to Plan
            </Link>

            <GoalHeroHeader goal={goal} milestoneLabel={milestone.label} pendingGutcheck={pendingGutcheck} />

            <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <DisproveTestPanel assumptions={localAssumptions} onCycle={cycleAssumption} />
                <TeamPanel teamAssignments={teamAssignments} />
            </div>

            <ObjectivesPanel
                objectives={objectives}
                expandedIds={expandedObjectiveIds}
                onToggle={toggleObjective}
            />

            <ActivityPanel history={history} />
        </div>
    )
}
