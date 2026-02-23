"use server"

import { createClient } from "@/lib/supabase/server"
import { withAuth } from "@/lib/server-action-utils"

export type RecommendationSourceType =
  | "marketplace_recommendation"
  | "cad_research_report"
  | "cad_module"
  | "cad_diagnostics"
  | "component_recommendation"

export type RecommendationFeedbackType =
  | "thumbs_up"
  | "thumbs_down"
  | "component_swap"
  | "module_built"
  | "module_skipped"

export interface SubmitFeedbackInput {
  sourceType: RecommendationSourceType
  sourceId: string | null
  feedbackType: RecommendationFeedbackType
  comment?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Submits user feedback for a recommendation (thumbs up/down, swap, built/skipped).
 *
 * @description Used to collect signals for improving future prompts via few-shot examples.
 * @security Requires authenticated user; foundry_id and user_id set server-side.
 */
export async function submitRecommendationFeedback(
  input: SubmitFeedbackInput
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ foundryId, user }) => {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("recommendation_feedback").insert({
      foundry_id: foundryId,
      user_id: user.id,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      feedback_type: input.feedbackType,
      comment: input.comment ?? null,
      metadata: input.metadata ?? {},
    })
    if (error) {
      console.warn("[RecommendationFeedback] Insert failed:", error.message)
      return { error: "Failed to save feedback" }
    }
    return { success: true }
  })
}

/**
 * Fetches recent feedback for use as few-shot examples in prompts.
 *
 * @param limit - Max number of feedback items (default 10)
 * @param sourceTypes - Optional filter by source type
 * @param feedbackTypes - Optional filter by feedback type (e.g. only thumbs_up)
 * @returns Formatted string for injection into AI prompt, or empty if none
 */
export async function getRecentFeedbackForPrompt(
  limit: number = 10,
  sourceTypes?: RecommendationSourceType[],
  feedbackTypes?: RecommendationFeedbackType[]
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ""

  const { data: profile } = await supabase
    .from("profiles")
    .select("foundry_id")
    .eq("id", user.id)
    .single()
  if (!profile?.foundry_id) return ""

  let query = supabase
    .from("recommendation_feedback")
    .select("source_type, source_id, feedback_type, comment, metadata, created_at")
    .eq("foundry_id", profile.foundry_id)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (sourceTypes?.length) {
    query = query.in("source_type", sourceTypes)
  }
  if (feedbackTypes?.length) {
    query = query.in("feedback_type", feedbackTypes)
  }

  const { data: rows } = await query
  if (!rows?.length) return ""

  const lines = rows.map((r) => {
    const meta = r.metadata as Record<string, unknown> | null
    const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ""
    return `- ${r.feedback_type} on ${r.source_type}${r.source_id ? ` (${r.source_id})` : ""}${r.comment ? `: ${r.comment}` : ""}${metaStr}`
  })
  return "Recent feedback from this foundry:\n" + lines.join("\n")
}
