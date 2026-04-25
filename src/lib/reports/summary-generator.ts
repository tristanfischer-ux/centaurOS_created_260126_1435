/**
 * Summary Generator
 *
 * Generates natural language summaries from report data using Claude Haiku 4.5.
 * Note: While this uses AI internally, user-facing copy avoids the term "AI".
 */

import { DailyPulseData, UserRole, Insight } from './types'

interface SummaryContext {
    data: DailyPulseData
    userName: string
    userRole: UserRole
    insights: Insight[]
}

/**
 * Generate a natural language summary for the daily pulse.
 * Uses Claude Haiku 4.5 (cheap + great at short prose) via direct Anthropic fetch.
 */
export async function generateDailySummary(context: SummaryContext): Promise<string> {
    const { data, userName, userRole, insights } = context

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
        return generateTemplateSummary(context)
    }

    try {
        const isLeader = userRole === 'Executive' || userRole === 'Founder' || userRole === 'Team Lead'

        const systemPrompt = isLeader
            ? `You are a concise executive assistant summarizing team activity for a business leader. Focus on:
- Team productivity highlights and any concerns
- Blockers that may need their attention
- Strategic progress on objectives
Keep it to 2-3 sentences. Be direct and actionable. Don't use the word "AI" anywhere.`
            : `You are a friendly productivity assistant summarizing the day for a team member. Focus on:
- Their personal accomplishments
- Upcoming priorities or deadlines
- Encouraging and constructive tone
Keep it to 2-3 sentences. Be warm but professional. Don't use the word "AI" anywhere.`

        const dataContext = {
            personalCompleted: data.personal.tasks_completed_count,
            personalCompletedTitles: data.personal.tasks_completed.slice(0, 3).map(t => t.title),
            personalOverdue: data.personal.tasks_overdue,
            personalDueToday: data.personal.tasks_due_today,
            teamCompleted: data.team.total_completed,
            teamCompletionRate: data.team.completion_rate,
            yesterdayCompleted: data.trends.completed_yesterday,
            blockerCount: data.blockers.length,
            criticalBlockers: data.blockers.filter(b => b.severity === 'critical' || b.severity === 'high'),
            pendingApprovals: data.pending_approvals.length,
            topInsights: insights.slice(0, 2).map(i => ({ type: i.type, title: i.title }))
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
                temperature: 0.7,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: `Generate a daily summary for ${userName}. Here's the data:\n${JSON.stringify(dataContext, null, 2)}`,
                    },
                ],
            }),
        })

        if (!response.ok) {
            console.error('[summary-generator] Anthropic API error:', response.status, await response.text())
            return generateTemplateSummary(context)
        }

        const json = await response.json()
        const text = (json.content?.[0]?.text ?? '').trim()
        return text || generateTemplateSummary(context)
    } catch (error) {
        console.error('Failed to generate summary with Claude Haiku:', error)
        return generateTemplateSummary(context)
    }
}

/**
 * Fallback template-based summary when OpenAI is unavailable
 */
function generateTemplateSummary(context: SummaryContext): string {
    const { data, userName, userRole, insights } = context
    const isLeader = userRole === 'Executive' || userRole === 'Founder' || userRole === 'Team Lead'
    
    const parts: string[] = []
    
    if (isLeader) {
        // Executive/Founder summary
        const teamCompleted = data.team.total_completed
        const yesterdayDiff = teamCompleted - data.trends.completed_yesterday
        const trendText = yesterdayDiff > 0 
            ? `up ${yesterdayDiff} from yesterday` 
            : yesterdayDiff < 0 
                ? `down ${Math.abs(yesterdayDiff)} from yesterday`
                : 'same as yesterday'
        
        parts.push(`Your team completed ${teamCompleted} task${teamCompleted !== 1 ? 's' : ''} today (${trendText}).`)
        
        if (data.blockers.length > 0) {
            const criticalCount = data.blockers.filter(b => b.severity === 'critical' || b.severity === 'high').length
            if (criticalCount > 0) {
                parts.push(`${criticalCount} team member${criticalCount !== 1 ? 's' : ''} reported critical blockers that may need attention.`)
            } else {
                parts.push(`${data.blockers.length} blocker${data.blockers.length !== 1 ? 's' : ''} reported.`)
            }
        }
        
        if (data.pending_approvals.length > 0) {
            parts.push(`${data.pending_approvals.length} task${data.pending_approvals.length !== 1 ? 's' : ''} awaiting your approval.`)
        }
    } else {
        // Team member summary
        const completed = data.personal.tasks_completed_count
        const yesterdayDiff = completed - data.trends.personal_completed_yesterday
        
        if (completed > 0) {
            const comparison = yesterdayDiff > 0 
                ? ` - ${yesterdayDiff} more than yesterday!`
                : ''
            parts.push(`You completed ${completed} task${completed !== 1 ? 's' : ''} today${comparison}`)
            
            if (data.personal.tasks_completed.length > 0) {
                const topTask = data.personal.tasks_completed[0].title
                parts[parts.length - 1] += `, including "${topTask.length > 40 ? topTask.slice(0, 40) + '...' : topTask}".`
            } else {
                parts[parts.length - 1] += '.'
            }
        } else {
            parts.push(`No tasks completed yet today.`)
        }
        
        if (data.personal.tasks_due_today > 0) {
            parts.push(`${data.personal.tasks_due_today} task${data.personal.tasks_due_today !== 1 ? 's' : ''} due today.`)
        }
        
        if (data.personal.tasks_overdue > 0) {
            parts.push(`${data.personal.tasks_overdue} overdue task${data.personal.tasks_overdue !== 1 ? 's' : ''} to address.`)
        }
    }
    
    // Add a relevant insight if available
    const warningInsight = insights.find(i => i.type === 'warning')
    const celebrationInsight = insights.find(i => i.type === 'celebration')
    
    if (celebrationInsight && data.personal.tasks_completed_count >= 3) {
        parts.push(celebrationInsight.title)
    } else if (warningInsight && warningInsight.priority === 'high') {
        parts.push(warningInsight.title)
    }
    
    return parts.join(' ')
}

/**
 * Generate weekly rollup summary
 */
export async function generateWeeklySummary(
    completedThisWeek: number,
    completedLastWeek: number,
    topPerformer: string | null,
    objectivesAtRisk: number
): Promise<string> {
    const diff = completedThisWeek - completedLastWeek
    const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'unchanged'
    
    const parts: string[] = []
    
    parts.push(`This week: ${completedThisWeek} tasks completed (${trend} ${Math.abs(diff)} from last week).`)
    
    if (topPerformer) {
        parts.push(`Top contributor: ${topPerformer}.`)
    }
    
    if (objectivesAtRisk > 0) {
        parts.push(`${objectivesAtRisk} objective${objectivesAtRisk !== 1 ? 's' : ''} at risk of missing deadline.`)
    }
    
    return parts.join(' ')
}

/**
 * Generate monthly summary
 */
export async function generateMonthlySummary(
    completedThisMonth: number,
    completedLastMonth: number,
    objectivesCompleted: number,
    monthName: string
): Promise<string> {
    const diff = completedThisMonth - completedLastMonth
    const percentChange = completedLastMonth > 0 
        ? Math.round((diff / completedLastMonth) * 100)
        : 0
    
    const parts: string[] = []
    
    parts.push(`${monthName}: ${completedThisMonth} tasks completed`)
    
    if (percentChange !== 0) {
        parts[parts.length - 1] += ` (${percentChange > 0 ? '+' : ''}${percentChange}% vs last month).`
    } else {
        parts[parts.length - 1] += '.'
    }
    
    if (objectivesCompleted > 0) {
        parts.push(`${objectivesCompleted} objective${objectivesCompleted !== 1 ? 's' : ''} achieved.`)
    }
    
    return parts.join(' ')
}
