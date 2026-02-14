/**
 * @file agent-insights.ts
 *
 * @description Server actions for the Always-On Agent Intelligence system.
 * Provides CRUD operations for agent insights (background specialist findings)
 * and preferences management.
 *
 * @security All actions require authenticated user with foundry membership.
 * RLS policies enforce foundry isolation.
 */

'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ──────────────────────────────────────────────────────────

export type InsightType = 'alert' | 'recommendation' | 'observation' | 'reminder' | 'report'
export type InsightUrgency = 'critical' | 'important' | 'informational'

export interface AgentInsight {
  id: string
  foundry_id: string
  specialist_id: string
  insight_type: InsightType
  urgency: InsightUrgency
  title: string
  body: string
  domain_data: Record<string, unknown>
  suggested_actions: Array<{
    label: string
    action_type: string
    action_data?: Record<string, unknown>
  }>
  is_read: boolean
  is_dismissed: boolean
  acted_on: boolean
  acted_on_at: string | null
  created_at: string
  expires_at: string | null
}

export interface InsightFeedResult {
  critical: AgentInsight[]
  important: AgentInsight[]
  informational: AgentInsight[]
  totalUnread: number
}

// ─── Queries ────────────────────────────────────────────────────────

/**
 * Fetches the insight feed for the current user's foundry.
 *
 * @description Returns insights grouped by urgency level, excluding
 * dismissed insights and expired ones. Most recent first.
 *
 * @param limit - Maximum insights per urgency level (default 10)
 * @returns Insights grouped by urgency, plus unread count
 */
export async function getInsightFeed(limit: number = 10): Promise<InsightFeedResult> {
  const supabase = await createClient()

  // AUTH: Get current user's foundry
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { critical: [], important: [], informational: [], totalUnread: 0 }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) {
    return { critical: [], important: [], informational: [], totalUnread: 0 }
  }

  // Fetch non-dismissed, non-expired insights
  const { data: insights, error } = await supabase
    .from('agent_insights')
    .select('*')
    .eq('foundry_id', foundryId)
    .eq('is_dismissed', false)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(limit * 3) // Fetch more to distribute across urgency levels

  if (error || !insights) {
    console.error('[AgentInsights] Failed to fetch insights:', error?.message)
    return { critical: [], important: [], informational: [], totalUnread: 0 }
  }

  const typed = insights as AgentInsight[]

  const critical = typed.filter(i => i.urgency === 'critical').slice(0, limit)
  const important = typed.filter(i => i.urgency === 'important').slice(0, limit)
  const informational = typed.filter(i => i.urgency === 'informational').slice(0, limit)
  const totalUnread = typed.filter(i => !i.is_read).length

  return { critical, important, informational, totalUnread }
}

/**
 * Marks an insight as read.
 *
 * @param insightId - The insight to mark as read
 *
 * @security Requires authenticated user; update scoped to user's foundry
 */
export async function markInsightRead(insightId: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return

  const { error } = await supabase
    .from('agent_insights')
    .update({ is_read: true })
    .eq('id', insightId)
    .eq('foundry_id', foundryId)

  if (error) {
    console.error('[AgentInsights] Failed to mark insight read:', error.message)
  }
}

/**
 * Dismisses an insight (hides it from the feed).
 *
 * @param insightId - The insight to dismiss
 *
 * @security Requires authenticated user; update scoped to user's foundry
 */
export async function dismissInsight(insightId: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return

  const { error } = await supabase
    .from('agent_insights')
    .update({ is_dismissed: true })
    .eq('id', insightId)
    .eq('foundry_id', foundryId)

  if (error) {
    console.error('[AgentInsights] Failed to dismiss insight:', error.message)
  }
}

/**
 * Marks an insight as acted on.
 *
 * @param insightId - The insight that was acted on
 *
 * @security Requires authenticated user; update scoped to user's foundry
 */
export async function markInsightActedOn(insightId: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return

  const { error } = await supabase
    .from('agent_insights')
    .update({
      acted_on: true,
      acted_on_at: new Date().toISOString(),
    })
    .eq('id', insightId)
    .eq('foundry_id', foundryId)

  if (error) {
    console.error('[AgentInsights] Failed to mark insight acted on:', error.message)
  }
}

/**
 * Fetches the latest weekly executive brief for the current foundry.
 *
 * @description Returns the most recent synthesis report from Cal (Chief of Staff).
 * Weekly briefs are insights of type "report" with domain_data.synthesis_type
 * set to "weekly_executive_brief".
 *
 * @returns The latest weekly brief, or null if none exists
 */
export async function getLatestWeeklyBrief(): Promise<AgentInsight | null> {
  const supabase = await createClient()

  // AUTH: Get current user's foundry
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return null

  // Fetch the latest weekly brief (report from chief-of-staff with synthesis_type)
  const { data: briefs, error } = await supabase
    .from('agent_insights')
    .select('*')
    .eq('foundry_id', foundryId)
    .eq('specialist_id', 'chief-of-staff')
    .eq('insight_type', 'report')
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !briefs || briefs.length === 0) {
    return null
  }

  // Verify it's actually a weekly brief via domain_data
  const brief = briefs[0] as AgentInsight
  const domainData = brief.domain_data as Record<string, unknown> | null
  if (domainData?.synthesis_type !== 'weekly_executive_brief') {
    return null
  }

  return brief
}

/**
 * Triggers generation of an auto-report (board update or investor brief).
 *
 * @description Invokes the agentic action engine to produce a report
 * that is stored as an insight for review on the Today page.
 *
 * @param reportType - Type of report to generate
 * @returns The insight ID of the generated report, or an error message
 */
export async function requestAutoReport(
  reportType: 'board_update' | 'investor_brief',
): Promise<{ insightId: string | null; error: string | null }> {
  const supabase = await createClient()

  // AUTH: Get current user's foundry
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { insightId: null, error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id, role')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) {
    return { insightId: null, error: 'No active foundry' }
  }

  // AUTH: Only Founders and Executives can request reports
  if (profile?.role !== 'Founder' && profile?.role !== 'Executive') {
    return { insightId: null, error: 'Insufficient permissions' }
  }

  try {
    // Dynamic import to avoid bundling server-only code in client
    const { autoGenerateReport } = await import('@/lib/agents/agentic-actions')
    const insightId = await autoGenerateReport(foundryId, reportType)
    return { insightId, error: insightId ? null : 'Report generation failed' }
  } catch (err) {
    console.error('[AgentInsights] requestAutoReport failed:', err)
    return { insightId: null, error: 'Report generation failed' }
  }
}

/**
 * Gets the count of unread insights for badge display.
 *
 * @returns Number of unread, non-dismissed insights
 */
export async function getUnreadInsightCount(): Promise<number> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return 0

  const { count, error } = await supabase
    .from('agent_insights')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', foundryId)
    .eq('is_dismissed', false)
    .eq('is_read', false)

  if (error) {
    console.error('[AgentInsights] Failed to count unread:', error.message)
    return 0
  }

  return count ?? 0
}
