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

    const admin = createAdminClient()

    // SECURITY: Check if this user was already referred (prevent duplicate credits)
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('referred_by')
      .eq('id', newUserId)
      .single()

    if (existingProfile?.referred_by) {
      return { error: 'User already referred' }
    }

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

    // Set referred_by on the new user
    await admin
      .from('profiles')
      .update({ referred_by: referrer.id })
      .eq('id', newUserId)

    // Grant +10 credits to referee (new user)
    await admin.from('referral_credits').insert({
      foundry_id: newFoundryId,
      granted_to: newUserId,
      granted_by: referrer.id,
      amount: REFERRAL_CREDIT_AMOUNT,
      reason: 'referral_received',
    })

    // Grant +10 credits to referrer
    if (referrer.foundry_id) {
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
