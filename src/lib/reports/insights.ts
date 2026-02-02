/**
 * Actionable Insights Engine
 * 
 * Generates smart suggestions based on report data patterns
 */

import { v4 as uuidv4 } from 'uuid'
import { 
    DailyPulseData, 
    WeeklyRollupData, 
    Insight, 
    InsightType, 
    InsightPriority,
    UserRole
} from './types'

/**
 * Generate insights from daily pulse data
 */
export function generateDailyInsights(
    data: DailyPulseData,
    userRole: UserRole
): Insight[] {
    const insights: Insight[] = []
    const isLeader = userRole === 'Executive' || userRole === 'Founder' || userRole === 'Team Lead'
    
    // ========================
    // Personal Insights
    // ========================
    
    // Overdue tasks warning
    if (data.personal.tasks_overdue > 0) {
        insights.push({
            id: uuidv4(),
            type: 'warning',
            priority: data.personal.tasks_overdue >= 3 ? 'high' : 'medium',
            title: `${data.personal.tasks_overdue} overdue task${data.personal.tasks_overdue !== 1 ? 's' : ''}`,
            description: 'Consider rescheduling or delegating these tasks',
            action: {
                label: 'View overdue',
                href: '/tasks?filter=overdue'
            }
        })
    }
    
    // Tasks due today reminder
    if (data.personal.tasks_due_today > 0 && data.personal.tasks_due_today <= 3) {
        insights.push({
            id: uuidv4(),
            type: 'suggestion',
            priority: 'medium',
            title: `${data.personal.tasks_due_today} task${data.personal.tasks_due_today !== 1 ? 's' : ''} due today`,
            description: 'Focus on completing these before end of day',
            action: {
                label: 'View tasks',
                href: '/tasks?filter=due_today'
            }
        })
    }
    
    // Productivity celebration
    const personalImprovement = data.personal.tasks_completed_count - data.trends.personal_completed_yesterday
    if (personalImprovement >= 2 && data.personal.tasks_completed_count >= 3) {
        insights.push({
            id: uuidv4(),
            type: 'celebration',
            priority: 'low',
            title: 'Productive day!',
            description: `You completed ${personalImprovement} more tasks than yesterday`
        })
    }
    
    // ========================
    // Team/Leader Insights
    // ========================
    
    if (isLeader) {
        // Critical blockers requiring attention
        const criticalBlockers = data.blockers.filter(
            b => b.severity === 'critical' || b.severity === 'high'
        )
        if (criticalBlockers.length > 0) {
            const firstBlocker = criticalBlockers[0]
            insights.push({
                id: uuidv4(),
                type: 'warning',
                priority: 'high',
                title: `${criticalBlockers.length} critical blocker${criticalBlockers.length !== 1 ? 's' : ''} reported`,
                description: `${firstBlocker.user_name}: "${truncate(firstBlocker.blocker, 60)}"`,
                action: {
                    label: 'View blockers',
                    href: '/tasks?view=blockers'
                }
            })
        }
        
        // Pending approvals
        if (data.pending_approvals.length > 0) {
            insights.push({
                id: uuidv4(),
                type: 'suggestion',
                priority: data.pending_approvals.length >= 3 ? 'high' : 'medium',
                title: `${data.pending_approvals.length} approval${data.pending_approvals.length !== 1 ? 's' : ''} pending`,
                description: 'Tasks waiting for your review',
                action: {
                    label: 'Review tasks',
                    href: '/tasks?filter=pending_approval'
                }
            })
        }
        
        // Team productivity drop
        const teamDiff = data.team.total_completed - data.trends.completed_yesterday
        if (teamDiff < -5 && data.trends.completed_yesterday > 0) {
            insights.push({
                id: uuidv4(),
                type: 'warning',
                priority: 'medium',
                title: 'Team velocity down',
                description: `${Math.abs(teamDiff)} fewer completions than yesterday`,
                action: {
                    label: 'View team',
                    href: '/team'
                }
            })
        }
        
        // Forwarded tasks (potential issues)
        if (data.forwarded_tasks.length >= 3) {
            insights.push({
                id: uuidv4(),
                type: 'suggestion',
                priority: 'low',
                title: `${data.forwarded_tasks.length} tasks forwarded today`,
                description: 'May indicate workload imbalance or unclear assignments'
            })
        }
        
        // Team celebration
        if (data.team.total_completed >= 10 && teamDiff > 0) {
            insights.push({
                id: uuidv4(),
                type: 'celebration',
                priority: 'low',
                title: 'Strong team performance!',
                description: `${data.team.total_completed} tasks completed, ${teamDiff} more than yesterday`
            })
        }
    }
    
    // ========================
    // Objective Insights
    // ========================
    
    // Objectives at risk
    const atRiskObjectives = data.objectives.filter(o => {
        if (!o.end_date || o.status !== 'In Progress') return false
        const daysRemaining = Math.ceil(
            (new Date(o.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
        return o.progress < 50 && daysRemaining < 14
    })
    
    if (atRiskObjectives.length > 0) {
        const firstAtRisk = atRiskObjectives[0]
        insights.push({
            id: uuidv4(),
            type: 'warning',
            priority: 'high',
            title: `"${truncate(firstAtRisk.title, 30)}" at risk`,
            description: `Only ${firstAtRisk.progress}% complete with deadline approaching`,
            action: {
                label: 'View objective',
                href: `/objectives/${firstAtRisk.id}`
            }
        })
    }
    
    // Sort by priority
    return sortInsights(insights)
}

/**
 * Generate insights from weekly rollup data
 */
export function generateWeeklyInsights(
    data: WeeklyRollupData,
    userRole: UserRole
): Insight[] {
    const insights: Insight[] = []
    const isLeader = userRole === 'Executive' || userRole === 'Founder' || userRole === 'Team Lead'
    
    const weekOverWeekChange = data.stats.tasks_completed - data.previous_week.tasks_completed
    const percentChange = data.previous_week.tasks_completed > 0
        ? Math.round((weekOverWeekChange / data.previous_week.tasks_completed) * 100)
        : 0
    
    // Week-over-week improvement celebration
    if (percentChange >= 20 && data.stats.tasks_completed >= 10) {
        insights.push({
            id: uuidv4(),
            type: 'celebration',
            priority: 'medium',
            title: `${percentChange}% productivity increase`,
            description: `${data.stats.tasks_completed} tasks completed this week vs ${data.previous_week.tasks_completed} last week`
        })
    }
    
    // Week-over-week decline warning
    if (percentChange <= -20 && data.previous_week.tasks_completed >= 10) {
        insights.push({
            id: uuidv4(),
            type: 'warning',
            priority: 'medium',
            title: `${Math.abs(percentChange)}% productivity decrease`,
            description: 'Consider reviewing workload or blockers',
            action: {
                label: 'View blockers',
                href: '/tasks?view=blockers'
            }
        })
    }
    
    // Top performer recognition
    if (data.top_completers.length > 0 && isLeader) {
        const topPerformer = data.top_completers[0]
        if (topPerformer.completed_count >= 5) {
            insights.push({
                id: uuidv4(),
                type: 'celebration',
                priority: 'low',
                title: `Top contributor: ${topPerformer.full_name}`,
                description: `Completed ${topPerformer.completed_count} tasks this week`
            })
        }
    }
    
    // Objectives progress
    const objectivesWithProgress = data.objectives_progress.filter(
        o => o.tasks_completed_this_week && o.tasks_completed_this_week > 0
    )
    if (objectivesWithProgress.length === 0 && data.objectives_progress.length > 0) {
        insights.push({
            id: uuidv4(),
            type: 'warning',
            priority: 'medium',
            title: 'No objective progress this week',
            description: 'Consider aligning tasks with strategic objectives',
            action: {
                label: 'View objectives',
                href: '/objectives'
            }
        })
    }
    
    // High blocker count
    if (data.stats.blockers_reported >= 5) {
        insights.push({
            id: uuidv4(),
            type: 'warning',
            priority: 'high',
            title: `${data.stats.blockers_reported} blockers reported this week`,
            description: 'Consider a team sync to address recurring issues'
        })
    }
    
    return sortInsights(insights)
}

/**
 * Sort insights by priority weight
 */
function sortInsights(insights: Insight[]): Insight[] {
    const priorityWeight: Record<InsightPriority, number> = {
        high: 3,
        medium: 2,
        low: 1
    }
    
    const typeWeight: Record<InsightType, number> = {
        warning: 3,
        suggestion: 2,
        celebration: 1
    }
    
    return insights.sort((a, b) => {
        const aScore = priorityWeight[a.priority] * 10 + typeWeight[a.type]
        const bScore = priorityWeight[b.priority] * 10 + typeWeight[b.type]
        return bScore - aScore
    })
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str
    return str.slice(0, maxLength - 3) + '...'
}
