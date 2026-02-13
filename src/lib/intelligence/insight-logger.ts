/**
 * @file insight-logger.ts
 *
 * @description Logs AI-generated insights to the insight_log table for
 * deduplication, narrative continuity, and implicit feedback tracking.
 *
 * Every time an AI generates a briefing narrative, nudge, weekly highlight,
 * or concern, the insight is logged here so future prompts can avoid
 * repetition and build on previous context.
 *
 * @security Uses authenticated Supabase client — RLS ensures users
 * can only write their own insight log entries.
 */

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────

export type InsightType =
  | 'briefing_narrative'
  | 'nudge'
  | 'weekly_highlight'
  | 'weekly_concern'
  | 'weekly_priority'

export interface InsightEntry {
  insightType: InsightType
  contentSummary: string
}

// ─── Hash Utility ─────────────────────────────────────────────────

/**
 * Creates a simple hash of content for deduplication.
 * Uses a fast string hash rather than crypto for performance.
 *
 * @param content - The insight text to hash
 * @returns A hex string hash
 */
function hashContent(content: string): string {
  let hash = 0
  const normalized = content.toLowerCase().trim()
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  // Convert to positive hex string with padding
  return Math.abs(hash).toString(16).padStart(8, '0')
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Logs one or more insights that were surfaced to the user.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 * @param insights - Array of insights to log
 *
 * @audit Appends to insight_log for feedback tracking
 */
export async function logInsights(
  userId: string,
  foundryId: string,
  insights: InsightEntry[]
): Promise<void> {
  if (insights.length === 0) return

  try {
    const supabase = await createClient()

    const rows = insights.map((insight) => ({
      user_id: userId,
      foundry_id: foundryId,
      insight_type: insight.insightType,
      content_hash: hashContent(insight.contentSummary),
      content_summary: insight.contentSummary.slice(0, 500), // Cap at 500 chars
    }))

    const { error } = await supabase.from('insight_log').insert(rows)

    if (error) {
      console.error('[InsightLogger] Failed to log insights:', {
        userId,
        foundryId,
        count: insights.length,
        error: error.message,
      })
    }
  } catch (error) {
    // Non-blocking — insight logging should never break the main flow
    console.error('[InsightLogger] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * Fetches recent insights surfaced to the user for deduplication.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 * @param days - Lookback period in days (default 7)
 * @param types - Optional filter by insight types
 * @returns Array of recent insight summaries
 */
export async function getRecentInsights(
  userId: string,
  foundryId: string,
  days: number = 7,
  types?: InsightType[]
): Promise<Array<{ type: InsightType; summary: string; surfacedAt: string; wasActedOn: boolean | null }>> {
  try {
    const supabase = await createClient()
    const since = new Date()
    since.setDate(since.getDate() - days)

    let query = supabase
      .from('insight_log')
      .select('insight_type, content_summary, surfaced_at, was_acted_on')
      .eq('user_id', userId)
      .eq('foundry_id', foundryId)
      .gte('surfaced_at', since.toISOString())
      .order('surfaced_at', { ascending: false })
      .limit(50)

    if (types && types.length > 0) {
      query = query.in('insight_type', types)
    }

    const { data, error } = await query

    if (error || !data) return []

    return data.map((row) => ({
      type: row.insight_type as InsightType,
      summary: row.content_summary,
      surfacedAt: row.surfaced_at,
      wasActedOn: row.was_acted_on,
    }))
  } catch {
    return []
  }
}

/**
 * Formats recent insights into a prompt section for deduplication.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 * @returns Formatted text block for AI prompt, or empty string
 */
export async function formatRecentInsightsForPrompt(
  userId: string,
  foundryId: string
): Promise<string> {
  const recent = await getRecentInsights(userId, foundryId, 7, ['briefing_narrative', 'nudge'])

  if (recent.length === 0) return ''

  const lines = recent.slice(0, 10).map((i) => {
    const daysAgo = Math.ceil(
      (Date.now() - new Date(i.surfacedAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    const actedLabel = i.wasActedOn === true ? ' [user acted on this]'
      : i.wasActedOn === false ? ' [user did not act on this]'
        : ''
    return `- (${daysAgo}d ago) ${i.summary}${actedLabel}`
  })

  return `\nPrevious insights you told this user (do NOT repeat these — build on them or provide new perspective):\n${lines.join('\n')}\n`
}
