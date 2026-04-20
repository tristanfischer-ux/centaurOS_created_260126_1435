/**
 * @file page.tsx — Task drill-in (Phase 3 Plan redesign · Chunk B.3).
 *
 * Server component. Flag-gated behind FLAG_NEW_PLAN_EXPERIENCE.
 *
 * - Flag OFF → redirect('/new-tasks?task=' + id) so deep-links from emails /
 *   notifications still resolve under the legacy UI.
 * - Flag ON → fetch task + task_assignees (joined w/ profiles, specialists,
 *   fractionals) + task_comments (last 50) and render the drill-in.
 *
 * The `completeTask` / reassign server actions land in Chunk B.4 — this
 * surface imports the existing legacy `completeTask` action for V1 and
 * exposes a client sub-component for interactivity.
 *
 * Reference: PLAN-SCHEMA.md §§4 (tasks additive cols), §5 (task_assignees).
 * Mockup: PLAN-MOCKUP-TASK.html.
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import { Card, CardContent } from "@/components/ui/card"
import { TaskDetailView, type TaskDetailData } from "./task-detail-view"

export const metadata: Metadata = {
  title: "Task · Plan",
  description: "Task detail — thread, assignees, sub-tasks.",
}

type PageProps = { params: Promise<{ id: string }> }

/** Shape of the joined task_assignees rows we render in the sidebar. */
type JoinedAssignee = {
  id: string
  profile_id: string | null
  specialist_id: string | null
  fractional_id: string | null
  created_at: string | null
  profile:
    | { id: string; full_name: string | null; avatar_url: string | null; role: string | null }
    | null
  specialist:
    | { id: string; specialist_key: string; display_name: string; title: string | null }
    | null
  fractional:
    | { id: string; display_name: string; specialisation: string; avatar_gradient: string | null }
    | null
}

/** Shape of task_comments we render in the thread area. */
type JoinedComment = {
  id: string
  content: string
  is_system_log: boolean | null
  created_at: string | null
  user_id: string | null
  user:
    | { id: string; full_name: string | null; avatar_url: string | null; role: string | null }
    | null
}

export default async function PlanTaskPage({ params }: PageProps): Promise<React.ReactNode> {
  const { id } = await params

  const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
  if (!enabled) redirect(`/new-tasks?task=${id}`)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, foundry_id")
    .eq("id", user.id)
    .single()
  if (!profile?.foundry_id) redirect("/onboarding")

  // ── fetch the task (RLS-scoped) ────────────────────────────────────────
  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, title, description, status, risk_level, progress, end_date, start_date, objective_id, parent_task_id, foundry_id, created_at, updated_at, creator_id, assignee_id",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!task) {
    return (
      <div className="mx-auto max-w-2xl p-6 sm:p-8">
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Task not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This task was removed, or you don&rsquo;t have access to it.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── parallel fetches: assignees, sub-tasks, comments ───────────────────
  // task_assignees.fractional_id is an additive column (PLAN-SCHEMA §5),
  // not yet in the generated database.types.ts. Cast the builder to `any`
  // for joins that reference it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySb = supabase as any

  const [
    { data: assignees },
    { data: subtasks },
    { data: comments },
  ] = await Promise.all([
    anySb
      .from("task_assignees")
      .select(
        `id, profile_id, specialist_id, fractional_id, created_at,
         profile:profiles!task_assignees_profile_id_fkey(id, full_name, avatar_url, role),
         specialist:specialist_profiles!task_assignees_specialist_id_fkey(id, specialist_key, display_name, title),
         fractional:fractional_executives!task_assignees_fractional_id_fkey(id, display_name, specialisation, avatar_gradient)`,
      )
      .eq("task_id", task.id)
      .returns<JoinedAssignee[]>(),
    supabase
      .from("tasks")
      .select("id, title, status, progress, end_date, assignee_id")
      .eq("parent_task_id", task.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("task_comments")
      .select(
        `id, content, is_system_log, created_at, user_id,
         user:profiles!task_comments_user_id_fkey(id, full_name, avatar_url, role)`,
      )
      .eq("task_id", task.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<JoinedComment[]>(),
  ])

  const detail: TaskDetailData = {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      riskLevel: task.risk_level,
      progress: task.progress,
      endDate: task.end_date,
      startDate: task.start_date,
      parentTaskId: task.parent_task_id,
      objectiveId: task.objective_id,
    },
    assignees: (assignees ?? []).map((a) => ({
      id: a.id,
      profileId: a.profile_id,
      displayName:
        a.profile?.full_name ??
        a.specialist?.display_name ??
        a.fractional?.display_name ??
        "Unassigned",
      avatarUrl: a.profile?.avatar_url ?? null,
      role:
        a.specialist?.title ??
        a.fractional?.specialisation ??
        a.profile?.role ??
        null,
      kind: a.specialist_id
        ? ("specialist" as const)
        : a.fractional_id
          ? ("fractional" as const)
          : ("user" as const),
    })),
    subtasks: (subtasks ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status ?? "Pending",
      progress: s.progress,
      endDate: s.end_date,
    })),
    // Reverse so oldest-first in the thread UI.
    comments: (comments ?? [])
      .slice()
      .reverse()
      .map((c) => ({
        id: c.id,
        content: c.content,
        isSystemLog: c.is_system_log === true,
        createdAt: c.created_at,
        authorName: c.user?.full_name ?? "System",
        authorAvatarUrl: c.user?.avatar_url ?? null,
      })),
  }

  return <TaskDetailView data={detail} />
}
