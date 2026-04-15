/**
 * @file process-signup.ts
 *
 * @description Internal referral processing logic. NOT a 'use server' file —
 * these functions cannot be called from the client. Only called from
 * setupNewUser() during signup.
 *
 * @security This file deliberately has NO 'use server' directive. Exports here
 * are standard server-side functions, not server actions. They use the admin
 * Supabase client and accept trusted parameters from the signup flow.
 */

import { createAdminClient } from '@/lib/supabase/admin'

/** VALIDATION: Referral codes are exactly 7 uppercase alphanumeric chars */
const REFERRAL_CODE_REGEX = /^[A-Z0-9]{7}$/

const REFERRAL_CREDIT_AMOUNT = 10
const FOUNDING_MEMBER_CREDIT_AMOUNT = 25
const FOUNDING_MEMBER_LIMIT = 100

/** Maximum signup referral rewards a referrer can receive in a 30-day window */
const MAX_SIGNUP_REWARDS_PER_30_DAYS = 5

/**
 * Track a referral signup: grant credits to both referrer and referee.
 *
 * @param referralCode - The referrer's 7-char code
 * @param newUserId - The new user who signed up
 * @param newFoundryId - The new user's foundry
 *
 * @security INTERNAL — called from processSignupReferral() only.
 */
async function trackReferralSignup(
  referralCode: string,
  newUserId: string,
  newFoundryId: string
): Promise<{ success: true } | { error: string }> {
  try {
    // VALIDATION: Sanitize referral code
    const code = referralCode.toUpperCase().trim()
    if (!REFERRAL_CODE_REGEX.test(code)) {
      return { error: 'Invalid referral code format' }
    }

    // SECURITY: admin client — cross-foundry referral processing during signup, scoped by newUserId param
    const admin = createAdminClient()

    // Look up the referrer by code
    const { data: referrer, error: lookupError } = await admin
      .from('profiles')
      .select('id, foundry_id')
      .eq('referral_code', code)
      .single()

    if (lookupError || !referrer) {
      return { error: 'Invalid referral code' }
    }

    // SECURITY: Don't let users refer themselves
    if (referrer.id === newUserId) {
      return { error: 'Cannot refer yourself' }
    }

    // SECURITY: Atomic check-and-set — the WHERE clause `referred_by IS NULL` ensures
    // only the first concurrent request succeeds. Prevents duplicate credit grants
    // from rapid duplicate signup requests (race condition).
    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update({ referred_by: referrer.id })
      .eq('id', newUserId)
      .is('referred_by', null)
      .select('id')

    if (updateError) {
      console.error('[Referral] Failed to set referred_by:', updateError.message)
      return { error: 'Failed to process referral' }
    }

    // If no rows were updated, the user was already referred (lost the race)
    if (!updated || updated.length === 0) {
      return { error: 'User already referred' }
    }

    // Grant +10 credits to referee (new user)
    await admin.from('referral_credits').insert({
      foundry_id: newFoundryId,
      granted_to: newUserId,
      granted_by: referrer.id,
      amount: REFERRAL_CREDIT_AMOUNT,
      reason: 'referral_received',
    })

    // SECURITY: Rate limit referrer's signup rewards (max 5 per 30 days).
    // The referee still gets their reward — don't punish them for the referrer's activity.
    let referrerCapped = false
    if (referrer.foundry_id) {
      const { data: recentCount, error: countError } = await admin.rpc(
        'count_recent_referral_rewards' as never,
        { p_foundry_id: referrer.foundry_id } as never
      )

      if (countError) {
        console.warn('[Referral] Failed to check referrer rate limit:', countError.message)
        // DECISION: Fail open — grant the reward if we can't check the count.
        // Better to occasionally over-grant than to block legitimate referrals.
      } else if (typeof recentCount === 'number' && recentCount >= MAX_SIGNUP_REWARDS_PER_30_DAYS) {
        referrerCapped = true
        console.info('[Referral] Referrer hit signup reward cap:', {
          referrer: referrer.id,
          recentCount,
          cap: MAX_SIGNUP_REWARDS_PER_30_DAYS,
        })
      }
    }

    // Grant +10 credits to referrer (unless capped)
    if (referrer.foundry_id && !referrerCapped) {
      await admin.from('referral_credits').insert({
        foundry_id: referrer.foundry_id,
        granted_to: referrer.id,
        granted_by: newUserId,
        amount: REFERRAL_CREDIT_AMOUNT,
        reason: 'referral_made',
      })
    }

    // SECURITY: Atomic increment via SQL to avoid read-then-write race
    await admin.rpc('increment_referral_count' as never, { p_user_id: referrer.id } as never)

    console.info('[Referral] Tracked referral:', {
      referrer: referrer.id,
      referee: newUserId,
    })

    return { success: true }
  } catch (error) {
    console.error('[Referral] trackReferralSignup error:', error)
    return { error: 'Failed to process referral' }
  }
}

/**
 * Check if a new user qualifies as a founding member and grant credits if so.
 *
 * @param userId - The new user's ID
 * @param foundryId - The new user's foundry
 *
 * @security INTERNAL — called from processSignupReferral() only.
 * TOCTOU race is acceptable: worst case a few extra founding members (101-105)
 * which is better than a lock/serialization. Unique index prevents double grants.
 */
async function checkAndGrantFoundingMember(
  userId: string,
  foundryId: string
): Promise<void> {
  try {
    const admin = createAdminClient()

    // SECURITY: Use atomic SQL function to prevent TOCTOU race condition.
    // The old approach (read count → assign count+1) could assign duplicate
    // founding_member_numbers under concurrent signups.
    const { data, error } = await admin.rpc('assign_founding_member_atomically' as never, {
      p_user_id: userId,
      p_foundry_id: foundryId,
      p_credit_amount: FOUNDING_MEMBER_CREDIT_AMOUNT,
      p_member_limit: FOUNDING_MEMBER_LIMIT,
    } as never)

    if (error) {
      console.warn('[Referral] assign_founding_member_atomically RPC failed:', error.message)
      return
    }

    const result = data as { granted: boolean; member_number?: number; reason?: string } | null
    if (result?.granted) {
      console.info('[Referral] Founding member #' + result.member_number + ':', userId)
    }
  } catch (error) {
    console.warn('[Referral] checkAndGrantFoundingMember failed:', error)
  }
}

/**
 * Process referral + founding member during signup.
 *
 * @security Accepts trusted params from setupNewUser() only. NOT a server action.
 * This file has no 'use server' directive — these functions cannot be
 * invoked from the client.
 */
export async function processSignupReferral(
  referralCode: string | null | undefined,
  userId: string,
  foundryId: string
): Promise<void> {
  if (referralCode?.trim()) {
    await trackReferralSignup(referralCode.trim(), userId, foundryId)
  }
  await checkAndGrantFoundingMember(userId, foundryId)
}
