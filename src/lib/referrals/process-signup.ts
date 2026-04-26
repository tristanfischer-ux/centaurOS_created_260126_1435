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

/** UUID v4 pattern — detects inviter user IDs from the in-app upsells CTA */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const REFERRAL_CREDIT_AMOUNT = 10
const FOUNDING_MEMBER_CREDIT_AMOUNT = 25
const FOUNDING_MEMBER_LIMIT = 100

/** Bonus investor monthly views granted per referral signup */
const REFERRAL_INVESTOR_VIEW_BONUS = 5

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

    // Grant +10 credits to referrer (uncapped — referrals are the primary growth lever)
    if (referrer.foundry_id) {
      await admin.from('referral_credits').insert({
        foundry_id: referrer.foundry_id,
        granted_to: referrer.id,
        granted_by: newUserId,
        amount: REFERRAL_CREDIT_AMOUNT,
        reason: 'referral_made',
      })

      // FLOW: Grant +5 investor monthly views to referrer via bonus_feature_credits
      try {
        await admin.from('bonus_feature_credits').insert({
          foundry_id: referrer.foundry_id,
          granted_to: referrer.id,
          feature: 'investor_monthly_views',
          amount: REFERRAL_INVESTOR_VIEW_BONUS,
          reason: 'referral_signup',
        })
      } catch (bonusError) {
        // Non-critical — AI task credits were still granted
        console.warn('[Referral] Failed to grant investor view bonus:', bonusError)
      }
    }

    // TODO: Activation gate — consider requiring profile completion before
    // granting referral rewards. This prevents gaming via empty signups.
    // Implementation requires checking profile completeness which is complex
    // (multiple fields across profiles + foundries tables). Defer to a
    // dedicated feature sprint.

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
    const ref = referralCode.trim()
    if (UUID_REGEX.test(ref)) {
      // FLOW: UUID-format ref from the in-app upsells CTA (?ref=<user_id>).
      // Records a referral_signups row for the conversion engine.
      // Investor-search credits fire later via the Stripe webhook.
      await processUuidReferral(ref, userId)
    } else {
      // FLOW: 7-char referral code — existing mechanism (AI-task credits + founding member)
      await trackReferralSignup(ref, userId, foundryId)
    }
  }
  await checkAndGrantFoundingMember(userId, foundryId)
}

/**
 * Record a referral_signups row for the conversion engine.
 *
 * Called from processSignupReferral when the ref value is a raw user UUID
 * (the URL pattern produced by the in-app upsells CTA:
 * `${APP_DOMAIN}/signup?ref=<user_id>`).
 *
 * Distinct from trackReferralSignup which handles 7-char referral codes and
 * grants immediate AI-task credits. This function only records the signup
 * event; investor-search credit grants fire later via the Stripe webhook
 * when the invitee actually upgrades to a paid tier.
 *
 * @param inviterUserId - The user who shared the referral link (the inviter)
 * @param inviteeUserId - The new user who signed up via the link (the invitee)
 *
 * @security INTERNAL — called from processSignupReferral() only.
 */
async function recordReferralSignupRow(
  inviterUserId: string,
  inviteeUserId: string,
): Promise<void> {
  try {
    // SECURITY: admin client — cross-foundry referral signup recording
    const admin = createAdminClient()

    // SECURITY: Verify the inviter exists and is not the same person
    if (inviterUserId === inviteeUserId) {
      console.warn('[Referral] Self-referral rejected:', { inviterUserId })
      return
    }

    const { data: inviter } = await admin
      .from('profiles')
      .select('id')
      .eq('id', inviterUserId)
      .maybeSingle()

    if (!inviter) {
      console.warn('[Referral] Inviter not found, skipping referral_signups row:', { inviterUserId })
      return
    }

    // INTENT: ON CONFLICT DO NOTHING — idempotent if called twice (e.g. duplicate OAuth callback)
    // The unique constraint on invitee_user_id prevents double rows.
    const { error } = await admin
      .from('referral_signups')
      .insert({
        inviter_user_id: inviterUserId,
        invitee_user_id: inviteeUserId,
        status: 'signed_up',
      })

    if (error) {
      if (error.code === '23505') {
        // Duplicate — already recorded; idempotent
        return
      }
      console.error('[Referral] Failed to insert referral_signups row:', error.message)
    } else {
      console.info('[Referral] referral_signups row created:', {
        inviter: inviterUserId,
        invitee: inviteeUserId,
      })
    }
  } catch (err) {
    console.error('[Referral] recordReferralSignupRow error:', err)
  }
}

/**
 * Process a UUID-format referral ref (from the upsells CTA) during signup.
 *
 * Handles the `?ref=<user_id>` URL pattern generated by the in-app
 * LimitReachedUpsell component. Records a referral_signups row so the
 * conversion engine can grant investor-search credits when the invitee
 * upgrades to a paid tier.
 *
 * Also falls through to the existing 7-char-code path so the two mechanisms
 * do not conflict — a user who signs up via a UUID ref still gets founding
 * member credits if applicable.
 *
 * @security INTERNAL — called from processSignupReferral() only.
 */
export async function processUuidReferral(
  refValue: string,
  newUserId: string,
): Promise<void> {
  if (!UUID_REGEX.test(refValue)) return
  await recordReferralSignupRow(refValue, newUserId)
}
