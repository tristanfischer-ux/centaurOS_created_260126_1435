/**
 * @file process-upgrade.ts
 *
 * @description Grants referral rewards when a referred user upgrades to a paid plan.
 * Rewards are NOT granted immediately — they are inserted into `referral_rewards_pending`
 * with a 30-day vesting period. A daily cron job vests them if the subscription is still active.
 *
 * @security This file has NO 'use server' directive. Functions are called from
 * handleSubscriptionEvent() in the Stripe webhook handler. Uses admin client
 * for all DB operations (system operation, no user session).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionTier } from '@/lib/billing/plans'

/**
 * Reward tiers for paid upgrades.
 * Referrer receives these after the 30-day vesting period if the subscription is still active.
 */
const UPGRADE_REWARDS: Record<
  Exclude<SubscriptionTier, 'free'>,
  { tasks: number; investorViews: number }
> = {
  seed: { tasks: 15, investorViews: 3 },
  starter: { tasks: 25, investorViews: 5 },
  professional: { tasks: 40, investorViews: 10 },
  enterprise: { tasks: 75, investorViews: 30 },
}

/**
 * Grant a referral upgrade reward (with 30-day vesting).
 *
 * Called from handleSubscriptionEvent() when a `customer.subscription.created` event fires.
 * Does NOT grant credits immediately — inserts into `referral_rewards_pending` instead.
 *
 * @param userId - The user who just subscribed (the referee)
 * @param tier - The subscription tier they upgraded to
 *
 * @security Uses admin client — this is a system operation triggered by Stripe webhook.
 * No user session available. Cross-foundry lookup is intentional (referrer and referee
 * may be in different foundries).
 */
export async function grantReferralUpgradeReward(
  userId: string,
  tier: SubscriptionTier
): Promise<void> {
  // Free tier has no upgrade reward
  if (tier === 'free') return

  const rewards = UPGRADE_REWARDS[tier]
  if (!rewards) {
    console.warn('[Referral] Unknown tier for upgrade reward:', tier)
    return
  }

  try {
    const admin = createAdminClient()

    // Look up the subscribing user's referrer
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('referred_by')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.referred_by) {
      // No referrer — nothing to do (most users won't have one)
      return
    }

    const referrerUserId = profile.referred_by

    // Look up the referrer's foundry_id
    const { data: referrer, error: referrerError } = await admin
      .from('profiles')
      .select('id, foundry_id')
      .eq('id', referrerUserId)
      .single()

    if (referrerError || !referrer?.foundry_id) {
      console.warn('[Referral] Referrer not found or has no foundry:', referrerUserId)
      return
    }

    // SECURITY: Check for duplicate — don't insert a pending reward if one already
    // exists for this referrer + referred user + tier combination. Prevents double
    // rewards from webhook retries or subscription re-creation.
    const { data: existing } = await admin
      .from('referral_rewards_pending')
      .select('id')
      .eq('referrer_user_id', referrerUserId)
      .eq('referred_user_id', userId)
      .eq('referred_tier', tier)
      .maybeSingle()

    if (existing) {
      console.info('[Referral] Pending reward already exists for this referral + tier:', {
        referrer: referrerUserId,
        referee: userId,
        tier,
      })
      return
    }

    // Insert pending reward with 30-day vesting period
    const vestsAt = new Date()
    vestsAt.setDate(vestsAt.getDate() + 30)

    const { error: insertError } = await admin
      .from('referral_rewards_pending')
      .insert({
        referrer_foundry_id: referrer.foundry_id,
        referrer_user_id: referrerUserId,
        referred_user_id: userId,
        referred_tier: tier,
        task_reward: rewards.tasks,
        investor_view_reward: rewards.investorViews,
        vests_at: vestsAt.toISOString(),
        vested: false,
        forfeited: false,
      })

    if (insertError) {
      console.error('[Referral] Failed to insert pending upgrade reward:', insertError.message)
      return
    }

    console.info('[Referral] Pending upgrade reward created:', {
      referrer: referrerUserId,
      referee: userId,
      tier,
      tasks: rewards.tasks,
      investorViews: rewards.investorViews,
      vestsAt: vestsAt.toISOString(),
    })
  } catch (error) {
    // INTENT: Log but don't throw — this is called fire-and-forget from the webhook.
    // Referral rewards should never fail the subscription webhook.
    console.error('[Referral] grantReferralUpgradeReward error:', error)
  }
}
