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

  // Create tracking callback
  const trackUsageFn = async (params: TrackUsageParams) => {
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
    denied: false as const,
    userId: user.id,
    foundryId,
    trackUsage: trackUsageFn,
  }
}
