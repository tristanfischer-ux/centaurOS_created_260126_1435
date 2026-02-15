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

/** Cad Lab Design→RFQ funnel telemetry summary for rollout monitoring */
export interface CadLabRfqTelemetrySummary {
  period_days: number
  total_events: number
  totals: {
    create_attempts: number
    create_blocked: number
    create_failed: number
    created: number
    rebroadcast_attempts: number
    rebroadcasted: number
    manifest_downloads: number
    supplier_packet_downloads: number
    bom_downloads: number
  }
  conversion: {
    attempt_to_created_pct: number
    blocked_rate_pct: number
    failure_rate_pct: number
  }
  readiness: {
    avg_readiness_score_at_attempt: number | null
    avg_quote_ready_modules_at_attempt: number | null
  }
  top_block_reasons: Array<{ reason: string; count: number }>
  top_failure_reasons: Array<{ reason: string; count: number }>
}

const VALID_EVENT_TYPES = new Set([
  'page_view',
  'search',
  'feature_use',
  'time_spent',
  'advisory_question',
])

const CAD_LAB_FEATURE_EVENTS = {
  createAttempt: 'cad_lab_rfq_create_attempt',
  createBlocked: 'cad_lab_rfq_create_blocked',
  createFailed: 'cad_lab_rfq_create_failed',
  created: 'cad_lab_rfq_created',
  rebroadcastAttempt: 'cad_lab_rfq_rebroadcast_attempt',
  rebroadcasted: 'cad_lab_rfq_rebroadcasted',
  manifestDownloaded: 'cad_lab_package_manifest_downloaded',
  supplierPacketDownloaded: 'cad_lab_supplier_packet_downloaded',
  bomDownloaded: 'cad_lab_module_bom_downloaded',
} as const

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function mapToTopCounts(map: Map<string, number>, limit: number): Array<{ reason: string; count: number }> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([reason, count]) => ({ reason, count }))
}

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

/**
 * Aggregates Cad Lab Design→RFQ telemetry events for release monitoring.
 *
 * @param foundryId Foundry to get telemetry for
 * @param days Number of days to look back (default 30)
 * @returns Funnel summary including conversion, blockers, and readiness context
 */
export async function getCadLabRfqTelemetrySummary(
  foundryId: string,
  days: number = 30,
): Promise<{ summary?: CadLabRfqTelemetrySummary; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  if (profile?.foundry_id !== foundryId) {
    return { error: 'Cannot access telemetry for different foundry' }
  }

  const since = new Date()
  since.setDate(since.getDate() - days)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('activity_events')
    .select('event_type, event_data, created_at')
    .eq('foundry_id', foundryId)
    .eq('event_type', 'feature_use')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    console.error('[ActivityEvents] Failed to fetch Cad Lab RFQ telemetry:', error.message)
    return { error: 'Failed to fetch telemetry data' }
  }

  const events = (data || []) as Array<{
    event_type: string
    event_data: Record<string, unknown>
    created_at: string
  }>

  const totals = {
    create_attempts: 0,
    create_blocked: 0,
    create_failed: 0,
    created: 0,
    rebroadcast_attempts: 0,
    rebroadcasted: 0,
    manifest_downloads: 0,
    supplier_packet_downloads: 0,
    bom_downloads: 0,
  }

  const readinessAtAttempt: number[] = []
  const quoteReadyAtAttempt: number[] = []
  const blockedReasonCounts = new Map<string, number>()
  const failureReasonCounts = new Map<string, number>()

  for (const event of events) {
    const feature = String(event.event_data?.feature || '')
    switch (feature) {
      case CAD_LAB_FEATURE_EVENTS.createAttempt: {
        totals.create_attempts += 1
        const readiness = toFiniteNumber(event.event_data?.readinessScore)
        if (readiness !== null) readinessAtAttempt.push(readiness)
        const quoteReady = toFiniteNumber(event.event_data?.quoteReadyModules)
        if (quoteReady !== null) quoteReadyAtAttempt.push(quoteReady)
        break
      }
      case CAD_LAB_FEATURE_EVENTS.createBlocked: {
        totals.create_blocked += 1
        const reason = String(event.event_data?.reason || 'unknown')
        blockedReasonCounts.set(reason, (blockedReasonCounts.get(reason) || 0) + 1)
        break
      }
      case CAD_LAB_FEATURE_EVENTS.createFailed: {
        totals.create_failed += 1
        const reason = String(event.event_data?.reason || 'unknown')
        failureReasonCounts.set(reason, (failureReasonCounts.get(reason) || 0) + 1)
        break
      }
      case CAD_LAB_FEATURE_EVENTS.created:
        totals.created += 1
        break
      case CAD_LAB_FEATURE_EVENTS.rebroadcastAttempt:
        totals.rebroadcast_attempts += 1
        break
      case CAD_LAB_FEATURE_EVENTS.rebroadcasted:
        totals.rebroadcasted += 1
        break
      case CAD_LAB_FEATURE_EVENTS.manifestDownloaded:
        totals.manifest_downloads += 1
        break
      case CAD_LAB_FEATURE_EVENTS.supplierPacketDownloaded:
        totals.supplier_packet_downloads += 1
        break
      case CAD_LAB_FEATURE_EVENTS.bomDownloaded:
        totals.bom_downloads += 1
        break
      default:
        break
    }
  }

  const attemptBase = totals.create_attempts > 0 ? totals.create_attempts : 1

  const summary: CadLabRfqTelemetrySummary = {
    period_days: days,
    total_events: events.length,
    totals,
    conversion: {
      attempt_to_created_pct: Math.round((totals.created / attemptBase) * 100),
      blocked_rate_pct: Math.round((totals.create_blocked / attemptBase) * 100),
      failure_rate_pct: Math.round((totals.create_failed / attemptBase) * 100),
    },
    readiness: {
      avg_readiness_score_at_attempt: readinessAtAttempt.length > 0
        ? Math.round(readinessAtAttempt.reduce((sum, value) => sum + value, 0) / readinessAtAttempt.length)
        : null,
      avg_quote_ready_modules_at_attempt: quoteReadyAtAttempt.length > 0
        ? Number(
            (
              quoteReadyAtAttempt.reduce((sum, value) => sum + value, 0) /
              quoteReadyAtAttempt.length
            ).toFixed(2),
          )
        : null,
    },
    top_block_reasons: mapToTopCounts(blockedReasonCounts, 5),
    top_failure_reasons: mapToTopCounts(failureReasonCounts, 5),
  }

  return { summary }
}
