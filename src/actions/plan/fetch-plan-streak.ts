/**
 * @file fetch-plan-streak.ts
 *
 * @description Server action that reads profiles.plan_streak_weeks for the
 * current user and refreshes it from plan_history if it is stale (>24 hours old).
 *
 * Refresh strategy: call the compute_plan_streak(foundry_id) SQL function,
 * write the result back to profiles, then return it. Stale-while-revalidate:
 * return the cached value immediately if fresh enough (within the same day)
 * to keep /plan load fast.
 *
 * @security Derives foundry_id from auth — never trusts caller.
 * @related
 *   - src/app/(platform)/plan/_components/streak-chip.tsx
 *   - supabase/migrations/20260425090000_profiles_plan_streak.sql
 */

"use server"

import { createClient } from "@/lib/supabase/server"

export interface FetchPlanStreakResult {
  weeks: number
  error: string | null
}

export async function fetchPlanStreak(): Promise<FetchPlanStreakResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { weeks: 0, error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("foundry_id, plan_streak_weeks, plan_streak_updated_at")
    .eq("id", user.id)
    .single()

  if (!profile?.foundry_id) return { weeks: 0, error: "No foundry" }

  // Use cached value if updated within the last 24 hours
  const updatedAt = profile.plan_streak_updated_at
    ? new Date(profile.plan_streak_updated_at)
    : null
  const isStale = !updatedAt || (Date.now() - updatedAt.getTime()) > 24 * 60 * 60 * 1000

  if (!isStale) {
    return { weeks: profile.plan_streak_weeks ?? 0, error: null }
  }

  // Recompute via the SQL function and cache back into profiles
  const { data: streakData, error: streakError } = await supabase
    .rpc("compute_plan_streak", { p_foundry_id: profile.foundry_id })

  if (streakError) {
    console.error("[fetch-plan-streak] compute_plan_streak error", {
      error: streakError.message,
    })
    return { weeks: profile.plan_streak_weeks ?? 0, error: streakError.message }
  }

  const weeks = (streakData as number) ?? 0

  // Write back to profiles — best-effort, don't fail the page load on error
  await supabase
    .from("profiles")
    .update({
      plan_streak_weeks: weeks,
      plan_streak_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)

  return { weeks, error: null }
}
