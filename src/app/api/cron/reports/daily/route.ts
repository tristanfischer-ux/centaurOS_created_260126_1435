/**
 * Cron Job: Daily Reports
 * 
 * Sends daily pulse reports to users who have enabled them.
 * Should be triggered by Vercel Cron or similar scheduler.
 * 
 * Schedule: Every hour at :00 (to catch different timezone briefing times)
 * 
 * Vercel cron config in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/reports/daily",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { 
    generateDailyPulseReport, 
    formatDailyPulseForTelegram,
    formatDailyPulseForSlack
} from '@/lib/reports'
import { isValidSlackWebhookUrl, sanitizeUrlForLogging } from '@/lib/security/url-validation'

// Get admin client for cron operations
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

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(req: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET
    
    // In production, require the secret
    if (!cronSecret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[SECURITY] CRON_SECRET not configured in production!')
            return false
        }
        return true // Allow in development
    }

    const authHeader = req.headers.get('authorization')
    return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
    // Verify authorization
    if (!verifyCronSecret(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getAdminClient()
    let sent = 0
    let failed = 0

    try {
        console.log('[Cron] Starting daily reports job...')
        
        const now = new Date()
        const currentHour = now.getUTCHours()
        
        // Get users with report preferences who should receive reports now
        const { data: prefsData } = await supabase
            .from('report_preferences')
            .select(`
                profile_id,
                daily_report_time,
                timezone,
                telegram_enabled,
                email_enabled,
                slack_enabled,
                slack_webhook_url,
                include_summary,
                include_trends,
                include_insights
            `)
            .or('telegram_enabled.eq.true,email_enabled.eq.true,slack_enabled.eq.true')
        
        if (!prefsData || prefsData.length === 0) {
            console.log('[Cron] No users with report preferences enabled')
            return NextResponse.json({
                success: true,
                sent: 0,
                failed: 0,
                message: 'No users with reports enabled'
            })
        }
        
        // Filter users whose report time matches current hour
        const eligibleUsers = prefsData.filter(pref => {
            const reportTime = pref.daily_report_time || '18:00:00'
            const [hour] = reportTime.split(':').map(Number)
            
            // Simple check - within the same hour
            // In production, add proper timezone handling
            return hour === currentHour
        })
        
        console.log(`[Cron] ${eligibleUsers.length} users eligible for reports`)
        
        // Process each eligible user
        for (const pref of eligibleUsers) {
            try {
                // Get user profile
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, role, foundry_id')
                    .eq('id', pref.profile_id)
                    .single()
                
                if (!profile) continue
                
                const userName = profile.full_name?.split(' ')[0] || 'there'
                const userRole = profile.role || 'Team Member'
                
                // Generate the report
                const report = await generateDailyPulseReport(
                    pref.profile_id,
                    userName,
                    userRole
                )
                
                if (!report) {
                    console.error(`[Cron] Failed to generate report for user ${pref.profile_id}`)
                    failed++
                    continue
                }
                
                // Send via Telegram
                if (pref.telegram_enabled) {
                    const { data: telegramLink } = await supabase
                        .from('messaging_links')
                        .select('platform_user_id')
                        .eq('profile_id', pref.profile_id)
                        .eq('platform', 'telegram')
                        .not('verified_at', 'is', null)
                        .single()
                    
                    if (telegramLink) {
                        const message = formatDailyPulseForTelegram(report)
                        const { sendMessage } = await import('@/lib/telegram/bot')
                        
                        await sendMessage({
                            chat_id: telegramLink.platform_user_id,
                            text: message,
                            parse_mode: 'HTML'
                        })
                        sent++
                    }
                }
                
                // Send via Slack
                if (pref.slack_enabled && pref.slack_webhook_url) {
                    // SECURITY: Validate webhook URL before making outbound request.
                    if (!isValidSlackWebhookUrl(pref.slack_webhook_url)) {
                        console.warn('[Cron] Skipping invalid Slack webhook URL:', {
                            profileId: pref.profile_id,
                            webhook: sanitizeUrlForLogging(pref.slack_webhook_url),
                        })
                        failed++
                        continue
                    }

                    const slackPayload = formatDailyPulseForSlack(report)

                    const controller = new AbortController()
                    const timeout = setTimeout(() => controller.abort(), 10_000)

                    try {
                        const slackResponse = await fetch(pref.slack_webhook_url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(slackPayload),
                            redirect: 'error',
                            signal: controller.signal,
                        })

                        if (!slackResponse.ok) {
                            throw new Error(`Slack webhook returned status ${slackResponse.status}`)
                        }

                        sent++
                    } finally {
                        clearTimeout(timeout)
                    }
                }
                
                // Email would be handled here if implemented
                // if (pref.email_enabled) { ... }
                
            } catch (error) {
                console.error(`[Cron] Failed to send report to user ${pref.profile_id}:`, error)
                failed++
            }
        }
        
        console.log(`[Cron] Daily reports complete: ${sent} sent, ${failed} failed`)
        
        return NextResponse.json({
            success: true,
            sent,
            failed,
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        console.error('[Cron] Daily reports error:', error)
        
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            sent,
            failed
        }, { status: 500 })
    }
}

// Also allow POST for manual triggering from admin panel
export async function POST(req: NextRequest) {
    return GET(req)
}
