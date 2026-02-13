'use server'

/**
 * @file progress-report.ts
 * 
 * @description Server actions for generating weekly progress reports.
 * Creates a summary of objectives and tasks progress with AI-written
 * executive summary. Reports can be shared via public link.
 * 
 * @security All actions require authentication and enforce foundry isolation
 */

import OpenAI from 'openai'
import { withAuth } from '@/lib/server-action-utils'
import { checkRateLimit } from '@/lib/security/rate-limit'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build',
})

// ─── Types ────────────────────────────────────────────────────────

export interface ObjectiveProgress {
  id: string
  title: string
  progress: number
  previousProgress: number
  status: string
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  health: 'on-track' | 'at-risk' | 'off-track' | 'completed'
}

export interface WeeklyDigest {
  weekStarting: string
  weekEnding: string
  summary: string
  objectiveProgress: ObjectiveProgress[]
  tasksCompleted: number
  tasksCreated: number
  totalActiveObjectives: number
  overallHealthTrend: 'improving' | 'stable' | 'declining'
  highlights: string[]
  concerns: string[]
}

// ─── Generate Weekly Digest ───────────────────────────────────────

/**
 * Generates a weekly progress digest for the current foundry.
 * 
 * @description Analyzes the past week's activity across all objectives
 * and tasks to create a comprehensive progress report with AI-generated
 * executive summary.
 * 
 * @returns Weekly digest data or error
 * 
 * @security Requires authenticated user with foundry membership
 */
export async function generateWeeklyDigest(): Promise<{ data?: WeeklyDigest; error?: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit
    const rateLimitError = await checkRateLimit('aiStrategicPlan', `digest:${user.id}`)
    if (rateLimitError) return { error: rateLimitError }

    const today = new Date()
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoStr = weekAgo.toISOString()
    const todayStr = today.toISOString().split('T')[0]

    // 1. Fetch all active objectives with their tasks
    const { data: objectives } = await supabase
      .from('objectives')
      .select(`
        id, title, progress, status, milestone_date,
        tasks(id, title, status, end_date, updated_at)
      `)
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .is('parent_objective_id', null)
      .in('status', ['In Progress', 'Not Started', 'Completed'])
      .order('created_at', { ascending: true })

    // 2. Calculate progress for each objective
    const objectiveProgress: ObjectiveProgress[] = (objectives || []).map((obj) => {
      const tasks = (obj.tasks || []) as Array<{
        id: string
        title: string
        status: string
        end_date: string | null
        updated_at: string
      }>
      const totalTasks = tasks.length
      const completedTasks = tasks.filter((t) => t.status === 'Completed').length
      const overdueTasks = tasks.filter(
        (t) => t.end_date && t.end_date < todayStr && t.status !== 'Completed'
      ).length

      // Estimate previous week's progress (simple heuristic)
      const recentlyCompleted = tasks.filter(
        (t) => t.status === 'Completed' && t.updated_at >= weekAgoStr
      ).length
      const currentProgress = obj.progress || 0
      const previousProgress = totalTasks > 0
        ? Math.max(0, currentProgress - Math.round((recentlyCompleted / Math.max(totalTasks, 1)) * 100))
        : 0

      // Health calculation
      let health: ObjectiveProgress['health'] = 'on-track'
      if (currentProgress >= 100 || obj.status === 'Completed') {
        health = 'completed'
      } else if (overdueTasks > 0) {
        health = 'off-track'
      } else if (currentProgress < 25 && totalTasks > 3) {
        health = 'at-risk'
      }

      return {
        id: obj.id,
        title: obj.title,
        progress: currentProgress,
        previousProgress,
        status: obj.status || 'In Progress',
        totalTasks,
        completedTasks,
        overdueTasks,
        health,
      }
    })

    // 3. Count tasks completed and created this week
    const { count: tasksCompleted } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('status', 'Completed')
      .gte('updated_at', weekAgoStr)

    const { count: tasksCreated } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .gte('created_at', weekAgoStr)

    // 4. Determine overall health trend
    const totalImproved = objectiveProgress.filter(
      (o) => o.progress > o.previousProgress
    ).length
    const totalDeclined = objectiveProgress.filter(
      (o) => o.overdueTasks > 0 && o.health !== 'completed'
    ).length

    let overallHealthTrend: WeeklyDigest['overallHealthTrend'] = 'stable'
    if (totalImproved > totalDeclined + 1) overallHealthTrend = 'improving'
    if (totalDeclined > totalImproved) overallHealthTrend = 'declining'

    // 5. Generate AI executive summary
    const progressSummary = objectiveProgress.map((o) =>
      `- ${o.title}: ${o.progress}% (${o.health}), ${o.completedTasks}/${o.totalTasks} tasks done, ${o.overdueTasks} overdue`
    ).join('\n')

    let summary = ''
    const highlights: string[] = []
    const concerns: string[] = []

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You write concise weekly progress summaries for startup founders. Be direct, factual, and actionable. No fluff.

Given objective progress data, respond with ONLY valid JSON:
{
  "summary": "2-3 sentence executive summary of the week's progress",
  "highlights": ["2-3 positive developments"],
  "concerns": ["1-3 items needing attention, or empty array if none"]
}`
          },
          {
            role: 'user',
            content: `Week: ${weekAgo.toLocaleDateString()} - ${today.toLocaleDateString()}
Tasks completed: ${tasksCompleted || 0}
Tasks created: ${tasksCreated || 0}
Health trend: ${overallHealthTrend}

Objectives:
${progressSummary || 'No active objectives'}`
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 500,
      })

      const content = response.choices[0]?.message?.content
      if (content) {
        const parsed = JSON.parse(content)
        summary = parsed.summary || ''
        highlights.push(...(parsed.highlights || []))
        concerns.push(...(parsed.concerns || []))
      }
    } catch (err) {
      console.error('[ProgressReport] AI summary failed:', err instanceof Error ? err.message : 'Unknown')
      summary = `This week: ${tasksCompleted || 0} tasks completed across ${objectiveProgress.length} objectives. Overall trend: ${overallHealthTrend}.`
    }

    return {
      data: {
        weekStarting: weekAgo.toISOString().split('T')[0],
        weekEnding: todayStr,
        summary,
        objectiveProgress,
        tasksCompleted: tasksCompleted || 0,
        tasksCreated: tasksCreated || 0,
        totalActiveObjectives: objectiveProgress.filter((o) => o.health !== 'completed').length,
        overallHealthTrend,
        highlights,
        concerns,
      },
    }
  }) as Promise<{ data?: WeeklyDigest; error?: string }>
}
