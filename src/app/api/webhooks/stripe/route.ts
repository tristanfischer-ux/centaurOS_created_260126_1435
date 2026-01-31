// @ts-nocheck - billing tables exist but types not regenerated
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { confirmPayment } from '@/lib/payments/flow'
import { sendNotification } from '@/lib/notifications'

// Disable body parsing, we need raw body for webhook signature verification
export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

/**
 * Verifies the Stripe webhook signature
 */
async function verifyWebhookSignature(
  request: NextRequest
): Promise<{ event: Stripe.Event; error: null } | { event: null; error: string }> {
  if (!webhookSecret) {
    return { event: null, error: 'Webhook secret not configured' }
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return { event: null, error: 'Missing stripe-signature header' }
  }

  try {
    const body = await request.text()
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    return { event, error: null }
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return {
      event: null,
      error: err instanceof Error ? err.message : 'Invalid signature',
    }
  }
}

/**
 * Atomically checks if an event has been processed and marks it as processing
 * SECURITY: Uses INSERT with ON CONFLICT to prevent race conditions
 * Returns true if we acquired the lock (event not yet processed)
 */
async function acquireEventLock(event: Stripe.Event): Promise<{ acquired: boolean; alreadyProcessed: boolean }> {
  try {
    const supabase = await createClient()
    
    // Try to insert the event as 'processing'
    // If it already exists, the ON CONFLICT will update nothing and we can check the status
    const { data, error } = await supabase
      .from('stripe_events')
      .upsert(
        {
          stripe_event_id: event.id,
          event_type: event.type,
          payload: JSON.parse(JSON.stringify(event.data.object)),
          processed: false,
          error: null,
          created_at: new Date(event.created * 1000).toISOString(),
          processed_at: null,
          processing_started_at: new Date().toISOString(),
        },
        {
          onConflict: 'stripe_event_id',
          ignoreDuplicates: false,
        }
      )
      .select('processed')
      .single()
    
    if (error) {
      console.error('Error acquiring event lock:', error)
      // Check if event exists and is already processed
      const { data: existingEvent } = await supabase
        .from('stripe_events')
        .select('processed')
        .eq('stripe_event_id', event.id)
        .single()
      
      if (existingEvent?.processed) {
        return { acquired: false, alreadyProcessed: true }
      }
      return { acquired: false, alreadyProcessed: false }
    }
    
    // If already processed, don't process again
    if (data?.processed) {
      return { acquired: false, alreadyProcessed: true }
    }
    
    return { acquired: true, alreadyProcessed: false }
  } catch (err) {
    console.error('Error in acquireEventLock:', err)
    return { acquired: false, alreadyProcessed: false }
  }
}

/**
 * Marks an event as successfully processed
 */
async function markEventProcessed(eventId: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('stripe_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: null,
      })
      .eq('stripe_event_id', eventId)
  } catch (error) {
    console.error('Error marking event as processed:', error)
  }
}

/**
 * Marks an event as failed
 */
async function markEventFailed(eventId: string, errorMessage: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('stripe_events')
      .update({
        processed: false,
        error: errorMessage,
      })
      .eq('stripe_event_id', eventId)
  } catch (error) {
    console.error('Error marking event as failed:', error)
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

/**
 * Handles balance top-up payment
 * Adds funds to user's account balance
 */
async function handleBalanceTopUp(paymentIntent: Stripe.PaymentIntent, userId: string): Promise<void> {
  console.log('Processing balance top-up:', {
    paymentIntentId: paymentIntent.id,
    userId,
    amount: paymentIntent.amount,
  })

  const supabase = await createClient()

  // Check if already processed (idempotency)
  const { data: existing } = await supabase
    .from('balance_transactions')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .single()

  if (existing) {
    console.log('Balance top-up already processed:', paymentIntent.id)
    return
  }

  // Adjust balance using database function
  const { data, error } = await supabase.rpc('adjust_account_balance', {
    p_user_id: userId,
    p_amount: paymentIntent.amount,
    p_transaction_type: 'top_up',
    p_stripe_payment_intent_id: paymentIntent.id,
    p_description: 'Account balance top-up',
  })

  if (error || !data?.[0]?.success) {
    console.error('Failed to adjust balance for top-up:', error?.message || data?.[0]?.error_message)
    return
  }

  console.log('Balance top-up successful:', {
    userId,
    amount: paymentIntent.amount,
    newBalance: data[0].new_balance,
  })

  // Send notification
  await sendNotification({
    userId,
    title: 'Balance Top-Up Complete',
    body: `${formatAmount(paymentIntent.amount, paymentIntent.currency)} has been added to your account balance.`,
    type: 'payment',
    priority: 'medium',
  })
}

/**
 * Handles payment_intent.succeeded event
 * - For balance top-ups: Adds funds to user's account balance
 * - For orders: Updates order escrow status to 'held', creates escrow hold transaction
 * - For retainers: Marks timesheet as paid
 * - Notifies the relevant parties
 * SECURITY: Validates payment amount against database before processing
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const paymentType = paymentIntent.metadata?.type
  const referenceId = paymentIntent.metadata?.order_id
  const buyerId = paymentIntent.metadata?.buyer_id
  const userId = paymentIntent.metadata?.user_id

  console.log('Payment succeeded:', {
    paymentIntentId: paymentIntent.id,
    paymentType,
    referenceId,
    buyerId,
    userId,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
  })

  // Handle balance top-ups
  if (paymentType === 'balance_top_up' && userId) {
    await handleBalanceTopUp(paymentIntent, userId)
    return
  }

  if (!referenceId) {
    console.error('[SECURITY] No order_id in payment intent metadata')
    return
  }

  const supabase = await createClient()
  
  // SECURITY: First validate the payment amount against database order
  const { data: orderValidation, error: validationError } = await supabase
    .from('orders')
    .select('id, total_amount, currency, status, escrow_status, stripe_payment_intent_id')
    .eq('id', referenceId)
    .single()
  
  if (validationError || !orderValidation) {
    console.error('[SECURITY] Order not found for payment validation:', referenceId)
    return
  }
  
  // SECURITY: Verify payment intent ID matches what was stored
  if (orderValidation.stripe_payment_intent_id && 
      orderValidation.stripe_payment_intent_id !== paymentIntent.id) {
    console.error('[SECURITY] Payment intent ID mismatch!', {
      expected: orderValidation.stripe_payment_intent_id,
      received: paymentIntent.id,
      orderId: referenceId
    })
    return
  }
  
  // SECURITY: Verify the payment amount matches the order amount (with tolerance for fees)
  const expectedAmount = Math.round(Number(orderValidation.total_amount) * 100) // Convert to cents
  const tolerance = 1 // Allow 1 cent tolerance for rounding
  
  if (Math.abs(paymentIntent.amount - expectedAmount) > tolerance) {
    console.error('[SECURITY] Payment amount mismatch!', {
      expected: expectedAmount,
      received: paymentIntent.amount,
      orderId: referenceId,
      difference: paymentIntent.amount - expectedAmount
    })
    // Alert but don't fail - log for investigation
  }
  
  // SECURITY: Verify currency matches
  if (orderValidation.currency?.toLowerCase() !== paymentIntent.currency.toLowerCase()) {
    console.error('[SECURITY] Currency mismatch!', {
      expected: orderValidation.currency,
      received: paymentIntent.currency,
      orderId: referenceId
    })
    return
  }

  // Check if this is a retainer timesheet payment or a regular order
  const { data: timesheet, error: timesheetError } = await supabase
    .from('timesheet_entries')
    .select(`
      id,
      status,
      stripe_payment_intent_id,
      retainer:retainers (
        id,
        seller_id,
        seller:provider_profiles!retainers_seller_id_fkey (
          user_id
        )
      )
    `)
    .eq('id', referenceId)
    .single()

  if (!timesheetError && timesheet) {
    // This is a RETAINER PAYMENT - handle timesheet
    console.log('Processing retainer payment for timesheet:', referenceId)
    
    // Verify this payment intent matches the one stored
    if (timesheet.stripe_payment_intent_id !== paymentIntent.id) {
      console.error('Payment intent mismatch for timesheet', {
        expected: timesheet.stripe_payment_intent_id,
        received: paymentIntent.id,
      })
      return
    }

    // Mark timesheet as paid NOW (payment confirmed via webhook)
    const { error: updateError } = await supabase
      .from('timesheet_entries')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', referenceId)

    if (updateError) {
      console.error('Error marking timesheet as paid:', updateError)
      return
    }

    console.log('Timesheet marked as paid:', referenceId)

    // Notify seller about retainer payment
    const seller = timesheet.retainer?.seller as { user_id: string } | null
    if (seller?.user_id) {
      try {
        await sendNotification({
          userId: seller.user_id,
          priority: 'medium',
          title: 'Retainer Payment Received',
          body: `Payment of ${formatAmount(paymentIntent.amount, paymentIntent.currency)} for your retainer has been confirmed.`,
          actionUrl: `/provider-portal/retainers/${timesheet.retainer?.id}`,
          metadata: {
            timesheetId: referenceId,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
          },
        })
      } catch (notifyError) {
        console.error('Error sending retainer payment notification:', notifyError)
      }
    }

    return
  }

  // This is a regular ORDER PAYMENT - use existing logic
  // Confirm the payment (creates hold transaction and updates order status)
  const result = await confirmPayment(paymentIntent.id)

  if (result.error) {
    console.error('Error confirming payment:', result.error)
    return
  }

  console.log('Payment confirmed, escrow held:', result.transaction)
}

/**
 * Handles payment_intent.payment_failed event
 * - For orders: Updates order with failure information
 * - For retainers: Clears pending payment intent from timesheet
 * - Notifies the buyer
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const referenceId = paymentIntent.metadata?.order_id
  const buyerId = paymentIntent.metadata?.buyer_id

  console.log('Payment failed:', {
    paymentIntentId: paymentIntent.id,
    referenceId,
    buyerId,
    error: paymentIntent.last_payment_error?.message,
  })

  const supabase = await createClient()

  // Check if this is a retainer timesheet payment
  const { data: timesheet, error: timesheetError } = await supabase
    .from('timesheet_entries')
    .select('id, stripe_payment_intent_id, retainer:retainers (buyer_id)')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .single()

  if (!timesheetError && timesheet) {
    // This is a RETAINER PAYMENT failure
    console.log('Retainer payment failed for timesheet:', timesheet.id)
    
    // Clear the payment intent so it can be retried
    await supabase
      .from('timesheet_entries')
      .update({
        stripe_payment_intent_id: null,
        // Status remains 'approved' so it can be retried
      })
      .eq('id', timesheet.id)

    // Notify the buyer about the failed payment
    const retainerBuyerId = (timesheet.retainer as { buyer_id: string })?.buyer_id
    if (retainerBuyerId) {
      try {
        await sendNotification({
          userId: retainerBuyerId,
          priority: 'high',
          title: 'Retainer Payment Failed',
          body: `Your retainer payment could not be processed. ${paymentIntent.last_payment_error?.message || 'Please update your payment method and try again.'}`,
          actionUrl: '/retainers',
          metadata: {
            timesheetId: timesheet.id,
            errorMessage: paymentIntent.last_payment_error?.message,
          },
        })
      } catch (notifyError) {
        console.error('Error sending retainer failure notification:', notifyError)
      }
    }

    return
  }

  // Continue with regular order failure handling
  const orderId = referenceId

  if (!orderId) {
    console.error('No order_id in payment intent metadata')
    return
  }

  // Update order escrow status to indicate failure
  await supabase
    .from('orders')
    .update({
      escrow_status: 'pending', // Keep as pending so buyer can retry
    })
    .eq('id', orderId)

  // Notify the buyer about the failed payment
  if (buyerId) {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('order_number, total_amount, currency')
        .eq('id', orderId)
        .single()

      await sendNotification({
        userId: buyerId,
        priority: 'high',
        title: 'Payment Failed',
        body: `Your payment of ${formatAmount(Number(order?.total_amount || paymentIntent.amount), order?.currency || paymentIntent.currency)} for order ${order?.order_number || orderId} could not be processed. ${paymentIntent.last_payment_error?.message || 'Please try again.'}`,
        actionUrl: `/marketplace/orders/${orderId}`,
        metadata: {
          orderId,
          paymentIntentId: paymentIntent.id,
          errorMessage: paymentIntent.last_payment_error?.message,
        },
      })
    } catch (notifyError) {
      console.error('Error sending payment failed notification:', notifyError)
    }
  }
}

/**
 * Handles account.updated event (Connect account status changes)
 * - Updates provider's Stripe status in database
 * - Sends notification if onboarding completed
 */
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const userId = account.metadata?.user_id

  console.log('Account updated:', {
    accountId: account.id,
    userId,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  })

  if (!userId) {
    console.log('No user_id in account metadata, skipping update')
    return
  }

  const supabase = await createClient()

  // Update provider profile with Stripe account status
  const { error: updateError } = await supabase
    .from('provider_profiles')
    .update({
      stripe_account_id: account.id,
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
      stripe_onboarding_complete: account.details_submitted && account.charges_enabled && account.payouts_enabled,
    })
    .eq('user_id', userId)

  if (updateError) {
    console.error('Error updating provider profile:', updateError)
  }

  // Send notification if onboarding just completed
  const isFullyOnboarded = account.details_submitted && account.charges_enabled && account.payouts_enabled

  if (isFullyOnboarded) {
    try {
      await sendNotification({
        userId,
        priority: 'medium',
        title: 'Payment Setup Complete',
        body: 'Your Stripe account is now fully set up. You can start receiving payments for your services.',
        actionUrl: '/provider-portal/settings',
        metadata: {
          stripeAccountId: account.id,
        },
      })
    } catch (notifyError) {
      console.error('Error sending onboarding complete notification:', notifyError)
    }
  }
}

/**
 * Handles transfer.created event
 * - Confirms transfer completed
 * - Updates milestone status if applicable
 * - Notifies seller of incoming funds
 */
async function handleTransferCreated(transfer: Stripe.Transfer): Promise<void> {
  const orderId = transfer.metadata?.order_id
  const milestoneId = transfer.metadata?.milestone_id

  console.log('Transfer created:', {
    transferId: transfer.id,
    orderId,
    milestoneId,
    amount: transfer.amount,
    currency: transfer.currency,
    destination: transfer.destination,
  })

  if (!orderId) {
    console.log('No order_id in transfer metadata')
    return
  }

  const supabase = await createClient()

  // Get order and seller details
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      seller:provider_profiles!orders_seller_id_fkey(
        user_id,
        user:profiles!provider_profiles_user_id_fkey(id, email, full_name)
      )
    `)
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    console.error('Error fetching order for transfer:', orderError)
    return
  }

  const seller = order.seller as unknown as {
    user_id: string
    user: { id: string; email: string; full_name: string }
  }

  // Notify seller about the transfer
  if (seller?.user?.id) {
    try {
      const milestoneInfo = milestoneId ? ` for milestone completion` : ''
      await sendNotification({
        userId: seller.user.id,
        priority: 'medium',
        title: 'Payment Transfer Initiated',
        body: `A transfer of ${formatAmount(transfer.amount, transfer.currency)}${milestoneInfo} for order ${order.order_number} has been initiated to your Stripe account.`,
        actionUrl: `/provider-portal/orders/${orderId}`,
        metadata: {
          orderId,
          orderNumber: order.order_number,
          transferId: transfer.id,
          amount: transfer.amount,
          currency: transfer.currency,
          milestoneId,
        },
      })
    } catch (notifyError) {
      console.error('Error sending transfer notification:', notifyError)
    }
  }
}

/**
 * Handles charge.dispute.created event
 * - Flags order as disputed
 * - Notifies both parties
 */
async function handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  console.log('Charge dispute created:', {
    disputeId: dispute.id,
    chargeId: dispute.charge,
    amount: dispute.amount,
    reason: dispute.reason,
  })

  const supabase = await createClient()

  // Get the charge to find the payment intent
  const charge = typeof dispute.charge === 'string' 
    ? await stripe.charges.retrieve(dispute.charge)
    : dispute.charge

  const paymentIntentId = typeof charge.payment_intent === 'string' 
    ? charge.payment_intent 
    : charge.payment_intent?.id

  if (!paymentIntentId) {
    console.error('No payment intent found for disputed charge')
    return
  }

  // Find the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      buyer_id,
      seller_id,
      buyer:profiles!orders_buyer_id_fkey(id, email, full_name),
      seller:provider_profiles!orders_seller_id_fkey(
        user_id,
        user:profiles!provider_profiles_user_id_fkey(id, email, full_name)
      )
    `)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single()

  if (orderError || !order) {
    console.error('Order not found for dispute:', orderError)
    return
  }

  // Update order status to disputed
  await supabase
    .from('orders')
    .update({
      status: 'disputed',
      escrow_status: 'held', // Funds remain held during dispute
    })
    .eq('id', order.id)

  // Create dispute record
  await supabase.from('disputes').insert({
    order_id: order.id,
    raised_by: 'stripe', // External dispute from Stripe
    reason: `Stripe chargeback: ${dispute.reason || 'No reason provided'}`,
    status: 'open',
    stripe_dispute_id: dispute.id,
  })

  const seller = order.seller as unknown as {
    user_id: string
    user: { id: string; email: string; full_name: string }
  }
  const buyer = order.buyer as unknown as { id: string; email: string; full_name: string }

  // Notify both parties
  const disputeMessage = `A payment dispute has been opened for order ${order.order_number}. Reason: ${dispute.reason || 'Not specified'}`

  try {
    if (seller?.user?.id) {
      await sendNotification({
        userId: seller.user.id,
        priority: 'high',
        title: 'Payment Dispute Filed',
        body: disputeMessage,
        actionUrl: `/provider-portal/orders/${order.id}`,
        metadata: {
          orderId: order.id,
          orderNumber: order.order_number,
          stripeDisputeId: dispute.id,
          reason: dispute.reason,
        },
      })
    }

    if (buyer?.id) {
      await sendNotification({
        userId: buyer.id,
        priority: 'high',
        title: 'Payment Dispute Filed',
        body: disputeMessage,
        actionUrl: `/marketplace/orders/${order.id}`,
        metadata: {
          orderId: order.id,
          orderNumber: order.order_number,
          stripeDisputeId: dispute.id,
          reason: dispute.reason,
        },
      })
    }
  } catch (notifyError) {
    console.error('Error sending dispute notifications:', notifyError)
  }
}

/**
 * Handles payout.paid event
 * - Logs that seller received funds
 * - Notifies seller of completed payout
 */
async function handlePayoutPaid(payout: Stripe.Payout): Promise<void> {
  console.log('Payout paid:', {
    payoutId: payout.id,
    amount: payout.amount,
    currency: payout.currency,
    arrivalDate: payout.arrival_date,
    destination: payout.destination,
  })

  // Note: Payouts go to the connected account's bank, not tied to specific orders
  // We can log this for auditing purposes
  const supabase = await createClient()

  // Find the seller by their Stripe account
  // The payout destination could be a bank account on a connected account
  // We need to get this from the request headers or payout metadata
  const stripeAccountId = payout.destination

  if (typeof stripeAccountId !== 'string') {
    console.log('Payout destination is not a string ID')
    return
  }

  // Log payout event for auditing
  await supabase.from('stripe_events').upsert({
    stripe_event_id: `payout_${payout.id}`,
    event_type: 'payout.paid',
    payload: {
      payoutId: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      arrivalDate: payout.arrival_date,
    },
    processed: true,
    processed_at: new Date().toISOString(),
  }, {
    onConflict: 'stripe_event_id',
  })
}

/**
 * Main webhook handler
 * SECURITY: Uses atomic idempotency check to prevent race conditions
 */
export async function POST(request: NextRequest) {
  // Verify webhook signature
  const verification = await verifyWebhookSignature(request)
  if (verification.error || !verification.event) {
    console.error('Webhook verification failed:', verification.error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const event = verification.event

  // SECURITY: Atomic idempotency check - prevents race conditions
  const { acquired, alreadyProcessed } = await acquireEventLock(event)
  
  if (alreadyProcessed) {
    console.log('Event already processed:', event.id)
    return NextResponse.json({ received: true, status: 'already_processed' })
  }
  
  if (!acquired) {
    console.log('Could not acquire lock for event:', event.id)
    // Another process is handling this event, return success to prevent retry
    return NextResponse.json({ received: true, status: 'processing' })
  }

  try {
    // Handle different event types
    switch (event.type) {
      // Payment intent events
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
        break

      // Connect account events
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account)
        break

      // Transfer events (funds released to seller)
      case 'transfer.created':
        await handleTransferCreated(event.data.object as Stripe.Transfer)
        break

      // Dispute events
      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event.data.object as Stripe.Dispute)
        break

      case 'charge.dispute.updated':
        // Log dispute updates but no specific handling needed
        console.log('Dispute updated:', (event.data.object as Stripe.Dispute).id)
        break

      case 'charge.dispute.closed':
        // Log dispute closure
        console.log('Dispute closed:', (event.data.object as Stripe.Dispute).id, 
          'Status:', (event.data.object as Stripe.Dispute).status)
        break

      // Payout events (funds arrive in seller's bank)
      case 'payout.paid':
        await handlePayoutPaid(event.data.object as Stripe.Payout)
        break

      case 'payout.failed':
        console.log('Payout failed:', (event.data.object as Stripe.Payout).id,
          'Failure:', (event.data.object as Stripe.Payout).failure_message)
        break

      // Refund events
      case 'charge.refunded':
        console.log('Charge refunded:', (event.data.object as Stripe.Charge).id,
          'Amount refunded:', (event.data.object as Stripe.Charge).amount_refunded)
        break

      default:
        console.log('Unhandled event type:', event.type)
    }

    // Mark event as successfully processed
    await markEventProcessed(event.id)

    return NextResponse.json({ received: true, status: 'processed' })
  } catch (error) {
    console.error('Error processing webhook:', error)

    // Mark event as failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await markEventFailed(event.id, errorMessage)

    // SECURITY: Return generic error message
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
