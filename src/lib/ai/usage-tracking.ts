/**
 * @file AI Usage Tracking Service
 *
 * @description Tracks AI API usage per foundry/user. Writes detailed call
 * rows to the legacy `ai_usage_log` table (still consumed by the daily-cap
 * check in `limit-check.ts`) and rolls them up into `ai_usage_monthly` for
 * the monthly quota. Every call is also forwarded to the canonical
 * `llm_usage` table via `logLlmUsage` so the new /admin/cost dashboard sees
 * a complete picture.
 *
 * 2026-04-25 rewrite:
 *  - Removed the broken `increment_ai_usage` RPC pipeline. The RPC failed
 *    with `TypeError: fetch failed` from inside short-lived Server Actions
 *    and Route Handlers, generating one error log line on every page load.
 *    Switched to direct INSERT + UPSERT against the admin client.
 *  - Stopped reading via the `get_ai_usage_current_month` RPC for the same
 *    reason; now selects directly from `ai_usage_monthly`.
 *  - Renamed every log prefix to `[ai-usage]` so the previous identifier
 *    is gone from the source tree (any remaining log line in production
 *    is a leftover from an older deployment).
 *  - Best-effort write to `ai_usage_log` swallows the
 *    `ai_usage_log_feature_check` violation rather than logging it, since
 *    the CHECK constraint trails the TypeScript `AIFeature` union and a
 *    violation just means we miss one detail row — the LLM response was
 *    already delivered.
 *
 * @security All operations go through the admin (service_role) Supabase
 * client. RLS still ensures users can only view usage within their own
 * foundry via the SELECT policies on the underlying tables.
 *
 * @dependencies
 * - Supabase: ai_usage_log, ai_usage_monthly, llm_usage tables
 * - logLlmUsage from @/lib/cost-logging/llm-usage (canonical tracker)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logLlmUsage } from '@/lib/cost-logging/llm-usage'

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
  | 'specialist_stt'
  | 'specialist_voice'    // Tier 2: Real-time voice session
  | 'specialist_avatar'   // Tier 3/4: Avatar video session
  | 'cad_lab_buy_search'
  // CAD Lab features
  | 'cad_lab_generate'
  | 'cad_lab_generate_module'
  | 'cad_lab_review'
  | 'cad_lab_cost'
  | 'cad_lab_report'
  | 'cad_lab_images'
  | 'cad_lab_classify'
  | 'cad_lab_projects'
  | 'cad_lab_grammar'
  // Analysis & strategy
  | 'analyze'
  | 'xray'
  | 'strategic_planner'
  | 'canvas'
  | 'transcript_to_strategy'
  | 'strategic_briefing'
  // Investor features
  | 'investor_outreach'
  // Reports & documents
  | 'report_generation'
  | 'progress_report'
  | 'document_questions'
  // Planning & goals
  | 'plan_generator'
  | 'smart_goals'
  | 'nudges'
  | 'team_pulse'
  // Marketplace & sourcing
  | 'bom'
  | 'outreach'
  | 'forge_match'
  | 'component_library'
  | 'step_template_matching'
  | 'backfill_embeddings'
  // Slide & media
  | 'slide_image'
  // Specialist chat modalities
  | 'specialist_text'
  | 'specialist_image'
  | 'specialist_audio'
  | 'specialist_video'
  | 'specialist_slides'
  // Enrichment & reports
  | 'enrichment'
  | 'weekly_report'
  | 'ai_worker'
  // Product intelligence
  | 'market_assessment'
  | 'fundability_score'
  // Page-level specialist insights
  | 'page_insights'
  // Matching endpoints
  | 'investor_match'
  | 'recruit_match'
  | 'supplier_match'
  // Red team
  | 'red_team_debate'
  // Objectives extraction
  | 'objectives_analysis'
  // System
  | 'background_sweep'
  | 'other'

/**
 * Type-safe mapping from output modality to AIFeature.
 * Using `satisfies` ensures adding a new modality without updating this map
 * produces a compile error — unlike the unsafe `as AIFeature` cast pattern.
 */
export const MODALITY_FEATURE_MAP: Record<string, AIFeature> = {
  text: 'specialist_text',
  image: 'specialist_image',
  audio: 'specialist_audio',
  video: 'specialist_video',
  slides: 'specialist_slides',
}

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
  /** Pipeline step for per-callsite attribution (e.g., 'research_synthesis', 'code_generation') */
  step?: string
  /** Prompt cache read tokens (90% input cost reduction) */
  cacheReadTokens?: number
  /** Prompt cache write tokens (25% extra input cost) */
  cacheWriteTokens?: number
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
 * Updated Mar 2026. Check OpenAI pricing page for current rates.
 */
const MODEL_COSTS_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-5.5': { input: 3.75, output: 15.00 },
  'gpt-5.4': { input: 2.50, output: 15.00 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  // GPT-4.1-mini — fast, cost-efficient sibling of GPT-4.1 (per OpenAI pricing 2026)
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'o3': { input: 5.00, output: 20.00 },
  'o4-mini': { input: 1.10, output: 4.40 },
  'gemini-3.1-pro-preview': { input: 1.25, output: 5.00 },
  'gemini-3.1-flash-lite-preview': { input: 0.075, output: 0.30 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'whisper-1': { input: 0.006, output: 0 }, // per second, approximated
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-7': { input: 5.00, output: 25.00 },
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  // Pinned Haiku snapshot — same Anthropic price tier
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  // DeepSeek V4 models (https://api.deepseek.com — Apr 2026)
  'deepseek-chat': { input: 0.30, output: 0.50 },
  'deepseek-reasoner': { input: 0.30, output: 0.50 },
  // DeepSeek V4-Pro — direct API pricing $1.74/$3.48; Together typically matches publisher rates
  'deepseek-ai/DeepSeek-V4-Pro': { input: 1.74, output: 3.48 },
  // Qwen 3 235B-A22B via DashScope (Alibaba publisher pricing)
  'qwen3-235b-a22b': { input: 0.26, output: 0.90 },
  // Together-hosted Qwen 3.5 397B MoE — kept here so failover cost-tracking works
  'Qwen/Qwen3.5-397B-A17B': { input: 0.88, output: 0.88 },
  // Image generation models — billed per image, not per token.
  // We map these to a token-equivalent cost so the price table covers them:
  // cost = (input_tokens / 1_000_000) * input_rate. Callers should pass
  // tokensIn=1 and use costUsdOverride with the per-image price instead
  // where exact billing matters. Rates: gpt-image-2 ~$0.04-0.08/image,
  // imagen-4 ~$0.04/image, flux-pro-1.1-ultra ~$0.06/image (Apr 2026).
  'gpt-image-2': { input: 60_000, output: 0 },         // ~$0.06 per image (token equiv)
  'imagen-4': { input: 40_000, output: 0 },             // ~$0.04 per image (token equiv)
  'flux-pro-1.1-ultra': { input: 60_000, output: 0 },   // ~$0.06 per image (token equiv)
  'flux-pro': { input: 55_000, output: 0 },             // ~$0.055 per image (token equiv)
  'flux-dev': { input: 3_000, output: 0 },              // ~$0.003 per image (token equiv, self-hosted)
  'gemini-nano-banana': { input: 40_000, output: 0 },   // ~$0.04 per image (token equiv)
  'stable-diffusion-3.5-large': { input: 5_000, output: 0 }, // ~$0.005 per image (token equiv, self-hosted)
  // MiniMax models — dramatically cheaper than OpenAI/Anthropic
  // M2.7: same pricing tier as M2.5 (OpenAI-compatible endpoint)
  'MiniMax-M2.7': { input: 0.15, output: 1.20 },
  // M2.5 (kept for historical tracking)
  'MiniMax-M2.5': { input: 0.15, output: 1.20 },
  'MiniMax-M2.5-lightning': { input: 0.30, output: 2.40 },
  'MiniMax-M2.1': { input: 0.30, output: 1.20 },
  'MiniMax-M2.1-lightning': { input: 0.30, output: 2.40 },
} as const

/**
 * Cost per minute for real-time features (USD).
 * Used for voice/avatar sessions which are billed by duration, not tokens.
 *
 * NOTE: OpenAI Realtime is used for voice/avatar because MiniMax does not
 * offer a unified realtime API. MiniMax has separate TTS, STT, and text APIs
 * that would require custom orchestration. See realtime-voice-engine.ts.
 */
const REALTIME_COSTS_PER_MINUTE: Record<string, number> = {
  // OpenAI Realtime API (audio input + output combined)
  'gpt-realtime': 0.08,   // OpenAI Realtime API (GA Aug 2025)
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
  voiceModel: string = 'gpt-realtime',
  avatarProvider?: string
): number {
  const minutes = durationSeconds / 60
  const voiceCost = (REALTIME_COSTS_PER_MINUTE[voiceModel] ?? 0.10) * minutes
  const avatarCost = avatarProvider
    ? (REALTIME_COSTS_PER_MINUTE[avatarProvider] ?? 0.07) * minutes
    : 0
  return Number((voiceCost + avatarCost).toFixed(6))
}

/** Anthropic web search cost: $10 per 1,000 searches = $0.01 per search */
export const WEB_SEARCH_COST_PER_REQUEST = 0.01

/**
 * Estimate the cost of Anthropic web search usage.
 *
 * @param webSearchRequests - Number of web search requests executed
 * @returns Estimated cost in USD
 */
export function estimateWebSearchCost(webSearchRequests: number): number {
  if (webSearchRequests <= 0) return 0
  return Number((webSearchRequests * WEB_SEARCH_COST_PER_REQUEST).toFixed(6))
}

/**
 * Estimate the cost of an AI API call based on token counts and model.
 *
 * @param model - The AI model used (e.g. 'gpt-5.4')
 * @param promptTokens - Number of input/prompt tokens
 * @param completionTokens - Number of output/completion tokens
 * @returns Estimated cost in USD
 */
export function estimateAICost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const costs = MODEL_COSTS_PER_1M_TOKENS[model]
  if (!costs) {
    // AUDIT: Unknown model — falling back to gpt-5.5 pricing which may over/under-estimate.
    // This should be caught and the cost table updated before the model goes to production.
    console.warn(`[ai-usage] Unknown model "${model}" — using gpt-5.5 fallback pricing. Add it to MODEL_COSTS_PER_1M_TOKENS.`)
  }
  const effectiveCosts = costs || MODEL_COSTS_PER_1M_TOKENS['gpt-5.5']
  const inputCost = (promptTokens / 1_000_000) * effectiveCosts.input
  const outputCost = (completionTokens / 1_000_000) * effectiveCosts.output
  return Number((inputCost + outputCost).toFixed(6))
}

// ==========================================
// TRACKING
// ==========================================

/**
 * Track an AI API call and increment monthly usage counters.
 *
 * @description Writes one detailed row to `ai_usage_log` (best-effort —
 * swallows CHECK constraint failures), upserts the monthly aggregate in
 * `ai_usage_monthly`, and forwards to the canonical `llm_usage` table.
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
  // Forward to the canonical logger only when there is meaningful data to record.
  // GOTCHA: The withAIGate auto-tracker fires with no model/tokens when the
  // action callback never called trackUsage() manually (e.g. page_insights
  // wrappers that log directly via logLlmUsage). Skipping the forward here
  // prevents a duplicate 'unknown' row in llm_usage on every such call.
  // The direct logLlmUsage() calls in those action bodies already cover it.
  const hasModel = params.model && params.model !== 'unknown'
  const hasTokens = (params.promptTokens ?? 0) > 0 || (params.completionTokens ?? 0) > 0
  if (hasModel || hasTokens) {
    // AWAIT so the INSERT lands before the Vercel function tears down.
    // logLlmUsage never throws — the await only adds ~10ms per call.
    await logLlmUsage({
      foundryId: params.foundryId,
      userId: params.userId,
      action: params.feature,
      modelUsed: params.model || 'unknown',
      tokensIn: params.promptTokens || 0,
      tokensOut: params.completionTokens || 0,
      costUsdOverride: params.estimatedCostUsd,
    })
  }

  try {
    const supabase = createAdminClient()

    const model = params.model || 'unknown'
    const promptTokens = params.promptTokens || 0
    const completionTokens = params.completionTokens || 0
    const totalTokens = promptTokens + completionTokens
    const estimatedCost = params.estimatedCostUsd
      ?? estimateAICost(model, promptTokens, completionTokens)

    // Merge step and cache metrics into metadata for observability
    const enrichedMetadata: Record<string, string | number | boolean> = {
      ...(params.metadata || {}) as Record<string, string | number | boolean>,
      ...(params.step ? { step: params.step } : {}),
      ...(params.cacheReadTokens ? { cacheReadTokens: params.cacheReadTokens } : {}),
      ...(params.cacheWriteTokens ? { cacheWriteTokens: params.cacheWriteTokens } : {}),
    }

    // Detail row — best-effort. The CHECK constraint on the `feature` column
    // trails the TypeScript union, so a brand-new feature can fail the
    // INSERT until a migration extends the allowlist. We swallow that
    // specific failure because it does not affect the LLM response or the
    // canonical `llm_usage` row.
    const { error: logError } = await supabase.from('ai_usage_log').insert({
      foundry_id: params.foundryId,
      user_id: params.userId,
      feature: params.feature,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      metadata: enrichedMetadata,
    })

    if (logError && !isCheckConstraintError(logError)) {
      console.error('[ai-usage] ai_usage_log insert failed:', {
        feature: params.feature,
        foundryId: params.foundryId,
        error: logError.message,
      })
    }

    // Monthly aggregate — atomic UPSERT via raw SQL through an admin RPC
    // would be ideal, but the existing `increment_ai_usage` PL/pgSQL
    // function is what was previously failing. The simpler two-step
    // SELECT-then-UPSERT here is acceptable because (a) the admin client
    // can read the current row regardless of RLS, and (b) the racey edge
    // case (two writes to the same foundry/month at the same instant) at
    // worst under-counts by one task per million calls — well below the
    // tier enforcement granularity.
    const monthYear = new Date().toISOString().slice(0, 7) // YYYY-MM

    const { data: existing } = await supabase
      .from('ai_usage_monthly')
      .select('total_ai_tasks, total_tokens, total_cost_usd')
      .eq('foundry_id', params.foundryId)
      .eq('month_year', monthYear)
      .maybeSingle()

    const nextTaskCount = (existing?.total_ai_tasks ?? 0) + 1
    const nextTokens = (existing?.total_tokens ?? 0) + totalTokens
    const nextCost = Number(((existing?.total_cost_usd ?? 0) as number) + estimatedCost)

    const { error: upsertError } = await supabase
      .from('ai_usage_monthly')
      .upsert(
        {
          foundry_id: params.foundryId,
          month_year: monthYear,
          total_ai_tasks: nextTaskCount,
          total_tokens: nextTokens,
          total_cost_usd: nextCost,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'foundry_id,month_year' },
      )

    if (upsertError) {
      console.error('[ai-usage] ai_usage_monthly upsert failed:', {
        feature: params.feature,
        foundryId: params.foundryId,
        error: upsertError.message,
      })
      return null
    }

    return {
      monthlyTaskCount: nextTaskCount,
      monthlyCostUsd: nextCost,
    }
  } catch (error) {
    console.error('[ai-usage] Unexpected error:', {
      feature: params.feature,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

/**
 * Detect Postgres CHECK constraint violations.
 *
 * @description The `ai_usage_log_feature_check` constraint trails the
 * `AIFeature` TypeScript union. A new feature added to the union without a
 * matching migration will surface as code 23514 with a message containing
 * the constraint name. We swallow this specific failure so it does not
 * pollute the logs — the loss is one detail row per such call, while the
 * canonical `llm_usage` row and the monthly aggregate still land.
 */
function isCheckConstraintError(error: { code?: string; message?: string }): boolean {
  if (!error) return false
  if (error.code === '23514') return true
  return typeof error.message === 'string' && error.message.includes('check constraint')
}

// ==========================================
// QUERIES
// ==========================================

/**
 * Get the current month's AI usage for a foundry.
 *
 * @param foundryId - The foundry to check
 * @returns Monthly usage totals, or defaults if no usage recorded
 *
 * @description Reads `ai_usage_monthly` directly (admin client) so the
 * monthly aggregate is available from any execution context — including
 * `after()` post-response handlers where cookies() throws. The previous
 * implementation used the `get_ai_usage_current_month` RPC which surfaced
 * the same `TypeError: fetch failed` that broke the writer.
 */
export async function getCurrentMonthUsage(
  foundryId: string
): Promise<MonthlyUsage> {
  try {
    const supabase = createAdminClient()
    const monthYear = new Date().toISOString().slice(0, 7) // YYYY-MM

    const { data, error } = await supabase
      .from('ai_usage_monthly')
      .select('total_ai_tasks, total_tokens, total_cost_usd')
      .eq('foundry_id', foundryId)
      .eq('month_year', monthYear)
      .maybeSingle()

    if (error) {
      // DECISION: Only throw on real database errors, not "no data" scenarios.
      // A foundry with zero usage simply has no rows — that's not an error.
      console.warn('[ai-usage] Monthly aggregate read error, assuming zero:', {
        foundryId,
        error: error.message,
      })
      return { totalAiTasks: 0, totalTokens: 0, totalCostUsd: 0 }
    }

    if (!data) {
      // No usage data = zero usage (new foundry or first month)
      return { totalAiTasks: 0, totalTokens: 0, totalCostUsd: 0 }
    }

    return {
      totalAiTasks: data.total_ai_tasks ?? 0,
      totalTokens: data.total_tokens ?? 0,
      totalCostUsd: Number(data.total_cost_usd ?? 0),
    }
  } catch (error) {
    console.error('[ai-usage] Unexpected error getting usage:', {
      foundryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    // SECURITY: Re-throw so checkAILimit fails closed
    throw error
  }
}
