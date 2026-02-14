'use server'

/**
 * Server Actions for Automated Reporting
 */

import { createClient } from '@/lib/supabase/server'
import { 
    generateDailyPulseReport,
    DailyPulseData,
    WeeklyRollupData,
    MonthlySummaryData,
    FormattedReport,
    TrendData,
    Insight,
    UserRole,
    ReportPreferences
} from '@/lib/reports'
import { calculateWeeklyTrends } from '@/lib/reports/trends'
import { generateWeeklyInsights } from '@/lib/reports/insights'
import { generateWeeklySummary } from '@/lib/reports/summary-generator'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { isValidSlackWebhookUrl } from '@/lib/security/url-validation'

// ========================
// Daily Pulse Actions
// ========================

export interface DailyPulseResult {
    success: boolean
    data?: FormattedReport
    error?: string
}

/**
 * Get the daily pulse report for the current user
 */
export async function getMyDailyPulse(date?: string): Promise<DailyPulseResult> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }
        
        // Get user profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, role')
            .eq('id', user.id)
            .single()
        
        if (!profile) {
            return { success: false, error: 'Profile not found' }
        }
        
        const userName = profile.full_name?.split(' ')[0] || 'there'
        const userRole = (profile.role || 'Team Member') as UserRole
        
        const report = await generateDailyPulseReport(
            user.id,
            userName,
            userRole,
            date ? new Date(date) : undefined
        )
        
        if (!report) {
            return { success: false, error: 'Failed to generate report' }
        }
        
        return { success: true, data: report }
    } catch (error) {
        console.error('Failed to get daily pulse:', error)
        return { success: false, error: sanitizeErrorMessage(error) }
    }
}

// ========================
// Weekly Rollup Actions
// ========================

export interface WeeklyRollupResult {
    success: boolean
    data?: {
        report: WeeklyRollupData
        trends: TrendData[]
        insights: Insight[]
        summary: string
    }
    error?: string
}

/**
 * Get the weekly rollup report for the user's foundry
 */
export async function getWeeklyRollup(weekStart?: string): Promise<WeeklyRollupResult> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }
        
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { success: false, error: 'No foundry context' }
        }
        
        // Get user role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        
        const userRole = (profile?.role || 'Team Member') as UserRole
        
        // Fetch weekly data
        const { data, error } = await supabase
            .rpc('get_weekly_rollup', {
                p_foundry_id: foundryId,
                p_week_start: weekStart || null
            })
        
        if (error) {
            console.error('Failed to fetch weekly rollup:', error)
            return { success: false, error: sanitizeErrorMessage(error) }
        }
        
        const report = data as WeeklyRollupData
        
        // Calculate trends
        const trends = calculateWeeklyTrends(
            report.stats.tasks_completed,
            report.previous_week.tasks_completed,
            report.stats.tasks_created,
            report.previous_week.tasks_created
        )
        
        // Generate insights
        const insights = generateWeeklyInsights(report, userRole)
        
        // Generate summary
        const topPerformer = report.top_completers.length > 0 
            ? report.top_completers[0].full_name 
            : null
        const atRiskObjectives = report.objectives_progress.filter(o => {
            const remaining = o.tasks_remaining || 0
            return o.progress < 50 && remaining > 5
        }).length
        
        const summary = await generateWeeklySummary(
            report.stats.tasks_completed,
            report.previous_week.tasks_completed,
            topPerformer,
            atRiskObjectives
        )
        
        return {
            success: true,
            data: { report, trends, insights, summary }
        }
    } catch (error) {
        console.error('Failed to get weekly rollup:', error)
        return { success: false, error: sanitizeErrorMessage(error) }
    }
}

// ========================
// Monthly Summary Actions
// ========================

export interface MonthlySummaryResult {
    success: boolean
    data?: {
        report: MonthlySummaryData
        summary: string
    }
    error?: string
}

/**
 * Get the monthly summary report for the user's foundry
 */
export async function getMonthlySummary(month?: string): Promise<MonthlySummaryResult> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }
        
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { success: false, error: 'No foundry context' }
        }
        
        // Fetch monthly data
        const { data, error } = await supabase
            .rpc('get_monthly_summary', {
                p_foundry_id: foundryId,
                p_month: month || null
            })
        
        if (error) {
            console.error('Failed to fetch monthly summary:', error)
            return { success: false, error: sanitizeErrorMessage(error) }
        }
        
        const report = data as MonthlySummaryData
        
        // Import summary generator
        const { generateMonthlySummary: genSummary } = await import('@/lib/reports/summary-generator')
        
        const summary = await genSummary(
            report.stats.tasks_completed,
            report.previous_month.tasks_completed,
            report.stats.objectives_completed,
            report.period.month_name
        )
        
        return {
            success: true,
            data: { report, summary }
        }
    } catch (error) {
        console.error('Failed to get monthly summary:', error)
        return { success: false, error: sanitizeErrorMessage(error) }
    }
}

// ========================
// Report Preferences Actions
// ========================

export interface ReportPreferencesResult {
    success: boolean
    data?: ReportPreferences
    error?: string
}

/**
 * Get the user's report preferences
 */
export async function getReportPreferences(): Promise<ReportPreferencesResult> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }
        
        const { data, error } = await supabase
            .from('report_preferences')
            .select('*')
            .eq('profile_id', user.id)
            .single()
        
        if (error && error.code !== 'PGRST116') {
            console.error('Failed to fetch report preferences:', error)
            return { success: false, error: sanitizeErrorMessage(error) }
        }
        
        // Return default preferences if none exist
        if (!data) {
            return {
                success: true,
                data: {
                    id: '',
                    profile_id: user.id,
                    telegram_enabled: true,
                    email_enabled: false,
                    slack_enabled: false,
                    slack_webhook_url: null,
                    daily_report_time: '18:00:00',
                    weekly_report_day: 1,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                    include_summary: true,
                    include_trends: true,
                    include_insights: true,
                    include_team_activity: true
                }
            }
        }
        
        return { success: true, data: data as ReportPreferences }
    } catch (error) {
        console.error('Failed to get report preferences:', error)
        return { success: false, error: sanitizeErrorMessage(error) }
    }
}

/**
 * Update the user's report preferences
 */
export async function updateReportPreferences(
    preferences: Partial<Omit<ReportPreferences, 'id' | 'profile_id'>>
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const normalizedPreferences: Partial<Omit<ReportPreferences, 'id' | 'profile_id'>> = {
            ...preferences,
            ...(typeof preferences.slack_webhook_url === 'string'
                ? { slack_webhook_url: preferences.slack_webhook_url.trim() }
                : {}),
        }

        // SECURITY: Load existing preference values to validate effective Slack settings.
        const { data: existingPreferences, error: existingPreferencesError } = await supabase
            .from('report_preferences')
            .select('slack_enabled, slack_webhook_url')
            .eq('profile_id', user.id)
            .maybeSingle()

        if (existingPreferencesError && existingPreferencesError.code !== 'PGRST116') {
            console.error('Failed to load existing report preferences:', existingPreferencesError)
            return { success: false, error: sanitizeErrorMessage(existingPreferencesError) }
        }

        const effectiveSlackEnabled =
            normalizedPreferences.slack_enabled
            ?? existingPreferences?.slack_enabled
            ?? false

        const effectiveSlackWebhook =
            normalizedPreferences.slack_webhook_url !== undefined
                ? normalizedPreferences.slack_webhook_url
                : (existingPreferences?.slack_webhook_url ?? null)

        // SECURITY: Prevent SSRF by validating stored webhook destination.
        if (effectiveSlackWebhook && !isValidSlackWebhookUrl(effectiveSlackWebhook)) {
            return { success: false, error: 'Slack webhook URL must be a valid Slack incoming webhook endpoint.' }
        }

        // VALIDATION: Enabling Slack delivery requires a webhook URL.
        if (effectiveSlackEnabled && !effectiveSlackWebhook) {
            return { success: false, error: 'Slack webhook URL is required when Slack reports are enabled.' }
        }
        
        const { error } = await supabase
            .from('report_preferences')
            .upsert({
                profile_id: user.id,
                ...normalizedPreferences,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'profile_id'
            })
        
        if (error) {
            console.error('Failed to update report preferences:', error)
            return { success: false, error: sanitizeErrorMessage(error) }
        }
        
        return { success: true }
    } catch (error) {
        console.error('Failed to update report preferences:', error)
        return { success: false, error: sanitizeErrorMessage(error) }
    }
}

// ========================
// Trend Data Actions
// ========================

export interface CompletionTrendResult {
    success: boolean
    data?: { date: string; completed: number; created: number }[]
    error?: string
}

/**
 * Get completion trend data for charts
 */
export async function getCompletionTrend(days: number = 14): Promise<CompletionTrendResult> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }
        
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { success: false, error: 'No foundry context' }
        }
        
        const { data, error } = await supabase
            .rpc('get_completion_trend', {
                p_foundry_id: foundryId,
                p_days: days
            })
        
        if (error) {
            console.error('Failed to fetch completion trend:', error)
            return { success: false, error: sanitizeErrorMessage(error) }
        }
        
        return { success: true, data: data || [] }
    } catch (error) {
        console.error('Failed to get completion trend:', error)
        return { success: false, error: sanitizeErrorMessage(error) }
    }
}
