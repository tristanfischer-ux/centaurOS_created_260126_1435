/**
 * @file page.tsx — "Plan" section page (flag-gated).
 *
 * @description Flag off: high-impact visual overview of Plan pages (Strategy,
 * Objectives, Tasks) via <PlanSectionIntro /> — unchanged. Flag on: real
 * Phase 3 Plan workspace fetching strategic_goals, disprove_assumptions,
 * linked objectives, pinned this-week tasks, pending gutchecks, and recent
 * history entries for the current foundry.
 *
 * Data is fetched server-side so the RSC payload contains real data —
 * no client-side loading state. Plan tables (strategic_goals etc.) are
 * not yet in the generated Database types; Money terminal regenerates
 * them in parallel. Until then we cast the supabase client to `any` at
 * the call site and narrow the result through the hand-written types in
 * src/types/plan.ts.
 */

import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import type { FoundryPurposeData } from "@/types/foundry"
import type {
    StrategicGoalRow,
    DisproveAssumptionRow,
    GutcheckSessionRow,
    HistoryEntryRow,
} from "@/types/plan"

import { PlanSectionIntro } from "./plan-section-intro"
import { PlanWorkspace, type PlanWorkspaceObjective, type PlanWorkspaceTask } from "./plan-workspace"

export const metadata: Metadata = {
    title: "Plan",
    description: "From vision to action — strategy, objectives, and tasks",
}

const MAX_PINNED_GOALS = 3
const MAX_WEEK_TASKS = 8
const MAX_HISTORY_ROWS = 10
const MAX_PENDING_GUTCHECKS = 3

export default async function PlanPage(): Promise<React.ReactNode> {
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) return <PlanSectionIntro />

    const supabase = await createClient()
    const foundryId = await getFoundryIdCached().catch(() => null)

    // No foundry → early empty state (still render workspace shell, no data)
    if (!foundryId) {
        return (
            <PlanWorkspace
                foundryName={null}
                foundryPurpose={null}
                pinnedGoals={[]}
                disproveAssumptions={[]}
                objectives={[]}
                thisWeekTasks={[]}
                pendingGutchecks={[]}
                recentHistory={[]}
            />
        )
    }

    // Plan tables aren't in Database types yet — cast to any for these queries.
    // Narrowed back to hand-written types below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any

    const [
        foundryRow,
        pinnedGoalsRes,
        weekTasksRes,
        gutchecksRes,
        historyRes,
    ] = await Promise.all([
        supabase
            .from("foundries")
            .select("name, purpose_data")
            .eq("id", foundryId)
            .maybeSingle(),
        untyped
            .from("strategic_goals")
            .select("*")
            .eq("foundry_id", foundryId)
            .eq("is_pinned", true)
            .is("deleted_at", null)
            .order("pin_order", { ascending: true })
            .limit(MAX_PINNED_GOALS),
        untyped
            .from("tasks")
            .select("id, title, status, strategic_goal_id, is_pinned, horizon, due_date")
            .eq("foundry_id", foundryId)
            .eq("is_pinned", true)
            .eq("horizon", "this_week")
            .limit(MAX_WEEK_TASKS),
        untyped
            .from("gutcheck_sessions")
            .select("*")
            .eq("foundry_id", foundryId)
            .is("decision", null)
            .order("fired_at", { ascending: false })
            .limit(MAX_PENDING_GUTCHECKS),
        untyped
            .from("history_entries")
            .select("*")
            .eq("foundry_id", foundryId)
            .order("created_at", { ascending: false })
            .limit(MAX_HISTORY_ROWS),
    ])

    const pinnedGoals = (pinnedGoalsRes.data as StrategicGoalRow[] | null) ?? []
    const weekTasks = (weekTasksRes.data as PlanWorkspaceTask[] | null) ?? []
    const pendingGutchecks = (gutchecksRes.data as GutcheckSessionRow[] | null) ?? []
    const recentHistory = (historyRes.data as HistoryEntryRow[] | null) ?? []

    // Fetch assumptions + objectives keyed to pinned goals only — skip if no goals.
    const goalIds = pinnedGoals.map((g) => g.id)
    let disproveAssumptions: DisproveAssumptionRow[] = []
    let objectives: PlanWorkspaceObjective[] = []

    if (goalIds.length > 0) {
        const [assumptionsRes, objectivesRes] = await Promise.all([
            untyped
                .from("disprove_assumptions")
                .select("*")
                .in("goal_id", goalIds)
                .order("order_index", { ascending: true }),
            untyped
                .from("objectives")
                .select("id, title, status, strategic_goal_id")
                .in("strategic_goal_id", goalIds)
                .is("deleted_at", null),
        ])
        disproveAssumptions = (assumptionsRes.data as DisproveAssumptionRow[] | null) ?? []
        objectives = (objectivesRes.data as PlanWorkspaceObjective[] | null) ?? []
    }

    // Foundry name + purpose (first 1–2 sentences).
    const foundryName = (foundryRow.data as { name?: string } | null)?.name ?? null
    const purposeData = (foundryRow.data as { purpose_data?: FoundryPurposeData | null } | null)?.purpose_data ?? null
    const foundryPurpose = purposeData?.purpose ?? null

    return (
        <PlanWorkspace
            foundryName={foundryName}
            foundryPurpose={foundryPurpose}
            pinnedGoals={pinnedGoals}
            disproveAssumptions={disproveAssumptions}
            objectives={objectives}
            thisWeekTasks={weekTasks}
            pendingGutchecks={pendingGutchecks}
            recentHistory={recentHistory}
        />
    )
}
