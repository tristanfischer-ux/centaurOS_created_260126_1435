/**
 * Subscription Billing Service
 * Handles recurring Stripe subscriptions for platform services
 */

import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

// ==========================================
// SUBSCRIPTION TYPES
// ==========================================

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'

export interface SubscriptionPlan {
  tier: SubscriptionTier
  name: string
  description: string
  priceMonthlyGBP: number // in pence
  priceAnnualGBP: number // in pence (annual price, usually discounted)
  features: string[]
  limits: {
    maxOrders?: number
    maxTeamMembers?: number
    maxRetainers?: number
    apiAccess?: boolean
    prioritySupport?: boolean
    dedicatedAccount?: boolean
  }
  stripePriceIdMonthly?: string
  stripePriceIdAnnual?: string
}

export interface UserSubscription {
  id: string
  userId: string
  stripeSubscriptionId: string
  stripeCustomerId: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd: string | null
  createdAt: string
  updatedAt: string
}

// ==========================================
// SUBSCRIPTION PLANS CONFIGURATION
// ==========================================

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    tier: 'free',
    name: 'Free',
    description: 'Get started with CentaurOS',
    priceMonthlyGBP: 0,
    priceAnnualGBP: 0,
    features: [
      'Up to 5 orders per month',
      'Basic marketplace access',
      'Standard support',
    ],
    limits: {
      maxOrders: 5,
      maxTeamMembers: 1,
      maxRetainers: 0,
      apiAccess: false,
      prioritySupport: false,
      dedicatedAccount: false,
    },
  },
  starter: {
    tier: 'starter',
    name: 'Starter',
    description: 'For growing businesses',
    priceMonthlyGBP: 4900, // £49/month
    priceAnnualGBP: 47000, // £470/year (save ~20%)
    features: [
      'Up to 25 orders per month',
      'Full marketplace access',
      'Up to 3 team members',
      '1 active retainer',
      'Email support',
    ],
    limits: {
      maxOrders: 25,
      maxTeamMembers: 3,
      maxRetainers: 1,
      apiAccess: false,
      prioritySupport: false,
      dedicatedAccount: false,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  professional: {
    tier: 'professional',
    name: 'Professional',
    description: 'For established companies',
    priceMonthlyGBP: 14900, // £149/month
    priceAnnualGBP: 142800, // £1,428/year (save ~20%)
    features: [
      'Unlimited orders',
      'Full marketplace access',
      'Up to 10 team members',
      'Unlimited retainers',
      'API access',
      'Priority support',
    ],
    limits: {
      maxOrders: undefined, // unlimited
      maxTeamMembers: 10,
      maxRetainers: undefined, // unlimited
      apiAccess: true,
      prioritySupport: true,
      dedicatedAccount: false,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    priceMonthlyGBP: 49900, // £499/month
    priceAnnualGBP: 478800, // £4,788/year (save ~20%)
    features: [
      'Everything in Professional',
      'Unlimited team members',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantees',
      'SSO/SAML',
    ],
    limits: {
      maxOrders: undefined,
      maxTeamMembers: undefined,
      maxRetainers: undefined,
      apiAccess: true,
      prioritySupport: true,
      dedicatedAccount: true,
    },
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
}

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
    
    return {
      subscription: {
        id: data.id,
        userId: data.user_id,
        stripeSubscriptionId: data.stripe_subscription_id,
        stripeCustomerId: data.stripe_customer_id,
        tier: data.tier as SubscriptionTier,
        status: data.status as SubscriptionStatus,
        currentPeriodStart: data.current_period_start,
        currentPeriodEnd: data.current_period_end,
        cancelAtPeriodEnd: data.cancel_at_period_end,
        trialEnd: data.trial_end,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error getting user subscription:', error)
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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
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
    console.error('Error creating subscription checkout:', error)
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
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    })
    
    return { url: session.url, error: null }
  } catch (error) {
    console.error('Error creating billing portal session:', error)
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
    console.error('Error canceling subscription:', error)
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
    console.error('Error resuming subscription:', error)
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
        console.error('No user_id in subscription metadata')
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
export async function checkSubscriptionLimit(
  userId: string,
  feature: keyof SubscriptionPlan['limits']
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
