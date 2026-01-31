'use server'

/**
 * Payment Server Actions
 * Server-side actions for payment operations in the marketplace
 * SECURITY: All functions include rate limiting, input validation, and authorization checks
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import {
  initiatePayment as initiatePaymentService,
  confirmPayment as confirmPaymentService,
  releaseToSeller as releaseToSellerService,
  getPaymentStatus as getPaymentStatusService,
} from '@/lib/payments/flow'
import { processRefund, releaseAllEscrow, getEscrowBalance } from '@/lib/stripe/escrow'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import {
  PaymentStatusResponse,
  PaymentIntent,
  EscrowTransaction,
} from '@/types/payments'

// Input validation schemas
const refundSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  amount: z.number().positive('Amount must be positive').optional(),
  reason: z.string().max(1000, 'Reason too long').optional()
})

/**
 * Result type for server actions
 */
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

/**
 * Creates a payment intent for an order
 * @param orderId - The order ID
 * @returns Payment intent with client secret
 * SECURITY: Includes rate limiting and input validation
 */
export async function createOrderPayment(orderId: string): Promise<ActionResult<PaymentIntent>> {
  try {
    // SECURITY: Validate orderId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!orderId || !uuidRegex.test(orderId)) {
      return { data: null, error: 'Invalid order ID' }
    }
    
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }
    
    // SECURITY: Rate limiting for payment creation
    const headersList = await headers()
    const clientIP = getClientIP(headersList)
    const rateLimitResult = await rateLimit('api', `payment:${user.id}:${clientIP}`, { limit: 10, window: 60 * 1000 })
    if (!rateLimitResult.success) {
      return { data: null, error: 'Too many payment requests. Please try again later.' }
    }

    // Get order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, total_amount, currency, status, escrow_status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    // Verify user is the buyer
    if (order.buyer_id !== user.id) {
      return { data: null, error: 'Only the buyer can initiate payment for this order' }
    }

    // Check order status
    if (order.status !== 'pending' && order.status !== 'accepted') {
      return { data: null, error: `Cannot pay for order with status '${order.status}'` }
    }

    // Check if already paid
    if (order.escrow_status === 'held') {
      return { data: null, error: 'Payment has already been made for this order' }
    }

    // Initiate the payment
    const result = await initiatePaymentService({
      orderId,
      amount: Number(order.total_amount),
      currency: order.currency || 'GBP',
    })

    if (result.error || !result.paymentIntent) {
      return { data: null, error: result.error || 'Failed to create payment' }
    }

    revalidatePath(`/marketplace/orders/${orderId}`)

    return { data: result.paymentIntent, error: null }
  } catch (error) {
    console.error('Error creating order payment:', error)
    // SECURITY: Sanitize error message before returning to client
    return {
      data: null,
      error: sanitizeErrorMessage(error),
    }
  }
}

/**
 * Gets the current payment/escrow status for an order
 * @param orderId - The order ID
 * @returns Complete payment status including transactions and milestones
 */
export async function getPaymentStatus(
  orderId: string
): Promise<ActionResult<PaymentStatusResponse>> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_id,
        seller_id,
        seller:provider_profiles!orders_seller_id_fkey(user_id)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    const seller = order.seller as unknown as { user_id: string }

    // Verify user is buyer or seller
    if (order.buyer_id !== user.id && seller?.user_id !== user.id) {
      return { data: null, error: 'Access denied' }
    }

    // Get payment status
    const result = await getPaymentStatusService(orderId)

    if (result.error || !result.status) {
      return { data: null, error: result.error || 'Failed to get payment status' }
    }

    return { data: result.status, error: null }
  } catch (error) {
    console.error('Error getting payment status:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get payment status',
    }
  }
}

/**
 * Approves and releases payment for a milestone
 * @param milestoneId - The milestone ID to approve
 * @returns Transfer details
 */
export async function approveAndReleaseMilestone(
  milestoneId: string
): Promise<
  ActionResult<{
    transferId: string
    sellerAmount: number
    platformFee: number
    currency: string
  }>
> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get milestone with order details
    const { data: milestone, error: milestoneError } = await supabase
      .from('order_milestones')
      .select(`
        id,
        status,
        amount,
        order:orders!order_milestones_order_id_fkey(
          id,
          buyer_id,
          currency,
          escrow_status
        )
      `)
      .eq('id', milestoneId)
      .single()

    if (milestoneError || !milestone) {
      return { data: null, error: milestoneError?.message || 'Milestone not found' }
    }

    const order = milestone.order as unknown as {
      id: string
      buyer_id: string
      currency: string
      escrow_status: string
    }

    // Verify user is the buyer
    if (order.buyer_id !== user.id) {
      return { data: null, error: 'Only the buyer can approve milestones' }
    }

    // Check milestone status
    if (milestone.status !== 'submitted') {
      return {
        data: null,
        error: `Cannot approve milestone with status '${milestone.status}'`,
      }
    }

    // Check escrow status
    if (order.escrow_status !== 'held' && order.escrow_status !== 'partial_release') {
      return {
        data: null,
        error: 'No funds available in escrow',
      }
    }

    // Release payment
    const result = await releaseToSellerService(order.id, milestoneId)

    if (result.error || !result.transfer) {
      return { data: null, error: result.error || 'Failed to release payment' }
    }

    revalidatePath(`/marketplace/orders/${order.id}`)
    revalidatePath(`/provider-portal/orders/${order.id}`)

    return {
      data: {
        transferId: result.transfer.id,
        sellerAmount: result.sellerAmount!,
        platformFee: result.platformFee!,
        currency: order.currency,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error approving milestone:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to approve milestone',
    }
  }
}

/**
 * Releases all remaining escrow funds to the seller (for orders without milestones)
 * @param orderId - The order ID
 * @returns Transfer details
 */
export async function releaseFullPayment(
  orderId: string
): Promise<
  ActionResult<{
    transferId: string
    sellerAmount: number
    platformFee: number
    currency: string
  }>
> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, currency, status, escrow_status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    // Verify user is the buyer
    if (order.buyer_id !== user.id) {
      return { data: null, error: 'Only the buyer can release payment' }
    }

    // Check order has funds in escrow
    if (order.escrow_status !== 'held' && order.escrow_status !== 'partial_release') {
      return { data: null, error: 'No funds available in escrow' }
    }

    // Check for existing milestones
    const { data: milestones } = await supabase
      .from('order_milestones')
      .select('id, status')
      .eq('order_id', orderId)

    if (milestones && milestones.length > 0) {
      const pendingMilestones = milestones.filter(
        (m) => m.status === 'pending' || m.status === 'submitted'
      )
      if (pendingMilestones.length > 0) {
        return {
          data: null,
          error: 'This order has milestones. Please approve milestones individually.',
        }
      }
    }

    // Release all remaining escrow
    const result = await releaseAllEscrow(orderId)

    if (result.error || !result.transfer) {
      return { data: null, error: result.error || 'Failed to release payment' }
    }

    // Update order status to completed
    await supabase
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    revalidatePath(`/marketplace/orders/${orderId}`)
    revalidatePath(`/provider-portal/orders/${orderId}`)

    const balance = await getEscrowBalance(orderId)
    const platformFee = balance.totalFees || 0

    return {
      data: {
        transferId: result.transfer.id,
        sellerAmount: result.transfer.amount,
        platformFee,
        currency: order.currency,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error releasing full payment:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to release payment',
    }
  }
}

/**
 * Requests a refund for an order
 * @param orderId - The order ID
 * @param amount - Optional partial refund amount (full refund if not specified)
 * @param reason - Optional reason for the refund
 * @returns Refund details
 * SECURITY: Includes rate limiting, input validation, and authorization
 */
export async function requestRefund(
  orderId: string,
  amount?: number,
  reason?: string
): Promise<
  ActionResult<{
    refundId: string
    amount: number
    status: string
  }>
> {
  try {
    // SECURITY: Validate input
    const validation = refundSchema.safeParse({ orderId, amount, reason })
    if (!validation.success) {
      return { data: null, error: validation.error.issues[0].message }
    }
    
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }
    
    // SECURITY: Rate limiting for refund requests
    const headersList = await headers()
    const clientIP = getClientIP(headersList)
    const rateLimitResult = await rateLimit('api', `refund:${user.id}:${clientIP}`, { limit: 5, window: 60 * 1000 })
    if (!rateLimitResult.success) {
      return { data: null, error: 'Too many refund requests. Please try again later.' }
    }

    // Get order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, status, escrow_status, total_amount')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    // Verify user is the buyer or seller
    if (order.buyer_id !== user.id && order.seller_id !== user.id) {
      return { data: null, error: 'Only the buyer or seller can request a refund' }
    }

    // Check if refund is possible
    if (order.escrow_status === 'released') {
      return {
        data: null,
        error: 'Cannot refund - funds have already been released to the seller',
      }
    }

    if (order.escrow_status === 'refunded') {
      return { data: null, error: 'This order has already been refunded' }
    }

    // Process the refund
    const result = await processRefund({
      orderId,
      amount,
      reason,
    })

    if (result.error || !result.refund) {
      return { data: null, error: result.error || 'Failed to process refund' }
    }

    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'cancelled',
      })
      .eq('id', orderId)

    revalidatePath(`/marketplace/orders/${orderId}`)
    revalidatePath(`/provider-portal/orders/${orderId}`)

    return {
      data: {
        refundId: result.refund.id,
        amount: result.refund.amount,
        status: result.refund.status,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error requesting refund:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to request refund',
    }
  }
}

/**
 * Gets the escrow balance breakdown for an order
 * @param orderId - The order ID
 * @returns Escrow balance details
 */
export async function getOrderEscrowBalance(orderId: string): Promise<
  ActionResult<{
    totalHeld: number
    totalReleased: number
    totalRefunded: number
    totalFees: number
    balance: number
  }>
> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_id,
        seller:provider_profiles!orders_seller_id_fkey(user_id)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    const seller = order.seller as unknown as { user_id: string }

    // Verify user is buyer or seller
    if (order.buyer_id !== user.id && seller?.user_id !== user.id) {
      return { data: null, error: 'Access denied' }
    }

    // Get escrow balance
    const result = await getEscrowBalance(orderId)

    if (result.error || result.balance === null) {
      return { data: null, error: result.error || 'Failed to get escrow balance' }
    }

    return {
      data: {
        totalHeld: result.totalHeld!,
        totalReleased: result.totalReleased!,
        totalRefunded: result.totalRefunded!,
        totalFees: result.totalFees!,
        balance: result.balance,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error getting escrow balance:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get escrow balance',
    }
  }
}

/**
 * Confirms a payment after it succeeds on Stripe
 * This is primarily called from webhooks but can be called manually if needed
 * @param paymentIntentId - The Stripe payment intent ID
 */
export async function confirmOrderPayment(
  paymentIntentId: string
): Promise<ActionResult<EscrowTransaction>> {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Unauthorized' }
    }

    // Verify the user is associated with the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (orderError || !order) {
      return { data: null, error: 'Order not found' }
    }

    // Check if user is the buyer or seller
    const isBuyer = order.buyer_id === user.id
    const { data: sellerProfile } = await supabase
      .from('provider_profiles')
      .select('user_id')
      .eq('id', order.seller_id)
      .single()

    const isSeller = sellerProfile?.user_id === user.id

    if (!isBuyer && !isSeller) {
      return { data: null, error: 'Unauthorized: You are not associated with this order' }
    }

    const result = await confirmPaymentService(paymentIntentId)

    if (result.error || !result.transaction) {
      return { data: null, error: result.error || 'Failed to confirm payment' }
    }

    return { data: result.transaction, error: null }
  } catch (error) {
    console.error('Error confirming payment:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to confirm payment',
    }
  }
}
