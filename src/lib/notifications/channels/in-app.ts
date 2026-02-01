/**
 * In-App Notification Channel
 * 
 * Creates notifications in the existing notifications table in Supabase.
 * Integrates with the existing notification system from src/actions/notifications.ts
 * Also bridges notifications to Telegram for linked users.
 */

import { createClient } from '@/lib/supabase/server'
import { InAppNotificationOptions, ChannelSendResult } from '../types'
import type { Json } from '@/types/database.types'

/**
 * Create an in-app notification
 * Uses the notifications table via direct insert or RPC
 * Also pushes to Telegram if user has it linked
 */
export async function createInAppNotification(
    options: InAppNotificationOptions
): Promise<ChannelSendResult> {
    const { userId, foundryId, type, title, message, link, metadata } = options

    try {
        const supabase = await createClient()
        let notificationId: string | undefined

        // Try using the create_notification RPC function first (if available)
        // This handles foundry_id automatically
        const { data: rpcNotificationId, error: rpcError } = await supabase.rpc('create_notification', {
            p_user_id: userId,
            p_type: type,
            p_title: title,
            p_message: message,
            p_link: link,
            p_metadata: metadata as Json | undefined
        })

        if (!rpcError && rpcNotificationId) {
            notificationId = rpcNotificationId as string
        } else {
            // Fallback to direct insert if RPC fails
            if (rpcError) {
                console.warn('RPC create_notification failed, using direct insert:', rpcError.message)
            }

            // Build insert data
            const { data: inserted, error: insertError } = await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    foundry_id: foundryId,
                    type,
                    title,
                    message,
                    link,
                    is_read: false
                })
                .select('id')
                .single()

            if (insertError) {
                console.error('Error creating in-app notification:', insertError)
                return { success: false, error: insertError.message }
            }

            notificationId = inserted?.id
        }

        // Push to Telegram asynchronously (don't block on this)
        pushToTelegramAsync(userId, notificationId, type, title, message, link)

        return { success: true }

    } catch (err) {
        console.error('Error creating in-app notification:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to create notification' 
        }
    }
}

/**
 * Push notification to Telegram asynchronously
 * This runs in the background and doesn't block the main notification creation
 */
async function pushToTelegramAsync(
    userId: string,
    notificationId: string | undefined,
    type: string,
    title: string,
    message?: string,
    link?: string
) {
    try {
        // Dynamic import to avoid circular dependencies
        const { pushNotificationToTelegram } = await import('@/lib/telegram/notification-bridge')
        
        await pushNotificationToTelegram({
            id: notificationId,
            user_id: userId,
            type,
            title,
            message,
            link,
        })
    } catch (error) {
        // Log but don't fail - Telegram is optional
        console.warn('Failed to push notification to Telegram:', error)
    }
}

/**
 * Create bulk in-app notifications for multiple users
 */
export async function createBulkInAppNotifications(
    userIds: string[],
    foundryId: string,
    options: Omit<InAppNotificationOptions, 'userId' | 'foundryId'>
): Promise<{ success: boolean; count: number; error?: string }> {
    const { type, title, message, link, metadata } = options

    try {
        const supabase = await createClient()

        const notifications = userIds.map(userId => ({
            user_id: userId,
            foundry_id: foundryId,
            type,
            title,
            message,
            link,
            is_read: false
        }))

        const { error } = await supabase
            .from('notifications')
            .insert(notifications)

        if (error) {
            console.error('Error creating bulk notifications:', error)
            return { success: false, count: 0, error: error.message }
        }

        return { success: true, count: userIds.length }

    } catch (err) {
        console.error('Error creating bulk notifications:', err)
        return { 
            success: false, 
            count: 0,
            error: err instanceof Error ? err.message : 'Failed to create notifications' 
        }
    }
}

/**
 * Notification types specific to marketplace
 */
export const MARKETPLACE_NOTIFICATION_TYPES = {
    // RFQ related
    NEW_RFQ: 'marketplace_new_rfq',
    RFQ_RESPONSE: 'marketplace_rfq_response',
    RFQ_AWARDED: 'marketplace_rfq_awarded',
    
    // Booking related
    BOOKING_REQUEST: 'marketplace_booking_request',
    BOOKING_CONFIRMED: 'marketplace_booking_confirmed',
    BOOKING_CANCELLED: 'marketplace_booking_cancelled',
    
    // Payment related
    PAYMENT_RECEIVED: 'marketplace_payment_received',
    PAYMENT_RELEASED: 'marketplace_payment_released',
    PAYMENT_REFUNDED: 'marketplace_payment_refunded',
    
    // Order related
    ORDER_CREATED: 'marketplace_order_created',
    ORDER_STATUS_CHANGED: 'marketplace_order_status',
    ORDER_COMPLETED: 'marketplace_order_completed',
    
    // Reviews and ratings
    REVIEW_RECEIVED: 'marketplace_review_received',
    
    // General marketplace
    LISTING_APPROVED: 'marketplace_listing_approved',
    LISTING_REJECTED: 'marketplace_listing_rejected',
    RECOMMENDATION: 'marketplace_recommendation'
} as const

export type MarketplaceNotificationType = typeof MARKETPLACE_NOTIFICATION_TYPES[keyof typeof MARKETPLACE_NOTIFICATION_TYPES]

/**
 * Create a marketplace-specific notification with proper typing
 */
export async function createMarketplaceNotification(
    userId: string,
    foundryId: string,
    notificationType: MarketplaceNotificationType,
    title: string,
    options?: {
        message?: string
        link?: string
        metadata?: Record<string, unknown>
    }
): Promise<ChannelSendResult> {
    return createInAppNotification({
        userId,
        foundryId,
        type: notificationType,
        title,
        message: options?.message,
        link: options?.link,
        metadata: options?.metadata
    })
}
