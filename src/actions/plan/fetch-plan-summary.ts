/**
 * @file fetch-plan-summary.ts
 *
 * @description Server action computing month-to-date plan activity counts for
 * the "What changed" banner on /plan.
 *
 * Returns:
 *   - decisions_this_month: decisions with decided_at in the current calendar month
 *   - tasks_closed_this_month: plan_history rows with action=completed and entity_type=task
 *   - objectives_revised_this_month: plan_history rows with entity_type=objective this month
 *
 * @security Derives foundry_id from auth.
 * @related
 *   - src/app/(platform)/plan/_components/what-changed-banner.tsx
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import type { PlanMonthlySummary } from "@/app/(platform)/plan/_components/what-changed-banner"

export async function fetchPlanMonthlySummary(): Promise<PlanMonthlySummary> {
  const empty: PlanMonthlySummary = {
    decisions_this_month: 0,
    tasks_closed_this_month: 0,
    objectives_revised_this_month: 0,
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const { data: profile } = await supabase
    .from("profiles")
    .select("foundry_id")
    .eq("id", user.id)
    .single()

  if (!profile?.foundry_id) return empty

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [decisionsResult, historyResult] = await Promise.all([
    // Decisions with decided_at this month
    supabase
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("foundry_id", profile.foundry_id)
      .gte("decided_at", monthStart.slice(0, 10)),

    // plan_history rows this month for tasks completed and objectives edited
    supabase
      .from("plan_history")
      .select("entity_type, action")
      .eq("foundry_id", profile.foundry_id)
      .gte("created_at", monthStart),
  ])

  const decisions_this_month = decisionsResult.count ?? 0
  const historyRows = historyResult.data ?? []

  const tasks_closed_this_month = historyRows.filter(
    (r) => r.entity_type === "task" && r.action === "completed"
  ).length

  const objectives_revised_this_month = historyRows.filter(
    (r) => r.entity_type === "objective" && ["updated", "status_changed", "progress_updated"].includes(r.action)
  ).length

  return { decisions_this_month, tasks_closed_this_month, objectives_revised_this_month }
}
