/**
 * @file log-decision.ts
 *
 * @description Server action to insert a new decision into the decisions table.
 * The trigger on decisions automatically writes a plan_history row with
 * action=decision_logged.
 *
 * @security
 *   - Derives foundry_id from auth — never trusts caller-supplied foundry_id.
 *   - author_user_id set to authenticated user.
 *
 * @related
 *   - src/app/(platform)/plan/_components/decision-log.tsx
 *   - supabase/migrations/20260425080000_decisions_table.sql
 */

"use server"

import { createClient } from "@/lib/supabase/server"

export interface LogDecisionInput {
  summary: string
  rationale?: string
  decided_at: string
  related_objective_ids?: string[]
  related_task_ids?: string[]
}

export interface LogDecisionResult {
  id: string | null
  error: string | null
}

export async function logDecision(input: LogDecisionInput): Promise<LogDecisionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { id: null, error: "Not authenticated" }

  if (!input.summary?.trim()) {
    return { id: null, error: "A one-line summary is required." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("foundry_id")
    .eq("id", user.id)
    .single()

  if (!profile?.foundry_id) {
    return { id: null, error: "No foundry associated with this account." }
  }

  const { data, error } = await supabase
    .from("decisions")
    .insert({
      foundry_id: profile.foundry_id,
      author_user_id: user.id,
      summary: input.summary.trim(),
      rationale: input.rationale?.trim() || null,
      decided_at: input.decided_at,
      related_objective_ids: JSON.stringify(input.related_objective_ids ?? []),
      related_task_ids: JSON.stringify(input.related_task_ids ?? []),
    })
    .select("id")
    .single()

  if (error) {
    console.error("[log-decision] insert error", { error: error.message })
    return { id: null, error: error.message }
  }

  return { id: data.id, error: null }
}

// ── Fetch decisions for the log component ─────────────────────────────────────

export interface FetchDecisionsResult {
  decisions: Array<{
    id: string
    summary: string
    rationale: string | null
    decided_at: string
    author_name: string | null
    related_objective_count: number
    related_task_count: number
  }>
  error: string | null
}

export async function fetchDecisions(): Promise<FetchDecisionsResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { decisions: [], error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("foundry_id")
    .eq("id", user.id)
    .single()

  if (!profile?.foundry_id) return { decisions: [], error: "No foundry" }

  const { data: rows, error } = await supabase
    .from("decisions")
    .select(`
      id,
      summary,
      rationale,
      decided_at,
      related_objective_ids,
      related_task_ids,
      profiles:author_user_id (full_name)
    `)
    .eq("foundry_id", profile.foundry_id)
    .order("decided_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("[fetch-decisions] error", { error: error.message })
    return { decisions: [], error: error.message }
  }

  const decisions = (rows ?? []).map((row) => {
    const authorName = (() => {
      const p = row.profiles as { full_name?: string | null } | null
      return p?.full_name ?? null
    })()

    const relatedObjectiveIds: string[] = Array.isArray(row.related_objective_ids)
      ? (row.related_objective_ids as string[])
      : []
    const relatedTaskIds: string[] = Array.isArray(row.related_task_ids)
      ? (row.related_task_ids as string[])
      : []

    return {
      id: row.id,
      summary: row.summary,
      rationale: row.rationale,
      decided_at: row.decided_at,
      author_name: authorName,
      related_objective_count: relatedObjectiveIds.length,
      related_task_count: relatedTaskIds.length,
    }
  })

  return { decisions, error: null }
}
