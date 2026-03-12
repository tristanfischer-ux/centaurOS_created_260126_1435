/**
 * @file AI Feature Gate for Server Actions
 *
 * @description Combines `withAuth` authentication with AI usage limit
 * enforcement. Wraps server actions so they check the foundry's monthly
 * AI task quota before executing, and provides a `trackUsage` callback
 * to log consumption after the AI call completes.
 *
 * @security Primary cost control gate for all AI-consuming server actions.
 * Prevents free/lower-tier users from exceeding their allocation.
 *
 * @dependencies
 * - src/lib/server-action-utils.ts (withAuth, AuthContext)
 * - src/lib/ai/limit-check.ts (checkAILimit)
 * - src/lib/ai/usage-tracking.ts (trackAIUsage, AIFeature)
 */

import { withAuth } from '@/lib/server-action-utils'
import type { AuthContext } from '@/lib/server-action-utils'
import { checkAILimit } from '@/lib/ai/limit-check'
import { trackAIUsage } from '@/lib/ai/usage-tracking'
import type { AIFeature } from '@/lib/ai/usage-tracking'

// ==========================================
// TYPES
// ==========================================

/** Extended auth context with AI usage tracking callback */
export interface AIGateContext extends AuthContext {
  /**
   * Track AI usage after the call completes.
   * Call this with token counts / cost from the AI response.
   */
  trackUsage: (params: {
    model?: string
    promptTokens?: number
    completionTokens?: number
    estimatedCostUsd?: number
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

// ==========================================
// GATE WRAPPER
// ==========================================

/**
 * Gate a server action behind AI usage limits and track consumption.
 *
 * @description Authenticates the user (via `withAuth`), checks their
 * foundry's monthly AI task quota (via `checkAILimit`), and provides a
 * `trackUsage` callback for post-call logging. If the limit is exceeded,
 * returns `{ error, limitReached: true }` so callers can show an upgrade
 * prompt.
 *
 * @param feature - Which AI feature is being used (must be in AIFeature union)
 * @param action - The action handler that receives the gated context
 * @returns The action result, or an error if auth/limit checks fail
 *
 * @throws Never throws - all errors returned as `{ error: string }`
 *
 * @security Blocks AI calls once the monthly quota is exhausted.
 *
 * @example
 * ```ts
 * export async function analyzeObjective(objectiveId: string) {
 *   return withAIGate('analyze', async ({ supabase, user, foundryId, trackUsage }) => {
 *     const result = await callAI(...)
 *     await trackUsage({ model: 'gpt-4o', promptTokens: 500, completionTokens: 200 })
 *     return { success: true, data: result }
 *   })
 * }
 * ```
 */
export async function withAIGate<T>(
  feature: AIFeature,
  action: (ctx: AIGateContext) => Promise<T>
): Promise<T> {
  return withAuth(async (authCtx) => {
    // SECURITY: Check AI usage limit before executing the action
    const limitCheck = await checkAILimit(authCtx.foundryId)

    if (!limitCheck.allowed) {
      return {
        error: limitCheck.message ?? 'AI usage limit reached. Please upgrade your plan.',
        limitReached: true,
      } as T
    }

    // Create tracking callback bound to this request's context
    const trackUsage = async (params: {
      model?: string
      promptTokens?: number
      completionTokens?: number
      estimatedCostUsd?: number
      metadata?: Record<string, unknown>
    }) => {
      // AUDIT: Log AI usage for cost tracking and tier enforcement
      await trackAIUsage({
        foundryId: authCtx.foundryId,
        userId: authCtx.user.id,
        feature,
        model: params.model,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        estimatedCostUsd: params.estimatedCostUsd,
        metadata: params.metadata,
      })
    }

    // Execute the action with the extended context
    return await action({ ...authCtx, trackUsage })
  })
}
