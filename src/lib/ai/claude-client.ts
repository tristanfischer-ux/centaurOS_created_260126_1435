/**
 * @file claude-client.ts — Centralized LLM API client routed through OpenAI GPT-5.5.
 *
 * @description Single source of truth for all non-streaming LLM API calls.
 * Originally called Anthropic's Claude API; now routes through OpenAI's
 * GPT-5.5 to eliminate the Anthropic dependency from the production pipeline.
 *
 * The function name (`callClaudeCentral`) and return type (`ClaudeCallResult`)
 * are preserved so that all ~25+ downstream call sites continue to work
 * without changes.
 *
 * @security
 * - API key read from env, trimmed to prevent whitespace-related 401s
 * - No secrets in error messages
 *
 * @audit Migrated from Anthropic to OpenAI GPT-5.5 on 2026-04-30.
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
   * @deprecated No-op. Retained for caller compatibility. OpenAI does not
   * have the same prompt-caching API as Anthropic.
   */
  enableCache?: boolean
  /**
   * Retry on 502/503 server errors (in addition to 429 rate limits).
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
  /** Tokens read from prompt cache (0 — not applicable for OpenAI) */
  cacheReadTokens: number
  /** Tokens written to prompt cache (0 — not applicable for OpenAI) */
  cacheWriteTokens: number
}

// ==========================================
// CONSTANTS
// ==========================================

/** The OpenAI model all calls are routed through.
 *  gpt-4.1-mini: 10× cheaper than gpt-5.5, adequate for structured tasks.
 *  Override per-caller by switching to callOpenAI() with an explicit modelId. */
const OPENAI_MODEL = 'gpt-4.1-mini'

// ==========================================
// MAIN FUNCTION
// ==========================================

/**
 * Call GPT-5.5 via the OpenAI chat-completions API and return the response
 * text with token counts.
 *
 * @description Centralized, non-streaming LLM client. Supports:
 * - Multimodal input (PNG + SVG images via OpenAI vision content blocks)
 * - Configurable retry with exponential backoff
 * - Truncation detection via finish_reason
 *
 * @param options - Call configuration
 * @returns Response text, token counts, and truncation metadata
 * @throws On API errors after retry exhaustion
 */
export async function callClaudeCentral(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const {
    systemPrompt,
    userPrompt,
    maxTokens = 16384,
    timeoutMs = 120_000,
    maxRetries = 2,
    retryOnServerErrors = false,
    imageBase64,
    renderedSvgBase64,
    actionSlug,
    foundryId,
    userId,
    specialistId,
  } = options

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const makeRequest = async (): Promise<ClaudeCallResult> => {
    // Build user content — text-only or multimodal (OpenAI vision format)
    type TextPart = { type: 'text'; text: string }
    type ImagePart = { type: 'image_url'; image_url: { url: string; detail?: string } }
    type ContentPart = TextPart | ImagePart
    let userContent: string | ContentPart[]

    if (imageBase64 && renderedSvgBase64) {
      userContent = [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        { type: 'image_url', image_url: { url: `data:image/svg+xml;base64,${renderedSvgBase64}` } },
        {
          type: 'text',
          text: 'Image 1 is the TARGET product you must model. Image 2 is what your previous code produced.\nCompare them carefully — identify SPECIFIC geometric differences (wrong shape primitives, missing features, wrong proportions).\nFix your code so the output matches Image 1.\n\n' + userPrompt,
        },
      ]
    } else if (imageBase64) {
      userContent = [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        {
          type: 'text',
          text: 'CRITICAL: The image above is the product you must model. Your primary goal is to produce CadQuery code whose 3D shape closely matches the proportions, silhouette, and features visible in this image. Study it carefully — every major geometric feature you see must appear in your model.\n\n' + userPrompt,
        },
      ]
    } else {
      userContent = userPrompt
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }

    // GPT-5.5 is a reasoning model — use max_completion_tokens, not max_tokens.
    // Reasoning models (gpt-5.x, o1, o3) reject non-default temperature.
    const isReasoningModel = /^(gpt-5|o[13])/.test(OPENAI_MODEL)
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: OPENAI_MODEL,
          max_completion_tokens: maxTokens,
          ...(!isReasoningModel && { temperature: 0.2 }),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      },
      timeoutMs,
    )

    if (!response.ok) {
      const errText = await response.text()
      const status: 'rate_limited' | 'timeout' | 'error' =
        response.status === 429 ? 'rate_limited' :
        response.status === 408 || response.status === 504 ? 'timeout' :
        'error'
      void logLlmUsage({
        action: actionSlug ?? 'claude_central_unknown',
        modelUsed: OPENAI_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        status,
        errorMessage: `${response.status}: ${errText.slice(0, 200)}`,
        foundryId,
        userId,
        specialistId,
      })

      throw new Error(`OpenAI API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const text: string = choice?.message?.content ?? ''
    const truncated = choice?.finish_reason === 'length'

    if (truncated) {
      console.warn(`[ClaudeClient] Response truncated at ${maxTokens} tokens — model: ${OPENAI_MODEL}`)
    }

    const tokensIn = data.usage?.prompt_tokens ?? 0
    const tokensOut = data.usage?.completion_tokens ?? 0

    void logLlmUsage({
      action: actionSlug ?? 'claude_central_unknown',
      modelUsed: OPENAI_MODEL,
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
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
  }

  return await withRetry(() => withLlmPermit('openai', OPENAI_MODEL, makeRequest), {
    maxRetries,
    baseDelay: 4000,
    maxDelay: 30000,
    shouldRetry: (error) => {
      const msg = error.message
      const isRateLimit = msg.includes('429') || msg.includes('overloaded')
      const isServerError = msg.includes('502') || msg.includes('503')
      return isRateLimit || (retryOnServerErrors && isServerError)
    },
  })
}
