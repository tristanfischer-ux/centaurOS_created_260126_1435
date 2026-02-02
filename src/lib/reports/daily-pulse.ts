/**
 * Daily Pulse Report Orchestration
 * 
 * Combines data aggregation, summary generation, trend analysis,
 * and insights into a complete daily report
 */

import { createClient } from '@supabase/supabase-js'
import { 
    DailyPulseData, 
    FormattedReport, 
    UserRole,
    TrendData,
    Insight
} from './types'
import { generateDailySummary } from './summary-generator'
import { calculateDailyTrends } from './trends'
import { generateDailyInsights } from './insights'

/**
 * Get admin client for server-side operations
 */
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !serviceKey) {
        throw new Error('Missing Supabase configuration')
    }
    
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
}

/**
 * Fetch daily pulse data from database
 */
export async function fetchDailyPulseData(
    profileId: string,
    date?: Date
): Promise<DailyPulseData | null> {
    const supabase = getAdminClient()
    
    const dateStr = date 
        ? date.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
        .rpc('get_daily_pulse', {
            p_profile_id: profileId,
            p_date: dateStr
        })
    
    if (error) {
        console.error('Failed to fetch daily pulse:', error)
        return null
    }
    
    return data as DailyPulseData
}

/**
 * Generate a complete daily pulse report
 */
export async function generateDailyPulseReport(
    profileId: string,
    userName: string,
    userRole: UserRole,
    date?: Date
): Promise<FormattedReport | null> {
    // 1. Fetch raw data
    const data = await fetchDailyPulseData(profileId, date)
    if (!data) {
        return null
    }
    
    // 2. Calculate trends
    const trends = calculateDailyTrends(
        data.personal.tasks_completed_count,
        data.trends.personal_completed_yesterday,
        data.team.total_completed,
        data.trends.completed_yesterday,
        data.team.completion_rate
    )
    
    // 3. Generate insights
    const insights = generateDailyInsights(data, userRole)
    
    // 4. Generate natural language summary
    const summary = await generateDailySummary({
        data,
        userName,
        userRole,
        insights
    })
    
    return {
        summary,
        trends,
        insights,
        data,
        generatedAt: new Date().toISOString(),
        userRole
    }
}

/**
 * Format report for Telegram delivery
 */
export function formatDailyPulseForTelegram(report: FormattedReport): string {
    const lines: string[] = []
    const data = report.data as DailyPulseData
    const isLeader = report.userRole === 'Executive' || report.userRole === 'Founder'
    
    // Header
    lines.push('📊 <b>Daily Pulse</b>')
    lines.push('')
    
    // Summary
    lines.push(report.summary)
    lines.push('')
    
    // Key stats
    lines.push('<b>Your Stats</b>')
    lines.push(`✅ Completed: ${data.personal.tasks_completed_count}`)
    if (data.personal.tasks_due_today > 0) {
        lines.push(`📅 Due today: ${data.personal.tasks_due_today}`)
    }
    if (data.personal.tasks_overdue > 0) {
        lines.push(`⚠️ Overdue: ${data.personal.tasks_overdue}`)
    }
    lines.push('')
    
    // Team stats for leaders
    if (isLeader) {
        lines.push('<b>Team Stats</b>')
        lines.push(`✅ Team completed: ${data.team.total_completed}`)
        lines.push(`📈 Completion rate: ${data.team.completion_rate}%`)
        
        if (data.blockers.length > 0) {
            lines.push(`🚧 Blockers: ${data.blockers.length}`)
        }
        if (data.pending_approvals.length > 0) {
            lines.push(`👀 Pending approvals: ${data.pending_approvals.length}`)
        }
        lines.push('')
    }
    
    // Trends
    const significantTrends = report.trends.filter(t => t.trend !== 'stable')
    if (significantTrends.length > 0) {
        lines.push('<b>Trends</b>')
        for (const trend of significantTrends.slice(0, 2)) {
            const arrow = trend.trend === 'up' ? '↑' : '↓'
            const sign = trend.changePercent > 0 ? '+' : ''
            lines.push(`${arrow} ${trend.metric}: ${sign}${trend.changePercent.toFixed(0)}%`)
        }
        lines.push('')
    }
    
    // Top insights
    const topInsights = report.insights.slice(0, 2)
    if (topInsights.length > 0) {
        lines.push('<b>Insights</b>')
        for (const insight of topInsights) {
            const icon = insight.type === 'warning' ? '⚠️' 
                : insight.type === 'celebration' ? '🎉' 
                : '💡'
            lines.push(`${icon} ${insight.title}`)
        }
    }
    
    return lines.join('\n')
}

/**
 * Format report for email delivery
 */
export function formatDailyPulseForEmail(report: FormattedReport): {
    subject: string
    preheader: string
    body: string
} {
    const data = report.data as DailyPulseData
    const dateStr = new Date(data.date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    })
    
    return {
        subject: `Daily Pulse - ${dateStr}`,
        preheader: report.summary.slice(0, 100),
        body: report.summary
    }
}

/**
 * Format report for Slack delivery
 */
export function formatDailyPulseForSlack(report: FormattedReport): object {
    const data = report.data as DailyPulseData
    
    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: '📊 Daily Pulse'
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: report.summary
            }
        },
        {
            type: 'divider'
        },
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*Completed*\n${data.personal.tasks_completed_count}`
                },
                {
                    type: 'mrkdwn',
                    text: `*Team Total*\n${data.team.total_completed}`
                }
            ]
        }
    ]
    
    // Add trends
    const significantTrends = report.trends.filter(t => t.trend !== 'stable')
    if (significantTrends.length > 0) {
        blocks.push({
            type: 'section',
            fields: significantTrends.slice(0, 2).map(trend => ({
                type: 'mrkdwn',
                text: `*${trend.metric}*\n${trend.trend === 'up' ? '📈' : '📉'} ${trend.changePercent > 0 ? '+' : ''}${trend.changePercent.toFixed(0)}%`
            }))
        })
    }
    
    // Add top insight
    if (report.insights.length > 0) {
        const topInsight = report.insights[0]
        const emoji = topInsight.type === 'warning' ? '⚠️' 
            : topInsight.type === 'celebration' ? '🎉' 
            : '💡'
        
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `${emoji} ${topInsight.title}: ${topInsight.description}`
                }
            ]
        })
    }
    
    return { blocks }
}
