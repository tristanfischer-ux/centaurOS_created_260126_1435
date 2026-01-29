/**
 * Notification System
 * 
 * Multi-channel notification service for CentaurOS Marketplace
 * 
 * @example
 * ```typescript
 * import { sendNotification } from '@/lib/notifications'
 * 
 * // Send a high-priority notification
 * const result = await sendNotification({
 *   userId: 'user-id',
 *   priority: 'high',
 *   title: 'New Booking',
 *   body: 'You have a new booking request',
 *   actionUrl: '/marketplace/bookings/123'
 * })
 * 
 * console.log(result.deliveredVia) // ['push', 'email', 'in_app']
 * ```
 */

// Main service
export { 
    sendNotification, 
    sendBulkNotification 
} from './service'

// Types
export type {
    SendNotificationParams,
    NotificationResult,
    NotificationChannel,
    NotificationPriority,
    UserNotificationPreferences,
    ChannelPreference,
    EmailOptions,
    EmailTemplate,
    PushNotificationOptions,
    SMSOptions,
    InAppNotificationOptions,
    ChannelSendResult
} from './types'

// Channel exports for direct use
export { sendEmail, sendTemplatedEmail, queueEmailForDigest } from './channels/email'
export { 
    sendPushNotification, 
    registerPushSubscription, 
    unregisterPushSubscription,
    getVapidPublicKey 
} from './channels/push'
export { sendSMS, sendCriticalSMS, isTwilioConfigured } from './channels/sms'
export { 
    createInAppNotification, 
    createBulkInAppNotifications,
    createMarketplaceNotification,
    MARKETPLACE_NOTIFICATION_TYPES
} from './channels/in-app'
export type { MarketplaceNotificationType } from './channels/in-app'
