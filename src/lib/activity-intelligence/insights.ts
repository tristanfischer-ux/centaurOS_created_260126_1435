/**
 * @file insights.ts
 * 
 * @description Aggregates raw activity events into structured behavioral insights.
 * These insights are consumed by the AI Context Builder to enrich prompts.
 * 
 * This module provides a server-side aggregation function that can be called
 * on-demand (when building AI context) or periodically (cron/Edge Function).
 */

import { createClient } from '@/lib/supabase/server'
import type { ActivityInsights } from '@/actions/activity-events'

/**
 * Summarises behavioral insights into a concise natural-language paragraph
 * suitable for injection into an AI system prompt.
 * 
 * Returns null if there are no meaningful insights (< 5 events).
 */
export function summariseInsights(insights: ActivityInsights): string | null {
  if (insights.total_events < 5) return null

  const parts: string[] = []

  // Top pages
  if (insights.top_pages.length > 0) {
    const pages = insights.top_pages
      .slice(0, 5)
      .map((p) => p.page.replace(/^\/(platform\/)?/, '').replace(/\//g, ' > ') || 'dashboard')
      .join(', ')
    parts.push(`Most visited areas: ${pages}`)
  }

  // Search themes
  if (insights.recent_searches.length > 0) {
    const searches = insights.recent_searches
      .slice(0, 5)
      .map((s) => `"${s.query}"`)
      .join(', ')
    parts.push(`Recent searches: ${searches}`)
  }

  // Feature adoption
  if (insights.top_features.length > 0) {
    const features = insights.top_features
      .slice(0, 5)
      .map((f) => f.feature)
      .join(', ')
    parts.push(`Most-used features: ${features}`)
  }

  if (parts.length === 0) return null

  return `User activity (last ${insights.period_days} days, ${insights.total_events} events):\n${parts.join('\n')}`
}

/**
 * Fetches and summarises activity insights for a foundry directly from the database.
 * Convenience wrapper that combines the fetch + summarise steps.
 * 
 * @param foundryId - Foundry to fetch insights for
 * @param days - Lookback period in days (default 30)
 * @returns Natural-language summary or null
 */
export async function getInsightsSummary(
  foundryId: string,
  days: number = 30
): Promise<string | null> {
  try {
    const supabase = await createClient()

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data: events, error } = await supabase
      .from('activity_events')
      .select('event_type, event_data')
      .eq('foundry_id', foundryId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error || !events?.length) return null

    const rawEvents = events as {
      event_type: string
      event_data: Record<string, unknown>
    }[]

    // Quick aggregation (same logic as getActivityInsights but without auth)
    const pageCounts = new Map<string, number>()
    const searchCounts = new Map<string, number>()
    const featureCounts = new Map<string, number>()

    for (const event of rawEvents) {
      switch (event.event_type) {
        case 'page_view': {
          const page = String(event.event_data?.page || 'unknown')
          pageCounts.set(page, (pageCounts.get(page) || 0) + 1)
          break
        }
        case 'search': {
          const query = String(event.event_data?.query || '').toLowerCase().trim()
          if (query) searchCounts.set(query, (searchCounts.get(query) || 0) + 1)
          break
        }
        case 'feature_use': {
          const feature = String(event.event_data?.feature || 'unknown')
          featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1)
          break
        }
      }
    }

    const sortByCount = (map: Map<string, number>, limit: number) =>
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)

    const insights: ActivityInsights = {
      top_pages: sortByCount(pageCounts, 10).map(([page, count]) => ({ page, count })),
      recent_searches: sortByCount(searchCounts, 10).map(([query, count]) => ({ query, count })),
      top_features: sortByCount(featureCounts, 10).map(([feature, count]) => ({ feature, count })),
      total_events: rawEvents.length,
      period_days: days,
    }

    return summariseInsights(insights)
  } catch (err) {
    console.debug('[Insights] Failed to get insights summary:', err)
    return null
  }
}
