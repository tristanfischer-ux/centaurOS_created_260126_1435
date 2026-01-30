/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: Fix Supabase type instantiation issues - using ts-nocheck until types are regenerated
'use server'

/**
 * Notification Preferences Server Actions
 * 
 * Manages user notification preferences:
 * - Get/update channel preferences
 * - Register push tokens
 * - Manage phone numbers for SMS
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registerPushSubscription, unregisterPushSubscription } from '@/lib/notifications/channels/push'

// Types
export interface ChannelPreferences {
    enabled: boolean
    criticalEnabled: boolean
    highEnabled: boolean
    mediumEnabled: boolean
    lowEnabled: boolean
}

export interface NotificationPreferencesResponse {
    push: ChannelPreferences & { pushToken: string | null }
    email: ChannelPreferences
    sms: ChannelPreferences & { phoneNumber: string | null }
    in_app: ChannelPreferences
}

// Database row types (not yet in generated types)
interface NotificationPreferenceRow {
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

interface NotificationLogRow {
    id: string
    user_id: string
    priority: string
    channels: string[]
    title: string
    body: string | null
    action_url: string | null
    delivered_via: string[]
    read_at: string | null
    created_at: string
}

// Default preferences
const DEFAULT_CHANNEL_PREFS: ChannelPreferences = {
    enabled: true,
    criticalEnabled: true,
    highEnabled: true,
    mediumEnabled: true,
    lowEnabled: false
}

// ==========================================
// GET PREFERENCES
// ==========================================

/**
 * Get current user's notification preferences
 */
export async function getNotificationPreferences(): Promise<{
    data: NotificationPreferencesResponse | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        // Get preferences from database
        // Note: notification_preferences table may not be in generated types yet
         
        const baseQuery: any = supabase.from('notification_preferences')
        const result = await baseQuery.select('*').eq('user_id', user.id)
        const { data: prefs, error } = result as { data: NotificationPreferenceRow[] | null; error: { message: string } | null }

        if (error) {
            console.error('Error fetching notification preferences:', error)
            return { data: null, error: error.message }
        }

        // Build response with defaults
        const response: NotificationPreferencesResponse = {
            push: { ...DEFAULT_CHANNEL_PREFS, pushToken: null },
            email: { ...DEFAULT_CHANNEL_PREFS },
            sms: { ...DEFAULT_CHANNEL_PREFS, enabled: false, phoneNumber: null },
            in_app: { ...DEFAULT_CHANNEL_PREFS, lowEnabled: true }
        }

        // Apply stored preferences
        if (prefs) {
            for (const pref of prefs) {
                const basePrefs = {
                    enabled: pref.enabled ?? DEFAULT_CHANNEL_PREFS.enabled,
                    criticalEnabled: pref.critical_enabled ?? DEFAULT_CHANNEL_PREFS.criticalEnabled,
                    highEnabled: pref.high_enabled ?? DEFAULT_CHANNEL_PREFS.highEnabled,
                    mediumEnabled: pref.medium_enabled ?? DEFAULT_CHANNEL_PREFS.mediumEnabled,
                    lowEnabled: pref.low_enabled ?? DEFAULT_CHANNEL_PREFS.lowEnabled
                }
                
                switch (pref.channel) {
                    case 'push':
                        response.push = { ...basePrefs, pushToken: pref.push_token }
                        break
                    case 'email':
                        response.email = basePrefs
                        break
                    case 'sms':
                        response.sms = { ...basePrefs, phoneNumber: pref.phone_number }
                        break
                    case 'in_app':
                        response.in_app = basePrefs
                        break
                }
            }
        }

        return { data: response, error: null }

    } catch (err) {
        console.error('Failed to get notification preferences:', err)
        return { 
            data: null, 
            error: err instanceof Error ? err.message : 'Failed to get preferences' 
        }
    }
}

// ==========================================
// UPDATE PREFERENCES
// ==========================================

/**
 * Update notification preferences for a specific channel
 */
export async function updateNotificationPreferences(
    channel: 'push' | 'email' | 'sms' | 'in_app',
    preferences: Partial<ChannelPreferences>
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        // Prepare update data
        const updateData: Record<string, unknown> = {}
        if (preferences.enabled !== undefined) updateData.enabled = preferences.enabled
        if (preferences.criticalEnabled !== undefined) updateData.critical_enabled = preferences.criticalEnabled
        if (preferences.highEnabled !== undefined) updateData.high_enabled = preferences.highEnabled
        if (preferences.mediumEnabled !== undefined) updateData.medium_enabled = preferences.mediumEnabled
        if (preferences.lowEnabled !== undefined) updateData.low_enabled = preferences.lowEnabled

        // Upsert preference
        // Note: notification_preferences table may not be in generated types yet
         
        const { error } = await (supabase as any)
            .from('notification_preferences')
            .upsert({
                user_id: user.id,
                channel,
                ...updateData
            }, {
                onConflict: 'user_id,channel'
            })

        if (error) {
            console.error('Error updating notification preferences:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/settings/notifications')
        return { success: true, error: null }

    } catch (err) {
        console.error('Failed to update notification preferences:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to update preferences' 
        }
    }
}

/**
 * Update all channel preferences at once
 */
export async function updateAllNotificationPreferences(
    preferences: Partial<Record<'push' | 'email' | 'sms' | 'in_app', Partial<ChannelPreferences>>>
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const channels = Object.keys(preferences) as Array<'push' | 'email' | 'sms' | 'in_app'>
        
        for (const channel of channels) {
            const channelPrefs = preferences[channel]
            if (channelPrefs) {
                const result = await updateNotificationPreferences(channel, channelPrefs)
                if (!result.success) {
                    return { success: false, error: `Failed to update ${channel}: ${result.error}` }
                }
            }
        }

        revalidatePath('/settings/notifications')
        return { success: true, error: null }

    } catch (err) {
        console.error('Failed to update all notification preferences:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to update preferences' 
        }
    }
}

// ==========================================
// PUSH TOKEN MANAGEMENT
// ==========================================

/**
 * Register a push notification token for the current user
 */
export async function registerPushToken(
    token: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        // Use the push channel registration function
        const result = await registerPushSubscription(user.id, token)
        
        if (!result.success) {
            return { success: false, error: result.error || 'Failed to register push token' }
        }

        return { success: true, error: null }

    } catch (err) {
        console.error('Failed to register push token:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to register push token' 
        }
    }
}

/**
 * Unregister push notifications for the current user
 */
export async function unregisterPushToken(): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const result = await unregisterPushSubscription(user.id)
        
        if (!result.success) {
            return { success: false, error: result.error || 'Failed to unregister push token' }
        }

        revalidatePath('/settings/notifications')
        return { success: true, error: null }

    } catch (err) {
        console.error('Failed to unregister push token:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to unregister push token' 
        }
    }
}

// ==========================================
// SMS NUMBER MANAGEMENT
// ==========================================

/**
 * Update phone number for SMS notifications
 */
export async function updateSMSPhoneNumber(
    phoneNumber: string | null
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        // Validate phone number format if provided
        if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
            return { success: false, error: 'Invalid phone number format' }
        }

        // Upsert SMS preference with phone number
        // Note: notification_preferences table may not be in generated types yet
         
        const { error } = await (supabase as any)
            .from('notification_preferences')
            .upsert({
                user_id: user.id,
                channel: 'sms',
                phone_number: phoneNumber,
                enabled: !!phoneNumber // Enable SMS if phone number provided
            }, {
                onConflict: 'user_id,channel'
            })

        if (error) {
            console.error('Error updating SMS phone number:', error)
            return { success: false, error: error.message }
        }

        // Also update profile phone number
        if (phoneNumber) {
            await supabase
                .from('profiles')
                .update({ phone_number: phoneNumber })
                .eq('id', user.id)
        }

        revalidatePath('/settings/notifications')
        return { success: true, error: null }

    } catch (err) {
        console.error('Failed to update SMS phone number:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to update phone number' 
        }
    }
}

// ==========================================
// NOTIFICATION LOG
// ==========================================

/**
 * Get notification history for the current user
 */
export async function getNotificationHistory(options?: {
    limit?: number
    offset?: number
    unreadOnly?: boolean
}): Promise<{
    data: Array<{
        id: string
        priority: string
        channels: string[]
        title: string
        body: string | null
        actionUrl: string | null
        deliveredVia: string[]
        readAt: string | null
        createdAt: string
    }>
    error: string | null
    total: number
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { data: [], error: 'Not authenticated', total: 0 }
        }

        const { limit = 20, offset = 0, unreadOnly = false } = options || {}

        // Note: notification_log table may not be in generated types yet
         
        let query: any = supabase.from('notification_log')
            .select('*', { count: 'exact' })
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

        if (unreadOnly) {
            query = query.is('read_at', null)
        }

        if (limit) {
            query = query.range(offset, offset + limit - 1)
        }

        const result = await query
        const { data, error, count } = result as { data: NotificationLogRow[] | null; error: { message: string } | null; count: number | null }

        if (error) {
            console.error('Error fetching notification history:', error)
            return { data: [], error: error.message, total: 0 }
        }

        const mappedData = (data || []).map(item => ({
            id: item.id,
            priority: item.priority,
            channels: item.channels || [],
            title: item.title,
            body: item.body,
            actionUrl: item.action_url,
            deliveredVia: item.delivered_via || [],
            readAt: item.read_at,
            createdAt: item.created_at
        }))

        return { data: mappedData, error: null, total: count || 0 }

    } catch (err) {
        console.error('Failed to get notification history:', err)
        return { 
            data: [], 
            error: err instanceof Error ? err.message : 'Failed to get history',
            total: 0
        }
    }
}

/**
 * Mark notification log entry as read
 */
export async function markNotificationLogAsRead(
    notificationId: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        // Note: notification_log table may not be in generated types yet
        const { error } = await (supabase
            .from('notification_log') as any)
            .update({ read_at: new Date().toISOString() })
            .eq('id', notificationId)
            .eq('user_id', user.id) // Security: only allow marking own notifications

        if (error) {
            console.error('Error marking notification as read:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }

    } catch (err) {
        console.error('Failed to mark notification as read:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to mark as read' 
        }
    }
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Basic phone number validation
 */
function isValidPhoneNumber(phoneNumber: string): boolean {
    const cleaned = phoneNumber.replace(/[\s\-\(\)\.]/g, '')
    const e164Regex = /^\+?[1-9]\d{6,14}$/
    return e164Regex.test(cleaned)
}
