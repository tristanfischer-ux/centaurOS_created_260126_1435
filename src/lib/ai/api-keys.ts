/**
 * @file api-keys.ts — Centralized API key access for all AI providers.
 *
 * INTENT: Every AI API key MUST be read through these helpers. Never read
 * process.env.*_KEY directly — Vercel env vars can contain trailing whitespace
 * or newlines that cause silent 401 failures across the entire fallback chain.
 *
 * This module was created after a production outage where image generation
 * broke because GOOGLE_AI_API_KEY had a trailing newline. The fix is simple:
 * always .trim(). This module ensures it's impossible to forget.
 *
 * @see https://github.com/tristanfischer-ux/centaurOS_created_260126_1435/commit/3bddbb01
 */

// ─── Provider Keys ──────────────────────────────────────────────────

/** Anthropic API key (Claude Opus, Sonnet, Haiku) */
export function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || undefined
}

/** OpenAI API key (GPT-5.3, GPT Image, TTS) */
export function getOpenAIKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined
}

/** Google AI API key (Gemini Pro, Flash, Image) */
export function getGoogleAIKey(): string | undefined {
  return (process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()) || undefined
}

/** DashScope API key (Qwen models via Alibaba Cloud) */
export function getDashScopeKey(): string | undefined {
  return process.env.DASHSCOPE_API_KEY?.trim() || undefined
}

/** MiniMax API key (M2.7, Hailuo, Speech) */
export function getMiniMaxKey(): string | undefined {
  return process.env.MINIMAX_API_KEY?.trim() || undefined
}

/** Together AI API key (Qwen cloud fallback) */
export function getTogetherKey(): string | undefined {
  return process.env.TOGETHER_API_KEY?.trim() || undefined
}

/** Stability AI API key (Stable Image Ultra) */
export function getStabilityKey(): string | undefined {
  return process.env.STABILITY_API_KEY?.trim() || undefined
}

/** ElevenLabs API key (Voice synthesis) */
export function getElevenLabsKey(): string | undefined {
  return process.env.ELEVENLABS_API_KEY?.trim() || undefined
}

/** Replicate API key (Flux, open-source models) */
export function getReplicateKey(): string | undefined {
  return process.env.REPLICATE_API_KEY?.trim() || undefined
}

// ─── Infrastructure URLs ────────────────────────────────────────────

/** Modal CAD endpoint URL */
export function getModalCadUrl(): string | undefined {
  return process.env.MODAL_CAD_ENDPOINT_URL?.trim()?.replace(/\/$/, "") || undefined
}

/** Modal FEA endpoint URL */
export function getModalFeaUrl(): string | undefined {
  return process.env.MODAL_FEA_ENDPOINT_URL?.trim()?.replace(/\/$/, "") || undefined
}

/** Modal CFD endpoint URL */
export function getModalCfdUrl(): string | undefined {
  return process.env.MODAL_CFD_ENDPOINT_URL?.trim()?.replace(/\/$/, "") || undefined
}

/** Modal Thermal endpoint URL */
export function getModalThermalUrl(): string | undefined {
  return process.env.MODAL_THERMAL_ENDPOINT_URL?.trim()?.replace(/\/$/, "") || undefined
}

// ─── Convenience: Get key or throw ──────────────────────────────────

/** Get Anthropic key or throw (for server actions that require it) */
export function requireAnthropicKey(): string {
  const key = getAnthropicKey()
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured")
  return key
}

/** Get OpenAI key or throw */
export function requireOpenAIKey(): string {
  const key = getOpenAIKey()
  if (!key) throw new Error("OPENAI_API_KEY is not configured")
  return key
}

/** Get Google AI key or throw */
export function requireGoogleAIKey(): string {
  const key = getGoogleAIKey()
  if (!key) throw new Error("GOOGLE_AI_API_KEY is not configured")
  return key
}
