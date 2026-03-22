'use server'

/**
 * @file progress-report.ts
 * 
 * @description Server actions for generating weekly progress reports.
 * Creates a narrative summary of objectives and tasks progress with
 * AI-written executive summary that references specific tasks, people,
 * and context. Reports can be shared via public link.
 * 
 * @security All actions require authentication and enforce foundry isolation
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { withAIGate } from '@/lib/ai/with-ai-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logInsights } from '@/lib/intelligence/insight-logger'
import type { InsightEntry } from '@/lib/intelligence/insight-logger'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY?.trim() || '')

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

export interface CompletedTaskDetail {
  title: string
  description: string | null
  completedBy: string
  objectiveTitle: string
}

export interface OverdueTaskDetail {
  title: string
  description: string | null
  objectiveTitle: string
  daysOverdue: number
  assignedTo: string
  riskLevel: string | null
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
  nextWeekPriorities: string[]
  completedTaskDetails: CompletedTaskDetail[]
  overdueTaskDetails: OverdueTaskDetail[]
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
  return withAIGate('progress_report', async ({ supabase, user, foundryId }) => {
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

    // 3. Fetch completed tasks WITH titles and assignee names
    const { data: completedTaskRows } = await supabase
      .from('tasks')
      .select(`
        id, title, description, objective_id,
        profiles:assigned_to(full_name),
        objectives:objective_id(title)
      `)
      .eq('foundry_id', foundryId)
      .eq('status', 'Completed')
      .gte('updated_at', weekAgoStr)
      .order('updated_at', { ascending: false })
      .limit(30)

    const completedTaskDetails: CompletedTaskDetail[] = (completedTaskRows || []).map((t) => ({
      title: t.title || 'Untitled task',
      description: t.description || null,
      completedBy: (t.profiles as unknown as { full_name: string } | null)?.full_name || 'Unknown',
      objectiveTitle: (t.objectives as unknown as { title: string } | null)?.title || 'No objective',
    }))
    const tasksCompleted = completedTaskDetails.length

    // 4. Fetch tasks created this week
    const { count: tasksCreated } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .gte('created_at', weekAgoStr)

    // 5. Fetch overdue tasks with context
    const { data: overdueTaskRows } = await supabase
      .from('tasks')
      .select(`
        id, title, description, risk_level, end_date, objective_id,
        profiles:assigned_to(full_name),
        objectives:objective_id(title)
      `)
      .eq('foundry_id', foundryId)
      .neq('status', 'Completed')
      .lt('end_date', todayStr)
      .order('end_date', { ascending: true })
      .limit(15)

    const overdueTaskDetails: OverdueTaskDetail[] = (overdueTaskRows || []).map((t) => {
      const dueDate = t.end_date ? new Date(t.end_date) : today
      const daysOverdue = Math.max(1, Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      return {
        title: t.title || 'Untitled task',
        description: t.description || null,
        objectiveTitle: (t.objectives as unknown as { title: string } | null)?.title || 'No objective',
        daysOverdue,
        assignedTo: (t.profiles as unknown as { full_name: string } | null)?.full_name || 'Unassigned',
        riskLevel: t.risk_level || null,
      }
    })

    // 6. Fetch previous week stats for comparison
    const twoWeeksAgo = new Date(weekAgo)
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7)
    const { count: prevWeekCompleted } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('status', 'Completed')
      .gte('updated_at', twoWeeksAgo.toISOString())
      .lt('updated_at', weekAgoStr)

    // 6b. Fetch recent standup blockers (last 7 days)
    const { data: recentBlockers } = await supabase
      .from('standups')
      .select('user_id, blockers, blocker_severity, profiles!standups_user_id_fkey(full_name)')
      .eq('foundry_id', foundryId)
      .gte('submitted_at', weekAgoStr)
      .not('blockers', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(10)

    // 7. Determine overall health trend
    const totalImproved = objectiveProgress.filter(
      (o) => o.progress > o.previousProgress
    ).length
    const totalDeclined = objectiveProgress.filter(
      (o) => o.overdueTasks > 0 && o.health !== 'completed'
    ).length

    let overallHealthTrend: WeeklyDigest['overallHealthTrend'] = 'stable'
    if (totalImproved > totalDeclined + 1) overallHealthTrend = 'improving'
    if (totalDeclined > totalImproved) overallHealthTrend = 'declining'

    // 8. Build rich context for AI
    const completedTasksList = completedTaskDetails.length > 0
      ? completedTaskDetails.map((t) => {
        const descSnippet = t.description
          ? ` — "${t.description.slice(0, 100)}${t.description.length > 100 ? '...' : ''}"`
          : ''
        return `  - "${t.title}" completed by ${t.completedBy} (for: ${t.objectiveTitle})${descSnippet}`
      }).join('\n')
      : '  None'

    const overdueTasksList = overdueTaskDetails.length > 0
      ? overdueTaskDetails.map((t) => {
        const riskTag = t.riskLevel ? `, risk: ${t.riskLevel}` : ''
        const descSnippet = t.description
          ? ` — "${t.description.slice(0, 100)}${t.description.length > 100 ? '...' : ''}"`
          : ''
        return `  - "${t.title}" — ${t.daysOverdue} day${t.daysOverdue > 1 ? 's' : ''} overdue, assigned to ${t.assignedTo}${riskTag} (for: ${t.objectiveTitle})${descSnippet}`
      }).join('\n')
      : '  None'

    const blockersList = (recentBlockers || []).length > 0
      ? (recentBlockers || []).map((b) => {
        const name = (b.profiles as unknown as { full_name: string } | null)?.full_name || 'Unknown'
        const severity = b.blocker_severity ? ` (severity: ${b.blocker_severity})` : ''
        return `  - ${name}: "${b.blockers}"${severity}`
      }).join('\n')
      : '  None'

    const objectiveNarratives = objectiveProgress.map((o) => {
      const delta = o.progress - o.previousProgress
      const deltaStr = delta > 0 ? `+${delta}pp this week` : delta < 0 ? `${delta}pp this week` : 'no change'
      return `  - "${o.title}": ${o.progress}% (${deltaStr}), ${o.completedTasks}/${o.totalTasks} tasks done, ${o.overdueTasks} overdue — ${o.health}`
    }).join('\n')

    const velocityComparison = prevWeekCompleted !== null
      ? `Last week: ${prevWeekCompleted} tasks completed. This week: ${tasksCompleted}. ${tasksCompleted > (prevWeekCompleted || 0) ? 'Velocity UP.' : tasksCompleted < (prevWeekCompleted || 0) ? 'Velocity DOWN.' : 'Steady pace.'}`
      : ''

    // 9. Generate AI executive summary with rich context
    let summary = ''
    const highlights: string[] = []
    const concerns: string[] = []
    const nextWeekPriorities: string[] = []

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 1000,
          responseMimeType: 'application/json',
        },
      })

      const systemPrompt = `You are a sharp, insightful chief of staff writing a weekly progress briefing for a startup founder. You know every task, every person, every objective by name. Write like a trusted advisor — direct, specific, and actionable.

Rules:
- Reference specific tasks and people BY NAME. Never say "several tasks were completed" — say WHO did WHAT.
- Highlights should be specific wins ("Sarah finished the competitive analysis ahead of schedule") not vague ("good progress was made").
- Concerns should name the problem AND suggest action ("The vendor contract is 5 days overdue — consider escalating to the CEO").
- Next week priorities should be concrete and actionable ("Unblock the API integration by reviewing the vendor contract").
- If velocity changed week-over-week, mention why (more tasks? fewer? blockers?).
- Celebrate wins warmly but briefly. Flag risks early and clearly.
- If blockers were reported in standups, reference them when suggesting concerns and next-week priorities. Connect blockers to specific overdue tasks or at-risk objectives when possible.

Respond with ONLY valid JSON:
{
  "summary": "3-4 sentence executive narrative of the week. Start with the biggest win or most important development. Be specific — use names and numbers.",
  "highlights": ["2-3 specific wins, referencing people and tasks by name"],
  "concerns": ["1-3 items needing attention with suggested action, or empty array"],
  "nextWeekPriorities": ["2-3 specific, actionable priorities for the coming week"]
}`

      const userPrompt = `Week: ${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}

COMPLETED TASKS (${tasksCompleted} this week):
${completedTasksList}

NEW TASKS CREATED: ${tasksCreated || 0}

OVERDUE TASKS (${overdueTaskDetails.length}):
${overdueTasksList}

${velocityComparison}

BLOCKERS REPORTED THIS WEEK:
${blockersList}

OBJECTIVES:
${objectiveNarratives || '  No active objectives'}

Overall health trend: ${overallHealthTrend}`

      const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`)
      const content = result.response.text()
      if (content) {
        const parsed = JSON.parse(content)
        summary = parsed.summary || ''
        highlights.push(...(parsed.highlights || []))
        concerns.push(...(parsed.concerns || []))
        nextWeekPriorities.push(...(parsed.nextWeekPriorities || []))
      }
    } catch (err) {
      console.error('[ProgressReport] AI summary failed:', err instanceof Error ? err.message : 'Unknown')
      const topCompleted = completedTaskDetails.slice(0, 3).map((t) => t.title).join(', ')
      summary = `This week: ${tasksCompleted} tasks completed${topCompleted ? ` including ${topCompleted}` : ''} across ${objectiveProgress.length} objectives. ${overdueTaskDetails.length > 0 ? `${overdueTaskDetails.length} tasks are overdue.` : ''} Overall trend: ${overallHealthTrend}.`
    }

    // 10. Log insights for deduplication and feedback tracking
    const insightsToLog: InsightEntry[] = []

    for (const highlight of highlights) {
      insightsToLog.push({ insightType: 'weekly_highlight', contentSummary: highlight })
    }
    for (const concern of concerns) {
      insightsToLog.push({ insightType: 'weekly_concern', contentSummary: concern })
    }
    for (const priority of nextWeekPriorities) {
      insightsToLog.push({ insightType: 'weekly_priority', contentSummary: priority })
    }

    // Non-blocking: log insights
    logInsights(user.id, foundryId, insightsToLog).catch(() => {
      // AUDIT: Silently ignore — logging should never break the main flow
    })

    return {
      data: {
        weekStarting: weekAgo.toISOString().split('T')[0],
        weekEnding: todayStr,
        summary,
        objectiveProgress,
        tasksCompleted,
        tasksCreated: tasksCreated || 0,
        totalActiveObjectives: objectiveProgress.filter((o) => o.health !== 'completed').length,
        overallHealthTrend,
        highlights,
        concerns,
        nextWeekPriorities,
        completedTaskDetails,
        overdueTaskDetails,
      },
    }
  }) as Promise<{ data?: WeeklyDigest; error?: string }>
}
