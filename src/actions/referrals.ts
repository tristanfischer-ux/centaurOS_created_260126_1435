'use server'

/**
 * @file referrals.ts
 *
 * @description Server actions for the viral referral system.
 * Handles referral tracking, credit granting, and stats retrieval.
 *
 * @security All exports here are server actions (callable from client).
 * Every export uses withAuth or is safe for unauthenticated use (lookupReferrer).
 * Internal admin-level helpers live in src/lib/referrals/process-signup.ts
 * (NOT a 'use server' file — not callable from client).
 */

import { unstable_cache } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionTier } from '@/lib/billing/plans'

/** VALIDATION: Referral codes are exactly 7 uppercase alphanumeric chars */
const REFERRAL_CODE_REGEX = /^[A-Z0-9]{7}$/

export interface ReferralInfo {
  referralCode: string
  referralLink: string
  referralCount: number
  bonusCredits: number
  isFoundingMember: boolean
  foundingMemberNumber: number | null
}

/**
 * Get the current user's referral info, link, and bonus credit balance.
 *
 * @returns Referral info for display in sidebar/settings
 */
export async function getMyReferralInfo(): Promise<ReferralInfo | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('referral_code, referral_count, is_founding_member, founding_member_number')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return { error: 'Failed to load referral info' }
    }

    // Get bonus credits via RPC
    const { data: bonusCredits } = await supabase.rpc('get_bonus_credits', {
      p_foundry_id: foundryId,
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

    const code = profile.referral_code || ''

    return {
      referralCode: code,
      referralLink: code ? `${baseUrl.replace(/\/$/, '')}/signup?ref=${code}` : '',
      referralCount: profile.referral_count || 0,
      bonusCredits: bonusCredits || 0,
      isFoundingMember: profile.is_founding_member || false,
      foundingMemberNumber: profile.founding_member_number || null,
    }
  })
}

/**
 * Look up a referrer by code for display on the join page.
 *
 * @param code - The 7-char referral code from ?ref= param
 * @returns Referrer's first name and company for warm banner
 */
export async function lookupReferrer(
  code: string
): Promise<{ name: string; company: string | null } | null> {
  try {
    // VALIDATION: Only accept properly formatted referral codes
    const sanitized = code.toUpperCase().trim()
    if (!REFERRAL_CODE_REGEX.test(sanitized)) return null

    // SECURITY: admin client — cross-foundry referral code lookup (intentional), foundry_id not needed
    const admin = createAdminClient()

    const { data: referrer } = await admin
      .from('profiles')
      .select('full_name, foundry_id')
      .eq('referral_code', sanitized)
      .single()

    if (!referrer) return null

    // Get company name from foundry
    let company: string | null = null
    if (referrer.foundry_id && referrer.foundry_id !== 'forge-guild' && referrer.foundry_id !== 'forge-suppliers') {
      const { data: foundry } = await admin
        .from('foundries')
        .select('name')
        .eq('id', referrer.foundry_id)
        .single()
      company = foundry?.name || null
    }

    // Return first name only for privacy
    const firstName = referrer.full_name?.split(' ')[0] || 'Someone'

    return { name: firstName, company }
  } catch {
    return null
  }
}

/**
 * Get the current founding member count for the dynamic join page counter.
 * Cached for 60s to avoid hitting DB on every join page load.
 */
export const getFoundingMemberCount = unstable_cache(
  async (): Promise<number> => {
    try {
      // SECURITY: admin client — aggregate count RPC, foundry_id not needed
      const admin = createAdminClient()
      const { data } = await admin.rpc('get_founding_member_count')
      return data || 0
    } catch {
      return 0
    }
  },
  ['founding-member-count'],
  { revalidate: 60 }
)

/**
 * Get available bonus credits for the current user's foundry.
 *
 * @returns Number of available bonus credits
 * @security Uses session foundryId — ignores any caller-supplied value
 */
export async function getBonusCredits(): Promise<number> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data } = await supabase.rpc('get_bonus_credits', {
      p_foundry_id: foundryId,
    })
    return data || 0
  }) as Promise<number>
}

/**
 * Get AI usage stats for the sidebar credits bar.
 *
 * @returns Current usage, limit, and bonus credits for the credits bar
 */
export async function getAIUsageForCreditsBar(): Promise<
  { currentUsage: number; limit: number; bonusCredits: number; tier: SubscriptionTier } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Import dynamically to avoid circular deps
    const { getCurrentMonthUsage } = await import('@/lib/ai/usage-tracking')
    const { SUBSCRIPTION_PLANS } = await import('@/lib/billing/subscriptions')

    // Get current usage
    const usage = await getCurrentMonthUsage(foundryId)

    // Get tier limit
    let limit = 50 // free tier default
    let tier: SubscriptionTier = 'free'
    try {
      const { data: foundry } = await supabase
        .from('foundries')
        .select('owner_id')
        .eq('id', foundryId)
        .single()

      if (foundry?.owner_id) {
        // GOTCHA: maybeSingle() not single() — free-tier users have no subscription row
        const { data: subscription } = await supabase
          .from('user_subscriptions')
          .select('tier')
          .eq('user_id', foundry.owner_id)
          .in('status', ['active', 'trialing'])
          .maybeSingle()

        if (subscription?.tier && subscription.tier in SUBSCRIPTION_PLANS) {
          tier = subscription.tier as SubscriptionTier
          limit = SUBSCRIPTION_PLANS[tier].limits.maxAiTasksPerMonth
        }
      }
    } catch {
      // Fall through with default limit
    }

    // Get bonus credits
    const { data: bonusCredits } = await supabase.rpc('get_bonus_credits', {
      p_foundry_id: foundryId,
    })

    return {
      currentUsage: usage.totalAiTasks,
      limit,
      bonusCredits: bonusCredits || 0,
      tier,
    }
  })
}

