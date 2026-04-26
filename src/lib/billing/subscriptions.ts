/**
 * Subscription Billing Service
 * Handles recurring Stripe subscriptions for platform services.
 *
 * Static plan data and types live in `./plans.ts` so they can be
 * safely imported by client components (no server-only deps).
 */

import { getStripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/domains'
import Stripe from 'stripe'

// Re-export types and static data from the shared plans module so
// existing server-side imports from this file continue to work.
export { SUBSCRIPTION_PLANS, EARLY_ACCESS_LIMITS } from './plans'
export type {
  SubscriptionTier,
  EffectiveTier,
  SubscriptionStatus,
  SubscriptionPlan,
  UserSubscription,
} from './plans'

import type { SubscriptionTier, EffectiveTier } from './plans'
import type {
  SubscriptionPlan,
  SubscriptionStatus,
  UserSubscription,
} from './plans'
import { SUBSCRIPTION_PLANS, EARLY_ACCESS_LIMITS, ENTERPRISE_OVERAGE_CONFIG } from './plans'
import { grantReferralUpgradeReward } from '@/lib/referrals/process-upgrade'

// ==========================================
// EARLY-ACCESS TIER RESOLUTION
// ==========================================

/**
 * Resolves the user's effective tier for limit-checking purposes.
 *
 * @description When a user's `profiles.early_access_until` is in the future,
 * they receive Starter-level limits for free. This function reads the DB and
 * returns `'early_access'` for those users so callers can branch on it without
 * knowing the underlying mechanism.
 *
 * Usage: always call this instead of reading `subscription.tier` directly when
 * making limit-enforcement decisions. Surfaces that only need the display label
 * (billing settings page, pricing comparison table) should still use the raw
 * `subscription.tier` from `getUserSubscription()`.
 *
 * @param userId - Authenticated user id
 * @returns The effective tier string (may be 'early_access' for free users in cohort)
 *
 * @security Uses admin client — no foundry_id scope needed (per-user lookup).
 */
export async function getEffectiveTier(userId: string): Promise<EffectiveTier> {
  try {
    const admin = createAdminClient()

    // Check early-access window first (fast path for the majority of early users)
    const { data: profile } = await admin
      .from('profiles')
      .select('early_access_until')
      .eq('id', userId)
      .single()

    if (profile?.early_access_until) {
      const until = new Date(profile.early_access_until)
      if (until > new Date()) {
        return 'early_access'
      }
    }

    // Fall back to subscription tier
    const { subscription } = await getUserSubscription(userId)
    return subscription?.tier ?? 'free'
  } catch {
    return 'free'
  }
}

/**
 * Resolves the plan limits that apply to a user, accounting for early-access.
 *
 * @description Returns the `SubscriptionPlan['limits']` shape for the
 * user's effective tier. When `effectiveTier` is `'early_access'`, returns
 * a limits object built from EARLY_ACCESS_LIMITS merged over the Starter plan
 * (so all non-overridden fields — voiceMinutes, etc. — still resolve correctly).
 *
 * @param effectiveTier - Result from getEffectiveTier()
 */
export function resolveEffectiveLimits(
  effectiveTier: EffectiveTier
): SubscriptionPlan['limits'] {
  if (effectiveTier === 'early_access') {
    // Merge early-access overrides into the starter_v2 plan limits.
    // This ensures any limit not explicitly overridden (voiceMinutesPerMonth,
    // maxConversationMode, etc.) still has a sensible value.
    const starterLimits = SUBSCRIPTION_PLANS['starter_v2'].limits
    return {
      ...starterLimits,
      investorLeadsPerMonth: EARLY_ACCESS_LIMITS.investorLeadsPerMonth,
      brainstormSessionsPerMonth: EARLY_ACCESS_LIMITS.brainstormSessionsPerMonth,
      savedSearchesLifetime: EARLY_ACCESS_LIMITS.savedSearchesLifetime,
      maxAiTasksPerMonth: EARLY_ACCESS_LIMITS.maxAiTasksPerMonth,
      maxComputeBudgetUsd: EARLY_ACCESS_LIMITS.maxComputeBudgetUsd,
      investorDeepAccess: EARLY_ACCESS_LIMITS.investorDeepAccess,
      investorIntelligenceAccess: EARLY_ACCESS_LIMITS.investorIntelligenceAccess,
    }
  }
  return SUBSCRIPTION_PLANS[effectiveTier].limits
}

// SECURITY: Reverse lookup from Stripe price ID to tier.
// Prevents tier escalation via metadata tampering — the actual price paid
// is the source of truth, not user-controllable metadata.
const PRICE_ID_TO_TIER: Record<string, SubscriptionTier> = Object.fromEntries(
  Object.values(SUBSCRIPTION_PLANS).flatMap((plan) => {
    const entries: [string, SubscriptionTier][] = []
    if (plan.stripePriceIdMonthly) entries.push([plan.stripePriceIdMonthly, plan.tier])
    if (plan.stripePriceIdAnnual) entries.push([plan.stripePriceIdAnnual, plan.tier])
    return entries
  })
)

const VALID_TIERS: Set<string> = new Set(['free', 'seed', 'starter', 'starter_v2', 'professional', 'enterprise'])

// ==========================================
// SUBSCRIPTION MANAGEMENT
// ==========================================

/**
 * Get user's current subscription
 */
export async function getUserSubscription(userId: string): Promise<{
  subscription: UserSubscription | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // GOTCHA: maybeSingle() returns null (not an error) when no subscription exists,
    // which is the normal case for free-tier users.
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      return { subscription: null, error: error.message }
    }
    
    if (!data) {
      // User has no subscription (free tier)
      return { subscription: null, error: null }
    }

    if (!data.current_period_start || !data.current_period_end || !data.created_at || !data.updated_at) {
      console.error('[Subscriptions] Invalid subscription record missing period timestamps:', {
        subscriptionId: data.id,
        userId,
      })
      return { subscription: null, error: 'Subscription record is incomplete' }
    }
    
    return {
      subscription: {
        id: data.id,
        userId: data.user_id,
        stripeSubscriptionId: data.stripe_subscription_id ?? '',
        stripeCustomerId: data.stripe_customer_id ?? '',
        tier: data.tier as SubscriptionTier,
        status: data.status as SubscriptionStatus,
        currentPeriodStart: data.current_period_start,
        currentPeriodEnd: data.current_period_end,
        cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
        trialEnd: data.trial_end,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('[Subscriptions] Error getting user subscription:', { error: error instanceof Error ? error.message : 'Unknown error' })
    return { subscription: null, error: 'Failed to get subscription' }
  }
}

/**
 * Create a checkout session for a new subscription
 */
export async function createSubscriptionCheckout(
  userId: string,
  tier: SubscriptionTier,
  billingPeriod: 'monthly' | 'annual' = 'monthly'
): Promise<{ url: string | null; error: string | null }> {
  try {
    if (tier === 'free') {
      return { url: null, error: 'Cannot create checkout for free tier' }
    }
    
    const plan = SUBSCRIPTION_PLANS[tier]
    const priceId = billingPeriod === 'monthly' 
      ? plan.stripePriceIdMonthly 
      : plan.stripePriceIdAnnual
    
    if (!priceId) {
      return { url: null, error: `Price not configured for ${tier} ${billingPeriod}` }
    }
    
    const supabase = await createClient()
    
    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', userId)
      .single()
    
    let customerId = profile?.stripe_customer_id
    
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: profile?.email || undefined,
        name: profile?.full_name || undefined,
        metadata: { user_id: userId },
      })
      customerId = customer.id
      
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }
    
    // DECISION: Enterprise subscriptions get a second metered line item for overage billing.
    // This metered price is usage-based — Stripe only charges if we report usage records.
    // No usage reported = no overage charge. The metered item has zero base cost.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: priceId, quantity: 1 },
    ]

    if (tier === 'enterprise' && ENTERPRISE_OVERAGE_CONFIG.stripePriceIdOverage) {
      lineItems.push({ price: ENTERPRISE_OVERAGE_CONFIG.stripePriceIdOverage })
    }

    // Create checkout session
    // DECISION: Use automatic_payment_methods instead of payment_method_types
    // to support the widest range of payment methods and avoid deprecation warnings.
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${getBaseUrl()}/settings/billing?success=true`,
      cancel_url: `${getBaseUrl()}/settings/billing?canceled=true`,
      metadata: {
        user_id: userId,
        tier,
        billing_period: billingPeriod,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          tier,
        },
        // No trials — free tier IS the trial. Paid tiers charge immediately.
      },
    })
    
    return { url: session.url, error: null }
  } catch (error) {
    // INTENT: Log full Stripe error details for debugging — the generic user-facing
    // message hides the actual cause. Stripe errors have type, code, and param fields.
    const stripeError = error as { type?: string; code?: string; param?: string; message?: string }
    console.error('[Subscriptions] Error creating subscription checkout:', {
      message: stripeError.message || 'Unknown error',
      type: stripeError.type,
      code: stripeError.code,
      param: stripeError.param,
      userId,
      tier,
      billingPeriod,
    })
    return { url: null, error: 'Failed to create checkout session' }
  }
}

/**
 * Create a portal session for managing subscription
 */
export async function createBillingPortalSession(
  userId: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const supabase = await createClient()
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()
    
    if (!profile?.stripe_customer_id) {
      return { url: null, error: 'No billing account found' }
    }
    
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${getBaseUrl()}/settings/billing`,
    })
    
    return { url: session.url, error: null }
  } catch (error) {
    console.error('[Subscriptions] Error creating billing portal session:', { error: error instanceof Error ? error.message : 'Unknown error' })
    return { url: null, error: 'Failed to create billing portal session' }
  }
}

/**
 * Cancel subscription (at end of billing period)
 */
export async function cancelSubscription(
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { subscription, error: fetchError } = await getUserSubscription(userId)
    
    if (fetchError || !subscription) {
      return { success: false, error: fetchError || 'No subscription found' }
    }
    
    await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })
    
    const supabase = await createClient()
    await supabase
      .from('user_subscriptions')
      .update({ 
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id)
    
    return { success: true, error: null }
  } catch (error) {
    console.error('[Subscriptions] Error canceling subscription:', { error: error instanceof Error ? error.message : 'Unknown error' })
    return { success: false, error: 'Failed to cancel subscription' }
  }
}

/**
 * Resume a canceled subscription (before period ends)
 */
export async function resumeSubscription(
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { subscription, error: fetchError } = await getUserSubscription(userId)
    
    if (fetchError || !subscription) {
      return { success: false, error: fetchError || 'No subscription found' }
    }
    
    await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    })
    
    const supabase = await createClient()
    await supabase
      .from('user_subscriptions')
      .update({ 
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id)
    
    return { success: true, error: null }
  } catch (error) {
    console.error('[Subscriptions] Error resuming subscription:', { error: error instanceof Error ? error.message : 'Unknown error' })
    return { success: false, error: 'Failed to resume subscription' }
  }
}

/**
 * Handle subscription webhook events
 */
export async function handleSubscriptionEvent(
  event: Stripe.Event
): Promise<void> {
  // SECURITY: admin client — webhook handler (no user session/cookies), foundry_id not needed: subscription is per-user via Stripe metadata
  const supabase = createAdminClient()
  
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.user_id

      if (!userId) {
        console.error('[Subscriptions] No user_id in subscription metadata')
        return
      }

      // SECURITY: Derive tier from the actual Stripe price ID, not metadata.
      // Metadata is user-controllable; the price they paid is not.
      // DECISION: Skip metered subscription items when deriving tier — the metered
      // overage component is not a tier indicator, it's a usage-based add-on.
      const overagePriceId = ENTERPRISE_OVERAGE_CONFIG.stripePriceIdOverage
      const fixedPriceItem = subscription.items.data.find(
        item => item.price?.id !== overagePriceId
      )
      const priceId = fixedPriceItem?.price?.id ?? subscription.items.data[0]?.price?.id
      const metadataTier = subscription.metadata?.tier
      const priceDerivedTier = priceId ? PRICE_ID_TO_TIER[priceId] : undefined

      // SECURITY: Derive tier ONLY from the Stripe price ID — never trust metadata.
      // Metadata is user-controllable via the Stripe API; the price they paid is not.
      // If price ID doesn't map, default to 'starter' (least-privileged tier).
      let tier: SubscriptionTier = 'starter'
      if (priceDerivedTier) {
        tier = priceDerivedTier
        if (metadataTier && metadataTier !== priceDerivedTier) {
          console.error('[Subscriptions] SECURITY: Tier mismatch — metadata says', metadataTier, 'but price ID maps to', priceDerivedTier)
        }
      } else {
        console.warn('[Subscriptions] Could not derive tier from price ID, defaulting to starter. metadata tier ignored:', metadataTier)
      }

      // FLOW: Extract metered overage subscription item ID for Enterprise tier.
      // This is the item we report usage records against for overage billing.
      const overageItem = overagePriceId
        ? subscription.items.data.find(item => item.price?.id === overagePriceId)
        : undefined
      const stripeOverageItemId = overageItem?.id ?? null

      const { error: upsertError } = await supabase.from('user_subscriptions').upsert({
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        tier,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        stripe_overage_item_id: stripeOverageItemId,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })

      if (upsertError) {
        console.error('[Subscriptions] Failed to upsert subscription:', {
          userId,
          tier,
          error: upsertError.message,
        })
      }

      // FLOW: Grant referral upgrade reward (fire-and-forget).
      // Only on subscription creation, not updates. Non-blocking — referral reward
      // failures must never fail the webhook handler.
      if (event.type === 'customer.subscription.created' && tier !== 'free') {
        grantReferralUpgradeReward(userId, tier).catch((err) => {
          console.error('[Subscriptions] Referral upgrade reward failed (non-blocking):', err)
        })
      }
      break
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.user_id
      
      if (!userId) return
      
      await supabase
        .from('user_subscriptions')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id)
      break
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription as string
      
      if (!subscriptionId) return
      
      await supabase
        .from('user_subscriptions')
        .update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscriptionId)
      break
    }
  }
}

/**
 * Check if user has access to a feature based on their subscription
 */
type SubscriptionLimitKey = Exclude<keyof SubscriptionPlan['limits'], 'maxConversationMode'>

export async function checkSubscriptionLimit(
  userId: string,
  feature: SubscriptionLimitKey
): Promise<{ allowed: boolean; currentTier: SubscriptionTier; limit?: number }> {
  const { subscription } = await getUserSubscription(userId)
  
  const tier = subscription?.tier || 'free'
  const plan = SUBSCRIPTION_PLANS[tier]
  const limit = plan.limits[feature]

  // Boolean features
  if (typeof limit === 'boolean') {
    return { allowed: limit, currentTier: tier }
  }

  // Numeric limits — undefined OR null both mean "unlimited" / "no cap".
  // null is used by the new pricing-restructure fields
  // (investorLeadsPerMonth, brainstormSessionsPerMonth, savedSearchesLifetime)
  // to signal an unlimited allowance on Pro / Enterprise.
  if (limit === undefined || limit === null) {
    return { allowed: true, currentTier: tier }
  }

  // Return the limit for the caller to check
  return { allowed: true, currentTier: tier, limit }
}
