// @ts-nocheck - notification_preferences table not in generated types; using type cast workaround `as 'profiles'` until table added to schema
/**
 * Push Notification Channel
 * 
 * Handles Web Push API integration for browser notifications.
 */

import { createClient } from '@/lib/supabase/server'
import { PushNotificationOptions, ChannelSendResult } from '../types'

// VAPID keys would be configured in environment
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@centauros.io'

/**
 * Send a push notification to a user
 */
export async function sendPushNotification(
    options: PushNotificationOptions
): Promise<ChannelSendResult> {
    const { userId, title, body, actionUrl, icon, badge } = options

    try {
        // Get user's push token from preferences
        const supabase = await createClient()
        
        // Note: notification_preferences table may not be in generated types yet
        const { data: prefData, error: prefError } = await supabase
            .from('notification_preferences' as 'profiles')
            .select('push_token')
            .eq('user_id', userId)
            .eq('channel', 'push')
            .single() as unknown as { data: { push_token: string | null } | null; error: { message: string } | null }

        if (prefError || !prefData?.push_token) {
            return { 
                success: false, 
                error: 'No push subscription found for user' 
            }
        }

        const pushSubscription = parsePushToken(prefData.push_token)
        if (!pushSubscription) {
            return { 
                success: false, 
                error: 'Invalid push subscription format' 
            }
        }

        // ============================================
        // STUB: Replace with actual Web Push sending
        // ============================================
        // Example with web-push:
        // 
        // import webpush from 'web-push'
        // 
        // webpush.setVapidDetails(
        //     VAPID_SUBJECT,
        //     VAPID_PUBLIC_KEY!,
        //     VAPID_PRIVATE_KEY!
        // )
        // 
        // const payload = JSON.stringify({
        //     title,
        //     body,
        //     icon: icon || '/icons/icon-192x192.png',
        //     badge: badge || '/icons/badge-72x72.png',
        //     data: { url: actionUrl }
        // })
        // 
        // await webpush.sendNotification(pushSubscription, payload)
        // ============================================

        console.log('[PUSH STUB] Would send push notification:', {
            userId,
            title,
            body: body.substring(0, 50) + '...',
            actionUrl
        })

        return { success: true }

    } catch (err) {
        console.error('Error sending push notification:', err)
        
        // Handle specific web-push errors
        if (err instanceof Error) {
            // Subscription expired or invalid
            if (err.message.includes('410') || err.message.includes('404')) {
                // Remove invalid subscription
                await removeInvalidSubscription(userId)
                return { 
                    success: false, 
                    error: 'Push subscription expired - user needs to re-subscribe' 
                }
            }
        }
        
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to send push notification' 
        }
    }
}

/**
 * Register a push subscription for a user
 */
export async function registerPushSubscription(
    userId: string,
    subscription: PushSubscription | string
): Promise<ChannelSendResult> {
    try {
        const supabase = await createClient()
        
        const pushToken = typeof subscription === 'string' 
            ? subscription 
            : JSON.stringify(subscription)

        // Upsert push preference with token
        // Note: notification_preferences table may not be in generated types yet
        const { error } = await (supabase
            .from('notification_preferences' as 'profiles') as unknown as ReturnType<typeof supabase.from>)
            .upsert({
                user_id: userId,
                channel: 'push',
                enabled: true,
                critical_enabled: true,
                high_enabled: true,
                medium_enabled: true,
                low_enabled: false,
                push_token: pushToken
            }, {
                onConflict: 'user_id,channel'
            })

        if (error) {
            console.error('Error registering push subscription:', error)
            return { success: false, error: error.message }
        }

        return { success: true }

    } catch (err) {
        console.error('Error registering push subscription:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to register subscription' 
        }
    }
}

/**
 * Unregister push subscription for a user
 */
export async function unregisterPushSubscription(userId: string): Promise<ChannelSendResult> {
    try {
        const supabase = await createClient()

        // Note: notification_preferences table may not be in generated types yet
        const { error } = await (supabase
            .from('notification_preferences' as 'profiles') as unknown as ReturnType<typeof supabase.from>)
            .update({ push_token: null, enabled: false })
            .eq('user_id', userId)
            .eq('channel', 'push')

        if (error) {
            console.error('Error unregistering push subscription:', error)
            return { success: false, error: error.message }
        }

        return { success: true }

    } catch (err) {
        console.error('Error unregistering push subscription:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to unregister subscription' 
        }
    }
}

/**
 * Remove invalid/expired subscription
 */
async function removeInvalidSubscription(userId: string): Promise<void> {
    try {
        const supabase = await createClient()
        
        // Note: notification_preferences table may not be in generated types yet
        await (supabase
            .from('notification_preferences' as 'profiles') as unknown as ReturnType<typeof supabase.from>)
            .update({ push_token: null })
            .eq('user_id', userId)
            .eq('channel', 'push')
            
    } catch (err) {
        console.error('Error removing invalid subscription:', err)
    }
}

/**
 * Parse push token from stored string
 */
function parsePushToken(token: string): PushSubscriptionJSON | null {
    try {
        const parsed = JSON.parse(token)
        // Validate basic structure
        if (parsed.endpoint && parsed.keys) {
            return parsed as PushSubscriptionJSON
        }
        return null
    } catch {
        return null
    }
}

/**
 * Get VAPID public key for client-side subscription
 */
export function getVapidPublicKey(): string | undefined {
    return VAPID_PUBLIC_KEY
}

// Type for push subscription JSON format
interface PushSubscriptionJSON {
    endpoint: string
    expirationTime?: number | null
    keys: {
        p256dh: string
        auth: string
    }
}
