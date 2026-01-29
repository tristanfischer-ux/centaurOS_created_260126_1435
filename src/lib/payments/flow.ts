// @ts-nocheck
// TODO: Fix type mismatches
/**
 * Payment Flow Service
 * Manages the complete payment lifecycle for marketplace orders
 */

import { createClient } from '@/lib/supabase/server'
import {
  createPaymentIntent,
  holdPayment,
  releaseEscrow,
  calculatePlatformFee,
  getEscrowBalance,
} from '@/lib/stripe/escrow'
import {
  PaymentIntent,
  EscrowTransaction,
  InitiatePaymentParams,
  PaymentStatusResponse,
  Order,
  Milestone,
  DEFAULT_PLATFORM_FEE_PERCENT,
  EscrowTransactionType,
  MilestoneStatus,
  EscrowStatus,
  OrderStatus,
} from '@/types/payments'
import { sendNotification } from '@/lib/notifications'

/**
 * Response type for initiatePayment
 */
export interface InitiatePaymentResponse {
  paymentIntent: PaymentIntent
  order: Order
  error: null
}

export interface InitiatePaymentError {
  paymentIntent: null
  order: null
  error: string
}

/**
 * Initiates a payment flow for an order
 * - Creates a Stripe payment intent
 * - Records the deposit in escrow_transactions
 * - Updates the order escrow_status to 'pending'
 */
export async function initiatePayment(
  params: InitiatePaymentParams
): Promise<InitiatePaymentResponse | InitiatePaymentError> {
  try {
    const { orderId, amount, currency = 'GBP', description } = params

    if (amount <= 0) {
      return { paymentIntent: null, order: null, error: 'Amount must be greater than 0' }
    }

    const supabase = await createClient()

    // Get order and verify it exists
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, buyer:profiles!orders_buyer_id_fkey(id, email, full_name)')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { paymentIntent: null, order: null, error: orderError?.message || 'Order not found' }
    }

    // Check if order already has a payment intent
    if (order.stripe_payment_intent_id) {
      return {
        paymentIntent: null,
        order: null,
        error: 'Order already has a payment intent. Use getPaymentStatus to retrieve it.',
      }
    }

    const buyer = order.buyer as unknown as { id: string; email: string; full_name: string }

    // Create payment intent with Stripe
    const piResult = await createPaymentIntent({
      amount,
      currency,
      orderId,
      buyerId: buyer.id,
      description: description || `Order ${order.order_number}`,
    })

    if (piResult.error || !piResult.paymentIntent) {
      return {
        paymentIntent: null,
        order: null,
        error: piResult.error || 'Failed to create payment intent',
      }
    }

    // Calculate platform fee
    const platformFee = calculatePlatformFee(amount)

    // Update order with payment intent and fee
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        stripe_payment_intent_id: piResult.paymentIntent.id,
        escrow_status: 'pending',
        total_amount: amount,
        platform_fee: platformFee,
        currency: currency.toUpperCase(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Error updating order with payment intent:', updateError)
      // Don't fail - payment intent is created, can be retrieved later
    }

    // Record the deposit transaction
    const { error: txError } = await supabase.from('escrow_transactions').insert({
      order_id: orderId,
      type: 'deposit',
      amount,
    })

    if (txError) {
      console.error('Error recording deposit transaction:', txError)
      // Don't fail - payment can still proceed
    }

    // Build the response
    const paymentIntent: PaymentIntent = {
      id: piResult.paymentIntent.id,
      clientSecret: piResult.paymentIntent.clientSecret,
      status: piResult.paymentIntent.status as PaymentIntent['status'],
      amount,
      currency,
      orderId,
    }

    const updatedOrder: Order = {
      id: order.id,
      orderNumber: order.order_number,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      listingId: order.listing_id,
      orderType: order.order_type,
      status: order.status as OrderStatus,
      totalAmount: amount,
      platformFee,
      currency: currency.toUpperCase(),
      stripePaymentIntentId: piResult.paymentIntent.id,
      escrowStatus: 'pending' as EscrowStatus,
      objectiveId: order.objective_id,
      businessFunctionId: order.business_function_id,
      vatAmount: Number(order.vat_amount),
      vatRate: Number(order.vat_rate),
      taxTreatment: order.tax_treatment,
      createdAt: order.created_at,
      completedAt: order.completed_at,
    }

    return { paymentIntent, order: updatedOrder, error: null }
  } catch (error) {
    console.error('Error initiating payment:', error)
    return {
      paymentIntent: null,
      order: null,
      error: error instanceof Error ? error.message : 'Failed to initiate payment',
    }
  }
}

/**
 * Confirms a payment after Stripe has processed it
 * - Updates escrow_transactions with type 'hold'
 * - Updates order escrow_status to 'held'
 * - Notifies the seller
 */
export async function confirmPayment(
  paymentIntentId: string
): Promise<
  { transaction: EscrowTransaction; error: null } | { transaction: null; error: string }
> {
  try {
    const supabase = await createClient()

    // Find the order by payment intent ID
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        *,
        seller:provider_profiles!orders_seller_id_fkey(
          user_id,
          user:profiles!provider_profiles_user_id_fkey(id, email, full_name)
        )
      `
      )
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (orderError || !order) {
      return { transaction: null, error: orderError?.message || 'Order not found' }
    }

    // Record the hold transaction
    const result = await holdPayment({
      orderId: order.id,
      amount: Number(order.total_amount),
    })

    if (result.error || !result.transaction) {
      return { transaction: null, error: result.error || 'Failed to hold payment' }
    }

    // Update order status to 'accepted' if still pending
    if (order.status === 'pending') {
      await supabase.from('orders').update({ status: 'accepted' }).eq('id', order.id)
    }

    // Notify the seller
    const seller = order.seller as unknown as {
      user_id: string
      user: { id: string; email: string; full_name: string }
    }

    if (seller?.user?.id) {
      try {
        await sendNotification({
          userId: seller.user.id,
          type: 'payment_received',
          title: 'Payment Received',
          message: `Payment of ${formatAmount(Number(order.total_amount), order.currency)} has been received and held in escrow for order ${order.order_number}.`,
          link: `/provider-portal/orders/${order.id}`,
          metadata: {
            orderId: order.id,
            orderNumber: order.order_number,
            amount: order.total_amount,
            currency: order.currency,
          },
        })
      } catch (notifyError) {
        console.error('Error sending seller notification:', notifyError)
        // Don't fail the payment confirmation for notification errors
      }
    }

    return { transaction: result.transaction, error: null }
  } catch (error) {
    console.error('Error confirming payment:', error)
    return {
      transaction: null,
      error: error instanceof Error ? error.message : 'Failed to confirm payment',
    }
  }
}

/**
 * Releases funds to the seller for a milestone or full order
 * - Calculates platform fee
 * - Transfers amount minus fee to seller
 * - Records transactions for 'release' and 'fee_deduction'
 * - Updates order escrow_status
 */
export async function releaseToSeller(
  orderId: string,
  milestoneId?: string
): Promise<
  | {
      transfer: { id: string; amount: number; currency: string }
      sellerAmount: number
      platformFee: number
      error: null
    }
  | { transfer: null; sellerAmount: null; platformFee: null; error: string }
> {
  try {
    const supabase = await createClient()

    // If milestone ID provided, get milestone amount
    let releaseAmount: number

    if (milestoneId) {
      const { data: milestone, error: milestoneError } = await supabase
        .from('order_milestones')
        .select('amount, status')
        .eq('id', milestoneId)
        .single()

      if (milestoneError || !milestone) {
        return {
          transfer: null,
          sellerAmount: null,
          platformFee: null,
          error: milestoneError?.message || 'Milestone not found',
        }
      }

      if (milestone.status !== 'approved') {
        return {
          transfer: null,
          sellerAmount: null,
          platformFee: null,
          error: 'Milestone must be approved before releasing funds',
        }
      }

      releaseAmount = Number(milestone.amount)
    } else {
      // Release full remaining escrow balance
      const balance = await getEscrowBalance(orderId)
      if (balance.error || balance.balance === null) {
        return {
          transfer: null,
          sellerAmount: null,
          platformFee: null,
          error: balance.error || 'Failed to get escrow balance',
        }
      }
      releaseAmount = balance.balance
    }

    if (releaseAmount <= 0) {
      return {
        transfer: null,
        sellerAmount: null,
        platformFee: null,
        error: 'No funds available to release',
      }
    }

    // Release the escrow
    const result = await releaseEscrow({
      orderId,
      amount: releaseAmount,
      milestoneId,
    })

    if (result.error || !result.transfer) {
      return {
        transfer: null,
        sellerAmount: null,
        platformFee: null,
        error: result.error || 'Failed to release escrow',
      }
    }

    // Update milestone status to 'paid' if applicable
    if (milestoneId) {
      await supabase
        .from('order_milestones')
        .update({ status: 'paid' })
        .eq('id', milestoneId)
    }

    const platformFee = calculatePlatformFee(releaseAmount)
    const sellerAmount = releaseAmount - platformFee

    return {
      transfer: result.transfer,
      sellerAmount,
      platformFee,
      error: null,
    }
  } catch (error) {
    console.error('Error releasing to seller:', error)
    return {
      transfer: null,
      sellerAmount: null,
      platformFee: null,
      error: error instanceof Error ? error.message : 'Failed to release to seller',
    }
  }
}

/**
 * Gets the complete payment status for an order
 */
export async function getPaymentStatus(
  orderId: string
): Promise<{ status: PaymentStatusResponse; error: null } | { status: null; error: string }> {
  try {
    const supabase = await createClient()

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { status: null, error: orderError?.message || 'Order not found' }
    }

    // Get escrow transactions
    const { data: transactions, error: txError } = await supabase
      .from('escrow_transactions')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    if (txError) {
      return { status: null, error: txError.message }
    }

    // Get milestones
    const { data: milestones, error: msError } = await supabase
      .from('order_milestones')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    if (msError) {
      return { status: null, error: msError.message }
    }

    // Calculate totals
    const totalHeld = transactions
      .filter((t) => t.type === 'hold')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const totalReleased = transactions
      .filter((t) => t.type === 'release')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const totalRefunded = transactions
      .filter((t) => t.type === 'refund')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const totalFees = transactions
      .filter((t) => t.type === 'fee_deduction')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const pendingRelease = totalHeld - totalReleased - totalRefunded - totalFees

    // Map to response types
    const mappedOrder: Order = {
      id: order.id,
      orderNumber: order.order_number,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      listingId: order.listing_id,
      orderType: order.order_type,
      status: order.status as OrderStatus,
      totalAmount: Number(order.total_amount),
      platformFee: Number(order.platform_fee),
      currency: order.currency,
      stripePaymentIntentId: order.stripe_payment_intent_id,
      escrowStatus: order.escrow_status as EscrowStatus,
      objectiveId: order.objective_id,
      businessFunctionId: order.business_function_id,
      vatAmount: Number(order.vat_amount),
      vatRate: Number(order.vat_rate),
      taxTreatment: order.tax_treatment,
      createdAt: order.created_at,
      completedAt: order.completed_at,
    }

    const mappedTransactions: EscrowTransaction[] = transactions.map((t) => ({
      id: t.id,
      orderId: t.order_id,
      milestoneId: t.milestone_id,
      type: t.type as EscrowTransactionType,
      amount: Number(t.amount),
      stripeTransferId: t.stripe_transfer_id,
      createdAt: t.created_at,
    }))

    const mappedMilestones: Milestone[] = milestones.map((m) => ({
      id: m.id,
      orderId: m.order_id,
      title: m.title,
      description: m.description,
      amount: Number(m.amount),
      dueDate: m.due_date,
      status: m.status as MilestoneStatus,
      submittedAt: m.submitted_at,
      approvedAt: m.approved_at,
      createdAt: m.created_at,
    }))

    return {
      status: {
        order: mappedOrder,
        escrowTransactions: mappedTransactions,
        milestones: mappedMilestones,
        totalHeld,
        totalReleased,
        totalRefunded,
        pendingRelease,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error getting payment status:', error)
    return {
      status: null,
      error: error instanceof Error ? error.message : 'Failed to get payment status',
    }
  }
}

/**
 * Helper to format amount for display
 */
function formatAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  })
  return formatter.format(amount / 100)
}
