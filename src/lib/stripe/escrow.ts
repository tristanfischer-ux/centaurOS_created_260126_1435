import { stripe, isValidCurrency, SupportedCurrency } from './client'
import { createClient } from '@/lib/supabase/server'
import {
  EscrowTransaction,
  EscrowTransactionType,
  DEFAULT_PLATFORM_FEE_PERCENT,
} from '@/types/payments'

export interface CreatePaymentIntentParams {
  /** Amount in smallest currency unit (e.g., pence for GBP) */
  amount: number
  /** Currency code (gbp, eur, usd) */
  currency: string
  /** Order ID for reference */
  orderId: string
  /** Buyer's user ID */
  buyerId: string
  /** Optional description */
  description?: string
}

export interface TransferToSellerParams {
  /** Amount in smallest currency unit (e.g., pence for GBP) */
  amount: number
  /** Currency code (gbp, eur, usd) */
  currency: string
  /** Seller's Stripe Connect account ID */
  sellerAccountId: string
  /** Order ID for reference */
  orderId: string
  /** Optional milestone ID */
  milestoneId?: string
}

export interface HoldPaymentParams {
  /** Order ID */
  orderId: string
  /** Amount to hold in smallest currency unit */
  amount: number
}

export interface ReleaseEscrowParams {
  /** Order ID */
  orderId: string
  /** Amount to release in smallest currency unit */
  amount: number
  /** Optional milestone ID */
  milestoneId?: string
}

export interface ProcessRefundParams {
  /** Order ID */
  orderId: string
  /** Amount to refund (optional - full refund if not provided) */
  amount?: number
  /** Reason for refund */
  reason?: string
}

/**
 * Creates a payment intent to collect payment from a buyer
 * The funds are held by the platform until released to the seller
 * @param params - Payment intent parameters
 * @returns The created payment intent
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<
  | { paymentIntent: { id: string; clientSecret: string; status: string }; error: null }
  | { paymentIntent: null; error: string }
> {
  try {
    const { amount, currency, orderId, buyerId, description } = params

    // Validate currency
    if (!isValidCurrency(currency)) {
      return {
        paymentIntent: null,
        error: `Invalid currency: ${currency}. Supported currencies: gbp, eur, usd`,
      }
    }

    // Validate amount
    if (amount <= 0) {
      return {
        paymentIntent: null,
        error: 'Amount must be greater than 0',
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase() as SupportedCurrency,
      description: description || `Order ${orderId}`,
      metadata: {
        order_id: orderId,
        buyer_id: buyerId,
      },
      // Automatically capture payment
      capture_method: 'automatic',
    })

    return {
      paymentIntent: {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret ?? '',
        status: paymentIntent.status,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error creating payment intent:', error)
    return {
      paymentIntent: null,
      error: error instanceof Error ? error.message : 'Failed to create payment intent',
    }
  }
}

/**
 * Transfers funds to a seller's Connect account
 * Use this to release escrowed funds after milestone completion
 * @param params - Transfer parameters
 * @returns The created transfer
 */
export async function transferToSeller(
  params: TransferToSellerParams
): Promise<
  | { transfer: { id: string; amount: number; currency: string }; error: null }
  | { transfer: null; error: string }
> {
  try {
    const { amount, currency, sellerAccountId, orderId, milestoneId } = params

    // Validate currency
    if (!isValidCurrency(currency)) {
      return {
        transfer: null,
        error: `Invalid currency: ${currency}. Supported currencies: gbp, eur, usd`,
      }
    }

    // Validate amount
    if (amount <= 0) {
      return {
        transfer: null,
        error: 'Amount must be greater than 0',
      }
    }

    const transfer = await stripe.transfers.create({
      amount,
      currency: currency.toLowerCase() as SupportedCurrency,
      destination: sellerAccountId,
      metadata: {
        order_id: orderId,
        ...(milestoneId && { milestone_id: milestoneId }),
      },
    })

    return {
      transfer: {
        id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error transferring to seller:', error)
    return {
      transfer: null,
      error: error instanceof Error ? error.message : 'Failed to transfer funds',
    }
  }
}

/**
 * Refunds a payment intent (full or partial)
 * @param paymentIntentId - The payment intent ID to refund
 * @param amount - Optional amount to refund (in smallest currency unit). If not provided, refunds full amount
 * @returns The created refund
 */
export async function refundPayment(
  paymentIntentId: string,
  amount?: number
): Promise<
  | { refund: { id: string; amount: number; status: string }; error: null }
  | { refund: null; error: string }
> {
  try {
    // Validate amount if provided
    if (amount !== undefined && amount <= 0) {
      return {
        refund: null,
        error: 'Refund amount must be greater than 0',
      }
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount && { amount }),
    })

    return {
      refund: {
        id: refund.id,
        amount: refund.amount ?? 0,
        status: refund.status ?? 'unknown',
      },
      error: null,
    }
  } catch (error) {
    console.error('Error refunding payment:', error)
    return {
      refund: null,
      error: error instanceof Error ? error.message : 'Failed to refund payment',
    }
  }
}

/**
 * Gets the status of a payment intent
 * @param paymentIntentId - The payment intent ID
 * @returns Payment intent status and details
 */
export async function getPaymentIntentStatus(
  paymentIntentId: string
): Promise<
  | {
      paymentIntent: {
        id: string
        status: string
        amount: number
        currency: string
        metadata: Record<string, string>
      }
      error: null
    }
  | { paymentIntent: null; error: string }
> {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    return {
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata as Record<string, string>,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error getting payment intent status:', error)
    return {
      paymentIntent: null,
      error: error instanceof Error ? error.message : 'Failed to get payment status',
    }
  }
}

/**
 * Records an escrow transaction in the database
 * @param params - Transaction parameters
 * @returns The created transaction
 */
async function recordEscrowTransaction(params: {
  orderId: string
  milestoneId?: string
  type: EscrowTransactionType
  amount: number
  stripeTransferId?: string
}): Promise<{ transaction: EscrowTransaction; error: null } | { transaction: null; error: string }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('escrow_transactions')
      .insert({
        order_id: params.orderId,
        milestone_id: params.milestoneId || null,
        type: params.type,
        amount: params.amount,
        stripe_transfer_id: params.stripeTransferId || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error recording escrow transaction:', error)
      return { transaction: null, error: error.message }
    }

    return {
      transaction: {
        id: data.id,
        orderId: data.order_id,
        milestoneId: data.milestone_id,
        type: data.type as EscrowTransactionType,
        amount: data.amount,
        stripeTransferId: data.stripe_transfer_id,
        createdAt: data.created_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error recording escrow transaction:', error)
    return {
      transaction: null,
      error: error instanceof Error ? error.message : 'Failed to record transaction',
    }
  }
}

/**
 * Holds payment in escrow (records the hold but doesn't transfer yet)
 * Call this after payment is confirmed by Stripe
 * @param params - Hold parameters
 * @returns The escrow transaction record
 */
export async function holdPayment(
  params: HoldPaymentParams
): Promise<{ transaction: EscrowTransaction; error: null } | { transaction: null; error: string }> {
  try {
    const { orderId, amount } = params

    if (amount <= 0) {
      return { transaction: null, error: 'Amount must be greater than 0' }
    }

    // Record the hold transaction
    const result = await recordEscrowTransaction({
      orderId,
      type: 'hold',
      amount,
    })

    if (result.error || !result.transaction) {
      return { transaction: null, error: result.error || 'Failed to record hold' }
    }

    // Update order escrow status
    const supabase = await createClient()
    await supabase.from('orders').update({ escrow_status: 'held' }).eq('id', orderId)

    return { transaction: result.transaction, error: null }
  } catch (error) {
    console.error('Error holding payment:', error)
    return {
      transaction: null,
      error: error instanceof Error ? error.message : 'Failed to hold payment',
    }
  }
}

/**
 * Calculates the platform fee for a given amount
 * @param amount - Amount in smallest currency unit
 * @param feePercent - Fee percentage (default 8%)
 * @returns The calculated fee
 */
export function calculatePlatformFee(
  amount: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT
): number {
  return Math.round(amount * (feePercent / 100))
}

/**
 * Releases escrowed funds to the seller
 * @param params - Release parameters
 * @returns The transfer and transaction records
 */
export async function releaseEscrow(
  params: ReleaseEscrowParams
): Promise<
  | {
      transfer: { id: string; amount: number; currency: string }
      transaction: EscrowTransaction
      feeTransaction: EscrowTransaction
      error: null
    }
  | { transfer: null; transaction: null; feeTransaction: null; error: string }
> {
  try {
    const { orderId, amount, milestoneId } = params

    if (amount <= 0) {
      return {
        transfer: null,
        transaction: null,
        feeTransaction: null,
        error: 'Amount must be greater than 0',
      }
    }

    const supabase = await createClient()

    // Get order details including seller's Stripe account
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        id,
        currency,
        total_amount,
        seller_id,
        seller:provider_profiles!orders_seller_id_fkey(
          stripe_account_id,
          user_id
        )
      `
      )
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return {
        transfer: null,
        transaction: null,
        feeTransaction: null,
        error: orderError?.message || 'Order not found',
      }
    }

    const sellerProfile = order.seller as unknown as {
      stripe_account_id: string | null
      user_id: string
    }

    if (!sellerProfile?.stripe_account_id) {
      return {
        transfer: null,
        transaction: null,
        feeTransaction: null,
        error: 'Seller has not completed Stripe onboarding',
      }
    }

    // Calculate platform fee
    const platformFee = calculatePlatformFee(amount)
    const sellerAmount = amount - platformFee

    // Create the transfer to seller
    const transferResult = await transferToSeller({
      amount: sellerAmount,
      currency: order.currency,
      sellerAccountId: sellerProfile.stripe_account_id,
      orderId,
      milestoneId,
    })

    if (transferResult.error || !transferResult.transfer) {
      return {
        transfer: null,
        transaction: null,
        feeTransaction: null,
        error: transferResult.error || 'Failed to create transfer',
      }
    }

    // Record the release transaction
    const releaseResult = await recordEscrowTransaction({
      orderId,
      milestoneId,
      type: 'release',
      amount: sellerAmount,
      stripeTransferId: transferResult.transfer.id,
    })

    if (releaseResult.error || !releaseResult.transaction) {
      return {
        transfer: null,
        transaction: null,
        feeTransaction: null,
        error: releaseResult.error || 'Failed to record release transaction',
      }
    }

    // Record the fee deduction transaction
    const feeResult = await recordEscrowTransaction({
      orderId,
      milestoneId,
      type: 'fee_deduction',
      amount: platformFee,
    })

    if (feeResult.error || !feeResult.transaction) {
      // Log but don't fail - the transfer was successful
      console.error('Failed to record fee transaction:', feeResult.error)
    }

    // Check if all funds have been released and update order status
    const { data: transactions } = await supabase
      .from('escrow_transactions')
      .select('type, amount')
      .eq('order_id', orderId)

    if (transactions) {
      const totalHeld = transactions
        .filter((t) => t.type === 'hold')
        .reduce((sum, t) => sum + Number(t.amount), 0)
      const totalReleased = transactions
        .filter((t) => t.type === 'release' || t.type === 'fee_deduction')
        .reduce((sum, t) => sum + Number(t.amount), 0)

      if (totalReleased >= totalHeld) {
        await supabase.from('orders').update({ escrow_status: 'released' }).eq('id', orderId)
      } else {
        await supabase.from('orders').update({ escrow_status: 'partial_release' }).eq('id', orderId)
      }
    }

    return {
      transfer: transferResult.transfer,
      transaction: releaseResult.transaction,
      feeTransaction: feeResult.transaction!,
      error: null,
    }
  } catch (error) {
    console.error('Error releasing escrow:', error)
    return {
      transfer: null,
      transaction: null,
      feeTransaction: null,
      error: error instanceof Error ? error.message : 'Failed to release escrow',
    }
  }
}

/**
 * Releases all remaining escrowed funds to the seller
 * @param orderId - The order ID
 * @returns The transfer and transaction records
 */
export async function releaseAllEscrow(orderId: string): Promise<
  | {
      transfer: { id: string; amount: number; currency: string }
      transaction: EscrowTransaction
      feeTransaction: EscrowTransaction
      error: null
    }
  | { transfer: null; transaction: null; feeTransaction: null; error: string }
> {
  try {
    const supabase = await createClient()

    // Get all escrow transactions for this order
    const { data: transactions, error: txError } = await supabase
      .from('escrow_transactions')
      .select('type, amount')
      .eq('order_id', orderId)

    if (txError) {
      return {
        transfer: null,
        transaction: null,
        feeTransaction: null,
        error: txError.message,
      }
    }

    // Calculate remaining amount
    const totalHeld = transactions
      .filter((t) => t.type === 'hold')
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const totalReleased = transactions
      .filter((t) => t.type === 'release' || t.type === 'fee_deduction')
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const remainingAmount = totalHeld - totalReleased

    if (remainingAmount <= 0) {
      return {
        transfer: null,
        transaction: null,
        feeTransaction: null,
        error: 'No funds remaining in escrow',
      }
    }

    // Release remaining funds
    return releaseEscrow({ orderId, amount: remainingAmount })
  } catch (error) {
    console.error('Error releasing all escrow:', error)
    return {
      transfer: null,
      transaction: null,
      feeTransaction: null,
      error: error instanceof Error ? error.message : 'Failed to release all escrow',
    }
  }
}

/**
 * Processes a refund for an order (full or partial)
 * @param params - Refund parameters
 * @returns The refund and transaction records
 */
export async function processRefund(
  params: ProcessRefundParams
): Promise<
  | {
      refund: { id: string; amount: number; status: string }
      transaction: EscrowTransaction
      error: null
    }
  | { refund: null; transaction: null; error: string }
> {
  try {
    const { orderId, amount, reason } = params

    const supabase = await createClient()

    // Get order details including payment intent
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, stripe_payment_intent_id, total_amount, escrow_status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return {
        refund: null,
        transaction: null,
        error: orderError?.message || 'Order not found',
      }
    }

    if (!order.stripe_payment_intent_id) {
      return {
        refund: null,
        transaction: null,
        error: 'No payment intent found for this order',
      }
    }

    // Calculate refund amount (full if not specified)
    const refundAmount = amount || Number(order.total_amount)

    if (refundAmount <= 0) {
      return {
        refund: null,
        transaction: null,
        error: 'Refund amount must be greater than 0',
      }
    }

    // Process refund through Stripe
    const refundResult = await refundPayment(order.stripe_payment_intent_id, refundAmount)

    if (refundResult.error || !refundResult.refund) {
      return {
        refund: null,
        transaction: null,
        error: refundResult.error || 'Failed to process refund',
      }
    }

    // Record the refund transaction
    const txResult = await recordEscrowTransaction({
      orderId,
      type: 'refund',
      amount: refundAmount,
    })

    if (txResult.error || !txResult.transaction) {
      console.error('Failed to record refund transaction:', txResult.error)
    }

    // Update order escrow status
    await supabase.from('orders').update({ escrow_status: 'refunded' }).eq('id', orderId)

    // Log the reason if provided
    if (reason) {
      console.log(`Refund processed for order ${orderId}: ${reason}`)
    }

    return {
      refund: refundResult.refund,
      transaction: txResult.transaction!,
      error: null,
    }
  } catch (error) {
    console.error('Error processing refund:', error)
    return {
      refund: null,
      transaction: null,
      error: error instanceof Error ? error.message : 'Failed to process refund',
    }
  }
}

/**
 * Gets the escrow balance for an order
 * @param orderId - The order ID
 * @returns The escrow balance details
 */
export async function getEscrowBalance(orderId: string): Promise<
  | {
      totalHeld: number
      totalReleased: number
      totalRefunded: number
      totalFees: number
      balance: number
      error: null
    }
  | {
      totalHeld: null
      totalReleased: null
      totalRefunded: null
      totalFees: null
      balance: null
      error: string
    }
> {
  try {
    const supabase = await createClient()

    const { data: transactions, error } = await supabase
      .from('escrow_transactions')
      .select('type, amount')
      .eq('order_id', orderId)

    if (error) {
      return {
        totalHeld: null,
        totalReleased: null,
        totalRefunded: null,
        totalFees: null,
        balance: null,
        error: error.message,
      }
    }

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

    const balance = totalHeld - totalReleased - totalRefunded - totalFees

    return {
      totalHeld,
      totalReleased,
      totalRefunded,
      totalFees,
      balance,
      error: null,
    }
  } catch (error) {
    console.error('Error getting escrow balance:', error)
    return {
      totalHeld: null,
      totalReleased: null,
      totalRefunded: null,
      totalFees: null,
      balance: null,
      error: error instanceof Error ? error.message : 'Failed to get escrow balance',
    }
  }
}
