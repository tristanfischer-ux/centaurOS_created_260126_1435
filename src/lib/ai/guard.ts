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

interface AIGuardResult {
  /** Whether the request was denied (limit exceeded or auth failed) */
  denied: boolean
  /** Pre-built NextResponse to return if denied */
  response: NextResponse
  /** The authenticated user ID */
  userId: string
  /** The user's foundry ID (may be null) */
  foundryId: string | null
  /**
   * Track usage after the AI call completes.
   * Call this with token counts from the OpenAI response.
   */
  trackUsage: (params: {
    model?: string
    promptTokens?: number
    completionTokens?: number
    estimatedCostUsd?: number
    metadata?: Record<string, unknown>
  }) => Promise<void>
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

  // Check AI limit if user has a foundry
  if (foundryId) {
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
  }

  // Create tracking callback
  const trackUsageFn = async (params: {
    model?: string
    promptTokens?: number
    completionTokens?: number
    estimatedCostUsd?: number
    metadata?: Record<string, unknown>
  }) => {
    if (!foundryId) return

    // AUDIT: Log AI usage for cost tracking
    await trackAIUsage({
      foundryId,
      userId: user.id,
      feature,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      estimatedCostUsd: params.estimatedCostUsd,
      metadata: params.metadata,
    })
  }

  return {
    denied: false,
    response: NextResponse.json({}), // unused when not denied
    userId: user.id,
    foundryId,
    trackUsage: trackUsageFn,
  }
}
