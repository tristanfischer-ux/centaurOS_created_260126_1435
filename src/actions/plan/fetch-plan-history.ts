/**
 * @file fetch-plan-history.ts
 *
 * @description Server action to load the last 30 plan_history entries for a
 * foundry, joined with the actor's display name and the entity's title.
 *
 * @security Derives foundry_id from the authenticated user — never trusts the caller.
 * @related
 *   - src/app/(platform)/plan/_components/plan-history-feed.tsx
 *   - supabase/migrations/20260425070000_plan_history.sql
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import type { PlanHistoryEntry } from "@/app/(platform)/plan/_components/plan-history-feed"

export interface FetchPlanHistoryResult {
  entries: PlanHistoryEntry[]
  error: string | null
}

export async function fetchPlanHistory(): Promise<FetchPlanHistoryResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { entries: [], error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("foundry_id")
    .eq("id", user.id)
    .single()

  if (!profile?.foundry_id) return { entries: [], error: "No foundry" }

  // Fetch the last 30 rows — actor name is resolved via a second query because
  // plan_history.actor_user_id is auth.users.id (not profiles.id, same thing
  // but we join through profiles for full_name).
  const { data: rows, error } = await supabase
    .from("plan_history")
    .select(`
      id,
      entity_type,
      entity_id,
      action,
      actor_user_id,
      after_data,
      before_data,
      created_at,
      profiles:actor_user_id (full_name)
    `)
    .eq("foundry_id", profile.foundry_id)
    .order("created_at", { ascending: false })
    .limit(30)

  if (error) {
    console.error("[fetch-plan-history] error", { error: error.message })
    return { entries: [], error: error.message }
  }

  const entries: PlanHistoryEntry[] = (rows ?? []).map((row) => {
    // Resolve actor name
    const actorName = (() => {
      const p = row.profiles as { full_name?: string | null } | null
      return p?.full_name ?? null
    })()

    // Resolve entity title from the jsonb snapshot
    const entityTitle = (() => {
      const d = (row.after_data ?? row.before_data) as Record<string, unknown> | null
      if (!d) return null
      const t = d["title"] ?? d["summary"]
      return typeof t === "string" ? t : null
    })()

    return {
      id: row.id,
      entity_type: row.entity_type as PlanHistoryEntry["entity_type"],
      entity_id: row.entity_id,
      action: row.action,
      actor_name: actorName,
      entity_title: entityTitle,
      created_at: row.created_at,
    }
  })

  return { entries, error: null }
}
