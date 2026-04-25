/**
 * @file claude-client.ts — Centralized Claude API client with prompt caching.
 *
 * @description Single source of truth for all non-streaming Claude API calls.
 * Replaces 6 separate `callClaude` implementations across the codebase:
 *   - src/lib/cad-lab/api-helpers.ts (main, multimodal, 10min timeout)
 *   - src/actions/cad-grammar.ts (Sonnet, 2min timeout)
 *   - src/actions/cad-grammar-research.ts (Sonnet, 5min timeout)
 *   - src/actions/outreach.ts (Sonnet, 2min timeout)
 *   - src/lib/cad-lab/multi-model-consensus.ts (Opus, 30s timeout, 256 tokens)
 *   - src/lib/cad-lab/domain-prompts.ts (Sonnet, 15s timeout, 32 tokens)
 *
 * The streaming path (src/lib/ai-providers/registry.ts) uses the Anthropic SDK
 * and remains separate — streaming has fundamentally different I/O patterns.
 *
 * @security
 * - API key read from env, trimmed to prevent whitespace-related 401s
 * - Prompt caching via Anthropic's cache_control: ephemeral (5-min TTL)
 * - No secrets in error messages
 *
 * @audit Created 2026-04-07 during API cost profitability audit.
 * Prompt caching reduces input token costs by 90% on cache hits.
 */

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { withRetry } from '@/lib/retry'
import { logLlmUsage } from '@/lib/cost-logging/llm-usage'

// ==========================================
// TYPES
// ==========================================

// FLOW: Import the canonical ClaudeModelId from cad-lab-types to stay in sync.
// Re-export so callers that import from claude-client get the same type.
export type { ClaudeModelId } from '@/lib/cad-lab-types'
import type { ClaudeModelId } from '@/lib/cad-lab-types'
import { withLlmPermit } from "@/lib/ai/llm-permit"

export interface ClaudeCallOptions {
  systemPrompt: string
  userPrompt: string
  modelId?: ClaudeModelId
  maxTokens?: number
  timeoutMs?: number
  maxRetries?: number
  /**
   * Enable Anthropic prompt caching on the system prompt.
   * Adds cache_control: { type: "ephemeral" } header (5-min TTL).
   * Reduces input cost by 90% on cache hits, costs 25% more on writes.
   * Default: true (opt-out with false for short/unique system prompts).
   */
  enableCache?: boolean
  /**
   * Retry on 502/503 server errors (in addition to 429/529 rate limits).
   * Default: false (fail fast to fallback). Set true for calls with no fallback.
   */
  retryOnServerErrors?: boolean
  /** Optional base64-encoded PNG image for multimodal content */
  imageBase64?: string
  /** Optional base64-encoded SVG of previous render for visual comparison */
  renderedSvgBase64?: string
  // ----- Cost-logging metadata (optional, fire-and-forget tracking) -----
  /** Action slug for cost attribution, e.g. 'cad_lab_generate', 'outreach_compose'. */
  actionSlug?: string
  /** Foundry id for tenant-scoped cost roll-up. */
  foundryId?: string
  /** Authenticated user id, if known. */
  userId?: string
  /** Specialist id, if this call is on behalf of a specialist persona. */
  specialistId?: string
}

export interface ClaudeCallResult {
  text: string
  tokensIn: number
  tokensOut: number
  /** Whether the response was truncated (hit max_tokens) */
  truncated: boolean
  /** Tokens read from prompt cache (0 if no cache hit) */
  cacheReadTokens: number
  /** Tokens written to prompt cache (0 if cache hit or caching disabled) */
  cacheWriteTokens: number
}

// ==========================================
// MAIN FUNCTION
// ==========================================

/**
 * Call a Claude model and return the response text with token counts.
 *
 * @description Centralized, non-streaming Claude API client. Supports:
 * - Prompt caching (system prompt cached for 5 min, 90% input cost reduction)
 * - Multimodal input (PNG + SVG images)
 * - Configurable retry with exponential backoff
 * - Truncation detection via stop_reason
 *
 * @param options - Call configuration
 * @returns Response text, token counts, and cache/truncation metadata
 * @throws On API errors after retry exhaustion
 */
export async function callClaudeCentral(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const {
    systemPrompt,
    userPrompt,
    modelId = 'claude-sonnet-4-6',
    maxTokens = 16384,
    timeoutMs = 120_000,
    maxRetries = 2,
    enableCache = true,
    retryOnServerErrors = false,
    imageBase64,
    renderedSvgBase64,
    actionSlug,
    foundryId,
    userId,
    specialistId,
  } = options

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const makeRequest = async (): Promise<ClaudeCallResult> => {
    // Build user content (text or multimodal)
    type ContentBlock = { type: string; source?: { type: string; media_type: string; data: string }; text?: string }
    let userContent: string | ContentBlock[]

    if (imageBase64 && renderedSvgBase64) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'image', source: { type: 'base64', media_type: 'image/svg+xml', data: renderedSvgBase64 } },
        {
          type: 'text',
          text: 'Image 1 is the TARGET product you must model. Image 2 is what your previous code produced.\nCompare them carefully — identify SPECIFIC geometric differences (wrong shape primitives, missing features, wrong proportions).\nFix your code so the output matches Image 1.\n\n' + userPrompt,
        },
      ]
    } else if (imageBase64) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        {
          type: 'text',
          text: 'CRITICAL: The image above is the product you must model. Your primary goal is to produce CadQuery code whose 3D shape closely matches the proportions, silhouette, and features visible in this image. Study it carefully — every major geometric feature you see must appear in your model.\n\n' + userPrompt,
        },
      ]
    } else {
      userContent = userPrompt
    }

    // Build system prompt — with or without prompt caching
    const systemField = enableCache
      ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
      : systemPrompt

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }

    // Prompt caching requires the beta header
    if (enableCache) {
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31'
    }

    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          max_tokens: maxTokens,
          system: systemField,
          messages: [{ role: 'user', content: userContent }],
        }),
      },
      timeoutMs,
    )

    if (!response.ok) {
      const errText = await response.text()
      // Cost-log the failure path: tokens unknown but model + status are useful for cost attribution.
      // Cache-read/write tokens are 0 (no usage block from a non-OK response).
      const status: 'rate_limited' | 'timeout' | 'error' =
        response.status === 429 || response.status === 529 ? 'rate_limited' :
        response.status === 408 || response.status === 504 ? 'timeout' :
        'error'
      void logLlmUsage({
        action: actionSlug ?? 'claude_central_unknown',
        modelUsed: modelId,
        tokensIn: 0,
        tokensOut: 0,
        status,
        errorMessage: `${response.status}: ${errText.slice(0, 200)}`,
        foundryId,
        userId,
        specialistId,
      })
      throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = await response.json()
    const text: string = data.content?.[0]?.text ?? ''
    const truncated = data.stop_reason === 'max_tokens'

    if (truncated) {
      console.warn(`[ClaudeClient] Response truncated at ${maxTokens} tokens — model: ${modelId}`)
    }

    const tokensIn = data.usage?.input_tokens ?? 0
    const tokensOut = data.usage?.output_tokens ?? 0
    const cacheReadTokens = data.usage?.cache_read_input_tokens ?? 0
    const cacheWriteTokens = data.usage?.cache_creation_input_tokens ?? 0

    void logLlmUsage({
      action: actionSlug ?? 'claude_central_unknown',
      modelUsed: modelId,
      tokensIn,
      tokensOut,
      status: 'success',
      foundryId,
      userId,
      specialistId,
    })

    return {
      text,
      tokensIn,
      tokensOut,
      truncated,
      cacheReadTokens,
      cacheWriteTokens,
    }
  }

  return await withRetry(() => withLlmPermit('anthropic', modelId, makeRequest), {
    maxRetries,
    baseDelay: 4000,
    maxDelay: 30000,
    shouldRetry: (error) => {
      const msg = error.message
      const isRateLimit = msg.includes('429') || msg.includes('529') || msg.includes('overloaded')
      const isServerError = msg.includes('502') || msg.includes('503')
      return isRateLimit || (retryOnServerErrors && isServerError)
    },
  })
}
