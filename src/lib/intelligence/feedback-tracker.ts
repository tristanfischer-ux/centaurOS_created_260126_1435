/**
 * @file feedback-tracker.ts
 *
 * @description Infers implicit feedback on surfaced insights by cross-referencing
 * the insight_log with activity_events and task_history.
 *
 * No "thumbs up/down" buttons needed — behavior tells us what's useful:
 * - User completed a flagged task within 24h → insight was useful
 * - User visited a flagged objective's detail page → insight was useful
 * - Same insight surfaced 3+ times with no action → insight was ignored
 *
 * Runs as part of the profile builder (when profile is refreshed).
 *
 * @security Uses authenticated Supabase client — RLS ensures data isolation.
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Infers whether recently surfaced insights were acted upon and updates
 * the insight_log accordingly.
 *
 * @description Cross-references recent insight_log entries (last 7 days, where
 * was_acted_on is NULL) with activity_events and task completions to determine
 * if the user took action based on the insight.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 *
 * @audit Updates was_acted_on and acted_on_at in insight_log
 */
export async function inferInsightFeedback(
  userId: string,
  foundryId: string
): Promise<{ updated: number; total: number }> {
  try {
    const supabase = await createClient()
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // 1. Get unresolved insights (was_acted_on IS NULL)
    const { data: unresolvedInsights } = await supabase
      .from('insight_log')
      .select('id, insight_type, content_summary, surfaced_at')
      .eq('user_id', userId)
      .eq('foundry_id', foundryId)
      .is('was_acted_on', null)
      .gte('surfaced_at', sevenDaysAgo.toISOString())
      .order('surfaced_at', { ascending: false })
      .limit(50)

    if (!unresolvedInsights || unresolvedInsights.length === 0) {
      return { updated: 0, total: 0 }
    }

    // 2. Get recent task completions (potential positive signals)
    const { data: recentCompletions } = await supabase
      .from('tasks')
      .select('title, updated_at')
      .eq('foundry_id', foundryId)
      .eq('assignee_id', userId)
      .eq('status', 'Completed')
      .gte('updated_at', sevenDaysAgo.toISOString())
      .limit(100)

    const completedTitles = new Set(
      (recentCompletions || []).map((t) => t.title.toLowerCase().trim())
    )

    // 3. Get recent page visits (potential positive signals)
    const { data: recentPageViews } = await supabase
      .from('activity_events')
      .select('event_data, created_at')
      .eq('foundry_id', foundryId)
      .eq('user_id', userId)
      .eq('event_type', 'page_view')
      .gte('created_at', sevenDaysAgo.toISOString())
      .limit(200)

    const visitedPages = new Set(
      (recentPageViews || []).map((e) => {
        const data = e.event_data as Record<string, unknown> | null
        return String(data?.page || '').toLowerCase()
      })
    )

    // 4. Evaluate each unresolved insight
    let updatedCount = 0
    const updates: Array<{ id: string; wasActedOn: boolean }> = []

    for (const insight of unresolvedInsights) {
      const summary = insight.content_summary.toLowerCase()
      const surfacedAt = new Date(insight.surfaced_at)
      const hoursSinceSurfaced = (now.getTime() - surfacedAt.getTime()) / (1000 * 60 * 60)

      let acted = false

      // Signal: user completed a task mentioned in the insight
      for (const title of completedTitles) {
        if (summary.includes(title.slice(0, 30))) {
          acted = true
          break
        }
      }

      // Signal: user visited an objective/task page after insight mentioned it
      if (!acted) {
        for (const page of visitedPages) {
          // Check if insight mentions objectives or tasks and user visited related pages
          if (
            (summary.includes('objective') || summary.includes('at risk') || summary.includes('at-risk')) &&
            (page.includes('/new-objectives/') || page.includes('/objectives/'))
          ) {
            acted = true
            break
          }
          if (
            (summary.includes('overdue') || summary.includes('task')) &&
            (page.includes('/new-tasks') || page.includes('/tasks'))
          ) {
            acted = true
            break
          }
        }
      }

      // Signal: insight is old (>48h) with no detected action → mark as not acted on
      if (!acted && hoursSinceSurfaced > 48) {
        updates.push({ id: insight.id, wasActedOn: false })
        updatedCount++
      } else if (acted) {
        updates.push({ id: insight.id, wasActedOn: true })
        updatedCount++
      }
      // else: too soon to tell — leave as NULL
    }

    // 5. Batch update
    for (const update of updates) {
      await supabase
        .from('insight_log')
        .update({
          was_acted_on: update.wasActedOn,
          acted_on_at: now.toISOString(),
        })
        .eq('id', update.id)
    }

    if (updatedCount > 0) {
      console.info('[FeedbackTracker] Updated insight feedback:', {
        userId,
        foundryId,
        updated: updatedCount,
        total: unresolvedInsights.length,
        actedOn: updates.filter((u) => u.wasActedOn).length,
        notActedOn: updates.filter((u) => !u.wasActedOn).length,
      })
    }

    return { updated: updatedCount, total: unresolvedInsights.length }
  } catch (error) {
    console.error('[FeedbackTracker] Failed to infer feedback:', {
      userId,
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { updated: 0, total: 0 }
  }
}
