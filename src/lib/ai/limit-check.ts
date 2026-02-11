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

/** Result of an AI limit check */
export interface AILimitCheckResult {
  allowed: boolean
  currentUsage: number
  limit: number
  remaining: number
  tier: SubscriptionTier
  message?: string
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
      return {
        allowed: false,
        currentUsage,
        limit,
        remaining: 0,
        tier,
        message: `You've reached your monthly AI limit of ${limit} tasks. Upgrade your plan for more.`,
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

    // SECURITY: On error, allow the call but log it.
    // Blocking users due to our internal errors is worse than occasional cost overrun.
    // The monthly aggregate acts as a safety net regardless.
    return {
      allowed: true,
      currentUsage: 0,
      limit: 20,
      remaining: 20,
      tier: 'free',
      message: 'Limit check failed, allowing request',
    }
  }
}

/**
 * Get the subscription tier for a foundry based on its owner's subscription.
 *
 * @param foundryId - The foundry ID to look up
 * @returns The owner's subscription tier, defaults to 'free'
 */
async function getFoundryTier(foundryId: string): Promise<SubscriptionTier> {
  try {
    const supabase = await createClient()

    // Find the foundry owner
    const { data: foundry } = await supabase
      .from('foundries')
      .select('owner_id')
      .eq('id', foundryId)
      .single()

    if (!foundry?.owner_id) return 'free'

    // Check their subscription
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('tier, status')
      .eq('user_id', foundry.owner_id)
      .in('status', ['active', 'trialing'])
      .single()

    if (!subscription) return 'free'

    return subscription.tier as SubscriptionTier
  } catch {
    return 'free'
  }
}
