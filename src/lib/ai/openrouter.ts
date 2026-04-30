/**
 * @file openrouter.ts — thin client for OpenRouter chat completions.
 *
 * @description Routes Claude-style "system + user prompt" calls to a
 * non-Anthropic model via OpenRouter, returning a uniform shape so
 * callers don't care about the model family.
 *
 * Per Tristan's 2026-04-25 NIGHT directive — pivot off Haiku because every
 * OpenRouter tier (frontier and cheap) is cheaper than Haiku per equivalent
 * quality. Default model is `deepseek/deepseek-v4-flash` (~7-18× cheaper
 * than Haiku for structured-output workloads); callers can request a higher
 * tier (V4-Pro, Gemini 3.1 Pro) when judgement matters.
 *
 * @see ~/.claude/CLAUDE.md "Sub-Agent Model Selection" — tier table.
 * @see memory `v4_flash_production_gotchas.md` — needs max_tokens >= 16K
 *      for reasoning models, watch for CJK drift on non-English docs.
 * @see memory `forgeos_deepseek_reasoning_content_separate_field.md` —
 *      DeepSeek V4 returns text in `reasoning_content` AND/OR `content`,
 *      callers must handle both fields.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1"

export interface OpenRouterCallInput {
    model: string
    system?: string
    prompt: string
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
    /**
     * W23 guard — when true, never fall back to `reasoning_content` if
     * `content` is empty. Use for all prose-output calls (brainstorming
     * council, cover copy, audio scripts) where a reasoning trace must
     * never reach the rendered UI. Returns an error instead so the caller
     * can degrade gracefully.
     *
     * Default: false (backward-compatible — existing structured-extraction
     * callers that rely on the reasoning fallback are unaffected).
     */
    suppressReasoningFallback?: boolean
}

export interface OpenRouterCallResult {
    ok: true
    text: string
    inputTokens: number
    outputTokens: number
    modelUsed: string
    /**
     * The finish reason from the model's response. "stop" = natural end;
     * "length" = output was truncated due to max_tokens budget exhaustion.
     * Reasoning models (Qwen 3 235B, DeepSeek V4-Pro) consume part of the
     * max_tokens budget on internal thinking, so "length" truncation is
     * common when the budget is too tight. Callers should check this to
     * detect and handle truncated output.
     */
    finishReason: string | null
    /** Raw response for debugging — omit on success-path to keep logs lean. */
    raw?: unknown
}

export interface OpenRouterCallFailure {
    ok: false
    error: string
    httpStatus?: number
    /** True if a retry with a different model might succeed. */
    retriable: boolean
}

export type OpenRouterCallOutput = OpenRouterCallResult | OpenRouterCallFailure

interface RawChoice {
    message?: {
        content?: unknown
        /** DeepSeek V4 reasoning models put visible text here, not in `content`. */
        reasoning_content?: unknown
        reasoning?: unknown
    }
    finish_reason?: string
}

interface RawResponse {
    choices?: RawChoice[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    error?: { message?: string; code?: number }
}

/**
 * Single-shot chat completion against OpenRouter.
 *
 * Behaviour:
 *   - Reads `OPENROUTER_API_KEY` at call time (server-side env only).
 *   - Default `maxTokens` = 16384 (sized for V4 reasoning + V4-Flash JSON).
 *   - Default `temperature` = 0 (structured-output workloads dominate).
 *   - Default `timeoutMs` = 90_000 (BOM batches sometimes run ~60s).
 *   - Extracts text from `message.content` (final answer). Falls back to
 *     `message.reasoning_content` ONLY when `suppressReasoningFallback` is false
 *     (the default). Pass `suppressReasoningFallback: true` for all prose calls
 *     to prevent DeepSeek V4 reasoning traces reaching user-visible UI (W23).
 */
export async function callOpenRouter(
    input: OpenRouterCallInput,
): Promise<OpenRouterCallOutput> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
        return {
            ok: false,
            error: "OPENROUTER_API_KEY not configured",
            retriable: false,
        }
    }
    const maxTokens = input.maxTokens ?? 16384
    const temperature = input.temperature ?? 0
    const timeoutMs = input.timeoutMs ?? 90_000
    const messages: Array<{ role: "system" | "user"; content: string }> = []
    if (input.system) messages.push({ role: "system", content: input.system })
    messages.push({ role: "user", content: input.prompt })

    const body = {
        model: input.model,
        messages,
        max_tokens: maxTokens,
        temperature,
    }

    let response: Response
    try {
        response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                // Optional but recommended by OpenRouter for analytics.
                "HTTP-Referer": "https://fractionalforge.app",
                "X-Title": "ForgeOS",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
            ok: false,
            error: `OpenRouter fetch failed: ${msg}`,
            retriable: true,
        }
    }

    if (!response.ok) {
        let errorBody = ""
        try {
            errorBody = await response.text()
        } catch {
            // ignore — fall through with empty body
        }
        return {
            ok: false,
            error: `OpenRouter HTTP ${response.status}: ${errorBody.slice(0, 500)}`,
            httpStatus: response.status,
            // 429 / 5xx are retriable; 4xx (auth, bad request) are not.
            retriable: response.status === 429 || response.status >= 500,
        }
    }

    let raw: RawResponse
    try {
        raw = (await response.json()) as RawResponse
    } catch (err) {
        return {
            ok: false,
            error: `OpenRouter JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
            retriable: true,
        }
    }

    if (raw.error) {
        return {
            ok: false,
            error: `OpenRouter API error: ${raw.error.message ?? "unknown"}`,
            httpStatus: raw.error.code,
            retriable: false,
        }
    }

    const choice = raw.choices?.[0]
    if (!choice) {
        return {
            ok: false,
            error: "OpenRouter returned no choices",
            retriable: true,
        }
    }

    // Extract text from `content` (final answer field).
    // DeepSeek V4 reasoning models also emit `reasoning_content` (chain-of-thought).
    // For JSON-extraction workloads we prefer `content`; fall back to
    // `reasoning_content` ONLY when the caller allows it (suppressReasoningFallback=false).
    // W23: prose callers (brainstorming council) pass suppressReasoningFallback=true so a
    // reasoning trace can never reach the rendered UI even if `content` comes back empty.
    const content = stringFromMaybeArray(choice.message?.content)
    const reasoning = stringFromMaybeArray(
        choice.message?.reasoning_content ?? choice.message?.reasoning,
    )
    const contentPresent = content && content.trim().length > 0
    let text: string
    if (contentPresent) {
        text = content
    } else if (!input.suppressReasoningFallback && reasoning) {
        // Structured-extraction caller: fall back to reasoning_content (legacy behaviour).
        text = reasoning
    } else {
        // Prose caller (suppressReasoningFallback=true) OR both fields empty:
        // return empty string so the error path fires cleanly.
        text = ""
    }

    if (!text) {
        return {
            ok: false,
            error: `OpenRouter returned empty text (finish=${choice.finish_reason ?? "?"})`,
            retriable: true,
        }
    }

    return {
        ok: true,
        text,
        inputTokens: raw.usage?.prompt_tokens ?? 0,
        outputTokens: raw.usage?.completion_tokens ?? 0,
        modelUsed: input.model,
        finishReason: choice.finish_reason ?? null,
    }
}

function stringFromMaybeArray(v: unknown): string | null {
    if (typeof v === "string") return v
    if (Array.isArray(v)) {
        // OpenAI-style content arrays: { type: "text", text: "..." }
        const parts: string[] = []
        for (const item of v) {
            if (typeof item === "string") parts.push(item)
            else if (
                item &&
                typeof item === "object" &&
                "text" in item &&
                typeof (item as { text: unknown }).text === "string"
            ) {
                parts.push((item as { text: string }).text)
            }
        }
        return parts.length > 0 ? parts.join("") : null
    }
    return null
}

/** Convenience: cheapest tier for structured-output workloads. */
export const CHEAP_STRUCTURED_MODEL = "deepseek/deepseek-v4-flash" as const
/** Mid-tier for cases where V4-Flash quality regresses; still cheaper than Haiku. */
export const MID_STRUCTURED_MODEL = "deepseek/deepseek-v4-pro" as const
/** Cheap option with strong English prose — good for description synthesis. */
export const CHEAP_PROSE_MODEL = "google/gemini-2.5-flash" as const
