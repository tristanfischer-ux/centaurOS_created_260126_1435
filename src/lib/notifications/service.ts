/**
 * Multi-Channel Notification Service
 * 
 * Routes notifications to appropriate channels based on priority:
 * - Critical: push + sms + email (all simultaneously)
 * - High: push + email
 * - Medium: push (if enabled) + email digest
 * - Low: in-app only
 */

import { createClient } from '@/lib/supabase/server'
import { 
    SendNotificationParams, 
    NotificationResult, 
    NotificationChannel,
    NotificationPriority,
    UserNotificationPreferences,
    ChannelPreference
} from './types'
import { sendEmail } from './channels/email'
import { sendPushNotification } from './channels/push'
import { sendSMS } from './channels/sms'
import { createInAppNotification } from './channels/in-app'

/**
 * Priority to channel mapping
 */
const PRIORITY_CHANNELS: Record<NotificationPriority, NotificationChannel[]> = {
    critical: ['push', 'sms', 'email', 'in_app'],
    high: ['push', 'email', 'in_app'],
    medium: ['push', 'email', 'in_app'],
    low: ['in_app']
}

/**
 * Main notification function - routes to appropriate channels based on priority
 */
export async function sendNotification(params: SendNotificationParams): Promise<NotificationResult> {
    const { userId, priority, title, body, actionUrl, metadata } = params
    
    const result: NotificationResult = {
        success: false,
        channels: [],
        deliveredVia: [],
        errors: []
    }

    try {
        // Get user preferences and profile
        const { preferences, profile } = await getUserPreferencesAndProfile(userId)
        
        // Determine which channels to use based on priority
        const targetChannels = PRIORITY_CHANNELS[priority]
        result.channels = targetChannels

        // Filter channels based on user preferences
        const enabledChannels = filterEnabledChannels(targetChannels, preferences, priority)

        // Send to each enabled channel in parallel
        const sendPromises: Promise<{ channel: NotificationChannel; success: boolean; error?: string }>[] = []

        for (const channel of enabledChannels) {
            sendPromises.push(
                sendToChannel(channel, { userId, title, body, actionUrl, metadata, profile, preferences })
                    .then(channelResult => ({ channel, ...channelResult }))
            )
        }

        const channelResults = await Promise.all(sendPromises)

        // Process results
        for (const channelResult of channelResults) {
            if (channelResult.success) {
                result.deliveredVia.push(channelResult.channel)
            } else if (channelResult.error) {
                result.errors?.push({ 
                    channel: channelResult.channel, 
                    error: channelResult.error 
                })
            }
        }

        // Log the notification
        result.logId = await logNotification({
            userId,
            priority,
            channels: enabledChannels,
            title,
            body,
            actionUrl,
            deliveredVia: result.deliveredVia
        })

        result.success = result.deliveredVia.length > 0

    } catch (err) {
        console.error('Error sending notification:', err)
        result.errors?.push({ 
            channel: 'in_app', 
            error: err instanceof Error ? err.message : 'Unknown error' 
        })
    }

    return result
}

// Database row type (not yet in generated types)
interface NotificationPreferenceDbRow {
    id: string
    user_id: string
    channel: 'push' | 'email' | 'sms' | 'in_app'
    enabled: boolean
    critical_enabled: boolean
    high_enabled: boolean
    medium_enabled: boolean
    low_enabled: boolean
    phone_number: string | null
    push_token: string | null
}

/**
 * Get user notification preferences and profile
 */
async function getUserPreferencesAndProfile(userId: string): Promise<{
    preferences: UserNotificationPreferences
    profile: { email: string; phone_number: string | null; foundry_id: string } | null
}> {
    const supabase = await createClient()

    // Get profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('email, phone_number, foundry_id')
        .eq('id', userId)
        .single()

    // Get notification preferences
    // Note: notification_preferences table may not be in generated types yet
    const { data: prefsData } = await supabase
        .from('notification_preferences' as 'profiles')
        .select('*')
        .eq('user_id', userId) as unknown as { data: NotificationPreferenceDbRow[] | null }

    // Build preferences object with defaults
    const defaultPreference: ChannelPreference = {
        enabled: true,
        criticalEnabled: true,
        highEnabled: true,
        mediumEnabled: true,
        lowEnabled: false,
        phoneNumber: null,
        pushToken: null
    }

    const preferences: UserNotificationPreferences = {
        push: { ...defaultPreference },
        email: { ...defaultPreference },
        sms: { ...defaultPreference, enabled: false }, // SMS disabled by default
        in_app: { ...defaultPreference, lowEnabled: true } // In-app always enabled for low
    }

    // Apply stored preferences
    if (prefsData) {
        for (const pref of prefsData) {
            const channel = pref.channel as NotificationChannel
            if (preferences[channel]) {
                preferences[channel] = {
                    enabled: pref.enabled ?? true,
                    criticalEnabled: pref.critical_enabled ?? true,
                    highEnabled: pref.high_enabled ?? true,
                    mediumEnabled: pref.medium_enabled ?? true,
                    lowEnabled: pref.low_enabled ?? false,
                    phoneNumber: pref.phone_number,
                    pushToken: pref.push_token
                }
            }
        }
    }

    // Use profile phone number as fallback for SMS
    if (profile?.phone_number && !preferences.sms.phoneNumber) {
        preferences.sms.phoneNumber = profile.phone_number
    }

    return { preferences, profile }
}

/**
 * Filter channels based on user preferences and priority
 */
function filterEnabledChannels(
    channels: NotificationChannel[],
    preferences: UserNotificationPreferences,
    priority: NotificationPriority
): NotificationChannel[] {
    return channels.filter(channel => {
        const pref = preferences[channel]
        if (!pref.enabled) return false

        switch (priority) {
            case 'critical':
                return pref.criticalEnabled
            case 'high':
                return pref.highEnabled
            case 'medium':
                return pref.mediumEnabled
            case 'low':
                return pref.lowEnabled
            default:
                return false
        }
    })
}

/**
 * Send to a specific channel
 */
async function sendToChannel(
    channel: NotificationChannel,
    params: {
        userId: string
        title: string
        body: string
        actionUrl?: string
        metadata?: Record<string, unknown>
        profile: { email: string; phone_number: string | null; foundry_id: string } | null
        preferences: UserNotificationPreferences
    }
): Promise<{ success: boolean; error?: string }> {
    const { userId, title, body, actionUrl, metadata, profile, preferences } = params

    try {
        switch (channel) {
            case 'email':
                if (!profile?.email) {
                    return { success: false, error: 'No email address available' }
                }
                return await sendEmail({
                    to: profile.email,
                    subject: title,
                    body,
                    template: 'generic'
                })

            case 'push':
                if (!preferences.push.pushToken) {
                    return { success: false, error: 'No push token registered' }
                }
                return await sendPushNotification({
                    userId,
                    title,
                    body,
                    actionUrl
                })

            case 'sms':
                const phoneNumber = preferences.sms.phoneNumber || profile?.phone_number
                if (!phoneNumber) {
                    return { success: false, error: 'No phone number available' }
                }
                return await sendSMS({
                    phoneNumber,
                    message: `${title}: ${body}`
                })

            case 'in_app':
                if (!profile?.foundry_id) {
                    return { success: false, error: 'No foundry context' }
                }
                return await createInAppNotification({
                    userId,
                    foundryId: profile.foundry_id,
                    type: 'marketplace',
                    title,
                    message: body,
                    link: actionUrl,
                    metadata
                })

            default:
                return { success: false, error: `Unknown channel: ${channel}` }
        }
    } catch (err) {
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Channel send failed' 
        }
    }
}

/**
 * Log notification to notification_log table
 */
async function logNotification(params: {
    userId: string
    priority: NotificationPriority
    channels: NotificationChannel[]
    title: string
    body: string
    actionUrl?: string
    deliveredVia: NotificationChannel[]
}): Promise<string | undefined> {
    const supabase = await createClient()

    // Note: notification_log table may not be in generated types yet
    const { data, error } = await (supabase
        .from('notification_log' as 'profiles') as unknown as ReturnType<typeof supabase.from>)
        .insert({
            user_id: params.userId,
            priority: params.priority,
            channels: params.channels,
            title: params.title,
            body: params.body,
            action_url: params.actionUrl || null,
            delivered_via: params.deliveredVia
        })
        .select('id')
        .single() as unknown as { data: { id: string } | null; error: { message: string } | null }

    if (error) {
        console.error('Error logging notification:', error)
        return undefined
    }

    return data?.id
}

/**
 * Send notification to multiple users
 */
export async function sendBulkNotification(
    userIds: string[],
    params: Omit<SendNotificationParams, 'userId'>
): Promise<{
    sent: number
    failed: number
    results: Array<{ userId: string; result: NotificationResult }>
}> {
    const results: Array<{ userId: string; result: NotificationResult }> = []
    let sent = 0
    let failed = 0

    // Send notifications in batches to avoid overwhelming the system
    const BATCH_SIZE = 10
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.all(
            batch.map(async userId => {
                const result = await sendNotification({ ...params, userId })
                return { userId, result }
            })
        )

        for (const { userId, result } of batchResults) {
            results.push({ userId, result })
            if (result.success) {
                sent++
            } else {
                failed++
            }
        }
    }

    return { sent, failed, results }
}

// Re-export types for convenience
export type { 
    SendNotificationParams, 
    NotificationResult,
    NotificationChannel,
    NotificationPriority
}
