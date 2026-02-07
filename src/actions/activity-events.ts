'use server'

/**
 * @file activity-events.ts
 * 
 * @description Server actions for recording and querying user activity events.
 * Events are captured client-side via useActivityTracker and sent in batches.
 * The insights function aggregates raw events into patterns for the AI Context Builder.
 * 
 * @security Events are scoped to the user's active foundry via RLS.
 */

import { createClient } from '@/lib/supabase/server'

/** Shape of a single activity event from the client */
export interface ActivityEvent {
  event_type: 'page_view' | 'search' | 'feature_use' | 'time_spent' | 'advisory_question'
  event_data: Record<string, unknown>
}

/** Aggregated insights derived from raw activity events */
export interface ActivityInsights {
  /** Top pages by visit count in the last 30 days */
  top_pages: { page: string; count: number }[]
  /** Recent search queries (last 30 days) */
  recent_searches: { query: string; count: number }[]
  /** Most-used features */
  top_features: { feature: string; count: number }[]
  /** Total events in the period */
  total_events: number
  /** Period covered */
  period_days: number
}

const VALID_EVENT_TYPES = new Set([
  'page_view',
  'search',
  'feature_use',
  'time_spent',
  'advisory_question',
])

/**
 * Records a batch of activity events for the current user.
 * 
 * @param events Array of activity events to record
 * @returns Success status
 * 
 * @security Events are automatically scoped to user's foundry via RLS.
 * The user_id and foundry_id are set server-side (not trusted from client).
 */
export async function trackEvents(
  events: ActivityEvent[]
): Promise<{ success: boolean; error?: string }> {
  if (!events.length) {
    return { success: true }
  }

  // Cap batch size to prevent abuse
  if (events.length > 50) {
    return { success: false, error: 'Batch size exceeds maximum of 50 events' }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get user's foundry
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    return { success: false, error: 'No foundry associated' }
  }

  // Validate and prepare events (server-side sets user_id and foundry_id)
  const validEvents = events
    .filter((e) => VALID_EVENT_TYPES.has(e.event_type))
    .map((e) => ({
      foundry_id: profile.foundry_id,
      user_id: user.id,
      event_type: e.event_type,
      event_data: e.event_data || {},
    }))

  if (!validEvents.length) {
    return { success: true }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('activity_events')
    .insert(validEvents)

  if (error) {
    console.error('[ActivityEvents] Failed to insert events:', error.message)
    return { success: false, error: 'Failed to record events' }
  }

  return { success: true }
}

/**
 * Aggregates recent activity events into structured insights for the AI Context Builder.
 * 
 * @param foundryId Foundry to get insights for
 * @param days Number of days to look back (default 30)
 * @returns Aggregated activity insights
 * 
 * @security Only returns insights for the user's own foundry (enforced by RLS).
 */
export async function getActivityInsights(
  foundryId: string,
  days: number = 30
): Promise<{ insights?: ActivityInsights; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Verify foundry membership
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  if (profile?.foundry_id !== foundryId) {
    return { error: 'Cannot access insights for different foundry' }
  }

  const since = new Date()
  since.setDate(since.getDate() - days)

  // Fetch raw events for the period (RLS ensures foundry isolation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error } = await (supabase as any)
    .from('activity_events')
    .select('event_type, event_data, created_at')
    .eq('foundry_id', foundryId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.error('[ActivityEvents] Failed to fetch events:', error.message)
    return { error: 'Failed to fetch activity data' }
  }

  const rawEvents = (events || []) as {
    event_type: string
    event_data: Record<string, unknown>
    created_at: string
  }[]

  // Aggregate page views
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
        if (query) {
          searchCounts.set(query, (searchCounts.get(query) || 0) + 1)
        }
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

  return { insights }
}
