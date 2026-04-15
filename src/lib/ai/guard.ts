/**
 * @file AI Feature Guard
 *
 * @description Convenience helper that combines auth, limit check, and usage
 * tracking for AI API routes. Reduces boilerplate in each route handler.
 *
 * Usage pattern:
 * ```ts
 * const guard = await aiGuard(supabase, 'voice_to_task')
 * if (guard.denied) return guard.response
 *
 * // ... make AI call ...
 *
 * await guard.trackUsage({ promptTokens: 100, completionTokens: 200 })
 * ```
 *
 * @security Primary gate for AI cost control. Combines subscription tier
 * limits with per-foundry monthly usage counters.
 */

import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { checkAILimit } from '@/lib/ai/limit-check'
import { trackAIUsage } from '@/lib/ai/usage-tracking'
import type { AIFeature } from '@/lib/ai/usage-tracking'
import { reportOverageToStripe } from '@/lib/billing/overage'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'

/** Shared params for trackUsage callback */
interface TrackUsageParams {
  model?: string
  promptTokens?: number
  completionTokens?: number
  estimatedCostUsd?: number
  metadata?: Record<string, unknown>
}

/**
 * Discriminated union: when denied=false, foundryId is guaranteed non-null.
 * This lets TypeScript narrow the type after `if (guard.denied) return guard.response`.
 */
type AIGuardResult =
  | {
      denied: true
      response: NextResponse
      userId: string
      foundryId: string | null
      trackUsage: (params: TrackUsageParams) => Promise<void>
    }
  | {
      denied: false
      userId: string
      /** Guaranteed non-null when denied=false */
      foundryId: string
      trackUsage: (params: TrackUsageParams) => Promise<void>
      /** True if this call is in overage territory (Enterprise only) */
      overageActive: boolean
      /** Remaining overage compute in USD before hard cap */
      overageComputeRemaining?: number
    }

/**
 * Gate an AI feature behind subscription limits and track usage.
 *
 * @description Authenticates the user, checks their foundry's AI limit,
 * and returns a tracking callback. If the limit is exceeded, returns
 * a pre-built 429 response.
 *
 * @param supabase - Authenticated Supabase client
 * @param feature - Which AI feature is being used
 * @returns Guard result with denied status and tracking callback
 */
export async function aiGuard(
  supabase: SupabaseClient,
  feature: AIFeature
): Promise<AIGuardResult> {
  // AUTH: Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      denied: true,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      userId: '',
      foundryId: null,
      trackUsage: async () => {},
    }
  }

  // Get user's foundry
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  const foundryId = profile?.foundry_id as string | null

  // SECURITY: Require foundry membership for AI access
  if (!foundryId) {
    return {
      denied: true,
      response: NextResponse.json(
        { error: 'You must belong to a foundry to use AI features.' },
        { status: 403 }
      ),
      userId: user.id,
      foundryId: null,
      trackUsage: async () => {},
    }
  }

  // Check AI limit
  const limitCheck = await checkAILimit(foundryId)
  if (!limitCheck.allowed) {
    return {
      denied: true,
      response: NextResponse.json(
        {
          error: limitCheck.message,
          usage: {
            current: limitCheck.currentUsage,
            limit: limitCheck.limit,
            remaining: 0,
          },
        },
        { status: 429 }
      ),
      userId: user.id,
      foundryId,
      trackUsage: async () => {},
    }
  }

  // DECISION: Capture overage state from limit check for use in tracking callback.
  // If overageActive=true, the tracking callback will report compute cost to Stripe
  // after logging usage — this happens AFTER the AI call succeeds, so we only bill
  // for compute that was actually consumed.
  const overageActive = limitCheck.overageActive ?? false
  const overageItemId = limitCheck.stripeOverageItemId

  // Create tracking callback
  const trackUsageFn = async (params: TrackUsageParams) => {
    // AUDIT: Log AI usage for cost tracking
    const result = await trackAIUsage({
      foundryId,
      userId: user.id,
      feature,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      estimatedCostUsd: params.estimatedCostUsd,
      metadata: params.metadata,
    })

    // FLOW: If in overage, report the overage portion of this call's cost to Stripe.
    // Only the cost that exceeds the base budget gets billed as overage.
    if (overageActive && overageItemId && result) {
      const costBudget = SUBSCRIPTION_PLANS[limitCheck.tier].limits.maxComputeBudgetUsd
      const previousCost = (limitCheck.currentCostUsd ?? 0)
      const currentCost = result.monthlyCostUsd
      const estimatedCallCost = params.estimatedCostUsd ?? (currentCost - previousCost)

      // INTENT: Calculate what portion of THIS call is overage.
      // If the user was already $10 over budget before this call, the entire call is overage.
      // If the user was $5 under and this call costs $8, only $3 is overage.
      let overagePortion: number
      if (previousCost >= costBudget) {
        // Already fully in overage — entire call cost is overage
        overagePortion = estimatedCallCost
      } else {
        // Partially in overage — only the portion above budget
        overagePortion = Math.max(0, (previousCost + estimatedCallCost) - costBudget)
      }

      if (overagePortion > 0) {
        // Fire-and-forget with logging — don't block the response.
        // If reporting fails, it's queued and the next call will flush.
        reportOverageToStripe(overageItemId, overagePortion, foundryId, user.id).catch(err => {
          console.error('[aiGuard] Overage reporting error (non-blocking):', err)
        })
      }
    }
  }

  return {
    denied: false as const,
    userId: user.id,
    foundryId,
    trackUsage: trackUsageFn,
    overageActive,
    overageComputeRemaining: limitCheck.overageComputeRemaining,
  }
}
