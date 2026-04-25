/**
 * @file investor-search-allowance.ts
 *
 * @description Helper for computing the effective investor-search allowance
 * for a given user, combining their subscription tier's base allowance with
 * any unconsumed referral-credit bonus searches.
 *
 * Used by the investor-search limit check and the in-app upsell display
 * (sidebar usage indicator — Tier 5 step 22 UI follow-up).
 *
 * @security This file has NO 'use server' directive. Functions here are called
 * from server actions and server components only. Uses the admin client
 * because it needs to read bonus_feature_credits across foundry boundaries
 * for referral accounting.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier } from '@/lib/billing/plans'

export interface InvestorSearchAllowance {
  /** Base monthly allowance from the subscription tier (null = unlimited) */
  baseAllowance: number | null
  /** Unconsumed referral-credit bonus investor searches available */
  creditsRemaining: number
  /**
   * Total effective allowance for this billing period.
   * null when baseAllowance is null (unlimited tier — credits are moot).
   */
  totalAvailable: number | null
}

/**
 * Returns the effective investor-search allowance for a user.
 *
 * @param foundryId - The user's foundry ID
 * @param tier - The user's current subscription tier
 * @returns Combined base + credits allowance data
 *
 * @security INTERNAL — called from server actions only (no 'use server' here).
 * Admin client used for bonus_feature_credits lookup (cross-foundry is
 * intentional for referral accounting).
 */
export async function getEffectiveSearchAllowance(
  foundryId: string,
  tier: SubscriptionTier,
): Promise<InvestorSearchAllowance> {
  const plan = SUBSCRIPTION_PLANS[tier]
  const baseAllowance = plan.limits.investorLeadsPerMonth

  // Unlimited tiers: credits are irrelevant — short-circuit
  if (baseAllowance === null) {
    return { baseAllowance: null, creditsRemaining: 0, totalAvailable: null }
  }

  // Fetch unconsumed referral bonus credits for investor searches
  let creditsRemaining = 0
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('get_bonus_feature_credits', {
      p_foundry_id: foundryId,
      p_feature: 'investor_monthly_views',
    })
    if (!error && typeof data === 'number') {
      creditsRemaining = data
    }
  } catch (err) {
    // Non-critical — log and fall back to zero bonus credits
    console.warn('[InvestorSearchAllowance] Failed to fetch bonus credits:', err)
  }

  return {
    baseAllowance,
    creditsRemaining,
    totalAvailable: baseAllowance + creditsRemaining,
  }
}
