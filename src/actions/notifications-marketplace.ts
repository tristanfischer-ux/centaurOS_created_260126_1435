'use server'
// @ts-nocheck - Database types out of sync

/**
 * Marketplace Notification Server Actions
 * 
 * Handles sending notifications for marketplace events:
 * - New RFQs
 * - Booking requests
 * - Payment notifications
 * - Order status changes
 */

import { createClient } from '@/lib/supabase/server'
import { sendNotification, sendBulkNotification } from '@/lib/notifications/service'
import { sendTemplatedEmail } from '@/lib/notifications/channels/email'
import { MARKETPLACE_NOTIFICATION_TYPES } from '@/lib/notifications/channels/in-app'
import { revalidatePath } from 'next/cache'

// Database row types (not yet in generated types)
interface MarketplaceOrderRow {
    id: string
    seller_id: string
    buyer_id: string
    listing_id: string
    amount: number
    status: string
    marketplace_listings: { title: string; category?: string } | null
    buyer?: { full_name: string | null; email: string } | null
}

// ==========================================
// RFQ NOTIFICATIONS
// ==========================================

/**
 * Notify matched suppliers of a new RFQ
 */
export async function notifyNewRFQ(
    rfqId: string,
    supplierIds: string[]
): Promise<{ success: boolean; sent: number; error: string | null }> {
    try {
        const supabase = await createClient()

        // Get RFQ details
        const { data: rfq, error: rfqError } = await supabase
            .from('manufacturing_rfqs')
            .select('title, specifications, budget_range, created_by')
            .eq('id', rfqId)
            .single()

        if (rfqError || !rfq) {
            return { success: false, sent: 0, error: 'RFQ not found' }
        }

        // Get requester name
        const { data: requester } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', rfq.created_by as string)
            .single()

        const actionUrl = `/marketplace/rfq/${rfqId}`

        // Send notifications to all suppliers
        const { sent, failed } = await sendBulkNotification(supplierIds, {
            priority: 'high',
            title: `New RFQ: ${rfq.title}`,
            body: rfq.specifications.substring(0, 200) + (rfq.specifications.length > 200 ? '...' : ''),
            actionUrl,
            metadata: {
                type: MARKETPLACE_NOTIFICATION_TYPES.NEW_RFQ,
                rfq_id: rfqId,
                requester_name: requester?.full_name || 'A business',
                budget_range: rfq.budget_range
            }
        })

        // Also send templated emails to suppliers
        for (const supplierId of supplierIds) {
            const { data: supplier } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', supplierId)
                .single()

            if (supplier?.email) {
                await sendTemplatedEmail(supplier.email, 'new_rfq', {
                    title: rfq.title,
                    specifications: rfq.specifications,
                    budgetRange: rfq.budget_range,
                    actionUrl
                })
            }
        }

        return { 
            success: sent > 0, 
            sent, 
            error: failed > 0 ? `${failed} notifications failed` : null 
        }

    } catch (err) {
        console.error('Error notifying suppliers of new RFQ:', err)
        return { 
            success: false, 
            sent: 0, 
            error: err instanceof Error ? err.message : 'Failed to send notifications' 
        }
    }
}

// ==========================================
// BOOKING NOTIFICATIONS
// ==========================================

/**
 * Notify provider of a new booking request
 */
export async function notifyBookingRequest(
    bookingId: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        // Get booking details - this assumes a marketplace_orders table exists
        // Note: marketplace_orders table may not be in generated types yet
        const { data: booking, error: bookingError } = await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('orders' as any)
            .select(`
                id,
                seller_id,
                buyer_id,
                listing_id,
                amount,
                status,
                marketplace_listings (
                    title,
                    category
                ),
                buyer:profiles!marketplace_orders_buyer_id_fkey (
                    full_name,
                    email
                )
            `)
            .eq('id', bookingId)
            .single() as unknown as { data: MarketplaceOrderRow | null; error: { message: string } | null }

        if (bookingError) {
            // Table might not exist yet, log and return gracefully
            console.warn('Booking query error (table may not exist):', bookingError.message)
            return { success: false, error: 'Booking not found or table does not exist' }
        }

        if (!booking) {
            return { success: false, error: 'Booking not found' }
        }

        const listing = booking.marketplace_listings
        const buyer = booking.buyer

        const actionUrl = `/marketplace/orders/${bookingId}`

        // Notify the seller/provider
        const result = await sendNotification({
            userId: booking.seller_id,
            priority: 'high',
            title: 'New Booking Request',
            body: `${buyer?.full_name || 'A customer'} has requested to book "${listing?.title || 'your service'}"`,
            actionUrl,
            metadata: {
                type: MARKETPLACE_NOTIFICATION_TYPES.BOOKING_REQUEST,
                booking_id: bookingId,
                listing_title: listing?.title,
                buyer_name: buyer?.full_name,
                amount: booking.amount
            }
        })

        // Send templated email
        const { data: seller } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', booking.seller_id)
            .single()

        if (seller?.email) {
            await sendTemplatedEmail(seller.email, 'booking_request', {
                serviceName: listing?.title,
                requesterName: buyer?.full_name,
                actionUrl
            })
        }

        return { 
            success: result.success, 
            error: result.success ? null : 'Failed to send notification' 
        }

    } catch (err) {
        console.error('Error notifying booking request:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to send notification' 
        }
    }
}

// ==========================================
// PAYMENT NOTIFICATIONS
// ==========================================

/**
 * Notify seller that payment has been received
 */
export async function notifyPaymentReceived(
    orderId: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        // Get order details
        // Note: marketplace_orders table may not be in generated types yet
        const { data: order, error: orderError } = await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('orders' as any)
            .select(`
                id,
                seller_id,
                buyer_id,
                listing_id,
                amount,
                status,
                marketplace_listings (
                    title
                )
            `)
            .eq('id', orderId)
            .single() as unknown as { data: MarketplaceOrderRow | null; error: { message: string } | null }

        if (orderError) {
            console.warn('Order query error:', orderError.message)
            return { success: false, error: 'Order not found or table does not exist' }
        }

        if (!order) {
            return { success: false, error: 'Order not found' }
        }

        const listing = order.marketplace_listings
        const formattedAmount = formatCurrency(order.amount)
        const actionUrl = `/marketplace/orders/${orderId}`

        // Notify seller
        const result = await sendNotification({
            userId: order.seller_id,
            priority: 'high',
            title: 'Payment Received!',
            body: `Payment of ${formattedAmount} has been received for "${listing?.title || 'your order'}"`,
            actionUrl,
            metadata: {
                type: MARKETPLACE_NOTIFICATION_TYPES.PAYMENT_RECEIVED,
                order_id: orderId,
                amount: order.amount,
                listing_title: listing?.title
            }
        })

        // Send templated email
        const { data: seller } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', order.seller_id)
            .single()

        if (seller?.email) {
            await sendTemplatedEmail(seller.email, 'payment_received', {
                amount: formattedAmount,
                orderTitle: listing?.title,
                orderId,
                actionUrl
            })
        }

        return { 
            success: result.success, 
            error: result.success ? null : 'Failed to send notification' 
        }

    } catch (err) {
        console.error('Error notifying payment received:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to send notification' 
        }
    }
}

// ==========================================
// ORDER STATUS NOTIFICATIONS
// ==========================================

/**
 * Notify relevant parties when order status changes
 */
export async function notifyOrderStatusChange(
    orderId: string,
    newStatus: string,
    options?: {
        message?: string
        notifyBuyer?: boolean
        notifySeller?: boolean
    }
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { notifyBuyer = true, notifySeller = true, message } = options || {}

        // Get order details
        // Note: marketplace_orders table may not be in generated types yet
        const { data: order, error: orderError } = await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('orders' as any)
            .select(`
                id,
                seller_id,
                buyer_id,
                listing_id,
                amount,
                status,
                marketplace_listings (
                    title
                )
            `)
            .eq('id', orderId)
            .single() as unknown as { data: MarketplaceOrderRow | null; error: { message: string } | null }

        if (orderError) {
            console.warn('Order query error:', orderError.message)
            return { success: false, error: 'Order not found or table does not exist' }
        }

        if (!order) {
            return { success: false, error: 'Order not found' }
        }

        const listing = order.marketplace_listings
        const actionUrl = `/marketplace/orders/${orderId}`
        const previousStatus = order.status

        // Determine priority based on status
        const priority = getStatusPriority(newStatus)

        // Build list of users to notify
        const usersToNotify: string[] = []
        if (notifyBuyer && order.buyer_id) usersToNotify.push(order.buyer_id)
        if (notifySeller && order.seller_id) usersToNotify.push(order.seller_id)

        let successCount = 0

        for (const userId of usersToNotify) {
            const result = await sendNotification({
                userId,
                priority,
                title: `Order ${formatStatus(newStatus)}`,
                body: message || `Your order "${listing?.title || orderId}" status has been updated to ${formatStatus(newStatus)}`,
                actionUrl,
                metadata: {
                    type: MARKETPLACE_NOTIFICATION_TYPES.ORDER_STATUS_CHANGED,
                    order_id: orderId,
                    previous_status: previousStatus,
                    new_status: newStatus,
                    listing_title: listing?.title
                }
            })

            if (result.success) successCount++

            // Send templated email
            const { data: user } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', userId)
                .single()

            if (user?.email) {
                await sendTemplatedEmail(user.email, 'order_status_update', {
                    orderTitle: listing?.title,
                    orderId,
                    previousStatus: formatStatus(previousStatus || ''),
                    status: formatStatus(newStatus),
                    message,
                    actionUrl
                })
            }
        }

        revalidatePath('/marketplace/orders')

        return { 
            success: successCount > 0, 
            error: successCount === 0 ? 'No notifications sent' : null 
        }

    } catch (err) {
        console.error('Error notifying order status change:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to send notification' 
        }
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Format currency for display
 */
function formatCurrency(amount: number | null): string {
    if (amount === null || amount === undefined) return 'Amount'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount / 100) // Assuming amount is in cents
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
    return status
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Determine notification priority based on status
 */
function getStatusPriority(status: string): 'critical' | 'high' | 'medium' | 'low' {
    const criticalStatuses = ['cancelled', 'refunded', 'disputed', 'failed']
    const highStatuses = ['completed', 'shipped', 'delivered', 'paid']
    const mediumStatuses = ['processing', 'in_progress', 'pending_review']
    
    const normalizedStatus = status.toLowerCase()
    
    if (criticalStatuses.some(s => normalizedStatus.includes(s))) return 'critical'
    if (highStatuses.some(s => normalizedStatus.includes(s))) return 'high'
    if (mediumStatuses.some(s => normalizedStatus.includes(s))) return 'medium'
    return 'low'
}

// ==========================================
// ADDITIONAL MARKETPLACE NOTIFICATIONS
// ==========================================

/**
 * Notify about escrow release
 */
export async function notifyEscrowReleased(
    orderId: string,
    sellerId: string,
    amount: number
): Promise<{ success: boolean; error: string | null }> {
    try {
        const formattedAmount = formatCurrency(amount)
        
        const result = await sendNotification({
            userId: sellerId,
            priority: 'high',
            title: 'Funds Released!',
            body: `${formattedAmount} has been released from escrow to your account`,
            actionUrl: `/marketplace/orders/${orderId}`,
            metadata: {
                type: MARKETPLACE_NOTIFICATION_TYPES.PAYMENT_RELEASED,
                order_id: orderId,
                amount
            }
        })

        return { success: result.success, error: result.success ? null : 'Failed to send notification' }
    } catch (err) {
        console.error('Error notifying escrow release:', err)
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}

/**
 * Notify about new review
 */
export async function notifyNewReview(
    sellerId: string,
    reviewerName: string,
    rating: number,
    listingTitle: string,
    listingId: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const result = await sendNotification({
            userId: sellerId,
            priority: 'medium',
            title: 'New Review Received',
            body: `${reviewerName} left a ${rating}-star review for "${listingTitle}"`,
            actionUrl: `/marketplace/listings/${listingId}`,
            metadata: {
                type: MARKETPLACE_NOTIFICATION_TYPES.REVIEW_RECEIVED,
                listing_id: listingId,
                rating,
                reviewer_name: reviewerName
            }
        })

        return { success: result.success, error: result.success ? null : 'Failed to send notification' }
    } catch (err) {
        console.error('Error notifying new review:', err)
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}
