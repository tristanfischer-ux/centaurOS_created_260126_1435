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
import { ENTERPRISE_OVERAGE_CONFIG } from '@/lib/billing/plans'
import { getCurrentMonthUsage } from '@/lib/ai/usage-tracking'
import {
  hasPendingOverageReports,
  flushPendingOverageReports,
  getOverageSubscriptionItemId,
} from '@/lib/billing/overage'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DECISION: All 13 specialists available on every tier.
 * Compute budget (not feature gating) controls cost. The "delight first"
 * philosophy means users experience the full product; they upgrade for
 * more usage, not to unlock features.
 *
 * These sets are kept for backward compatibility with the execute route
 * but now contain ALL specialist IDs so no one is blocked.
 */
const ALL_SPECIALISTS = new Set([
  'strategist', 'finance-lead', 'growth-marketer', 'product-lead',
  'hiring-team', 'chief-of-staff', 'sales-lead', 'legal-counsel',
  'fundraising-advisor', 'vp-supply-chain', 'cto', 'vp-engineering',
  'vp-manufacturing',
])
export const FREE_TIER_SPECIALISTS = ALL_SPECIALISTS
export const SEED_TIER_SPECIALISTS = ALL_SPECIALISTS

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
  /** Current month's estimated AI cost in USD */
  currentCostUsd?: number
  /** Monthly cost budget ceiling in USD */
  costBudgetUsd?: number
  /** True if this call is in overage territory (Enterprise only) */
  overageActive?: boolean
  /** Compute cost in USD used beyond the base budget this month */
  overageComputeUsed?: number
  /** Remaining overage compute in USD before hard cap */
  overageComputeRemaining?: number
  /** True if the overage cap has been reached (hard block) */
  overageCapHit?: boolean
  /** Stripe subscription item ID for metered overage reporting */
  stripeOverageItemId?: string
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
    const costBudget = plan.limits.maxComputeBudgetUsd
    const currentCost = usage.totalCostUsd

    // SECURITY: Dual-limit check — deny if EITHER task count or cost budget is exceeded.
    // Task count prevents "death by a thousand paper cuts" (many cheap calls).
    // Cost budget prevents "one expensive call blows the budget" (e.g., heavy Opus usage).
    const taskLimitHit = currentUsage >= limit
    const costLimitHit = currentCost >= costBudget

    if (taskLimitHit || costLimitHit) {
      // DECISION: Enterprise tier gets overage billing instead of hard block on cost limit.
      // When cost budget is exceeded but task limit is not, Enterprise users can continue
      // at a premium rate (2.5x markup) up to a monthly overage cap ($600 compute).
      if (costLimitHit && !taskLimitHit && tier === 'enterprise') {
        const overageUsed = Math.max(0, currentCost - costBudget)
        const overageCap = ENTERPRISE_OVERAGE_CONFIG.maxOverageComputeUsd

        // Check if overage cap has been reached
        if (overageUsed >= overageCap) {
          return {
            allowed: false,
            currentUsage,
            limit,
            remaining: 0,
            tier,
            message: 'You\'ve reached your monthly overage cap. Contact sales for custom capacity.',
            currentCostUsd: currentCost,
            costBudgetUsd: costBudget,
            overageCapHit: true,
            overageComputeUsed: overageUsed,
            overageComputeRemaining: 0,
          }
        }

        // SECURITY: Fail-closed — check for un-reported overage charges.
        // If prior Stripe reporting failed, we must flush the queue before
        // allowing more overage compute to prevent giving away free resources.
        const hasPending = await hasPendingOverageReports(foundryId)
        if (hasPending) {
          const flushed = await flushPendingOverageReports(foundryId)
          if (!flushed) {
            return {
              allowed: false,
              currentUsage,
              limit,
              remaining: 0,
              tier,
              message: 'Unable to process overage billing. Please try again shortly.',
              currentCostUsd: currentCost,
              costBudgetUsd: costBudget,
              overageActive: true,
              overageComputeUsed: overageUsed,
              overageComputeRemaining: overageCap - overageUsed,
            }
          }
        }

        // Look up metered subscription item for Stripe reporting
        const overageItemId = await getOverageSubscriptionItemId(foundryId)
        if (!overageItemId) {
          // GOTCHA: Enterprise user without metered component — shouldn't happen
          // in normal flow, but possible for Enterprise users who subscribed before
          // the overage feature was added. Fall through to standard hard block.
          console.warn('[AILimitCheck] Enterprise user missing overage item, hard-blocking:', { foundryId })
          return {
            allowed: false,
            currentUsage,
            limit,
            remaining: 0,
            tier,
            message: 'You\'ve reached your monthly AI compute budget. Please contact support to enable overage billing.',
            currentCostUsd: currentCost,
            costBudgetUsd: costBudget,
          }
        }

        // ALLOW with overage — caller must report usage to Stripe after the AI call
        return {
          allowed: true,
          currentUsage,
          limit,
          remaining: 0,
          tier,
          currentCostUsd: currentCost,
          costBudgetUsd: costBudget,
          overageActive: true,
          overageComputeUsed: overageUsed,
          overageComputeRemaining: overageCap - overageUsed,
          stripeOverageItemId: overageItemId,
        }
      }

      // SECURITY: Cost budget is a hard ceiling — bonus credits cannot bypass it.
      // Bonus credits only help with task count limits, not cost overruns.
      // Without this guard, a user could use bonus credits to make unlimited
      // expensive calls (one credit per call regardless of cost).
      if (costLimitHit) {
        const upgradeHint = tier === 'free'
          ? 'Upgrade to Seed (£19/mo) for more capacity'
          : tier === 'seed'
            ? 'Upgrade to Startup Team (£49/mo) for more capacity'
            : tier === 'starter'
              ? 'Upgrade to Professional (£149/mo) for more capacity'
              : tier === 'professional'
                ? 'Upgrade to Enterprise (£499/mo) for more capacity'
                : 'Contact sales for custom capacity'
        return {
          allowed: false,
          currentUsage,
          limit,
          remaining: 0,
          tier,
          message: `You've reached your monthly AI compute budget. ${upgradeHint}.`,
          currentCostUsd: currentCost,
          costBudgetUsd: costBudget,
        }
      }

      // FLOW: Task limit hit — check if the foundry has bonus referral credits
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
              currentCostUsd: currentCost,
              costBudgetUsd: costBudget,
            }
          }
        }
      } catch (bonusError) {
        // Non-critical — fall through to deny
        console.warn('[AILimitCheck] Bonus credit check failed:', bonusError)
      }

      const upgradeHint = tier === 'free'
        ? 'Upgrade to Seed (£19/mo) for 250 tasks'
        : tier === 'seed'
          ? 'Upgrade to Startup Team (£49/mo) for 750 tasks'
          : tier === 'starter'
            ? 'Upgrade to Professional (£149/mo) for 2,500 tasks'
            : tier === 'professional'
              ? 'Upgrade to Enterprise (£499/mo) for 10,000 tasks'
              : 'Contact sales'
      return {
        allowed: false,
        currentUsage,
        limit,
        remaining: 0,
        tier,
        message: `You've reached your monthly AI limit of ${limit} tasks. Invite a friend to get 10 more, or ${upgradeHint.toLowerCase()}.`,
        currentCostUsd: currentCost,
        costBudgetUsd: costBudget,
      }
    }

    return {
      allowed: true,
      currentUsage,
      limit,
      remaining,
      tier,
      currentCostUsd: currentCost,
      costBudgetUsd: costBudget,
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

// ==========================================
// DAILY FEATURE CAPS
// ==========================================

/**
 * Daily caps per feature by subscription tier.
 * Only features with explicit caps are listed — uncapped features
 * fall through to the monthly task limit instead.
 */
const DAILY_FEATURE_CAPS: Record<string, Partial<Record<SubscriptionTier, number>>> = {
  specialist_text:        { free: 5, seed: 10, starter: 15 },
  cad_lab_generate:       { free: 1, seed: 3, starter: 5 },
  cad_lab_generate_module:{ free: 1, seed: 3, starter: 5 },
  // Red team debates are not available on free tier (no daily cap needed — handled by specialist gating)
  business_plan_analysis: { free: 1, seed: 2, starter: 3 },
  xray:                   { free: 1, seed: 2, starter: 3 },
  strategic_briefing:     { free: 1, seed: 2, starter: 2 },
}

/** Monthly caps for NEW investor detail views per tier. null = unlimited. */
export const MONTHLY_INVESTOR_VIEW_CAPS: Partial<Record<SubscriptionTier, number>> = {
  free: 15,
  seed: 50,
  starter: 200,
  // professional and enterprise: no entry = unlimited
}

/** Maximum investor detail views per day regardless of tier/bonuses (anti-scraping) */
export const MAX_DAILY_INVESTOR_VIEWS = 50

/** Result of a daily feature cap check */
export interface DailyCapCheckResult {
  allowed: boolean
  todayUsage: number
  dailyCap: number | null
  message?: string
}

/**
 * Check whether a foundry has remaining daily capacity for a specific feature.
 *
 * @description Enforces per-feature daily caps for lower tiers to prevent
 * expensive features from burning through the monthly budget too quickly.
 * Professional and Enterprise tiers have no daily caps.
 *
 * @param foundryId - The foundry making the call
 * @param feature - The AI feature being used
 * @param tier - The foundry's subscription tier
 * @returns Check result with allowed/denied status
 */
export async function checkDailyFeatureCap(
  foundryId: string,
  feature: string,
  tier: SubscriptionTier,
): Promise<DailyCapCheckResult> {
  // Professional and Enterprise have no daily caps
  if (tier === 'professional' || tier === 'enterprise') {
    return { allowed: true, todayUsage: 0, dailyCap: null }
  }

  const featureCaps = DAILY_FEATURE_CAPS[feature]
  if (!featureCaps) {
    // Feature has no daily cap — rely on monthly limit
    return { allowed: true, todayUsage: 0, dailyCap: null }
  }

  const cap = featureCaps[tier]
  if (cap === undefined) {
    return { allowed: true, todayUsage: 0, dailyCap: null }
  }

  try {
    const adminSupabase = createAdminClient()
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count, error } = await adminSupabase
      .from('ai_usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('feature', feature)
      .gte('created_at', todayStart.toISOString())

    if (error) {
      console.warn('[DailyCapCheck] Query error, allowing:', error.message)
      // DECISION: Fail open for daily caps (they are a soft limit, not a security control).
      // The monthly budget is the hard ceiling; daily caps are UX smoothing.
      return { allowed: true, todayUsage: 0, dailyCap: cap }
    }

    const todayUsage = count ?? 0
    if (todayUsage >= cap) {
      return {
        allowed: false,
        todayUsage,
        dailyCap: cap,
        message: `You've reached the daily limit of ${cap} for this feature. Limits reset at midnight UTC.`,
      }
    }

    return { allowed: true, todayUsage, dailyCap: cap }
  } catch (error) {
    console.warn('[DailyCapCheck] Error:', error)
    // Fail open — daily caps are UX smoothing, not a security control
    return { allowed: true, todayUsage: 0, dailyCap: cap }
  }
}

