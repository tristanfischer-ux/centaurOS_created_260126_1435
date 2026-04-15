/**
 * @file Enterprise Overage Billing
 *
 * @description Handles metered overage billing for Enterprise tier users
 * who exceed their included $400/mo compute budget. Reports usage to
 * Stripe via the metered billing API, with a fail-closed queue for
 * retries if Stripe is unavailable.
 *
 * @security Fail-closed design: if Stripe reporting fails, usage is
 * queued and further overage calls are blocked until the queue is flushed.
 * This prevents giving away free compute.
 *
 * @dependencies
 * - src/lib/stripe/client.ts for Stripe API
 * - src/lib/supabase/admin.ts for queue operations (bypasses RLS)
 * - src/lib/billing/plans.ts for overage config
 */

import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENTERPRISE_OVERAGE_CONFIG } from '@/lib/billing/plans'

// ==========================================
// STRIPE USAGE REPORTING
// ==========================================

/**
 * Report overage compute usage to Stripe via metered billing.
 *
 * @param subscriptionItemId - The Stripe subscription item ID for the metered price
 * @param computeCostUsd - The compute cost in USD to report
 * @param foundryId - For queue tracking if reporting fails
 * @param userId - For queue tracking if reporting fails
 * @returns true if reported successfully, false if queued for retry
 *
 * @security On failure, queues to overage_report_queue. Next AI call
 * will attempt to flush before allowing more overage.
 */
export async function reportOverageToStripe(
  subscriptionItemId: string,
  computeCostUsd: number,
  foundryId: string,
  userId: string,
): Promise<boolean> {
  // INTENT: Convert USD cost to Stripe units. Each unit = $0.01 of compute.
  // With $0.01/unit pricing, 250 units per $1 compute = $2.50 billed = 2.5x markup.
  const units = Math.max(1, Math.round(computeCostUsd * ENTERPRISE_OVERAGE_CONFIG.stripeUnitsPerComputeDollar))

  try {
    // DECISION: Use Stripe Billing Meter events API (required for Stripe API ≥ 2025-03-31).
    // The older subscriptionItems.createUsageRecord() requires non-meter-backed prices.
    // Meter events are aggregated by Stripe and invoiced at period end.
    await stripe.billing.meterEvents.create({
      event_name: ENTERPRISE_OVERAGE_CONFIG.stripeMeterEventName,
      payload: {
        stripe_customer_id: await getStripeCustomerIdForFoundry(foundryId),
        value: String(units),
      },
    })

    console.log('[Overage] Reported to Stripe via meter event:', {
      subscriptionItemId,
      computeCostUsd,
      units,
      foundryId,
    })

    return true
  } catch (error) {
    console.error('[Overage] Stripe reporting failed, queueing:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      subscriptionItemId,
      computeCostUsd,
      foundryId,
    })

    // SECURITY: Queue for retry — don't silently drop the charge
    await queueOverageReport(
      foundryId,
      userId,
      subscriptionItemId,
      Math.round(computeCostUsd * 100), // store as cents
      error instanceof Error ? error.message : 'Unknown error',
    )

    return false
  }
}

/**
 * Get the Stripe customer ID for a foundry's owner.
 * Required by the Billing Meter events API to associate usage with a customer.
 */
async function getStripeCustomerIdForFoundry(foundryId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data: foundry } = await supabase
    .from('foundries')
    .select('owner_id')
    .eq('id', foundryId)
    .maybeSingle()

  if (!foundry?.owner_id) {
    throw new Error(`[Overage] Foundry ${foundryId} has no owner`)
  }

  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', foundry.owner_id)
    .in('status', ['active', 'trialing'])
    .maybeSingle()

  if (!subscription?.stripe_customer_id) {
    throw new Error(`[Overage] No active subscription for foundry owner ${foundry.owner_id}`)
  }

  return subscription.stripe_customer_id
}

// ==========================================
// QUEUE MANAGEMENT (FAIL-CLOSED)
// ==========================================

/**
 * Queue a failed overage report for retry.
 */
async function queueOverageReport(
  foundryId: string,
  userId: string,
  subscriptionItemId: string,
  computeCostCents: number,
  errorMessage: string,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('overage_report_queue').insert({
      foundry_id: foundryId,
      user_id: userId,
      stripe_subscription_item_id: subscriptionItemId,
      compute_cost_cents: computeCostCents,
      status: 'pending',
      attempts: 1,
      last_error: errorMessage,
    })

    if (error) {
      // SECURITY: If we can't even queue the report, log prominently.
      // The next AI call will still be blocked by hasPendingOverageReports
      // returning true (if the queue check itself works).
      console.error('[Overage] CRITICAL: Failed to queue overage report:', error.message)
    }
  } catch (err) {
    console.error('[Overage] CRITICAL: Queue insert threw:', err)
  }
}

/**
 * Check if a foundry has un-reported overage charges.
 * Used as a gate before allowing new overage calls (fail-closed).
 *
 * @returns true if there are pending reports that must be flushed first
 */
export async function hasPendingOverageReports(foundryId: string): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { count, error } = await supabase
      .from('overage_report_queue')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('status', 'pending')

    if (error) {
      // SECURITY: On error, assume there are pending reports (fail closed)
      console.warn('[Overage] Pending check failed, assuming pending:', error.message)
      return true
    }

    return (count ?? 0) > 0
  } catch (err) {
    console.warn('[Overage] Pending check threw:', err)
    return true // fail closed
  }
}

/**
 * Attempt to flush all pending overage reports for a foundry.
 * Called before allowing a new overage AI call.
 *
 * @returns true if all pending reports are cleared, false if any remain
 */
export async function flushPendingOverageReports(foundryId: string): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data: pendingReports, error } = await supabase.rpc('get_pending_overage_reports', {
      p_foundry_id: foundryId,
    })

    if (error || !pendingReports || pendingReports.length === 0) {
      // No pending reports or error — either way, don't block
      return !error
    }

    let allFlushed = true

    // Look up Stripe customer ID once for all pending reports
    let stripeCustomerId: string
    try {
      stripeCustomerId = await getStripeCustomerIdForFoundry(foundryId)
    } catch (err) {
      console.error('[Overage] Cannot flush — no customer ID:', err)
      return false
    }

    for (const report of pendingReports) {
      try {
        const units = Math.max(1, Math.round(
          (report.compute_cost_cents / 100) * ENTERPRISE_OVERAGE_CONFIG.stripeUnitsPerComputeDollar
        ))

        await stripe.billing.meterEvents.create({
          event_name: ENTERPRISE_OVERAGE_CONFIG.stripeMeterEventName,
          payload: {
            stripe_customer_id: stripeCustomerId,
            value: String(units),
          },
        })

        // Mark as reported
        await supabase.rpc('mark_overage_reported', { p_report_id: report.id })

        console.log('[Overage] Flushed pending report:', {
          reportId: report.id,
          units,
          foundryId,
        })
      } catch (reportError) {
        // Mark attempt as failed
        await supabase.rpc('mark_overage_failed', {
          p_report_id: report.id,
          p_error: reportError instanceof Error ? reportError.message : 'Unknown error',
        })
        allFlushed = false
      }
    }

    return allFlushed
  } catch (err) {
    console.error('[Overage] Flush failed:', err)
    return false
  }
}

// ==========================================
// SUBSCRIPTION ITEM LOOKUP
// ==========================================

/**
 * Get the Stripe metered subscription item ID for a foundry's Enterprise overage.
 *
 * @param foundryId - The foundry to look up
 * @returns The subscription item ID, or null if not found (non-Enterprise or not set up)
 */
export async function getOverageSubscriptionItemId(foundryId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient()

    // FLOW: foundry → owner → user_subscriptions → stripe_overage_item_id
    const { data: foundry } = await supabase
      .from('foundries')
      .select('owner_id')
      .eq('id', foundryId)
      .maybeSingle()

    if (!foundry?.owner_id) return null

    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('stripe_overage_item_id')
      .eq('user_id', foundry.owner_id)
      .in('status', ['active', 'trialing'])
      .maybeSingle()

    return subscription?.stripe_overage_item_id ?? null
  } catch (err) {
    console.error('[Overage] Subscription item lookup failed:', err)
    return null
  }
}
