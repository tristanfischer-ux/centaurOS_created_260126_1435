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
  // Starter (£20) sits between Seed and the legacy Startup Team in reward
  // size — it bundles fewer AI tasks than Startup Team but lands the new
  // entry-tier cohort. Pegged to seed rewards as a conservative starting
  // point; revisit when v2 cohort data is in.
  starter_v2: { tasks: 15, investorViews: 3 },
  professional: { tasks: 40, investorViews: 10 },
  enterprise: { tasks: 75, investorViews: 30 },
}

/**
 * Grant a referral upgrade reward.
 *
 * Called from handleSubscriptionEvent() when a `customer.subscription.created` event fires.
 *
 * Two grant mechanisms run in parallel:
 *
 *   1. Immediate investor-search credits via `grant_referral_credits_on_paid_conversion` RPC.
 *      Fires for both UUID-format refs (from the in-app upsells CTA) and legacy-code refs.
 *      Inviter: +100 investor searches (capped at 500/month).
 *      Invitee: +50 investor searches as a welcome bonus.
 *
 *   2. Vested AI-task credits via `referral_rewards_pending` (30-day vesting).
 *      Only fires for legacy 7-char-code referrals (where `profiles.referred_by` is set).
 *
 * @param userId - The user who just subscribed (the invitee)
 * @param tier - The subscription tier they upgraded to
 *
 * @security Uses admin client — this is a system operation triggered by Stripe webhook.
 * No user session available. Cross-foundry lookup is intentional.
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

    // FLOW: Immediate investor-search credit grant for UUID-format referrals.
    // Fires for any paid conversion where a referral_signups row exists for the
    // invitee (recorded during signup via the in-app upsells CTA).
    // The function is idempotent — safe to call even if no referral_signups row exists.
    try {
      const { data: conversionResult, error: conversionError } = await admin.rpc(
        'grant_referral_credits_on_paid_conversion',
        { p_invitee_user_id: userId, p_paid_tier: tier }
      )
      if (conversionError) {
        console.error('[Referral] grant_referral_credits_on_paid_conversion error:', conversionError.message)
      } else {
        const result = conversionResult as { status: string; inviter_capped?: boolean; inviter_user_id?: string } | null
        console.info('[Referral] grant_referral_credits_on_paid_conversion:', {
          userId,
          tier,
          status: result?.status,
          inviterCapped: result?.inviter_capped,
        })

        // FLOW: Forge Ambassador lane (Tier 5 step 23).
        // On a successful conversion, refresh the inviter's ambassador status cache
        // so forge_ambassador_since is set when they first cross 10 active paid referrals.
        // We look up the inviter from referral_signups directly (the SQL function does
        // the join). Fire-and-forget: ambassador cache failures must never fail the webhook.
        if (result?.status === 'ok' || result?.status === 'already_converted') {
          try {
            const { data: signupRow } = await admin
              .from('referral_signups')
              .select('inviter_user_id')
              .eq('invitee_user_id', userId)
              .maybeSingle()

            if (signupRow?.inviter_user_id) {
              await admin.rpc('update_forge_ambassador_status', {
                p_inviter_user_id: signupRow.inviter_user_id,
              })
              console.info('[Referral] update_forge_ambassador_status called for inviter:', signupRow.inviter_user_id)
            }
          } catch (ambassadorErr) {
            console.warn('[Referral] update_forge_ambassador_status failed (non-blocking):', ambassadorErr)
          }
        }
      }
    } catch (conversionErr) {
      // Non-blocking — investor-search grants must not fail the subscription webhook
      console.error('[Referral] grant_referral_credits_on_paid_conversion threw:', conversionErr)
    }

    // FLOW: Vested AI-task credit grant for legacy 7-char-code referrals.
    // Only fires when profiles.referred_by is set (7-char-code path sets this;
    // UUID-format path does not — it uses referral_signups instead).

    // Look up the subscribing user's referrer
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('referred_by')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.referred_by) {
      // No legacy referrer — nothing more to do
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
