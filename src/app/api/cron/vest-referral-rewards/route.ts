/**
 * Cron Job: Vest Referral Upgrade Rewards
 *
 * @description Daily job that vests pending referral rewards whose 30-day
 * vesting period has elapsed. If the referred user still has an active
 * subscription, credits are granted to the referrer. If the subscription
 * was canceled, the reward is forfeited.
 *
 * Schedule: Daily at 03:00 UTC
 *
 * Vercel cron config in vercel.json:
 * path: /api/cron/vest-referral-rewards
 * schedule: 0 3 * * *
 *
 * @security Requires CRON_SECRET Bearer token for authorization.
 * Uses admin client — system operation with no user session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/vest-referral-rewards
 *
 * @description Processes all pending referral rewards that are ready to vest.
 * For each pending reward:
 *   1. Check if referred user still has active/trialing subscription
 *   2. If yes: grant credits (referral_credits + bonus_feature_credits), mark vested
 *   3. If no: mark forfeited
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // SECURITY: Verify cron secret
  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  const admin = createAdminClient()
  const results = { vested: 0, forfeited: 0, errors: 0 }

  try {
    // Query all pending rewards that are ready to vest
    const { data: pendingRewards, error: queryError } = await admin
      .from('referral_rewards_pending')
      .select('*')
      .eq('vested', false)
      .eq('forfeited', false)
      .lte('vests_at', new Date().toISOString())

    if (queryError) {
      console.error('[Referral Vest] Failed to query pending rewards:', queryError.message)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    if (!pendingRewards || pendingRewards.length === 0) {
      console.info('[Referral Vest] No pending rewards to process')
      return NextResponse.json({ results, message: 'No pending rewards' })
    }

    console.info('[Referral Vest] Processing', pendingRewards.length, 'pending rewards')

    for (const reward of pendingRewards) {
      try {
        // Check if the referred user still has an active/trialing subscription
        const { data: subscription, error: subError } = await admin
          .from('user_subscriptions')
          .select('status')
          .eq('user_id', reward.referred_user_id)
          .maybeSingle()

        if (subError) {
          console.error('[Referral Vest] Error checking subscription:', subError.message)
          results.errors++
          continue
        }

        const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'

        if (!isActive) {
          // Subscription canceled or not found — forfeit the reward
          const { error: forfeitError } = await admin
            .from('referral_rewards_pending')
            .update({ forfeited: true })
            .eq('id', reward.id)

          if (forfeitError) {
            console.error('[Referral Vest] Failed to forfeit reward:', forfeitError.message)
            results.errors++
          } else {
            results.forfeited++
            console.info('[Referral Vest] Forfeited reward:', {
              id: reward.id,
              referrer: reward.referrer_user_id,
              referee: reward.referred_user_id,
              reason: subscription ? `status: ${subscription.status}` : 'no subscription',
            })
          }
          continue
        }

        // Subscription is active — grant the credits

        // FLOW: Credits expire in 12 months from vesting date
        const expiresAt = new Date()
        expiresAt.setFullYear(expiresAt.getFullYear() + 1)

        // Grant AI task credits to referrer
        if (reward.task_reward > 0) {
          const { error: creditError } = await admin
            .from('referral_credits')
            .insert({
              foundry_id: reward.referrer_foundry_id,
              granted_to: reward.referrer_user_id,
              granted_by: reward.referred_user_id,
              amount: reward.task_reward,
              reason: 'referral_paid_upgrade',
              expires_at: expiresAt.toISOString(),
            })

          if (creditError) {
            console.error('[Referral Vest] Failed to grant task credits:', creditError.message)
            results.errors++
            continue
          }
        }

        // Grant investor view credits to referrer
        if (reward.investor_view_reward > 0) {
          const { error: featureError } = await admin
            .from('bonus_feature_credits')
            .insert({
              foundry_id: reward.referrer_foundry_id,
              granted_to: reward.referrer_user_id,
              feature: 'investor_view',
              amount: reward.investor_view_reward,
              consumed: 0,
              reason: 'referral_paid_upgrade',
              expires_at: expiresAt.toISOString(),
            })

          if (featureError) {
            console.error('[Referral Vest] Failed to grant investor view credits:', featureError.message)
            results.errors++
            continue
          }
        }

        // Mark the reward as vested
        const { error: vestError } = await admin
          .from('referral_rewards_pending')
          .update({
            vested: true,
            vested_at: new Date().toISOString(),
          })
          .eq('id', reward.id)

        if (vestError) {
          console.error('[Referral Vest] Failed to mark reward as vested:', vestError.message)
          results.errors++
        } else {
          results.vested++
          console.info('[Referral Vest] Vested reward:', {
            id: reward.id,
            referrer: reward.referrer_user_id,
            referee: reward.referred_user_id,
            tasks: reward.task_reward,
            investorViews: reward.investor_view_reward,
          })
        }
      } catch (rewardError) {
        console.error('[Referral Vest] Error processing reward:', reward.id, rewardError)
        results.errors++
      }
    }

    console.info('[Referral Vest] Complete:', results)
    return NextResponse.json({ results })
  } catch (error) {
    console.error('[Referral Vest] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
