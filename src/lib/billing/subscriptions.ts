/**
 * Subscription Billing Service
 * Handles recurring Stripe subscriptions for platform services.
 *
 * Static plan data and types live in `./plans.ts` so they can be
 * safely imported by client components (no server-only deps).
 */

import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/domains'
import Stripe from 'stripe'

// Re-export types and static data from the shared plans module so
// existing server-side imports from this file continue to work.
export { SUBSCRIPTION_PLANS } from './plans'
export type {
  SubscriptionTier,
  SubscriptionStatus,
  SubscriptionPlan,
  UserSubscription,
} from './plans'

import type { SubscriptionTier } from './plans'
import type {
  SubscriptionPlan,
  SubscriptionStatus,
  UserSubscription,
} from './plans'
import { SUBSCRIPTION_PLANS } from './plans'

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
    
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (error && error.code !== 'PGRST116') {
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
      const customer = await stripe.customers.create({
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
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
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
        trial_period_days: tier === 'starter' ? 14 : undefined, // 14-day trial for starter
      },
    })
    
    return { url: session.url, error: null }
  } catch (error) {
    console.error('[Subscriptions] Error creating subscription checkout:', { error: error instanceof Error ? error.message : 'Unknown error' })
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
    
    const session = await stripe.billingPortal.sessions.create({
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
    
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
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
    
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
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
  const supabase = await createClient()
  
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata.user_id
      
      if (!userId) {
        console.error('[Subscriptions] No user_id in subscription metadata')
        return
      }
      
      await supabase.from('user_subscriptions').upsert({
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        tier: subscription.metadata.tier || 'starter',
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end 
          ? new Date(subscription.trial_end * 1000).toISOString() 
          : null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      break
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata.user_id
      
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
  
  // Numeric limits (undefined = unlimited)
  if (limit === undefined) {
    return { allowed: true, currentTier: tier }
  }
  
  // Return the limit for the caller to check
  return { allowed: true, currentTier: tier, limit }
}
