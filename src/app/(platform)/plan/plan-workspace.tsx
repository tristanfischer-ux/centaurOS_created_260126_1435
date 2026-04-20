/**
 * @file plan-workspace.tsx — Real Plan workspace (flag-ON render).
 *
 * @description Orchestrates the Phase 3 Plan workspace per
 * PLAN-MOCKUP-WORKSPACE.html / PLAN-MOCKUP-GAP-AUDIT.html §1: Strategy
 * header (foundry purpose) · pinned Strategic Goals hero (up to 3) ·
 * This Week pinned tasks band · 4-slot signal rail (Waiting on you ·
 * Mid-quarter gutcheck · Recently changed · Health snapshot).
 *
 * Pure presentation — data is fetched in page.tsx. Empty-state guards
 * surface a "Create your first Strategic Goal" CTA when no pinned goals
 * exist yet. Links use canonical /plan routes; CTAs that are not yet
 * wired (e.g. "Edit purpose") render as disabled buttons.
 *
 * Constraints:
 * - Server component; client interactivity lives in drill-in pages
 *   (/plan/goal/[id], /plan/task/[id]).
 * - Design tokens only: bg-card, text-foreground, border-border,
 *   text-international-orange. No hardcoded brand colors.
 * - Sub-components live in plan-workspace-parts.tsx to keep this file
 *   thin and close to the root data-to-view wiring.
 */

import type {
    StrategicGoalRow,
    DisproveAssumptionRow,
    GutcheckSessionRow,
    HistoryEntryRow,
} from "@/types/plan"

import {
    StrategyHeader,
    PinnedGoalsGrid,
    ThisWeekBand,
    SignalRail,
    type PlanWorkspaceObjective,
    type PlanWorkspaceTask,
} from "./plan-workspace-parts"

export type { PlanWorkspaceObjective, PlanWorkspaceTask }

export interface PlanWorkspaceProps {
    foundryName: string | null
    foundryPurpose: string | null
    pinnedGoals: StrategicGoalRow[]
    disproveAssumptions: DisproveAssumptionRow[]
    objectives: PlanWorkspaceObjective[]
    thisWeekTasks: PlanWorkspaceTask[]
    pendingGutchecks: GutcheckSessionRow[]
    recentHistory: HistoryEntryRow[]
}

export function PlanWorkspace(props: PlanWorkspaceProps): React.ReactNode {
    const {
        foundryName,
        foundryPurpose,
        pinnedGoals,
        disproveAssumptions,
        objectives,
        thisWeekTasks,
        pendingGutchecks,
        recentHistory,
    } = props

    const assumptionsByGoalId: Record<string, DisproveAssumptionRow[]> = {}
    for (const a of disproveAssumptions) {
        ;(assumptionsByGoalId[a.goal_id] ||= []).push(a)
    }

    const objectivesByGoalId: Record<string, PlanWorkspaceObjective[]> = {}
    for (const o of objectives) {
        if (o.strategic_goal_id) (objectivesByGoalId[o.strategic_goal_id] ||= []).push(o)
    }

    return (
        <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
            <StrategyHeader foundryName={foundryName} foundryPurpose={foundryPurpose} />
            <PinnedGoalsGrid
                goals={pinnedGoals}
                assumptionsByGoalId={assumptionsByGoalId}
                objectivesByGoalId={objectivesByGoalId}
            />
            <ThisWeekBand tasks={thisWeekTasks} />
            <SignalRail
                pendingGutchecks={pendingGutchecks}
                recentHistory={recentHistory}
                pinnedGoals={pinnedGoals}
            />
        </div>
    )
}
