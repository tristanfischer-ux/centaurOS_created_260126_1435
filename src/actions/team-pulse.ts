'use server'

/**
 * @file team-pulse.ts
 * 
 * @description Server actions for the Team Pulse dashboard.
 * Provides real-time team activity data, workload distribution,
 * and AI-generated daily standup summaries.
 * 
 * @security All actions require authentication and enforce foundry isolation
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { withAuth } from '@/lib/server-action-utils'
import { checkRateLimit } from '@/lib/security/rate-limit'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

// ─── Types ────────────────────────────────────────────────────────

export interface TeamMemberPulse {
  id: string
  name: string
  role: string | null
  avatarUrl: string | null
  activeTasks: number
  completedThisWeek: number
  overdueTasks: number
  currentFocus: string | null
}

export interface TeamPulseData {
  members: TeamMemberPulse[]
  totalActiveTasks: number
  totalCompletedThisWeek: number
  totalOverdue: number
  blockedTasks: number
}

export interface StandupEntry {
  memberId: string
  memberName: string
  yesterday: string[]
  today: string[]
  blockers: string[]
}

export interface DailyStandup {
  date: string
  entries: StandupEntry[]
  summary: string
}

// ─── Get Team Pulse ───────────────────────────────────────────────

/**
 * Fetches team activity data for the pulse dashboard.
 * 
 * @returns Team pulse data or error
 * 
 * @security Requires authenticated user with foundry membership
 */
export async function getTeamPulse(): Promise<{ data?: TeamPulseData; error?: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const today = new Date()
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoStr = weekAgo.toISOString()

    // 1. Get all team members
    const { data: memberships } = await supabase
      .from('foundry_memberships')
      .select(`
        user_id,
        role,
        profiles!inner(id, full_name, role, avatar_url)
      `)
      .eq('foundry_id', foundryId)

    if (!memberships || memberships.length === 0) {
      return { data: { members: [], totalActiveTasks: 0, totalCompletedThisWeek: 0, totalOverdue: 0, blockedTasks: 0 } }
    }

    // 2. Get all active tasks for the foundry
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, status, end_date, assignee_id, updated_at, objective_id')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)

    const allTasks = tasks || []
    const todayStr = today.toISOString().split('T')[0]

    // 3. Build per-member pulse
    const members: TeamMemberPulse[] = memberships.map((m) => {
      const profile = m.profiles as unknown as {
        id: string
        full_name: string | null
        role: string | null
        avatar_url: string | null
      }

      const memberTasks = allTasks.filter((t) => t.assignee_id === profile.id)
      const activeTasks = memberTasks.filter(
        (t) => ['Pending', 'Accepted'].includes(t.status || '')
      )
      const completedThisWeek = memberTasks.filter(
        (t) => t.status === 'Completed' && t.updated_at && t.updated_at >= weekAgoStr
      )
      const overdueTasks = activeTasks.filter(
        (t) => t.end_date && t.end_date < todayStr
      )

      // Current focus = most recently updated active task
      const sortedActive = [...activeTasks].sort((a, b) =>
        (b.updated_at || '').localeCompare(a.updated_at || '')
      )
      const currentFocus = sortedActive[0]?.title || null

      return {
        id: profile.id,
        name: profile.full_name || 'Unknown',
        role: m.role || profile.role,
        avatarUrl: profile.avatar_url,
        activeTasks: activeTasks.length,
        completedThisWeek: completedThisWeek.length,
        overdueTasks: overdueTasks.length,
        currentFocus,
      }
    })

    // Sort by active tasks (busiest first)
    members.sort((a, b) => b.activeTasks - a.activeTasks)

    // 4. Aggregate stats
    const totalActiveTasks = allTasks.filter(
      (t) => ['Pending', 'Accepted'].includes(t.status || '')
    ).length
    const totalCompletedThisWeek = allTasks.filter(
      (t) => t.status === 'Completed' && t.updated_at && t.updated_at >= weekAgoStr
    ).length
    const totalOverdue = allTasks.filter(
      (t) => t.end_date && t.end_date < todayStr && t.status !== 'Completed'
    ).length

    return {
      data: {
        members,
        totalActiveTasks,
        totalCompletedThisWeek,
        totalOverdue,
        blockedTasks: 0,
      },
    }
  }) as Promise<{ data?: TeamPulseData; error?: string }>
}

// ─── Generate Daily Standup ───────────────────────────────────────

/**
 * Generates an AI-powered daily standup summary from team activity.
 * 
 * @returns Daily standup data or error
 * 
 * @security Requires authenticated user with foundry membership
 */
export async function generateDailyStandup(): Promise<{ data?: DailyStandup; error?: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit
    const rateLimitError = await checkRateLimit('aiStrategicPlan', `standup:${user.id}`)
    if (rateLimitError) return { error: rateLimitError }

    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const todayStr = today.toISOString().split('T')[0]

    // 1. Get team members
    const { data: memberships } = await supabase
      .from('foundry_memberships')
      .select(`
        user_id,
        profiles!inner(id, full_name)
      `)
      .eq('foundry_id', foundryId)

    if (!memberships || memberships.length === 0) {
      return { error: 'No team members found' }
    }

    // 2. For each member, get yesterday's completed tasks and today's active tasks
    const entries: StandupEntry[] = []

    for (const m of memberships) {
      const profile = m.profiles as unknown as { id: string; full_name: string | null }

      // Yesterday's completions
      const { data: completedYesterday } = await supabase
        .from('tasks')
        .select('title')
        .eq('foundry_id', foundryId)
        .eq('assignee_id', profile.id)
        .eq('status', 'Completed')
        .gte('updated_at', `${yesterdayStr}T00:00:00`)
        .lt('updated_at', `${todayStr}T00:00:00`)
        .limit(10)

      // Today's active tasks
      const { data: activeTasks } = await supabase
        .from('tasks')
        .select('title, end_date')
        .eq('foundry_id', foundryId)
        .eq('assignee_id', profile.id)
        .in('status', ['Pending', 'Accepted'])
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .order('end_date', { ascending: true, nullsFirst: false })
        .limit(5)

      // Overdue (blockers)
      const overdueTasks = (activeTasks || []).filter(
        (t) => t.end_date && t.end_date < todayStr
      )

      entries.push({
        memberId: profile.id,
        memberName: profile.full_name || 'Unknown',
        yesterday: (completedYesterday || []).map((t) => t.title),
        today: (activeTasks || []).map((t) => t.title),
        blockers: overdueTasks.map((t) => `"${t.title}" is overdue`),
      })
    }

    // 3. Generate AI summary
    let summary = ''
    try {
      const standupText = entries.map((e) =>
        `${e.memberName}:
  Yesterday: ${e.yesterday.length > 0 ? e.yesterday.join(', ') : 'No completed tasks'}
  Today: ${e.today.length > 0 ? e.today.join(', ') : 'No active tasks'}
  Blockers: ${e.blockers.length > 0 ? e.blockers.join(', ') : 'None'}`
      ).join('\n\n')

      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite-preview',
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 200,
        },
      })

      const result = await model.generateContent(
        `Write a 2-3 sentence standup summary highlighting key focus areas and any blockers. Be concise and direct. No markdown, just plain text.\n\n${standupText}`
      )

      summary = result.response.text() || ''
    } catch {
      summary = `Team standup for ${todayStr}: ${entries.length} team members, ${entries.reduce((s, e) => s + e.today.length, 0)} active tasks today.`
    }

    return {
      data: {
        date: todayStr,
        entries,
        summary,
      },
    }
  }) as Promise<{ data?: DailyStandup; error?: string }>
}
