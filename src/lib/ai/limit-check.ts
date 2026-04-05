/**
 * @file AI Usage Limit Enforcement
 *
 * @description Checks whether a foundry has remaining AI task quota
 * based on their subscription tier. Used as a gate before making
 * AI API calls to prevent cost overruns.
 *
 * @security Prevents free/lower-tier users from consuming expensive
 * AI resources beyond their allocation. The primary cost control mechanism.
 *
 * @dependencies
 * - src/lib/billing/subscriptions.ts for tier limits
 * - src/lib/ai/usage-tracking.ts for current usage
 */

import { SUBSCRIPTION_PLANS } from '@/lib/billing/subscriptions'
import type { SubscriptionTier } from '@/lib/billing/subscriptions'
import { getCurrentMonthUsage } from '@/lib/ai/usage-tracking'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Result of an AI limit check */
export interface AILimitCheckResult {
  allowed: boolean
  currentUsage: number
  limit: number
  remaining: number
  tier: SubscriptionTier
  message?: string
  /** True if this request was allowed via bonus referral credits */
  bonusUsed?: boolean
  /** Remaining bonus credits after this check */
  bonusRemaining?: number
}

/**
 * Check whether a foundry can make another AI API call.
 *
 * @description Looks up the foundry owner's subscription tier,
 * gets the monthly AI task limit for that tier, and compares
 * against current month usage. Returns whether the call is allowed.
 *
 * @param foundryId - The foundry making the AI call
 * @returns Check result with allowed/denied status and current usage info
 *
 * @security This is the primary cost control gate for AI features.
 * Must be called before every AI API call.
 */
export async function checkAILimit(
  foundryId: string
): Promise<AILimitCheckResult> {
  // SECURITY: Developer foundries bypass quota entirely (set via Vercel env var)
  const devFoundries = process.env.DEVELOPER_FOUNDRY_IDS?.split(',').map(s => s.trim()) ?? []
  if (devFoundries.includes(foundryId)) {
    // AUDIT: Log every bypass so we can detect abuse or accidental inclusion
    console.warn('[AILimitCheck] Developer foundry bypass used:', { foundryId })
    return { allowed: true, currentUsage: 0, limit: 999999, remaining: 999999, tier: 'enterprise' }
  }

  try {
    // Get the foundry owner's subscription tier
    const tier = await getFoundryTier(foundryId)
    const plan = SUBSCRIPTION_PLANS[tier]
    const limit = plan.limits.maxAiTasksPerMonth

    // Get current month's usage
    const usage = await getCurrentMonthUsage(foundryId)
    const currentUsage = usage.totalAiTasks
    const remaining = Math.max(0, limit - currentUsage)

    if (currentUsage >= limit) {
      // FLOW: Before denying, check if the foundry has bonus referral credits
      try {
        const supabase = await createClient()
        const { data: bonus } = await supabase.rpc('get_bonus_credits', {
          p_foundry_id: foundryId,
        })

        if (bonus && bonus > 0) {
          const { data: consumed } = await supabase.rpc('consume_bonus_credit', {
            p_foundry_id: foundryId,
          })

          if (consumed) {
            return {
              allowed: true,
              currentUsage,
              limit,
              remaining: 0,
              tier,
              bonusUsed: true,
              bonusRemaining: bonus - 1,
            }
          }
        }
      } catch (bonusError) {
        // Non-critical — fall through to deny
        console.warn('[AILimitCheck] Bonus credit check failed:', bonusError)
      }

      return {
        allowed: false,
        currentUsage,
        limit,
        remaining: 0,
        tier,
        message: `You've reached your monthly AI limit of ${limit} tasks. Invite a friend to get 10 more, or upgrade your plan.`,
      }
    }

    return {
      allowed: true,
      currentUsage,
      limit,
      remaining,
      tier,
    }
  } catch (error) {
    console.error('[AILimitCheck] Error checking limit:', {
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // SECURITY: Fail closed — deny on error to prevent cost overruns.
    // A temporary Supabase outage should block AI calls, not open the floodgates.
    return {
      allowed: false,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      tier: 'free',
      message: 'Unable to verify usage limits. Please try again shortly.',
    }
  }
}

/**
 * Get the subscription tier for a foundry based on its owner's subscription.
 *
 * @param foundryId - The foundry ID to look up
 * @returns The owner's subscription tier, defaults to 'free'
 */
export async function getFoundryTier(foundryId: string): Promise<SubscriptionTier> {
  try {
    // DECISION: Use admin client for foundries lookup to bypass RLS.
    // The foundries SELECT policy depends on get_my_foundry_id() which calls
    // is_active on profiles — this can return NULL for newly-created accounts
    // due to function caching or timing issues with the SECURITY DEFINER function.
    // Since getFoundryTier is only called from server-side code that has already
    // verified user identity, using admin client here is safe and avoids a class
    // of RLS edge-case bugs where the tier always defaults to 'free'.
    let foundry: { owner_id: string | null } | null = null
    try {
      const adminSupabase = createAdminClient()
      const { data, error: foundryError } = await adminSupabase
        .from('foundries')
        .select('owner_id')
        .eq('id', foundryId)
        .maybeSingle()

      if (foundryError) {
        console.warn('[AILimitCheck] Foundry lookup error (admin), defaulting to free:', { foundryId, error: foundryError.message })
        return 'free'
      }
      foundry = data
    } catch (adminError) {
      // GOTCHA: If admin client is unavailable (missing service role key in dev),
      // fall back to the user's client. This preserves backward compatibility.
      console.warn('[AILimitCheck] Admin client unavailable, falling back to user client:', adminError)
      const supabase = await createClient()
      const { data, error: foundryError } = await supabase
        .from('foundries')
        .select('owner_id')
        .eq('id', foundryId)
        .maybeSingle()

      if (foundryError) {
        console.warn('[AILimitCheck] Foundry lookup error (fallback), defaulting to free:', { foundryId, error: foundryError.message })
        return 'free'
      }
      foundry = data
    }

    if (!foundry?.owner_id) {
      // GOTCHA: Shared foundries (e.g. forge-guild) may not have an owner_id.
      // This is expected — default to free tier rather than blocking all AI features.
      console.warn('[AILimitCheck] Foundry has no owner, defaulting to free:', { foundryId })
      return 'free'
    }

    // Check their subscription
    // DECISION: Also use admin client here to bypass RLS on user_subscriptions.
    // Even though we added a SELECT policy, using admin is more robust and avoids
    // future breakage if the policy changes.
    let subscription: { tier: string; status: string } | null = null
    try {
      const adminSupabase = createAdminClient()
      const { data } = await adminSupabase
        .from('user_subscriptions')
        .select('tier, status')
        .eq('user_id', foundry.owner_id)
        .in('status', ['active', 'trialing'])
        .maybeSingle()
      subscription = data
    } catch {
      // Fallback to user client
      const supabase = await createClient()
      const { data } = await supabase
        .from('user_subscriptions')
        .select('tier, status')
        .eq('user_id', foundry.owner_id)
        .in('status', ['active', 'trialing'])
        .maybeSingle()
      subscription = data
    }

    if (!subscription) return 'free'

    const tier = subscription.tier as string
    if (!(tier in SUBSCRIPTION_PLANS)) {
      console.warn('[AILimitCheck] Unknown subscription tier, defaulting to free:', { foundryId, tier })
      return 'free'
    }
    return tier as SubscriptionTier
  } catch (error) {
    console.error('[AILimitCheck] Error getting foundry tier:', {
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    // SECURITY: Re-throw so checkAILimit fails closed
    throw error
  }
}
