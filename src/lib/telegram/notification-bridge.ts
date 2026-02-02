/**
 * Telegram Notification Bridge
 * 
 * Bridges CentaurOS notifications to Telegram for users who have linked their accounts.
 * Called from notification creation triggers or directly from server actions.
 */

import { createClient } from '@supabase/supabase-js'
import { sendNotificationToTelegram } from './bot'

// Use service role for notification operations
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
        throw new Error('Missing Supabase configuration')
    }

    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

export interface NotificationPayload {
    id?: string
    user_id: string
    type: string
    title: string
    message?: string
    link?: string
    metadata?: Record<string, unknown>
}

/**
 * Push a notification to a user's linked Telegram account
 * 
 * @param notification - The notification to push
 * @returns Promise<boolean> - Whether the notification was successfully sent
 */
export async function pushNotificationToTelegram(
    notification: NotificationPayload
): Promise<boolean> {
    const supabase = getAdminClient()

    try {
        // Check if user has Telegram linked
        const { data: link } = await supabase
            .from('messaging_links')
            .select('platform_user_id, id')
            .eq('profile_id', notification.user_id)
            .eq('platform', 'telegram')
            .not('verified_at', 'is', null)
            .single()

        if (!link) {
            // User doesn't have Telegram linked
            return false
        }

        // Check user's notification preferences
        const { data: prefs } = await supabase
            .from('telegram_preferences')
            .select('*')
            .eq('profile_id', notification.user_id)
            .single()

        // Check if notifications are enabled
        if (prefs?.notifications_enabled === false) {
            return false
        }

        // Check if currently muted
        if (prefs?.muted_until && new Date(prefs.muted_until) > new Date()) {
            return false
        }

        // Check notification type preferences
        const typePreferenceMap: Record<string, string> = {
            'task_assigned': 'notify_task_assigned',
            'task_completed': 'notify_task_completed',
            'mention': 'notify_mentions',
            'approval_needed': 'notify_approvals',
            'order_update': 'notify_orders',
            'rfq_response': 'notify_rfq',
        }

        const prefKey = typePreferenceMap[notification.type]
        if (prefKey && prefs && prefs[prefKey] === false) {
            return false
        }

        // Check for deduplication (don't send same notification twice)
        if (notification.id) {
            const { data: existing } = await supabase
                .from('telegram_notification_log')
                .select('id')
                .eq('notification_id', notification.id)
                .single()

            if (existing) {
                return false // Already sent
            }
        }

        // Send to Telegram
        const result = await sendNotificationToTelegram(
            link.platform_user_id,
            {
                type: notification.type,
                title: notification.title,
                message: notification.message,
                link: notification.link,
            }
        )

        if (result) {
            // Log the notification
            await supabase
                .from('telegram_notification_log')
                .insert({
                    profile_id: notification.user_id,
                    notification_id: notification.id,
                    telegram_chat_id: link.platform_user_id,
                    telegram_message_id: result.message_id.toString(),
                    notification_type: notification.type,
                    delivered: true,
                })

            return true
        }

        return false
    } catch (error) {
        console.error('Failed to push notification to Telegram:', error)
        
        // Log the failure
        const supabase = getAdminClient()
        try {
            await supabase
                .from('telegram_notification_log')
                .insert({
                    profile_id: notification.user_id,
                    notification_id: notification.id,
                    telegram_chat_id: 'unknown',
                    notification_type: notification.type,
                    delivered: false,
                    error_message: error instanceof Error ? error.message : 'Unknown error',
                })
        } catch {
            // Ignore logging errors
        }

        return false
    }
}

/**
 * Push notification to multiple users
 */
export async function pushNotificationToMultipleUsers(
    userIds: string[],
    notification: Omit<NotificationPayload, 'user_id'>
): Promise<{ sent: number; failed: number }> {
    let sent = 0
    let failed = 0

    await Promise.all(
        userIds.map(async (userId) => {
            const success = await pushNotificationToTelegram({
                ...notification,
                user_id: userId,
            })
            if (success) sent++
            else failed++
        })
    )

    return { sent, failed }
}

/**
 * Create a decision and push to Telegram
 */
export async function createAndPushDecision(params: {
    profile_id: string
    decision_type: 'task_review' | 'rfq_proposal' | 'order_milestone' | 'team_request' | 'expense_approval' | 'other'
    title: string
    description?: string
    reference_type: string
    reference_id: string
    priority?: 'low' | 'normal' | 'high' | 'urgent'
}): Promise<string | null> {
    const supabase = getAdminClient()

    try {
        // Get user's foundry
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', params.profile_id)
            .single()

        if (!profile?.foundry_id) {
            throw new Error('User has no foundry')
        }

        // Create the decision
        const { data: decision, error } = await supabase
            .from('telegram_decisions')
            .insert({
                profile_id: params.profile_id,
                foundry_id: profile.foundry_id,
                decision_type: params.decision_type,
                title: params.title,
                description: params.description,
                reference_type: params.reference_type,
                reference_id: params.reference_id,
                priority: params.priority || 'normal',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            })
            .select('id')
            .single()

        if (error || !decision) {
            throw new Error('Failed to create decision')
        }

        // Push notification about the decision
        await pushNotificationToTelegram({
            user_id: params.profile_id,
            type: 'approval_needed',
            title: `⚡ ${params.title}`,
            message: params.description,
            link: `/decisions/${decision.id}`,
        })

        return decision.id
    } catch (error) {
        console.error('Failed to create and push decision:', error)
        return null
    }
}

/**
 * Send daily briefing to all eligible users
 * This should be called by a cron job
 * 
 * Enhanced version using the new Daily Pulse report system
 */
export async function sendDailyBriefings(): Promise<{ sent: number; failed: number }> {
    const supabase = getAdminClient()
    let sent = 0
    let failed = 0

    try {
        // Get all users with daily briefing enabled
        // and whose briefing time is now (within 30 min window)
        const now = new Date()
        const currentHour = now.getUTCHours()
        const currentMinute = now.getUTCMinutes()

        // Query users with briefing enabled
        const { data: prefsWithLinks } = await supabase
            .from('telegram_preferences')
            .select(`
                profile_id,
                daily_briefing_time,
                timezone,
                messaging_links!inner(platform_user_id)
            `)
            .eq('daily_briefing_enabled', true)
            .not('messaging_links.verified_at', 'is', null)

        if (!prefsWithLinks || prefsWithLinks.length === 0) {
            return { sent: 0, failed: 0 }
        }

        // Filter users whose briefing time matches current time
        const eligibleUsers = prefsWithLinks.filter(pref => {
            const briefingTime = pref.daily_briefing_time || '08:00:00'
            const [hour] = briefingTime.split(':').map(Number)
            
            // Simple check - within the same hour
            // In production, you'd want timezone-aware scheduling
            return hour === currentHour && currentMinute < 30
        })

        // Send briefings using enhanced Daily Pulse
        for (const user of eligibleUsers) {
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, role')
                    .eq('id', user.profile_id)
                    .single()

                if (!profile || !user.messaging_links) continue

                const chatId = (user.messaging_links as { platform_user_id: string }[])[0]?.platform_user_id
                if (!chatId) continue

                // Try to use enhanced Daily Pulse report
                try {
                    const { generateDailyPulseReport, formatDailyPulseForTelegram } = await import('@/lib/reports')
                    
                    const report = await generateDailyPulseReport(
                        user.profile_id,
                        profile.full_name?.split(' ')[0] || 'there',
                        profile.role || 'Team Member'
                    )
                    
                    if (report) {
                        const message = formatDailyPulseForTelegram(report)
                        const { sendMessage } = await import('./bot')
                        
                        await sendMessage({
                            chat_id: chatId,
                            text: message,
                            parse_mode: 'HTML',
                        })
                        sent++
                        continue
                    }
                } catch (reportError) {
                    // Fall back to basic briefing if enhanced report fails
                    console.warn(`Enhanced report failed for ${user.profile_id}, using fallback:`, reportError)
                }

                // Fallback: Use basic briefing data
                const { data: briefingData } = await supabase
                    .rpc('get_daily_briefing', { p_profile_id: user.profile_id })

                if (briefingData) {
                    const { formatDailyBriefing, sendMessage } = await import('./bot')
                    const message = formatDailyBriefing(briefingData, profile.full_name || 'there')
                    
                    await sendMessage({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'HTML',
                    })
                    sent++
                }
            } catch (error) {
                console.error(`Failed to send briefing to user ${user.profile_id}:`, error)
                failed++
            }
        }

        return { sent, failed }
    } catch (error) {
        console.error('Failed to send daily briefings:', error)
        return { sent, failed }
    }
}
