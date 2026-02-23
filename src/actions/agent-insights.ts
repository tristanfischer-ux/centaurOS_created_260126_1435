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

// ─── Smart Prompt Suggestions ────────────────────────────────────────

/**
 * Generates context-aware prompt suggestions for a specialist card.
 *
 * @description Scores prompts based on company stage, recent decisions,
 * time-based relevance, and which specialists haven't been consulted.
 *
 * @param specialistId - The specialist to get suggestions for
 * @returns Top 3-5 scored prompts with reasons
 *
 * @security Requires authenticated user with foundry membership
 */
export async function getSmartPromptSuggestions(
  specialistId: string,
): Promise<Array<{ prompt: string; reason: string; score: number }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return []

  // Fetch recent decisions and insights for context
  const [decisionsResult, insightsResult] = await Promise.all([
    supabase
      .from('specialist_decision_journal')
      .select('decision, specialist_id, created_at')
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('agent_insights')
      .select('title, specialist_id, urgency')
      .eq('foundry_id', foundryId)
      .eq('specialist_id', specialistId)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const suggestions: Array<{ prompt: string; reason: string; score: number }> = []

  // Suggest based on unread insights
  const insights = insightsResult.data ?? []
  for (const insight of insights.slice(0, 2)) {
    suggestions.push({
      prompt: `Tell me more about: ${insight.title}`,
      reason: insight.urgency === 'critical' ? 'Needs your attention' : 'Recent finding',
      score: insight.urgency === 'critical' ? 10 : 7,
    })
  }

  // Suggest follow-ups on recent decisions with this specialist
  const myDecisions = (decisionsResult.data ?? []).filter(d => d.specialist_id === specialistId)
  if (myDecisions.length > 0) {
    const latest = myDecisions[0]
    suggestions.push({
      prompt: `Follow up on: ${latest.decision.slice(0, 80)}`,
      reason: 'Continue from your last decision',
      score: 8,
    })
  }

  // Sort by score and return top 5
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

// ─── Context-to-Specialist Mapping ──────────────────────────────────

/**
 * Maps page contexts to the specialist IDs most relevant for that page.
 * Used by getContextualInsights to filter insights by page.
 */
const CONTEXT_SPECIALIST_MAP: Record<string, string[]> = {
  objectives: ['strategist', 'chief-of-staff'],
  strategy: ['strategist', 'chief-of-staff', 'finance-lead'],
  tasks: ['chief-of-staff', 'vp-engineering', 'product-lead'],
  team: ['hiring-team', 'chief-of-staff'],
  finance: ['finance-lead', 'fundraising-advisor'],
  forge: ['vp-manufacturing', 'vp-supply-chain', 'cto'],
  marketplace: ['sales-lead', 'growth-marketer'],
  today: ['chief-of-staff', 'strategist', 'finance-lead'],
} satisfies Record<string, string[]>

// ─── Contextual Queries ─────────────────────────────────────────────

/**
 * Fetches contextual insights for a specific page/context.
 *
 * @description Returns recent, non-dismissed insights relevant to the given
 * page context. Context maps to specialist IDs via CONTEXT_SPECIALIST_MAP.
 * Results are ordered by creation date (newest first).
 *
 * @param context - Page context (e.g., 'objectives', 'tasks', 'strategy', 'team', 'finance')
 * @param limit - Maximum number of insights to return (default 3)
 * @returns Array of specialist insights relevant to the context
 *
 * @security Requires authenticated user with foundry membership.
 * RLS policies enforce foundry isolation.
 */
export async function getContextualInsights(
  context: string,
  limit: number = 3,
): Promise<AgentInsight[]> {
  const supabase = await createClient()

  // AUTH: Get current user's foundry
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return []

  // Map page context to relevant specialist IDs
  const relevantSpecialists = CONTEXT_SPECIALIST_MAP[context] ?? ['chief-of-staff']

  const { data, error } = await supabase
    .from('agent_insights')
    .select('*')
    .eq('foundry_id', foundryId)
    .in('specialist_id', relevantSpecialists)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[AgentInsights] Failed to fetch contextual insights:', {
      context,
      foundryId,
      error: error.message,
    })
    return []
  }

  return (data ?? []) as AgentInsight[]
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

/**
 * Gets the most recent proactive opener for a specialist.
 *
 * @description Fetches the newest unread insight with a `proactive_opener` in
 * domain_data for the given specialist. Used by the dialog to render
 * proactive messages when the founder opens a specialist.
 *
 * @param specialistId - The specialist to check for proactive openers
 * @returns The opener text and insight ID, or null if none exists
 */
export async function getProactiveOpener(
  specialistId: string,
): Promise<{ opener: string; insightId: string; title: string; urgency: string } | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return null

  const { data: insights } = await supabase
    .from('agent_insights')
    .select('id, title, urgency, domain_data')
    .eq('foundry_id', foundryId)
    .eq('specialist_id', specialistId)
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .in('urgency', ['critical', 'important'])
    .order('created_at', { ascending: false })
    .limit(5)

  if (!insights?.length) return null

  // Find the first insight with a proactive_opener
  for (const insight of insights) {
    const domainData = (insight.domain_data ?? {}) as Record<string, unknown>
    if (typeof domainData.proactive_opener === 'string' && domainData.proactive_opener.length > 0) {
      return {
        opener: domainData.proactive_opener,
        insightId: insight.id,
        title: insight.title,
        urgency: insight.urgency,
      }
    }
  }

  return null
}

/**
 * Gets recent insights and overdue tasks for a specialist to use in greeting context.
 *
 * @description Fetches the 3 most recent unread insights and up to 2 overdue tasks
 * owned by this specialist. Used to enrich conversation starters with real data
 * so the specialist's first message references actual findings and pending work.
 *
 * @param specialistId - The specialist to get context for
 * @returns Object with insight titles and overdue task titles
 */
export async function getSpecialistGreetingContext(
  specialistId: string,
): Promise<{ insightTitles: string[]; overdueTasks: string[] }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { insightTitles: [], overdueTasks: [] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.active_foundry_id ?? profile?.foundry_id
  if (!foundryId) return { insightTitles: [], overdueTasks: [] }

  // Fetch in parallel: recent insights + overdue tasks
  const [insightsResult, tasksResult] = await Promise.all([
    supabase
      .from('agent_insights')
      .select('title')
      .eq('foundry_id', foundryId)
      .eq('specialist_id', specialistId)
      .eq('is_dismissed', false)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('tasks')
      .select('title')
      .eq('foundry_id', foundryId)
      .or(`created_by_agent_id.eq.${specialistId},owner_agent_id.eq.${specialistId}`)
      .not('status', 'in', '("Done","Completed")')
      .lt('end_date', new Date().toISOString())
      .is('deleted_at', null)
      .limit(2),
  ])

  return {
    insightTitles: (insightsResult.data ?? []).map(i => i.title),
    overdueTasks: (tasksResult.data ?? []).map(t => t.title),
  }
}
