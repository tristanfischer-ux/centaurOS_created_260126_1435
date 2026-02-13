/**
 * @file AI Usage Tracking Service
 *
 * @description Centralized tracking of AI API usage per foundry/user.
 * Logs individual API calls with token counts and estimated costs,
 * maintains monthly aggregates for tier-based limit enforcement,
 * and provides usage queries for the billing UI.
 *
 * @security All operations use SECURITY DEFINER RPC functions in Supabase.
 * RLS ensures users can only view usage within their own foundry.
 *
 * @dependencies
 * - Supabase: ai_usage_log, ai_usage_monthly tables
 * - increment_ai_usage() RPC function
 * - get_ai_usage_current_month() RPC function
 */

import { createClient } from '@/lib/supabase/server'

// ==========================================
// TYPES
// ==========================================

/** AI features that can be tracked */
export type AIFeature =
  | 'ghost_agent'
  | 'voice_to_task'
  | 'voice_to_rfq'
  | 'ai_search'
  | 'centaur_matcher'
  | 'comparison_assistant'
  | 'advisory_answers'
  | 'coverage_assessment'
  | 'business_plan_analysis'
  | 'talent_match'
  | 'specialist_tts'
  | 'specialist_stt'
  | 'specialist_voice'    // Tier 2: Real-time voice session
  | 'specialist_avatar'   // Tier 3/4: Avatar video session
  | 'other'

/** Conversation modes that can be tracked alongside features */
export type ConversationModeTracking = 'text' | 'voice' | 'avatar'

/** Parameters for tracking an AI API call */
export interface TrackAIUsageParams {
  foundryId: string
  userId: string
  feature: AIFeature
  model?: string
  promptTokens?: number
  completionTokens?: number
  estimatedCostUsd?: number
  /** Duration in seconds (for voice/avatar sessions) */
  durationSeconds?: number
  /** Conversation mode used (text, voice, avatar) */
  conversationMode?: ConversationModeTracking
  metadata?: Record<string, unknown>
}

/** Result from tracking, includes current monthly totals */
export interface TrackAIUsageResult {
  monthlyTaskCount: number
  monthlyCostUsd: number
}

/** Current month usage for a foundry */
export interface MonthlyUsage {
  totalAiTasks: number
  totalTokens: number
  totalCostUsd: number
}

// ==========================================
// COST ESTIMATION
// ==========================================

/**
 * Estimated cost per 1M tokens for common models (USD).
 * Updated Feb 2026. Check OpenAI pricing page for current rates.
 */
const MODEL_COSTS_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'whisper-1': { input: 0.006, output: 0 }, // per second, approximated
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
  'claude-haiku-4-5': { input: 0.80, output: 4.00 },
  // MiniMax models — dramatically cheaper than OpenAI/Anthropic
  // M2.5 (50 TPS): $0.15 input / $1.20 output per 1M tokens
  // M2.5-lightning (100 TPS): $0.30 input / $2.40 output per 1M tokens
  // Pricing: https://www.minimax.io/news/minimax-m25
  'MiniMax-M2.5': { input: 0.15, output: 1.20 },
  'MiniMax-M2.5-lightning': { input: 0.30, output: 2.40 },
  'MiniMax-M2.1': { input: 0.30, output: 1.20 },
  'MiniMax-M2.1-lightning': { input: 0.30, output: 2.40 },
} as const

/**
 * Cost per minute for real-time features (USD).
 * Used for voice/avatar sessions which are billed by duration, not tokens.
 */
const REALTIME_COSTS_PER_MINUTE: Record<string, number> = {
  // OpenAI Realtime API (audio input + output combined)
  'gpt-4o-realtime-preview': 0.30,       // ~$0.06 input + $0.24 output
  'gpt-4o-mini-realtime-preview': 0.10,   // ~$0.02 input + $0.08 output
  // Avatar providers
  'heygen-streaming': 0.07,
  'simli-streaming': 0.03,
  'tavus-streaming': 0.10,
} as const

/**
 * Estimate the cost of a real-time voice or avatar session.
 *
 * @param durationSeconds - Session duration in seconds
 * @param voiceModel - The real-time voice model used
 * @param avatarProvider - Optional avatar provider name
 * @returns Estimated cost in USD
 */
export function estimateRealtimeCost(
  durationSeconds: number,
  voiceModel: string = 'gpt-4o-mini-realtime-preview',
  avatarProvider?: string
): number {
  const minutes = durationSeconds / 60
  const voiceCost = (REALTIME_COSTS_PER_MINUTE[voiceModel] ?? 0.10) * minutes
  const avatarCost = avatarProvider
    ? (REALTIME_COSTS_PER_MINUTE[avatarProvider] ?? 0.07) * minutes
    : 0
  return Number((voiceCost + avatarCost).toFixed(6))
}

/**
 * Estimate the cost of an AI API call based on token counts and model.
 *
 * @param model - The AI model used (e.g. 'gpt-4o')
 * @param promptTokens - Number of input/prompt tokens
 * @param completionTokens - Number of output/completion tokens
 * @returns Estimated cost in USD
 */
export function estimateAICost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const costs = MODEL_COSTS_PER_1M_TOKENS[model] || MODEL_COSTS_PER_1M_TOKENS['gpt-4o']
  const inputCost = (promptTokens / 1_000_000) * costs.input
  const outputCost = (completionTokens / 1_000_000) * costs.output
  return Number((inputCost + outputCost).toFixed(6))
}

// ==========================================
// TRACKING
// ==========================================

/**
 * Track an AI API call and increment monthly usage counters.
 *
 * @description Logs the call to ai_usage_log and atomically increments
 * the monthly aggregate in ai_usage_monthly via the increment_ai_usage RPC.
 * Returns the updated monthly totals for immediate limit checking.
 *
 * @param params - Tracking parameters including foundry, user, feature, tokens
 * @returns Current monthly task count and cost, or null on error
 *
 * @throws Never throws - returns null on error to avoid blocking AI features
 * @audit Logs AI usage for cost tracking and tier enforcement
 */
export async function trackAIUsage(
  params: TrackAIUsageParams
): Promise<TrackAIUsageResult | null> {
  try {
    const supabase = await createClient()

    const model = params.model || 'gpt-4o'
    const promptTokens = params.promptTokens || 0
    const completionTokens = params.completionTokens || 0
    const estimatedCost = params.estimatedCostUsd
      ?? estimateAICost(model, promptTokens, completionTokens)

    const { data, error } = await supabase.rpc('increment_ai_usage', {
      p_foundry_id: params.foundryId,
      p_user_id: params.userId,
      p_feature: params.feature,
      p_model: model,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
      p_estimated_cost_usd: estimatedCost,
      p_metadata: (params.metadata || {}) as Record<string, string | number | boolean>,
    })

    if (error) {
      console.error('[AIUsageTracking] Failed to track usage:', {
        feature: params.feature,
        foundryId: params.foundryId,
        error: error.message,
      })
      return null
    }

    // RPC returns array with single row
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return null

    return {
      monthlyTaskCount: row.monthly_task_count,
      monthlyCostUsd: Number(row.monthly_cost),
    }
  } catch (error) {
    console.error('[AIUsageTracking] Unexpected error:', {
      feature: params.feature,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

// ==========================================
// QUERIES
// ==========================================

/**
 * Get the current month's AI usage for a foundry.
 *
 * @param foundryId - The foundry to check
 * @returns Monthly usage totals, or defaults if no usage recorded
 */
export async function getCurrentMonthUsage(
  foundryId: string
): Promise<MonthlyUsage> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_ai_usage_current_month', {
      p_foundry_id: foundryId,
    })

    if (error || !data) {
      console.error('[AIUsageTracking] Failed to get monthly usage:', {
        foundryId,
        error: error?.message,
      })
      return { totalAiTasks: 0, totalTokens: 0, totalCostUsd: 0 }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      return { totalAiTasks: 0, totalTokens: 0, totalCostUsd: 0 }
    }

    return {
      totalAiTasks: row.total_ai_tasks ?? 0,
      totalTokens: row.total_tokens ?? 0,
      totalCostUsd: Number(row.total_cost_usd ?? 0),
    }
  } catch (error) {
    console.error('[AIUsageTracking] Unexpected error getting usage:', {
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { totalAiTasks: 0, totalTokens: 0, totalCostUsd: 0 }
  }
}
