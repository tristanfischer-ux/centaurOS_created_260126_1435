/**
 * @file profile-builder.ts
 *
 * @description Computes and upserts a user intelligence profile by analyzing
 * task_history, standups, and activity_events over the last 30 days.
 * Called when the Today page loads if the profile is stale (>6 hours).
 *
 * The profile is a structured summary of user patterns that gets injected
 * into every AI prompt via buildAIContext(), enabling personalized briefings.
 *
 * @security Uses the authenticated Supabase client — RLS ensures users
 * can only read/write their own profile.
 */

import { createClient } from '@/lib/supabase/server'
import { analyzeProductivityPattern } from '@/lib/reports/trends'

// ─── Types ────────────────────────────────────────────────────────

export interface ProductivityPatterns {
  /** Average tasks completed per day (last 30 days) */
  avgTasksPerDay: number
  /** Which day of the week is most productive */
  bestDay: string | null
  /** Average completions per day-of-week */
  avgByDay: Record<string, number>
  /** Total tasks completed in the window */
  totalCompleted: number
  /** Total tasks created in the window */
  totalCreated: number
  /** Velocity trend: positive = accelerating, negative = decelerating */
  velocityTrend: number
  /** Recent week completions vs 4-week average */
  recentWeekVsPrior: number
}

export interface CommunicationStyle {
  /** Which pages the user spends the most time on */
  topPages: Array<{ page: string; count: number }>
  /** How many total page views in the period */
  totalPageViews: number
}

export interface FocusAreas {
  /** Objective IDs the user checks most (from page views) */
  topObjectiveIds: string[]
  /** Most-used features */
  topFeatures: Array<{ feature: string; count: number }>
}

export interface RiskTolerance {
  /** How often the user acts on at-risk items (visits objective detail after flagging) */
  atRiskActionRate: number
  /** Number of at-risk items the user engaged with */
  atRiskActedOn: number
  /** Number of at-risk items surfaced total */
  atRiskSurfaced: number
}

export interface RecentWin {
  taskTitle: string
  completedAt: string
  objectiveTitle: string | null
}

export interface KnownBlocker {
  text: string
  severity: string | null
  reportedAt: string
  recurring: boolean
}

export interface UserIntelligenceProfile {
  productivityPatterns: ProductivityPatterns
  communicationStyle: CommunicationStyle
  focusAreas: FocusAreas
  riskTolerance: RiskTolerance
  recentWins: RecentWin[]
  knownBlockers: KnownBlocker[]
  daysOfData: number
  firstActivityAt: string | null
}

// ─── Staleness Check ─────────────────────────────────────────────

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000 // 6 hours

/**
 * Checks if the user's intelligence profile is stale and needs rebuilding.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 * @returns true if profile is missing or older than 6 hours
 */
export async function isProfileStale(
  userId: string,
  foundryId: string
): Promise<boolean> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('user_intelligence_profiles')
    .select('updated_at')
    .eq('user_id', userId)
    .eq('foundry_id', foundryId)
    .single()

  if (!data) return true

  const updatedAt = new Date(data.updated_at).getTime()
  return Date.now() - updatedAt > STALE_THRESHOLD_MS
}

/**
 * Builds (or refreshes) the user intelligence profile from raw data.
 *
 * @description Queries task_history, standups, and activity_events for the
 * last 30 days, computes patterns, and upserts into user_intelligence_profiles.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 * @returns The computed profile, or null on failure
 *
 * @security RLS ensures the user can only write their own profile
 */
export async function buildUserProfile(
  userId: string,
  foundryId: string
): Promise<UserIntelligenceProfile | null> {
  try {
    const supabase = await createClient()
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

    // ─── 1. Productivity Patterns (from tasks) ──────────────

    // Get completions by day over last 30 days
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('id, title, updated_at, objectives!tasks_objective_id_fkey(title)')
      .eq('foundry_id', foundryId)
      .eq('assignee_id', userId)
      .eq('status', 'Completed')
      .gte('updated_at', thirtyDaysAgoStr)
      .order('updated_at', { ascending: false })
      .limit(500)

    const { data: createdTasks } = await supabase
      .from('tasks')
      .select('id, created_at')
      .eq('foundry_id', foundryId)
      .eq('assignee_id', userId)
      .gte('created_at', thirtyDaysAgoStr)
      .limit(500)

    // Build daily completion data for pattern analysis
    const dailyCompletions = new Map<string, number>()
    for (const task of completedTasks || []) {
      const date = (task.updated_at || task.id).split('T')[0] // updated_at should always exist for completed tasks
      if (task.updated_at) {
        dailyCompletions.set(date, (dailyCompletions.get(date) || 0) + 1)
      }
    }

    const dailyData = Array.from(dailyCompletions.entries()).map(([date, completed]) => ({
      date,
      completed,
    }))

    const { bestDay, avgByDay } = analyzeProductivityPattern(dailyData)

    const totalCompleted = (completedTasks || []).length
    const totalCreated = (createdTasks || []).length
    const avgTasksPerDay = Math.round((totalCompleted / 30) * 10) / 10

    // Velocity: compare last 7 days vs prior 23 days average
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentCompletions = (completedTasks || []).filter(
      (t) => t.updated_at && new Date(t.updated_at) >= sevenDaysAgo
    ).length
    const priorCompletions = totalCompleted - recentCompletions
    const priorAvgPerWeek = priorCompletions > 0 ? (priorCompletions / 23) * 7 : 0
    const velocityTrend = priorAvgPerWeek > 0
      ? Math.round(((recentCompletions - priorAvgPerWeek) / priorAvgPerWeek) * 100)
      : 0

    const productivityPatterns: ProductivityPatterns = {
      avgTasksPerDay,
      bestDay,
      avgByDay,
      totalCompleted,
      totalCreated,
      velocityTrend,
      recentWeekVsPrior: recentCompletions,
    }

    // ─── 2. Recent Wins (last 5 significant completions) ────

    const recentWins: RecentWin[] = (completedTasks || []).slice(0, 5).map((t) => ({
      taskTitle: t.title,
      completedAt: t.updated_at || now.toISOString(),
      objectiveTitle: (t.objectives as unknown as { title: string } | null)?.title || null,
    }))

    // ─── 3. Known Blockers (from standups) ──────────────────

    const { data: recentStandups } = await supabase
      .from('standups')
      .select('blockers, blocker_severity, standup_date')
      .eq('foundry_id', foundryId)
      .eq('user_id', userId)
      .not('blockers', 'is', null)
      .gte('standup_date', thirtyDaysAgoStr.split('T')[0])
      .order('standup_date', { ascending: false })
      .limit(30)

    // Detect recurring blockers (same text appearing 2+ times)
    const blockerCounts = new Map<string, number>()
    for (const standup of recentStandups || []) {
      if (standup.blockers) {
        const normalized = standup.blockers.toLowerCase().trim()
        blockerCounts.set(normalized, (blockerCounts.get(normalized) || 0) + 1)
      }
    }

    const knownBlockers: KnownBlocker[] = (recentStandups || []).slice(0, 5).map((s) => ({
      text: s.blockers || '',
      severity: s.blocker_severity,
      reportedAt: s.standup_date,
      recurring: blockerCounts.get((s.blockers || '').toLowerCase().trim()) as number >= 2,
    }))

    // ─── 4. Activity-Based Insights ─────────────────────────

    const { data: activityEvents } = await supabase
      .from('activity_events')
      .select('event_type, event_data, created_at')
      .eq('foundry_id', foundryId)
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(1000)

    // Communication style: top pages
    const pageCounts = new Map<string, number>()
    const featureCounts = new Map<string, number>()
    const objectivePageVisits = new Map<string, number>()
    let totalPageViews = 0

    for (const event of activityEvents || []) {
      const eventData = event.event_data as Record<string, unknown> | null
      if (event.event_type === 'page_view' && eventData?.page) {
        const page = String(eventData.page)
        pageCounts.set(page, (pageCounts.get(page) || 0) + 1)
        totalPageViews++

        // Track objective detail page visits
        const objectiveMatch = page.match(/\/new-objectives\/([a-f0-9-]+)/)
        if (objectiveMatch) {
          objectivePageVisits.set(
            objectiveMatch[1],
            (objectivePageVisits.get(objectiveMatch[1]) || 0) + 1
          )
        }
      }
      if (event.event_type === 'feature_use' && eventData?.feature) {
        const feature = String(eventData.feature)
        featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1)
      }
    }

    const sortMap = <T>(map: Map<string, T>, compareFn: (a: [string, T], b: [string, T]) => number, limit: number) =>
      Array.from(map.entries()).sort(compareFn).slice(0, limit)

    const communicationStyle: CommunicationStyle = {
      topPages: sortMap(pageCounts, (a, b) => (b[1] as number) - (a[1] as number), 5).map(
        ([page, count]) => ({ page, count: count as number })
      ),
      totalPageViews,
    }

    const focusAreas: FocusAreas = {
      topObjectiveIds: sortMap(
        objectivePageVisits,
        (a, b) => (b[1] as number) - (a[1] as number),
        5
      ).map(([id]) => id),
      topFeatures: sortMap(featureCounts, (a, b) => (b[1] as number) - (a[1] as number), 5).map(
        ([feature, count]) => ({ feature, count: count as number })
      ),
    }

    // ─── 5. Risk Tolerance (placeholder — needs insight_log) ─

    const riskTolerance: RiskTolerance = {
      atRiskActionRate: 0,
      atRiskActedOn: 0,
      atRiskSurfaced: 0,
    }

    // ─── 6. Days of data & first activity ───────────────────

    const { data: firstEvent } = await supabase
      .from('activity_events')
      .select('created_at')
      .eq('foundry_id', foundryId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    const firstActivityAt = firstEvent?.created_at || null
    const daysOfData = firstActivityAt
      ? Math.ceil((now.getTime() - new Date(firstActivityAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0

    // ─── 7. Assemble and upsert profile ─────────────────────

    const profile: UserIntelligenceProfile = {
      productivityPatterns,
      communicationStyle,
      focusAreas,
      riskTolerance,
      recentWins,
      knownBlockers,
      daysOfData,
      firstActivityAt,
    }

    const upsertRow = {
      user_id: userId,
      foundry_id: foundryId,
      productivity_patterns: JSON.parse(JSON.stringify(productivityPatterns)),
      communication_style: JSON.parse(JSON.stringify(communicationStyle)),
      focus_areas: JSON.parse(JSON.stringify(focusAreas)),
      risk_tolerance: JSON.parse(JSON.stringify(riskTolerance)),
      recent_wins: JSON.parse(JSON.stringify(recentWins)),
      known_blockers: JSON.parse(JSON.stringify(knownBlockers)),
      days_of_data: daysOfData,
      first_activity_at: firstActivityAt,
      updated_at: now.toISOString(),
    }

    const { error: upsertError } = await supabase
      .from('user_intelligence_profiles')
      .upsert(upsertRow, { onConflict: 'user_id,foundry_id' })

    if (upsertError) {
      console.error('[ProfileBuilder] Upsert failed:', {
        userId,
        foundryId,
        error: upsertError.message,
      })
      return null
    }

    console.info('[ProfileBuilder] Profile rebuilt:', {
      userId,
      foundryId,
      daysOfData,
      totalCompleted,
      bestDay,
      velocityTrend: `${velocityTrend}%`,
    })

    return profile
  } catch (error) {
    console.error('[ProfileBuilder] Failed to build profile:', {
      userId,
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

/**
 * Fetches the existing user intelligence profile from the database.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 * @returns The profile data, or null if not found
 */
export async function getUserProfile(
  userId: string,
  foundryId: string
): Promise<UserIntelligenceProfile | null> {
  try {
    const supabase = await createClient()

    const { data } = await supabase
      .from('user_intelligence_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('foundry_id', foundryId)
      .single()

    if (!data) return null

    return {
      productivityPatterns: data.productivity_patterns as unknown as ProductivityPatterns,
      communicationStyle: data.communication_style as unknown as CommunicationStyle,
      focusAreas: data.focus_areas as unknown as FocusAreas,
      riskTolerance: data.risk_tolerance as unknown as RiskTolerance,
      recentWins: data.recent_wins as unknown as RecentWin[],
      knownBlockers: data.known_blockers as unknown as KnownBlocker[],
      daysOfData: data.days_of_data || 0,
      firstActivityAt: data.first_activity_at,
    }
  } catch {
    return null
  }
}

/**
 * Ensures the user profile is fresh, rebuilding if stale.
 * Call this from the Today page load path.
 *
 * @param userId - The authenticated user's ID
 * @param foundryId - The current foundry ID
 * @returns The profile (fresh or cached), or null on failure
 */
export async function ensureFreshProfile(
  userId: string,
  foundryId: string
): Promise<UserIntelligenceProfile | null> {
  const stale = await isProfileStale(userId, foundryId)
  if (stale) {
    return buildUserProfile(userId, foundryId)
  }
  return getUserProfile(userId, foundryId)
}

/**
 * Formats the user intelligence profile into a natural-language block
 * suitable for injection into AI system prompts.
 *
 * @param profile - The computed user intelligence profile
 * @returns Formatted text block for AI context
 */
export function formatProfileForAI(profile: UserIntelligenceProfile): string {
  const sections: string[] = []

  // Productivity patterns
  const pp = profile.productivityPatterns
  if (pp.totalCompleted > 0) {
    const lines: string[] = []
    lines.push(`Average ${pp.avgTasksPerDay} tasks/day over the last 30 days (${pp.totalCompleted} total)`)
    if (pp.bestDay) {
      lines.push(`Most productive day: ${pp.bestDay}`)
    }
    if (pp.velocityTrend !== 0) {
      const direction = pp.velocityTrend > 0 ? 'up' : 'down'
      lines.push(`Velocity trend: ${direction} ${Math.abs(pp.velocityTrend)}% vs prior weeks`)
    }
    sections.push(`Productivity patterns:\n${lines.join('\n')}`)
  }

  // Recent wins
  if (profile.recentWins.length > 0) {
    const wins = profile.recentWins
      .slice(0, 3)
      .map((w) => `"${w.taskTitle}"${w.objectiveTitle ? ` (${w.objectiveTitle})` : ''}`)
      .join(', ')
    sections.push(`Recent completions: ${wins}`)
  }

  // Known blockers
  const recurringBlockers = profile.knownBlockers.filter((b) => b.recurring)
  if (recurringBlockers.length > 0) {
    const blockers = recurringBlockers.map((b) => `"${b.text}"`).join(', ')
    sections.push(`Recurring blockers reported in standups: ${blockers}`)
  }

  // Focus areas
  if (profile.focusAreas.topFeatures.length > 0) {
    const features = profile.focusAreas.topFeatures.map((f) => f.feature).join(', ')
    sections.push(`Most-used features: ${features}`)
  }

  // Data depth
  if (profile.daysOfData > 0) {
    sections.push(`Profile based on ${profile.daysOfData} days of activity data`)
  }

  if (sections.length === 0) return ''

  return `\n--- User Intelligence Profile ---\n${sections.join('\n')}\n--- End User Intelligence Profile ---\n`
}
