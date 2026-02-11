/**
 * @file Billing Settings Page
 *
 * @description Displays the user's current subscription tier, AI usage stats,
 * and provides upgrade/manage subscription actions. Links to Stripe billing
 * portal for payment method management.
 *
 * @security Only accessible to authenticated users. Shows only the
 * current user's subscription and their foundry's usage data.
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserSubscription, SUBSCRIPTION_PLANS } from '@/lib/billing/subscriptions'
import type { SubscriptionTier } from '@/lib/billing/subscriptions'
import { getCurrentMonthUsage } from '@/lib/ai/usage-tracking'
import { BillingContent } from './billing-content'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile and foundry info
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, stripe_customer_id')
    .eq('id', user.id)
    .single()

  // Get current subscription
  const { subscription } = await getUserSubscription(user.id)
  const currentTier: SubscriptionTier = (subscription?.tier as SubscriptionTier) || 'free'
  const currentPlan = SUBSCRIPTION_PLANS[currentTier]

  // Get AI usage for this month
  const foundryId = profile?.foundry_id as string | null
  const aiUsage = foundryId
    ? await getCurrentMonthUsage(foundryId)
    : { totalAiTasks: 0, totalTokens: 0, totalCostUsd: 0 }

  const hasStripeCustomer = !!profile?.stripe_customer_id

  // Map subscription to the shape expected by BillingContent
  const subscriptionInfo = subscription
    ? {
        status: subscription.status,
        current_period_end: subscription.currentPeriodEnd,
        cancel_at_period_end: subscription.cancelAtPeriodEnd,
      }
    : null

  return (
    <BillingContent
      userId={user.id}
      currentTier={currentTier}
      currentPlan={currentPlan}
      subscription={subscriptionInfo}
      aiUsage={aiUsage}
      hasStripeCustomer={hasStripeCustomer}
    />
  )
}
