/**
 * Types for the Automated Reporting Engine
 */

// ========================
// Daily Pulse Types
// ========================

export interface CompletedTask {
    task_id: string
    title: string
    completed_at: string
    objective_title?: string | null
}

export interface Blocker {
    user_id: string
    user_name: string
    blocker: string
    severity: 'low' | 'medium' | 'high' | 'critical' | null
    needs_help: boolean
}

export interface ForwardedTask {
    task_id: string
    title: string
    from_user: string | null
    to_user: string | null
    reason: string | null
}

export interface PendingApproval {
    task_id: string
    title: string
    status: string
    assignee_name: string | null
    requested_at: string | null
}

export interface TopCompleter {
    full_name: string
    completed_count: number
}

export interface ObjectiveProgress {
    id: string
    title: string
    progress: number
    status: string
    end_date: string | null
    tasks_completed_today?: number
    tasks_completed_this_week?: number
    tasks_remaining?: number
}

export interface DailyPulseData {
    date: string
    foundry_id: string
    personal: {
        tasks_completed: CompletedTask[]
        tasks_completed_count: number
        tasks_created_count: number
        tasks_due_today: number
        tasks_overdue: number
    }
    team: {
        total_completed: number
        total_created: number
        completion_rate: number
        top_completers: TopCompleter[]
    }
    blockers: Blocker[]
    forwarded_tasks: ForwardedTask[]
    pending_approvals: PendingApproval[]
    trends: {
        completed_yesterday: number
        personal_completed_yesterday: number
    }
    objectives: ObjectiveProgress[]
}

// ========================
// Weekly Rollup Types
// ========================

export interface DailyBreakdown {
    date: string
    completed: number
    created: number
}

export interface WeeklyStats {
    tasks_created: number
    tasks_completed: number
    blockers_reported: number
    standup_submissions: number
    avg_daily_completion: number | null
}

export interface WeeklyRollupData {
    period: {
        start: string
        end: string
        week_number: number
    }
    stats: WeeklyStats
    previous_week: {
        tasks_completed: number
        tasks_created: number
    }
    top_completers: (TopCompleter & { id: string })[]
    objectives_progress: ObjectiveProgress[]
    daily_breakdown: DailyBreakdown[]
}

// ========================
// Monthly Summary Types
// ========================

export interface WeeklyBreakdown {
    week_start: string
    completed: number
    created: number
}

export interface MonthlyStats {
    tasks_created: number
    tasks_completed: number
    objectives_completed: number
    objectives_started: number
    avg_weekly_completion: number | null
}

export interface TopContributor {
    id: string
    full_name: string
    role: string | null
    completed_count: number
}

export interface MonthlySummaryData {
    period: {
        start: string
        end: string
        month_name: string
    }
    stats: MonthlyStats
    previous_month: {
        tasks_completed: number
        tasks_created: number
    }
    top_contributors: TopContributor[]
    weekly_breakdown: WeeklyBreakdown[]
    objectives_summary: {
        total_active: number
        completed_this_month: number
        at_risk: number
    }
}

// ========================
// Trend Types
// ========================

export type TrendDirection = 'up' | 'down' | 'stable'

export interface TrendData {
    metric: string
    current: number
    previous: number
    change: number
    changePercent: number
    trend: TrendDirection
    isAnomaly: boolean
    anomalyType?: 'spike' | 'drop' | null
}

// ========================
// Insight Types
// ========================

export type InsightType = 'warning' | 'suggestion' | 'celebration'
export type InsightPriority = 'high' | 'medium' | 'low'

export interface Insight {
    id: string
    type: InsightType
    priority: InsightPriority
    title: string
    description: string
    action?: {
        label: string
        href: string
    }
}

// ========================
// Report Output Types
// ========================

export type UserRole = 'Executive' | 'Founder' | 'Team Lead' | 'Team Member' | string

export interface FormattedReport {
    summary: string
    trends: TrendData[]
    insights: Insight[]
    data: DailyPulseData | WeeklyRollupData | MonthlySummaryData
    generatedAt: string
    userRole: UserRole
}

export interface ReportPreferences {
    id: string
    profile_id: string
    telegram_enabled: boolean
    email_enabled: boolean
    slack_enabled: boolean
    slack_webhook_url: string | null
    daily_report_time: string
    weekly_report_day: number
    timezone: string
    include_summary: boolean
    include_trends: boolean
    include_insights: boolean
    include_team_activity: boolean
}
