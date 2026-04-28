/**
 * @file llm-usage.ts — Tier -1 cost-logging wrapper.
 *
 * @description Fire-and-forget logger that writes one row to `public.llm_usage`
 * per LLM call. Replaces the legacy `trackAIUsage` / `increment_ai_usage` RPC
 * pipeline (broken in production with `TypeError: fetch failed` because it
 * calls a Postgres function via the user-scoped Supabase client from inside
 * Server Actions).
 *
 * Design rules:
 * 1. NEVER throws. NEVER blocks the caller. If logging fails, log to console
 *    and return — the LLM response must still reach the user.
 * 2. Uses the admin (service_role) Supabase client so it works from anywhere
 *    on the server (Server Actions, Route Handlers, Edge Functions, cron).
 * 3. Computes `cost_usd` deterministically from a model price map. Callers
 *    that already have a precise cost can pass it via the optional override.
 *
 * The /admin/cost dashboard (separate task) reads this table.
 *
 * @audit Tier -1 cost-logging foundation. Every LLM call in production must
 * call `logLlmUsage(...)` from its post-response path.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ==========================================
// PRICE MAP (USD per 1M tokens)
// ==========================================

/**
 * Estimated cost per 1M tokens (USD), Apr 2026 prices.
 *
 * GBP-denominated guidance from the pricing brief was converted to USD at
 * roughly 1.25 USD/GBP for this map. Update whenever a provider changes
 * pricing. Unknown models fall back to a `gpt-5.4`-equivalent default.
 *
 * The keys are LLM model strings as they appear in API responses / config.
 * Aliases that resolve to the same SKU (e.g. `claude-haiku-4-5` and the
 * dated variant `claude-haiku-4-5-20251001`) are duplicated so callers don't
 * have to normalise.
 */
export const MODEL_COSTS_PER_1M_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  // Anthropic
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.75, output: 18.75 },
  'claude-sonnet-4-7': { input: 3.75, output: 18.75 },
  'claude-opus-4-7': { input: 18.75, output: 93.75 },

  // OpenAI
  'gpt-5.4': { input: 3.125, output: 12.5 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.625, output: 1.875 },
  'o3': { input: 5.0, output: 20.0 },
  'o4-mini': { input: 1.1, output: 4.4 },

  // OpenAI embeddings — tokens_out always 0
  'text-embedding-3-small': { input: 0.025, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },

  // DeepSeek (V4 era)
  'deepseek-chat': { input: 0.175, output: 0.35 },
  'deepseek-reasoner': { input: 0.175, output: 0.35 },
  'deepseek-v4': { input: 0.175, output: 0.35 },

  // Google
  'gemini-3.1-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-3.1-flash-lite-preview': { input: 0.075, output: 0.3 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },

  // MiniMax
  'MiniMax-M2.7': { input: 0.15, output: 1.2 },
  'MiniMax-M2.5': { input: 0.15, output: 1.2 },
  'MiniMax-M2.5-lightning': { input: 0.3, output: 2.4 },
  'MiniMax-M2.1': { input: 0.3, output: 1.2 },
  'MiniMax-M2.1-lightning': { input: 0.3, output: 2.4 },

  // Image generation models — billed per image, not per token.
  // Mapped to a token-equivalent cost so the price table is self-consistent:
  // cost = (tokens_in / 1_000_000) * input_rate. Callers should pass
  // tokensIn=1 and use costUsdOverride with the per-image price where exact
  // billing matters. Rates from provider pages, Apr 2026.
  'gpt-image-2': { input: 60_000, output: 0 },         // ~$0.06 per image average (standard quality)
  'imagen-4': { input: 40_000, output: 0 },             // ~$0.04 per image (Google Vertex AI)
  'flux-pro-1.1-ultra': { input: 60_000, output: 0 },   // ~$0.06 per image (Black Forest Labs via fal.ai)
  'flux-pro': { input: 55_000, output: 0 },             // ~$0.055 per image
  'flux-dev': { input: 3_000, output: 0 },              // ~$0.003 per image (open-weight, self-hosted)
  'gemini-nano-banana': { input: 40_000, output: 0 },   // ~$0.04 per image (banana MCP endpoint)
  'stable-diffusion-3.5-large': { input: 5_000, output: 0 }, // ~$0.005 per image (self-hosted on Modal)

  // Local / self-hosted embeddings (Ollama nomic-embed-text) — effectively free
  // but logged to keep accounting honest.
  'nomic-embed-text': { input: 0.0625, output: 0 },
}

/** Fallback price used when an unknown model string is logged. */
const FALLBACK_PRICE = MODEL_COSTS_PER_1M_TOKENS['gpt-5.4']

// ==========================================
// COST CALCULATION
// ==========================================

/**
 * Compute USD cost from token counts and a model price map entry.
 *
 * @param model - Model id as it appears in the price map.
 * @param tokensIn - Input tokens.
 * @param tokensOut - Output tokens.
 * @returns Cost in USD, rounded to 6 decimal places.
 */
export function computeCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const price = MODEL_COSTS_PER_1M_TOKENS[model]
  if (!price) {
    // GOTCHA: Unknown model — log once so future runs can add the entry.
    // We still return a fallback cost so the logger never blocks the call.
    console.warn(
      `[llm-usage] Unknown model "${model}" — using gpt-5.4 fallback pricing. Add to MODEL_COSTS_PER_1M_TOKENS.`,
    )
  }
  const effective = price ?? FALLBACK_PRICE
  const inputCost = (tokensIn / 1_000_000) * effective.input
  const outputCost = (tokensOut / 1_000_000) * effective.output
  return Number((inputCost + outputCost).toFixed(6))
}

// ==========================================
// LOGGER
// ==========================================

/** Status values supported by the `llm_usage.status` CHECK constraint. */
export type LlmUsageStatus = 'success' | 'error' | 'timeout' | 'rate_limited'

/** Parameters for `logLlmUsage`. */
export interface LogLlmUsageParams {
  /** Foundry id (TEXT, not UUID — `foundries.id` is text). */
  foundryId?: string
  /** Anonymous visitor id for pre-signup funnel attribution. */
  anonId?: string
  /** Authenticated user id (`auth.users.id`). */
  userId?: string
  /** Short slug describing what was being done (e.g. `cad_lab_generate`, `outreach_compose`). */
  action: string
  /** Specialist id when the call was on behalf of a specialist (e.g. `strategist`). */
  specialistId?: string
  /** Model id as it appears in the API call (e.g. `claude-haiku-4-5`). */
  modelUsed: string
  /** Input/prompt tokens. */
  tokensIn: number
  /** Output/completion tokens. Pass 0 for embeddings. */
  tokensOut: number
  /** Defaults to `success`. */
  status?: LlmUsageStatus
  /** Optional error message (only when status !== 'success'). */
  errorMessage?: string
  /** Optional client IP for abuse forensics. */
  ipAddress?: string
  /**
   * Optional pre-computed cost override. When omitted, cost is derived from
   * `MODEL_COSTS_PER_1M_TOKENS[modelUsed]`. Useful when the provider returned
   * an exact billed cost (e.g. via the OpenRouter `usage.cost` field).
   */
  costUsdOverride?: number
}

/**
 * Log one LLM call to `public.llm_usage`. Fire-and-forget — never throws,
 * never blocks the caller.
 *
 * @description This is the ONLY function call sites should reach for. It
 * resolves cost from the price map, opens an admin (service_role) Supabase
 * client, and inserts one row. Failures are logged to console and swallowed.
 *
 * Call this AFTER the LLM call returns (success OR failure). For streaming
 * responses, log once after the stream closes with the final token counts.
 *
 * @example
 * ```ts
 * const result = await callClaudeCentral({ ... })
 * void logLlmUsage({
 *   foundryId,
 *   userId,
 *   action: 'cad_lab_generate',
 *   modelUsed: 'claude-haiku-4-5',
 *   tokensIn: result.tokensIn,
 *   tokensOut: result.tokensOut,
 * })
 * ```
 *
 * @audit Writes one row per LLM call for the /admin/cost dashboard.
 */
export async function logLlmUsage(params: LogLlmUsageParams): Promise<void> {
  try {
    const cost =
      params.costUsdOverride ??
      computeCostUsd(params.modelUsed, params.tokensIn, params.tokensOut)

    const supabase = createAdminClient()

    const { error } = await supabase.from('llm_usage').insert({
      foundry_id: params.foundryId ?? null,
      anon_id: params.anonId ?? null,
      user_id: params.userId ?? null,
      action: params.action,
      specialist_id: params.specialistId ?? null,
      model_used: params.modelUsed,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      cost_usd: cost,
      status: params.status ?? 'success',
      error_message: params.errorMessage ?? null,
      ip_address: params.ipAddress ?? null,
    })

    if (error) {
      // SECURITY: Never throw — the LLM response has already been delivered to
      // the user. Failing the request because logging failed would be worse
      // than missing one row.
      console.error('[llm-usage] insert failed', {
        action: params.action,
        modelUsed: params.modelUsed,
        error: error.message,
      })
    }
  } catch (err) {
    console.error('[llm-usage] unexpected error', {
      action: params.action,
      modelUsed: params.modelUsed,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
