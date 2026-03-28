"use server"

/**
 * @file red-team-debate.ts — Server actions for Red Team debate history + actions
 *
 * @description Handles persistence (list/load past debates from report_snapshots)
 * and action creation (batch-create objectives + tasks from debate findings).
 * The actual debate generation is handled by the SSE route at /api/red-team/generate.
 */

import { withAuth } from "@/lib/server-action-utils"
import type { RedTeamDebateDocument, SuggestedObjective, SuggestedTask } from "@/lib/red-team/types"

// ─── History ────────────────────────────────────────────────────

export interface DebateHistoryItem {
  id: string
  topic: string
  generatedAt: string
  totalDuration: number
}

export async function listRedTeamDebates(): Promise<DebateHistoryItem[]> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from("report_snapshots")
      .select("id, summary_text, report_data, generated_at")
      .eq("foundry_id", foundryId)
      .eq("report_type", "red-team-debate")
      .order("generated_at", { ascending: false })
      .limit(20)

    if (error || !data) return []

    return data.map((row) => {
      const doc = row.report_data as unknown as RedTeamDebateDocument | null
      return {
        id: row.id,
        topic: doc?.topic || row.summary_text?.replace("Red Team Debate: ", "") || "Untitled",
        generatedAt: doc?.generatedAt || row.generated_at || new Date().toISOString(),
        totalDuration: doc?.totalDuration || 0,
      }
    })
  })
}

export async function loadRedTeamDebate(snapshotId: string): Promise<RedTeamDebateDocument | null> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from("report_snapshots")
      .select("report_data")
      .eq("id", snapshotId)
      .eq("foundry_id", foundryId)
      .single()

    if (error || !data) return null
    return (data.report_data as unknown as RedTeamDebateDocument) || null
  })
}

// ─── Create Actions from Debate ─────────────────────────────────

export async function createRedTeamActions(input: {
  topic: string
  objectives: SuggestedObjective[]
  tasks: SuggestedTask[]
}): Promise<{ success: boolean; objectiveId?: string; taskCount?: number; error?: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const { topic, objectives, tasks } = input

    // Create a parent objective for the debate follow-ups
    const objectiveTitle = objectives[0]?.title || `Red Team Follow-ups: ${topic.slice(0, 80)}`
    const objectiveDesc = objectives.map(o => `- ${o.title}: ${o.description}`).join("\n")

    const { data: objective, error: objError } = await supabase
      .from("objectives")
      .insert({
        title: objectiveTitle,
        description: `From Red Team debate: "${topic}"\n\n${objectiveDesc}`,
        status: "active",
        foundry_id: foundryId,
        created_by: user.id,
        target_date: objectives[0]?.targetDate || null,
      })
      .select("id")
      .single()

    if (objError || !objective) {
      return { success: false, error: objError?.message || "Failed to create objective" }
    }

    // Create tasks under this objective
    let taskCount = 0
    for (const task of tasks) {
      const { error: taskError } = await supabase
        .from("tasks")
        .insert({
          title: task.title,
          description: task.description,
          status: "Pending",
          foundry_id: foundryId,
          creator_id: user.id,
          objective_id: objective.id,
        })

      if (!taskError) taskCount++
    }

    return { success: true, objectiveId: objective.id, taskCount }
  })
}
