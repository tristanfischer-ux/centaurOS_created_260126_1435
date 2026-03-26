'use server'

/**
 * @file nudges.ts
 * 
 * @description Server actions for the Smart Nudges / AI Coach system.
 * Generates morning briefings, identifies at-risk objectives, and
 * suggests next actions based on the user's plan state.
 * 
 * @security All actions require authentication and enforce foundry isolation
 */

import { withAIGate } from '@/lib/ai/with-ai-gate'
import { logInsights } from '@/lib/intelligence/insight-logger'
import { ensureFreshProfile } from '@/lib/intelligence/profile-builder'
import { inferInsightFeedback } from '@/lib/intelligence/feedback-tracker'
import type { InsightEntry } from '@/lib/intelligence/insight-logger'

// ─── Types ────────────────────────────────────────────────────────

export interface MorningBriefing {
  greeting: string
  narrative: string
  userName: string
  topTasks: Array<{
    id: string
    title: string
    objectiveTitle: string | null
    dueDate: string | null
    isOverdue: boolean
  }>
  overdueCount: number
  atRiskObjectives: Array<{
    id: string
    title: string
    progress: number
    daysUntilDeadline: number | null
    reason: string
  }>
  streak: number
  completedYesterday: number
  nudges: Array<{
    type: 'overdue' | 'stale' | 'at_risk' | 'momentum'
    message: string
    actionLabel?: string
    actionHref?: string
  }>
  /** Number of days of activity data the intelligence profile is based on */
  intelligenceDaysOfData: number
  /** Productivity pattern: best day of the week */
  bestProductivityDay: string | null
  /** Velocity trend as a percentage (positive = accelerating) */
  velocityTrend: number
}

// ─── Morning Briefing ─────────────────────────────────────────────

/**
 * Generates a personalized morning briefing for the user.
 * 
 * @description Analyzes the user's tasks, objectives, and recent activity
 * to create a focused summary of what needs attention today.
 * 
 * @returns Morning briefing data or error
 * 
 * @security Requires authenticated user with foundry membership
 */
export async function getMorningBriefing(): Promise<{ data?: MorningBriefing; error?: string }> {
  return withAIGate('nudges', async ({ supabase, user, foundryId }) => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    // 1. Get user's active tasks ordered by urgency
    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        id, title, status, end_date, start_date, risk_level,
        objectives!tasks_objective_id_fkey(title)
      `)
      .eq('foundry_id', foundryId)
      .eq('assignee_id', user.id)
      .in('status', ['Pending', 'Accepted'])
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .order('end_date', { ascending: true, nullsFirst: false })
      .limit(50)

    // 2. Get overdue count
    const overdueTasks = (tasks || []).filter((t) => {
      if (!t.end_date) return false
      return t.end_date < todayStr
    })

    // 3. Get today's due tasks + top upcoming
    const dueTodayOrSoon = (tasks || []).filter((t) => {
      if (!t.end_date) return false
      const daysUntil = Math.ceil(
        (new Date(t.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )
      return daysUntil >= 0 && daysUntil <= 7
    })

    // Top 3 most urgent tasks
    const topTasks = [...overdueTasks, ...dueTodayOrSoon]
      .slice(0, 3)
      .map((t) => ({
        id: t.id,
        title: t.title,
        objectiveTitle: (t.objectives as unknown as { title: string } | null)?.title || null,
        dueDate: t.end_date,
        isOverdue: !!(t.end_date && t.end_date < todayStr),
      }))

    // 4. Get at-risk objectives
    const { data: objectives } = await supabase
      .from('objectives')
      .select('id, title, progress, milestone_date, status')
      .eq('foundry_id', foundryId)
      .in('status', ['In Progress', 'Not Started'])
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .limit(50)

    const atRiskObjectives = (objectives || [])
      .map((obj) => {
        let daysUntilDeadline: number | null = null
        let reason = ''

        if (obj.milestone_date) {
          daysUntilDeadline = Math.ceil(
            (new Date(obj.milestone_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          )
        }

        // At risk if: overdue, or progress is low relative to time remaining
        if (daysUntilDeadline !== null && daysUntilDeadline < 0) {
          reason = 'Deadline has passed'
        } else if (daysUntilDeadline !== null && daysUntilDeadline < 14 && (obj.progress || 0) < 50) {
          reason = `Only ${obj.progress || 0}% done with ${daysUntilDeadline} days left`
        } else if ((obj.progress || 0) === 0 && obj.status === 'In Progress') {
          reason = 'No progress recorded yet'
        } else {
          return null
        }

        return {
          id: obj.id,
          title: obj.title,
          progress: obj.progress || 0,
          daysUntilDeadline,
          reason,
        }
      })
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .slice(0, 3)

    // 5. Calculate streak (consecutive days with task completions)
    let streak = 0
    const checkDate = new Date(yesterday)
    for (let i = 0; i < 30; i++) {
      const dateStr = checkDate.toISOString().split('T')[0]
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('foundry_id', foundryId)
        .eq('status', 'Completed')
        .gte('updated_at', `${dateStr}T00:00:00`)
        .lt('updated_at', `${dateStr}T23:59:59`)

      if ((count || 0) > 0) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        break
      }
    }

    // 6. Count completed yesterday
    const { count: completedYesterday } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('status', 'Completed')
      .gte('updated_at', `${yesterdayStr}T00:00:00`)
      .lt('updated_at', `${yesterdayStr}T23:59:59`)

    // 7. Generate nudges
    const nudges: MorningBriefing['nudges'] = []

    if (overdueTasks.length > 0) {
      nudges.push({
        type: 'overdue',
        message: `You have ${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? 's' : ''}. Consider reassigning or updating deadlines.`,
        actionLabel: 'View overdue tasks',
        actionHref: '/new-tasks',
      })
    }

    if (atRiskObjectives.length > 0) {
      nudges.push({
        type: 'at_risk',
        message: `${atRiskObjectives.length} objective${atRiskObjectives.length !== 1 ? 's are' : ' is'} at risk of missing ${atRiskObjectives.length !== 1 ? 'their' : 'its'} deadline.`,
        actionLabel: 'Review objectives',
        actionHref: '/new-objectives',
      })
    }

    if (streak >= 5) {
      nudges.push({
        type: 'momentum',
        message: `${streak}-day completion streak! Your team is building great momentum.`,
      })
    }

    // No tasks assigned
    if ((tasks || []).length === 0) {
      nudges.push({
        type: 'stale',
        message: 'No tasks assigned to you. Check your objectives or create some tasks.',
        actionLabel: 'Go to tasks',
        actionHref: '/new-tasks',
      })
    }

    // Time tracking nudge — remind if nothing logged yesterday (weekdays only)
    const yesterdayDay = yesterday.getUTCDay()
    if (yesterdayDay >= 1 && yesterdayDay <= 5) {
      // Exclude active timers (placeholder entries) — only count completed entries
      const { count: timeYesterday, error: timeError } = await supabase
        .from('time_entries')
        .select('*', { count: 'exact', head: true })
        .eq('foundry_id', foundryId)
        .eq('user_id', user.id)
        .eq('entry_date', yesterdayStr)
        .or('started_at.is.null,ended_at.not.is.null')

      // Skip nudge if query failed (e.g. table not migrated yet)
      if (!timeError && (timeYesterday ?? 0) === 0) {
        nudges.push({
          type: 'stale',
          message: 'You didn\'t log any time yesterday — catch up now?',
          actionLabel: 'Log time',
          actionHref: '/time',
        })
      }
    }

    // 8. Build greeting
    const hour = today.getHours()
    let timeGreeting = 'Good morning'
    if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon'
    if (hour >= 17) timeGreeting = 'Good evening'

    const greeting = (completedYesterday || 0) > 0
      ? `${timeGreeting}! You completed ${completedYesterday} task${(completedYesterday || 0) !== 1 ? 's' : ''} yesterday.`
      : `${timeGreeting}! Here is what needs your attention today.`

    // 9. Generate personalized narrative briefing

    // 9a. Fetch user's first name from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const userName = profile?.full_name?.split(' ')[0] || 'there'

    // 9b. Build user intelligence context (productivity patterns, velocity)
    let intelligenceDaysOfData = 0
    let bestProductivityDay: string | null = null
    let velocityTrend = 0
    try {
      const profile = await ensureFreshProfile(user.id, foundryId)
      if (profile) {
        intelligenceDaysOfData = profile.daysOfData
        bestProductivityDay = profile.productivityPatterns.bestDay
        velocityTrend = profile.productivityPatterns.velocityTrend
      }
    } catch {
      // Non-blocking — intelligence context is optional
    }

    // 9d. Run implicit feedback inference in background (non-blocking)
    inferInsightFeedback(user.id, foundryId).catch(() => {
      // Silently ignore — feedback tracking is best-effort
    })

    // DECISION: Narrative generation moved to Cal (Haiku) via generateTodayBriefing.
    // This server action now returns the DB-driven greeting as the narrative fallback.
    const narrative = greeting

    // 10. Log insights for deduplication and feedback tracking
    const insightsToLog: InsightEntry[] = []

    // Log the narrative briefing
    if (narrative !== greeting) {
      insightsToLog.push({
        insightType: 'briefing_narrative',
        contentSummary: narrative,
      })
    }

    // Log each nudge
    for (const nudge of nudges) {
      insightsToLog.push({
        insightType: 'nudge',
        contentSummary: nudge.message,
      })
    }

    // Non-blocking: log insights
    logInsights(user.id, foundryId, insightsToLog).catch(() => {
      // Silently ignore — logging should never break the main flow
    })

    return {
      data: {
        greeting,
        narrative,
        userName,
        topTasks,
        overdueCount: overdueTasks.length,
        atRiskObjectives,
        streak,
        completedYesterday: completedYesterday || 0,
        nudges,
        intelligenceDaysOfData,
        bestProductivityDay,
        velocityTrend,
      },
    }
  }) as Promise<{ data?: MorningBriefing; error?: string }>
}
