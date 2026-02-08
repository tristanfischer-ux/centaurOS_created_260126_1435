'use server'

/**
 * Subscription Server Actions
 *
 * @description Provides authenticated server actions for subscription management.
 * Wraps the core subscription functions from lib/billing/subscriptions.ts with
 * auth checks and revalidation.
 *
 * @security All actions require authenticated user. User can only manage their own subscription.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  getUserSubscription,
  createSubscriptionCheckout,
  createBillingPortalSession,
  cancelSubscription,
  resumeSubscription,
  checkSubscriptionLimit,
} from '@/lib/billing/subscriptions'
import type { SubscriptionTier, SubscriptionPlan } from '@/lib/billing/plans'

/**
 * Get the current user's subscription status
 *
 * @returns Subscription data or null for free tier
 * @security Requires authenticated user
 */
export async function getMySubscription() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { subscription: null, error: 'Not authenticated' }
  }

  return getUserSubscription(user.id)
}

/**
 * Create a Stripe checkout session for subscribing to a plan
 *
 * @param tier - The subscription tier to subscribe to
 * @param billingPeriod - Monthly or annual billing
 * @returns Checkout URL to redirect to
 *
 * @security Requires authenticated user
 * @audit Logs subscription checkout initiation
 */
export async function startSubscriptionCheckout(
  tier: SubscriptionTier,
  billingPeriod: 'monthly' | 'annual' = 'monthly'
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { url: null, error: 'Not authenticated' }
  }

  // AUTH: User can only create checkout for themselves
  const result = await createSubscriptionCheckout(user.id, tier, billingPeriod)

  if (result.url) {
    revalidatePath('/settings/billing')
  }

  return result
}

/**
 * Open the Stripe billing portal for subscription management
 *
 * @returns Portal URL to redirect to
 * @security Requires authenticated user with existing subscription
 */
export async function openBillingPortal(): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { url: null, error: 'Not authenticated' }
  }

  return createBillingPortalSession(user.id)
}

/**
 * Cancel the current subscription (at end of billing period)
 *
 * @returns Success status
 * @security Requires authenticated user with active subscription
 */
export async function cancelMySubscription(): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const result = await cancelSubscription(user.id)

  if (result.success) {
    revalidatePath('/settings/billing')
  }

  return result
}

/**
 * Resume a cancelled subscription (before period ends)
 *
 * @returns Success status
 * @security Requires authenticated user with cancelling subscription
 */
export async function resumeMySubscription(): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const result = await resumeSubscription(user.id)

  if (result.success) {
    revalidatePath('/settings/billing')
  }

  return result
}

/**
 * Check if the current user can use a feature based on their subscription
 *
 * @param feature - The feature to check (e.g., 'maxOrders', 'apiAccess')
 * @returns Whether the feature is allowed and the current tier
 *
 * @security Requires authenticated user
 */
export async function checkMySubscriptionLimit(
  feature: keyof SubscriptionPlan['limits']
): Promise<{ allowed: boolean; currentTier: SubscriptionTier; limit?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { allowed: false, currentTier: 'free', error: 'Not authenticated' }
  }

  return checkSubscriptionLimit(user.id, feature)
}
