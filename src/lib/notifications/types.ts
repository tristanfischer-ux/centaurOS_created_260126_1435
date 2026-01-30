/**
 * Notification System Types
 * 
 * These types align with the database enums and tables:
 * - notification_priority: 'critical', 'high', 'medium', 'low'
 * - notification_channel: 'push', 'email', 'sms', 'in_app'
 */

export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low'
export type NotificationChannel = 'push' | 'email' | 'sms' | 'in_app'

export interface SendNotificationParams {
    userId: string
    priority: NotificationPriority
    title: string
    body: string
    actionUrl?: string
    metadata?: Record<string, unknown>
}

export interface NotificationResult {
    success: boolean
    channels: NotificationChannel[]
    deliveredVia: NotificationChannel[]
    logId?: string
    errors?: Array<{ channel: NotificationChannel; error: string }>
}

export interface ChannelSendResult {
    success: boolean
    error?: string
}

export interface UserNotificationPreferences {
    push: ChannelPreference
    email: ChannelPreference
    sms: ChannelPreference
    in_app: ChannelPreference
}

export interface ChannelPreference {
    enabled: boolean
    criticalEnabled: boolean
    highEnabled: boolean
    mediumEnabled: boolean
    lowEnabled: boolean
    phoneNumber?: string | null
    pushToken?: string | null
}

export interface EmailOptions {
    to: string
    subject: string
    body: string
    template?: EmailTemplate
    templateData?: Record<string, unknown>
}

export type EmailTemplate = 
    | 'new_rfq'
    | 'booking_request'
    | 'payment_received'
    | 'order_status_update'
    | 'rfq_new_match'
    | 'rfq_urgent_match'
    | 'rfq_priority_hold_won'
    | 'rfq_awarded_to_you'
    | 'rfq_outbid'
    | 'team_invitation'
    | 'generic'

export interface PushNotificationOptions {
    userId: string
    title: string
    body: string
    actionUrl?: string
    icon?: string
    badge?: number
}

export interface SMSOptions {
    phoneNumber: string
    message: string
}

export interface InAppNotificationOptions {
    userId: string
    foundryId: string
    type: string
    title: string
    message?: string
    link?: string
    metadata?: Record<string, unknown>
}
