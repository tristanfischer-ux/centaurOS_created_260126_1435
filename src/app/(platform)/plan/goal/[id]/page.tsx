/**
 * @file page.tsx — Strategic Goal drill-in (Phase 3 Plan redesign · Chunk B.2).
 *
 * Server component. Flag-gated behind FLAG_NEW_PLAN_EXPERIENCE. When the flag
 * is OFF, hitting this URL redirects back to the legacy `/new-objectives`
 * surface; when ON, we fetch the Goal + its disprove test + objectives + team
 * + goal-scoped activity + any pending gutcheck and render the drill-in.
 *
 * `params.id === 'new'` renders the goal-create variant.
 *
 * Reference: PLAN-SCHEMA.md §§1, 2, 8, 9, 11. Mockup: PLAN-MOCKUP-GOAL.html.
 */
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import type {
    DisproveAssumptionRow,
    GoalTeamAssignmentRow,
    GutcheckSessionRow,
    HistoryEntryRow,
    StrategicGoalRow,
} from "@/types/plan"
import { GoalDetailView, type GoalDetailObjective } from "./goal-detail-view"
import { GoalCreateForm } from "./goal-create-form"

type JoinedTeamAssignment = GoalTeamAssignmentRow & {
    user: { id: string; full_name: string | null; avatar_url: string | null } | null
    fractional:
        | {
              id: string
              display_name: string
              avatar_gradient: string | null
              specialisation: string
          }
        | null
    specialist: { specialist_key: string; display_name: string; title: string } | null
}

export const metadata: Metadata = {
    title: "Strategic Goal · Plan",
    description: "Drill into a Strategic Goal — disprove test, objectives, team, activity.",
}

type PageProps = { params: Promise<{ id: string }> }

export default async function StrategicGoalPage({ params }: PageProps): Promise<React.ReactNode> {
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) redirect("/new-objectives")

    const { id } = await params

    // ── goal-create variant ────────────────────────────────────────────────
    if (id === "new") {
        return (
            <div className="mx-auto max-w-3xl p-6 sm:p-8">
                <GoalCreateForm />
            </div>
        )
    }

    // ── auth + foundry membership ──────────────────────────────────────────
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("id, foundry_id, role")
        .eq("id", user.id)
        .single()

    if (!profile?.foundry_id) redirect("/onboarding")

    // ── fetch goal (RLS-scoped) ────────────────────────────────────────────
    // strategic_goals + related tables are post-migration; not yet in
    // generated database.types.ts. Cast through `any` at the `.from()` boundary
    // so the rest of the file keeps its strong types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySb = supabase as any

    const { data: goal } = await anySb
        .from("strategic_goals")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle<StrategicGoalRow>()

    if (!goal) {
        return (
            <div className="mx-auto max-w-2xl p-8">
                <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                    <h1 className="text-2xl font-semibold tracking-tight">Goal not found</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        This Strategic Goal was removed, or you don&rsquo;t have access to it.
                    </p>
                </div>
            </div>
        )
    }

    // ── parallel fetches ───────────────────────────────────────────────────
    const [
        { data: assumptions },
        { data: teamAssignments },
        { data: objectives },
        { data: history },
        { data: gutcheckSessions },
    ] = await Promise.all([
        anySb
            .from("disprove_assumptions")
            .select("*")
            .eq("goal_id", goal.id)
            .order("order_index", { ascending: true })
            .returns<DisproveAssumptionRow[]>(),
        anySb
            .from("goal_team_assignments")
            .select(
                `*,
                user:profiles!goal_team_assignments_user_id_fkey(id, full_name, avatar_url),
                fractional:fractional_executives!goal_team_assignments_fractional_id_fkey(id, display_name, avatar_gradient, specialisation),
                specialist:specialist_profiles!goal_team_assignments_specialist_slug_fkey(specialist_key, display_name, title)`,
            )
            .eq("goal_id", goal.id)
            .returns<JoinedTeamAssignment[]>(),
        supabase
            .from("objectives")
            .select(
                "id, title, description, status, progress, end_date, strategic_goal_id, tasks(id, title, status, progress, end_date, assignee_id)",
            )
            // strategic_goal_id is an additive column per §3; cast to any for filter.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .eq("strategic_goal_id" as any, goal.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: true }),
        anySb
            .from("history_entries")
            .select("*")
            .eq("goal_id", goal.id)
            .order("created_at", { ascending: false })
            .limit(20)
            .returns<HistoryEntryRow[]>(),
        anySb
            .from("gutcheck_sessions")
            .select("*")
            .eq("goal_id", goal.id)
            .is("decided_at", null)
            .order("fired_at", { ascending: false })
            .returns<GutcheckSessionRow[]>(),
    ])

    const normalisedObjectives: GoalDetailObjective[] = ((objectives ?? []) as unknown as Array<{
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
        }> | null
    }>).map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        status: o.status,
        progress: o.progress,
        end_date: o.end_date,
        tasks: (o.tasks ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            progress: t.progress,
            end_date: t.end_date,
            assignee_id: t.assignee_id,
        })),
    }))

    return (
        <GoalDetailView
            goal={goal}
            assumptions={assumptions ?? []}
            teamAssignments={teamAssignments ?? []}
            objectives={normalisedObjectives}
            history={history ?? []}
            pendingGutcheck={gutcheckSessions?.[0] ?? null}
        />
    )
}
