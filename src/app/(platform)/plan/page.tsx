/**
 * @file plan/page.tsx — Compressed Plan landing.
 *
 * @description Server shell for the V2 compressed Plan page. Mockup-faithful
 * port of `FORGEOS-COMPRESSED-PLAN-MOCKUP.html` — fuses Strategy + Objectives
 * + Tasks into one canvas. Reads objectives (where `is_strategic_goal=true`
 * are pillars), their child objectives, and the tasks under those objectives.
 *
 * Real fields bound today:
 *   - foundries.purpose_data (purpose / mission / vision)
 *   - objectives.* (title, description, parent_objective_id, status, progress)
 *   - tasks.* (title, status, priority, end_date, objective_id, assignees)
 *
 * Empty-state policy: if a foundry has no purpose recorded, no strategic
 * pillars, or pillars with zero objectives/tasks, each section renders a
 * tone-matched empty state. No fabricated specifics — the mockup's example
 * pillars / objectives / tasks are illustrative only.
 *
 * @related
 *   - View:   ./plan-view.tsx
 *   - Styles: ./plan-v2.css (scoped .plan2)
 *   - Mockup: FORGEOS-COMPRESSED-PLAN-MOCKUP.html
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { ProfileSetupRequired } from "@/components/ProfileSetupRequired"
import type { FoundryPurposeData } from "@/types/foundry"

import {
  PlanView,
  type PlanHealth,
  type PlanObjectiveRow,
  type PlanPillarRow,
  type PlanTaskRow,
  type SageBriefing,
} from "./plan-view"
import { fetchPlanHistory } from "@/actions/plan/fetch-plan-history"
import { fetchPlanStreak } from "@/actions/plan/fetch-plan-streak"
import { fetchPlanMonthlySummary } from "@/actions/plan/fetch-plan-summary"
import { fetchDecisions } from "@/actions/plan/log-decision"

export const metadata: Metadata = {
  title: "Plan",
  description: "Purpose, pillars, objectives, and tasks — in one view.",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

interface ObjectiveRecord {
  id: string
  title: string
  description: string | null
  parent_objective_id: string | null
  is_strategic_goal: boolean | null
  status: string | null
  progress: number | null
  start_date: string | null
  end_date: string | null
}

interface TaskRecord {
  id: string
  title: string
  status: string | null
  risk_level: string | null
  end_date: string | null
  start_date: string | null
  created_at: string
  objective_id: string | null
}

interface AssigneeRecord {
  task_id: string
  profile_id: string
  profiles: { full_name: string | null; email: string | null } | null
}

export default async function PlanPage(): Promise<React.ReactNode> {
  // ── 1. Auth + foundry resolution ───────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, foundry_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.foundry_id) {
    return <ProfileSetupRequired userRole={profile?.role} />
  }

  const foundryId = profile.foundry_id
  const canCreate = profile.role === "Founder" || profile.role === "Executive"

  // ── 2. Foundry purpose ─────────────────────────────────────────────
  // Use the same RPC the Strategy page relies on (bypasses an RLS quirk on
  // foundries). Fall back to null on error so the page still renders an
  // honest empty-state purpose card.
  let purposeData: FoundryPurposeData | null = null
  const { data: foundry, error: foundryError } = await supabase.rpc("ensure_foundry_exists", {
    p_foundry_id: foundryId,
  })
  if (foundryError) {
    console.error(`[Plan] Failed to fetch foundry: foundryId=${foundryId} err=${foundryError.message}`)
  } else {
    const f = foundry as { purpose_data?: FoundryPurposeData | null } | null
    purposeData = f?.purpose_data ?? null
  }

  // ── 3. Objectives + tasks (parallel) ───────────────────────────────
  const [objectivesResult, tasksResult] = await Promise.all([
    supabase
      .from("objectives")
      .select(
        "id, title, description, parent_objective_id, is_strategic_goal, status, progress, start_date, end_date",
      )
      .eq("foundry_id", foundryId)
      .eq("is_ghost", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select(
        "id, title, status, risk_level, end_date, start_date, created_at, objective_id",
      )
      .eq("foundry_id", foundryId)
      .eq("is_ghost", false)
      .is("deleted_at", null)
      .not("objective_id", "is", null),
  ])

  const objectivesRaw = ((objectivesResult.data ?? []) as ObjectiveRecord[])
  const tasksRaw = ((tasksResult.data ?? []) as TaskRecord[])

  if (objectivesResult.error) {
    console.error("[Plan] Error loading objectives:", {
      foundryId,
      error: objectivesResult.error.message,
    })
  }
  if (tasksResult.error) {
    console.error("[Plan] Error loading tasks:", {
      foundryId,
      error: tasksResult.error.message,
    })
  }

  // ── 4. Task assignees (separate fetch — needs a join) ──────────────
  // Best-effort: failure leaves assignee initials empty.
  let assigneesByTask = new Map<string, string[]>()
  if (tasksRaw.length > 0) {
    const taskIds = tasksRaw.map((t) => t.id)
    const { data: assignees, error: assigneesError } = await supabase
      .from("task_assignees")
      .select("task_id, profile_id, profiles:profiles(full_name, email)")
      .in("task_id", taskIds)

    if (assigneesError) {
      console.error("[Plan] Error loading task assignees:", {
        foundryId,
        error: assigneesError.message,
      })
    } else {
      assigneesByTask = bucketAssigneesByTask((assignees ?? []) as unknown as AssigneeRecord[])
    }
  }

  // ── 5. Shape into pillar → objective → task tree ───────────────────
  const now = new Date()
  const strategicGoals = objectivesRaw.filter((o) => o.is_strategic_goal === true)
  const regularObjectives = objectivesRaw.filter((o) => !o.is_strategic_goal)

  const pillars: PlanPillarRow[] = strategicGoals.map((sg) => {
    const childObjectives = regularObjectives.filter((o) => o.parent_objective_id === sg.id)
    const childObjectiveIds = new Set(childObjectives.map((o) => o.id))

    const linkedTasks = tasksRaw.filter(
      (t) => t.objective_id !== null && childObjectiveIds.has(t.objective_id),
    )

    const totalTasks = linkedTasks.length
    const completedTasks = linkedTasks.filter((t) => isTaskComplete(t.status)).length
    const overdueTasks = linkedTasks.filter((t) => isOverdue(t, now)).length
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    const health = computeHealth({
      objectives: childObjectives.length,
      progress,
      overdueTasks,
      tasks: linkedTasks,
      now,
    })

    const objectives: PlanObjectiveRow[] = childObjectives.map((obj) => {
      const objTasks = linkedTasks.filter((t) => t.objective_id === obj.id)
      const objCompleted = objTasks.filter((t) => isTaskComplete(t.status)).length
      const objOverdue = objTasks.filter((t) => isOverdue(t, now)).length
      const objProgress =
        objTasks.length > 0 ? Math.round((objCompleted / objTasks.length) * 100) : 0
      const objHealth = computeHealth({
        objectives: 1,
        progress: objProgress,
        overdueTasks: objOverdue,
        tasks: objTasks,
        now,
      })

      const taskRows: PlanTaskRow[] = objTasks
        .slice() // don't mutate
        .sort((a, b) => sortTasks(a, b, now))
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          riskLevel: t.risk_level,
          end_date: t.end_date,
          assigneeInitials: assigneesByTask.get(t.id) ?? [],
          isDone: isTaskComplete(t.status),
          isOverdue: isOverdue(t, now),
        }))

      // Aggregate assignee initials across all tasks for the objective avatar stack
      const seen = new Set<string>()
      const objAssignees: string[] = []
      for (const t of taskRows) {
        for (const init of t.assigneeInitials) {
          if (!seen.has(init)) {
            seen.add(init)
            objAssignees.push(init)
          }
        }
      }

      return {
        id: obj.id,
        title: obj.title,
        description: obj.description,
        health: objHealth,
        totalTasks: objTasks.length,
        completedTasks: objCompleted,
        hint: null,
        assigneeInitials: objAssignees,
        tasks: taskRows,
      }
    })

    return {
      id: sg.id,
      title: sg.title,
      description: sg.description,
      progress,
      totalTasks,
      completedTasks,
      health,
      objectiveCount: childObjectives.length,
      objectives,
    }
  })

  // Unlinked = regular objectives without a parent pillar
  const unlinkedCount = regularObjectives.filter((o) => !o.parent_objective_id).length

  // ── 6. Aggregate progress + Sage briefing ──────────────────────────
  const totalProgress = computeTotalProgress(pillars)
  const sageBriefing: SageBriefing | null = pillars.length === 0 ? null : buildSageBriefing(pillars)

  // ── 7. Stickiness levers — load in parallel, never block the page ───
  const [historyResult, streakResult, summaryResult, decisionsResult] = await Promise.all([
    fetchPlanHistory(),
    fetchPlanStreak(),
    fetchPlanMonthlySummary(),
    fetchDecisions(),
  ])

  return (
    <PlanView
      sageBriefing={sageBriefing}
      purpose={purposeData}
      totalProgress={totalProgress}
      pillars={pillars}
      unlinkedCount={unlinkedCount}
      canCreate={canCreate}
      historyEntries={historyResult.entries}
      streakWeeks={streakResult.weeks}
      monthlySummary={summaryResult}
      decisions={decisionsResult.decisions}
    />
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

function bucketAssigneesByTask(rows: AssigneeRecord[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const row of rows) {
    const initials = deriveInitials(row.profiles?.full_name, row.profiles?.email)
    if (!initials) continue
    const arr = out.get(row.task_id) ?? []
    if (!arr.includes(initials)) arr.push(initials)
    out.set(row.task_id, arr)
  }
  return out
}

function deriveInitials(fullName: string | null | undefined, email: string | null | undefined): string {
  const source = (fullName ?? "").trim()
  if (source.length > 0) {
    const parts = source.split(/\s+/).slice(0, 2)
    const init = parts.map((p) => p.charAt(0).toUpperCase()).join("")
    if (init.length > 0) return init
  }
  const e = (email ?? "").trim()
  if (e.length > 0) return e.charAt(0).toUpperCase()
  return ""
}

function isTaskComplete(status: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s === "completed" || s === "done"
}

function isOverdue(task: TaskRecord, now: Date): boolean {
  if (!task.end_date) return false
  if (isTaskComplete(task.status)) return false
  const end = new Date(task.end_date)
  if (Number.isNaN(end.getTime())) return false
  return end < now
}

function sortTasks(a: TaskRecord, b: TaskRecord, now: Date): number {
  // Open tasks first, then completed
  const aDone = isTaskComplete(a.status) ? 1 : 0
  const bDone = isTaskComplete(b.status) ? 1 : 0
  if (aDone !== bDone) return aDone - bDone
  // Overdue tasks before non-overdue (within open bucket)
  const aOver = isOverdue(a, now) ? 0 : 1
  const bOver = isOverdue(b, now) ? 0 : 1
  if (aOver !== bOver) return aOver - bOver
  // Then by end_date asc (nulls last)
  const aEnd = a.end_date ? new Date(a.end_date).getTime() : Number.POSITIVE_INFINITY
  const bEnd = b.end_date ? new Date(b.end_date).getTime() : Number.POSITIVE_INFINITY
  return aEnd - bEnd
}

function computeHealth(args: {
  objectives: number
  progress: number
  overdueTasks: number
  tasks: TaskRecord[]
  now: Date
}): PlanHealth {
  const { objectives, progress, overdueTasks, tasks, now } = args
  if (objectives === 0) return "not-started"
  if (progress === 100 && tasks.length > 0) return "completed"
  if (overdueTasks > 0) return "off-track"

  // Timeline-aware: compare progress % vs elapsed %
  let earliestStart: Date | null = null
  let latestEnd: Date | null = null
  for (const t of tasks) {
    const start = t.start_date ? new Date(t.start_date) : new Date(t.created_at)
    const end = t.end_date ? new Date(t.end_date) : null
    if (!earliestStart || start < earliestStart) earliestStart = start
    if (end && (!latestEnd || end > latestEnd)) latestEnd = end
  }

  if (earliestStart && latestEnd && latestEnd > earliestStart) {
    const total = latestEnd.getTime() - earliestStart.getTime()
    const elapsed = Math.max(0, now.getTime() - earliestStart.getTime())
    const elapsedPct = Math.min(100, Math.round((elapsed / total) * 100))
    const gap = elapsedPct - progress
    if (gap <= 10) return "on-track"
    if (gap <= 25) return "at-risk"
    return "off-track"
  }

  // Fallback when no timeline data is available
  if (progress >= 50) return "on-track"
  if (progress >= 20) return "at-risk"
  return "off-track"
}

function computeTotalProgress(pillars: PlanPillarRow[]): number {
  if (pillars.length === 0) return 0
  let total = 0
  let done = 0
  for (const p of pillars) {
    total += p.totalTasks
    done += p.completedTasks
  }
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}

function buildSageBriefing(pillars: PlanPillarRow[]): SageBriefing {
  const totalProgress = computeTotalProgress(pillars)

  const ranked = [...pillars].sort((a, b) => b.progress - a.progress)
  const bright = ranked[0] && ranked[0].totalTasks > 0
    ? { title: ranked[0].title, percent: ranked[0].progress }
    : null

  // Risk = anything off-track first, then at-risk; pick the lowest-progress one
  const risk = (() => {
    const offTrack = pillars.filter((p) => p.health === "off-track")
    if (offTrack.length > 0) {
      const worst = offTrack.sort((a, b) => a.progress - b.progress)[0]
      return {
        title: worst.title,
        percent: worst.progress,
        reason:
          worst.totalTasks === 0
            ? "no tasks underneath it yet — it can't move without work attached"
            : `only ${worst.completedTasks} of ${worst.totalTasks} tasks are done and the timeline is slipping`,
      }
    }
    const atRisk = pillars.filter((p) => p.health === "at-risk")
    if (atRisk.length > 0) {
      const worst = atRisk.sort((a, b) => a.progress - b.progress)[0]
      return {
        title: worst.title,
        percent: worst.progress,
        reason: `progress is trailing the timeline at ${worst.progress}%`,
      }
    }
    return null
  })()

  return {
    overallPercent: totalProgress,
    pillarCount: pillars.length,
    bright,
    risk,
  }
}
