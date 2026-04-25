/**
 * Summary Generator
 *
 * Generates natural language summaries from report data using DeepSeek V4.
 * Note: While this uses an LLM internally, user-facing copy avoids the term "AI".
 *
 * COST CUT 2026-04-24: Swapped from Anthropic Haiku ($1.00 / $5.00 per 1M)
 * to DeepSeek V4 chat ($0.30 / $0.50 per 1M) — ~3x cheaper input, ~10x
 * cheaper output. Same long-form 2-3 sentence prose use case; V4 handles it
 * well. Provider notes: DeepSeek's chat completions API is OpenAI-compatible
 * so we use the OpenAI SDK with a custom baseURL (mirrors the pattern in
 * src/lib/ai-providers/registry.ts streamDeepSeek).
 */

import { DailyPulseData, UserRole, Insight } from './types'
import { logLlmUsage } from '@/lib/cost-logging/llm-usage'

interface SummaryContext {
    data: DailyPulseData
    userName: string
    userRole: UserRole
    insights: Insight[]
}

/**
 * Generate a natural language summary for the daily pulse.
 * Uses DeepSeek V4 (cheap + great at short prose) via OpenAI-compatible API.
 */
export async function generateDailySummary(context: SummaryContext): Promise<string> {
    const { data, userName, userRole, insights } = context

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
    if (!apiKey) {
        return generateTemplateSummary(context)
    }

    const summaryModel = 'deepseek-chat'

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

        // DeepSeek exposes an OpenAI-compatible chat completions endpoint at
        // api.deepseek.com — we use the OpenAI SDK with a custom baseURL.
        const OpenAI = (await import('openai')).default
        const client = new OpenAI({
            apiKey,
            baseURL: 'https://api.deepseek.com',
            timeout: 30_000,
            maxRetries: 0,
        })

        let completion: Awaited<ReturnType<typeof client.chat.completions.create>> & {
            choices: Array<{ message?: { content?: string | null } }>
            usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        try {
            const raw = await client.chat.completions.create({
                model: summaryModel,
                max_tokens: 200,
                temperature: 0.7,
                stream: false,
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: `Generate a daily summary for ${userName}. Here's the data:\n${JSON.stringify(dataContext, null, 2)}`,
                    },
                ],
            })
            // OpenAI SDK returns a union type that includes streaming; we set
            // stream:false above so the cast is safe.
            completion = raw as typeof completion
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            // Map common HTTP status patterns surfaced by the OpenAI SDK to our
            // logLlmUsage status enum so the cost dashboard can split failures.
            const status: 'rate_limited' | 'timeout' | 'error' =
                /429|529|rate.?limit|overloaded/i.test(errMsg) ? 'rate_limited' :
                /408|504|timeout|timed out|aborted/i.test(errMsg) ? 'timeout' :
                'error'
            void logLlmUsage({
                action: 'report_summary',
                modelUsed: summaryModel,
                tokensIn: 0,
                tokensOut: 0,
                status,
                errorMessage: errMsg.slice(0, 200),
            })
            console.error('[summary-generator] DeepSeek API error:', errMsg)
            return generateTemplateSummary(context)
        }

        void logLlmUsage({
            action: 'report_summary',
            modelUsed: summaryModel,
            tokensIn: completion.usage?.prompt_tokens ?? 0,
            tokensOut: completion.usage?.completion_tokens ?? 0,
            status: 'success',
        })
        const text = (completion.choices?.[0]?.message?.content ?? '').trim()
        return text || generateTemplateSummary(context)
    } catch (error) {
        console.error('Failed to generate summary with DeepSeek V4:', error)
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
