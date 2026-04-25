/**
 * Provider Registry — contains the actual execution logic for each provider.
 * Each provider implements a streaming text generator (and later, image/audio/video).
 * This is server-only code, imported by the API route.
 */

import type {
    AIProviderId,
    OutputModality,
    ToolCall,
    ToolDefinition,
} from "./types"
import { logLlmUsage, type LlmUsageStatus } from "@/lib/cost-logging/llm-usage"

// ─── Cost-logging helpers ────────────────────────────────────────────

/**
 * Map a provider error to the `llm_usage.status` enum.
 *
 * @description Inspects HTTP status (when present in the message), keyword
 * markers (`overloaded`, `timeout`, `aborted`), and Anthropic SDK error names
 * to bucket failures into the four allowed statuses. Used inside every
 * `stream*` catch block so cost auditors can split spend by failure mode.
 */
function classifyStreamError(
    err: unknown,
    httpStatus?: number,
): LlmUsageStatus {
    if (httpStatus !== undefined) {
        if (httpStatus === 429 || httpStatus === 529) return "rate_limited"
        if (httpStatus === 408 || httpStatus === 504) return "timeout"
    }
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
    if (
        msg.includes("429") ||
        msg.includes("529") ||
        msg.includes("overloaded") ||
        msg.includes("rate limit") ||
        msg.includes("rate_limit")
    ) {
        return "rate_limited"
    }
    if (
        msg.includes("408") ||
        msg.includes("504") ||
        msg.includes("timeout") ||
        msg.includes("timed out") ||
        msg.includes("aborted")
    ) {
        return "timeout"
    }
    return "error"
}

/**
 * Rough char-count → token estimator used when a provider's streaming API
 * does not emit a `usage` block. The 4-chars-per-token heuristic is the
 * widely-cited GPT/Claude rule of thumb. Off by ±25% on average — fine for
 * cost dashboards, never used for billing decisions.
 *
 * GOTCHA: Streaming OpenAI / MiniMax / DeepSeek / Together / Qwen / Ollama
 * do NOT return usage in chunks unless `stream_options.include_usage` is
 * set. We don't enable it here to avoid changing semantics — instead we
 * estimate and tag the row with a comment in code so future devs know.
 */
function estimateTokens(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / 4)
}

// ─── Common types for provider implementations ──────────────────────

/** Assistant message with optional tool calls (for tool-use loops). */
export interface AssistantToolCallPart {
    id: string
    name: string
    arguments: Record<string, unknown>
}

/** A single message in a multi-turn conversation. */
export type ChatMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | {
          role: "assistant"
          content: string
          tool_calls?: AssistantToolCallPart[]
      }
    | { role: "tool"; content: string; tool_call_id: string }

export interface StreamingTextOptions {
    apiKey: string
    modelId: string
    systemPrompt: string
    userPrompt: string
    /**
     * Optional conversation history to send as proper multi-turn messages.
     * When provided, these are inserted between the system prompt and the
     * final user prompt, giving the model real conversational context
     * instead of a flat text blob in the system prompt.
     */
    conversationHistory?: ChatMessage[]
    maxTokens?: number
    /** Enable Anthropic extended thinking for deeper reasoning. Only applies to Anthropic models. */
    enableThinking?: boolean
    /** Token budget for extended thinking (default: 10000). Only used when enableThinking is true. */
    thinkingBudget?: number
    /** Tool definitions for function/tool calling. When set, the model may request tool execution. */
    tools?: ToolDefinition[]
    /** When tools are provided: "auto" (default), "none", or "required". */
    toolChoice?: "auto" | "none" | "required"
    /** Called when the model requests a tool execution (streaming pauses until tool results are sent). */
    onToolCall?: (toolCall: ToolCall) => void
    /** Called when web search citations are available (Anthropic web_search beta). */
    onCitations?: (sources: Array<{ title: string; url: string; snippet: string }>) => void
    /** Enable Anthropic web_search tool for real-time data access. Only applies to Anthropic models. */
    enableWebSearch?: boolean
    onChunk: (text: string) => void
    onDone: () => void
    onError: (error: string) => void
    signal?: AbortSignal
    // ----- Cost-logging metadata (optional, fire-and-forget tracking) ----
    /**
     * Action slug for cost attribution, e.g. `agent_execute`,
     * `specialist_chat`, `sweep_<specialist>`. Surfaces in the `/admin/cost`
     * dashboard's "what was the model doing" column.
     */
    actionSlug?: string
    /**
     * Foundry id (TEXT, not UUID — `foundries.id` is text) for tenant-scoped
     * cost roll-up. Pass through from `withAuth({ foundryId })` callers.
     */
    foundryId?: string
    /**
     * Authenticated user id (`auth.users.id`), if known. Lets the cost
     * dashboard split spend per-user inside a foundry.
     */
    userId?: string
    /**
     * Specialist id when this stream is on behalf of a specialist persona
     * (e.g. `strategist`, `cto`). Used to compute cost-per-specialist.
     */
    specialistId?: string
}

export interface ImageGenerationOptions {
    apiKey: string
    modelId: string
    prompt: string
    size?: string
    signal?: AbortSignal
}

export interface ImageGenerationResult {
    imageUrl: string // base64 data URI or URL
}

export interface AudioGenerationOptions {
    apiKey: string
    modelId: string
    text: string
    voice?: string
    signal?: AbortSignal
}

export interface AudioGenerationResult {
    audioUrl: string // base64 data URI
}

// ─── Multi-Turn Message Builder ──────────────────────────────────────

/**
 * Builds the full messages array for an LLM call, inserting conversation
 * history between the system prompt and the current user prompt.
 *
 * @description When conversationHistory is provided, the model sees a real
 * multi-turn exchange instead of a flat text blob. This dramatically improves
 * the model's ability to track what the user said and respond accordingly.
 *
 * @param opts - The streaming options containing system prompt, history, and user prompt
 * @returns An array of messages ready for the LLM API
 */
function buildMessages(opts: StreamingTextOptions): ChatMessage[] {
    const messages: ChatMessage[] = [
        { role: "system", content: opts.systemPrompt },
    ]

    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
        for (const msg of opts.conversationHistory) {
            if (msg.role === "tool") {
                messages.push({
                    role: "tool",
                    content: msg.content,
                    tool_call_id: msg.tool_call_id,
                })
            } else if (msg.role === "assistant" && msg.tool_calls?.length) {
                messages.push({
                    role: "assistant",
                    content: msg.content,
                    tool_calls: msg.tool_calls,
                })
            } else {
                messages.push({ role: msg.role, content: msg.content })
            }
        }
    }

    messages.push({ role: "user", content: opts.userPrompt })
    return messages
}

// ─── Text Streaming Providers ────────────────────────────────────────

async function streamOpenAI(opts: StreamingTextOptions): Promise<void> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({ apiKey: opts.apiKey, timeout: 90_000, maxRetries: 0 })

    const messages = buildMessages(opts)

    // DECISION: GPT-5.x models require max_completion_tokens instead of max_tokens.
    // Both params do the same thing, but OpenAI rejects the old name for newer models.
    const isGpt5 = opts.modelId.startsWith("gpt-5")
    const tokenParam = isGpt5
        ? { max_completion_tokens: opts.maxTokens ?? 4096 }
        : { max_tokens: opts.maxTokens ?? 4096 }

    // estimated, no usage block from provider — accumulate output chars to
    // estimate completion tokens at end-of-stream.
    let outputCharCount = 0

    try {
        const stream = await client.chat.completions.create({
            model: opts.modelId,
            messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
            stream: true,
            ...tokenParam,
        })

        for await (const chunk of stream) {
            if (opts.signal?.aborted) break
            const text = chunk.choices[0]?.delta?.content ?? ""
            if (text) {
                outputCharCount += text.length
                opts.onChunk(text)
            }
        }
        // estimated, no usage block from provider — input from prompt size.
        const tokensIn = estimateTokens(opts.systemPrompt + opts.userPrompt)
        const tokensOut = Math.ceil(outputCharCount / 4)
        void logLlmUsage({
            action: opts.actionSlug ?? "openai_unknown",
            modelUsed: opts.modelId,
            tokensIn,
            tokensOut,
            status: "success",
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onDone()
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error("[streamOpenAI] Stream failed:", { model: opts.modelId, error: errorMessage })
        void logLlmUsage({
            action: opts.actionSlug ?? "openai_unknown",
            modelUsed: opts.modelId,
            tokensIn: 0,
            tokensOut: 0,
            status: classifyStreamError(err),
            errorMessage: errorMessage.slice(0, 200),
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onError(errorMessage)
    }
}

async function streamAnthropic(opts: StreamingTextOptions): Promise<void> {
    // Route to web search handler if enabled
    if (opts.enableWebSearch) {
        return streamAnthropicWithWebSearch(opts)
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: opts.apiKey, timeout: 240_000, maxRetries: 0 })

    // Anthropic uses a separate `system` param, so we build messages without it
    const conversationMessages: Array<{ role: "user" | "assistant"; content: string }> = []

    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
        for (const msg of opts.conversationHistory) {
            if (msg.role === "user" || msg.role === "assistant") {
                conversationMessages.push({ role: msg.role, content: msg.content })
            }
        }
    }

    conversationMessages.push({ role: "user", content: opts.userPrompt })

    // Build stream parameters, conditionally enabling extended thinking
    // Extended thinking adds an internal chain-of-thought step before the
    // final response, improving reasoning quality for complex analysis.
    const thinkingBudget = opts.thinkingBudget ?? 10_000
    // AUDIT: Prompt caching — system prompt cached for 5-min TTL (90% input cost reduction on hits).
    // The Anthropic SDK supports cache_control on system content blocks natively.
    const cachedSystem = [{
        type: 'text' as const,
        text: opts.systemPrompt,
        cache_control: { type: 'ephemeral' as const },
    }]
    const streamParams: Parameters<typeof client.messages.stream>[0] = {
        model: opts.modelId,
        max_tokens: opts.maxTokens ?? 4096,
        system: cachedSystem,
        messages: conversationMessages,
        ...(opts.enableThinking && {
            thinking: {
                type: "enabled" as const,
                budget_tokens: thinkingBudget,
            },
        }),
    }

    // Fallback estimator — only used if `finalMessage()` cannot be read.
    let outputCharCount = 0

    try {
        const stream = await client.messages.stream(streamParams)

        for await (const event of stream) {
            if (opts.signal?.aborted) break
            // Only stream text deltas to the user -- thinking blocks are internal
            // reasoning that improves quality silently without exposing raw chain-of-thought.
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                outputCharCount += event.delta.text.length
                opts.onChunk(event.delta.text)
            }
        }

        // AUDIT: Log cache metrics from streaming response for observability.
        // The Anthropic SDK provides usage data on the final message.
        let tokensIn = 0
        let tokensOut = 0
        let usedEstimator = false
        try {
            const finalMsg = await stream.finalMessage()
            const usageAny = finalMsg.usage as unknown as Record<string, number>
            const cacheRead = usageAny?.cache_read_input_tokens ?? 0
            const cacheWrite = usageAny?.cache_creation_input_tokens ?? 0
            // For cost-logging, sum cache reads + cache writes into tokensIn so
            // the dashboard never under-reports input volume. The price map
            // bills the full input rate; cache-aware pricing is a future
            // enhancement requiring per-row cache columns.
            tokensIn = (finalMsg.usage?.input_tokens ?? 0) + cacheRead + cacheWrite
            tokensOut = finalMsg.usage?.output_tokens ?? 0
            if (cacheRead > 0 || cacheWrite > 0) {
                console.info("[streamAnthropic] Cache metrics:", {
                    model: opts.modelId,
                    cacheRead,
                    cacheWrite,
                    inputTokens: finalMsg.usage?.input_tokens ?? 0,
                })
            }
        } catch {
            // Non-critical — cache metrics are observability, not functional.
            // Fall back to char-count estimator for cost logging.
            usedEstimator = true
            tokensIn = estimateTokens(opts.systemPrompt + opts.userPrompt)
            tokensOut = Math.ceil(outputCharCount / 4)
        }

        void logLlmUsage({
            action: opts.actionSlug ?? "anthropic_unknown",
            modelUsed: opts.modelId,
            tokensIn,
            tokensOut,
            status: "success",
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
            errorMessage: usedEstimator
                ? "estimated tokens — finalMessage() unavailable"
                : undefined,
        })

        opts.onDone()
    } catch (err) {
        // Extract meaningful error details from Anthropic SDK errors
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error("[streamAnthropic] Stream failed:", {
            model: opts.modelId,
            enableThinking: opts.enableThinking,
            error: errorMessage,
        })
        void logLlmUsage({
            action: opts.actionSlug ?? "anthropic_unknown",
            modelUsed: opts.modelId,
            tokensIn: 0,
            tokensOut: 0,
            status: classifyStreamError(err),
            errorMessage: errorMessage.slice(0, 200),
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onError(errorMessage)
    }
}

/**
 * Streams Anthropic with web_search tool enabled (non-streaming beta API).
 *
 * Uses client.beta.messages.create() (non-streaming) because web_search
 * requires the beta API which doesn't support streaming. Simulates streaming
 * by emitting response text in chunks.
 *
 * Handles pause_turn continuation (max 5 loops) and citation extraction.
 */
async function streamAnthropicWithWebSearch(opts: StreamingTextOptions): Promise<void> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: opts.apiKey, timeout: 240_000, maxRetries: 0 })

    const conversationMessages: Array<{ role: "user" | "assistant"; content: string | Array<{ type: string; text?: string }> }> = []
    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
        for (const msg of opts.conversationHistory) {
            if (msg.role === "user" || msg.role === "assistant") {
                conversationMessages.push({ role: msg.role, content: msg.content })
            }
        }
    }
    conversationMessages.push({ role: "user", content: opts.userPrompt })

    // AUDIT: Prompt caching for web search path (same pattern as streaming)
    const cachedSystem = [{
        type: 'text' as const,
        text: opts.systemPrompt,
        cache_control: { type: 'ephemeral' as const },
    }]
    const WEB_SEARCH_BETA = "code-execution-web-tools-2026-02-09"
    const webSearchTool = {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 3,
    }

    const createParams = {
        model: opts.modelId,
        max_tokens: opts.maxTokens ?? 4096,
        system: cachedSystem,
        messages: conversationMessages,
        tools: [webSearchTool],
        betas: [WEB_SEARCH_BETA],
    }

    // Token totals across the (potentially multiple) pause_turn loops.
    let totalTokensIn = 0
    let totalTokensOut = 0

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let response = await client.beta.messages.create(createParams as any) as any
        // Sum tokens from the first response. Beta API returns usage blocks
        // with the same shape as the standard messages API.
        const firstUsage = response?.usage ?? {}
        totalTokensIn += (firstUsage.input_tokens ?? 0)
            + (firstUsage.cache_read_input_tokens ?? 0)
            + (firstUsage.cache_creation_input_tokens ?? 0)
        totalTokensOut += firstUsage.output_tokens ?? 0

        // Handle pause_turn continuation
        let continueCount = 0
        while (response.stop_reason === "pause_turn" && continueCount < 5) {
            continueCount++
            const prevMessages = [
                ...conversationMessages.slice(0, -1),
                { role: "user" as const, content: opts.userPrompt },
                { role: "assistant" as const, content: response.content },
                { role: "user" as const, content: "Continue." },
            ]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            response = await client.beta.messages.create({ ...createParams, messages: prevMessages } as any) as any
            const u = response?.usage ?? {}
            totalTokensIn += (u.input_tokens ?? 0)
                + (u.cache_read_input_tokens ?? 0)
                + (u.cache_creation_input_tokens ?? 0)
            totalTokensOut += u.output_tokens ?? 0
        }

        // Extract text and citations from response
        const content: Array<{ type: string; text?: string; citations?: Array<{ url?: string; title?: string | null; cited_text?: string }> | null }> = response.content ?? []

        // Collect citations
        const seen = new Set<string>()
        const sources: Array<{ title: string; url: string; snippet: string }> = []
        for (const block of content) {
            if (block.type !== "text" || !block.citations) continue
            for (const c of block.citations) {
                const url = c.url ?? ""
                if (!url || seen.has(url)) continue
                seen.add(url)
                sources.push({
                    title: (c.title ?? "Source").toString(),
                    url,
                    snippet: (c.cited_text ?? "").slice(0, 200),
                })
            }
        }

        // Emit citations if any
        if (sources.length > 0 && opts.onCitations) {
            opts.onCitations(sources)
        }

        // Simulate streaming by emitting text in chunks
        const fullText = content
            .filter(b => b.type === "text" && b.text)
            .map(b => b.text!)
            .join("\n")

        // Emit in ~100 char chunks for a natural streaming feel
        const chunkSize = 100
        for (let i = 0; i < fullText.length; i += chunkSize) {
            if (opts.signal?.aborted) break
            opts.onChunk(fullText.slice(i, i + chunkSize))
        }

        void logLlmUsage({
            action: opts.actionSlug ?? "anthropic_websearch_unknown",
            modelUsed: opts.modelId,
            tokensIn: totalTokensIn,
            tokensOut: totalTokensOut,
            status: "success",
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onDone()
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error("[streamAnthropicWithWebSearch] Failed:", {
            model: opts.modelId,
            error: errorMessage,
        })
        void logLlmUsage({
            action: opts.actionSlug ?? "anthropic_websearch_unknown",
            // Even on error, keep any tokens already consumed by completed
            // pause_turn loops — they were billed.
            modelUsed: opts.modelId,
            tokensIn: totalTokensIn,
            tokensOut: totalTokensOut,
            status: classifyStreamError(err),
            errorMessage: errorMessage.slice(0, 200),
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onError(errorMessage)
    }
}

async function streamGoogle(opts: StreamingTextOptions): Promise<void> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai")
    const genAI = new GoogleGenerativeAI(opts.apiKey)
    const model = genAI.getGenerativeModel({
        model: opts.modelId,
        systemInstruction: opts.systemPrompt,
    })

    // Build multi-turn contents for Google's format
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
        for (const msg of opts.conversationHistory) {
            // Google uses "user" and "model" (not "assistant")
            const role = msg.role === "assistant" ? "model" : "user"
            contents.push({ role, parts: [{ text: msg.content }] })
        }
    }

    contents.push({ role: "user", parts: [{ text: opts.userPrompt }] })

    // Estimator fallback if response.usageMetadata is unavailable.
    let outputCharCount = 0

    try {
        const result = await model.generateContentStream({
            contents,
            generationConfig: {
                maxOutputTokens: opts.maxTokens ?? 4096,
            },
        })

        for await (const chunk of result.stream) {
            if (opts.signal?.aborted) break
            const text = chunk.text()
            if (text) {
                outputCharCount += text.length
                opts.onChunk(text)
            }
        }

        // The Google SDK exposes `result.response` (a Promise) which resolves
        // to the aggregated final response, including `usageMetadata` with
        // promptTokenCount / candidatesTokenCount. Read it for accurate
        // cost-logging; fall back to the char-count estimator if missing.
        let tokensIn = 0
        let tokensOut = 0
        let usedEstimator = false
        try {
            const finalResp = await result.response
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const usage = (finalResp as any)?.usageMetadata
            if (usage) {
                tokensIn = usage.promptTokenCount ?? 0
                tokensOut = usage.candidatesTokenCount ?? 0
            } else {
                throw new Error("no usageMetadata")
            }
        } catch {
            usedEstimator = true
            tokensIn = estimateTokens(opts.systemPrompt + opts.userPrompt)
            tokensOut = Math.ceil(outputCharCount / 4)
        }

        void logLlmUsage({
            action: opts.actionSlug ?? "google_unknown",
            modelUsed: opts.modelId,
            tokensIn,
            tokensOut,
            status: "success",
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
            errorMessage: usedEstimator
                ? "estimated tokens — usageMetadata unavailable"
                : undefined,
        })
        opts.onDone()
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error("[streamGoogle] Stream failed:", { model: opts.modelId, error: errorMessage })
        void logLlmUsage({
            action: opts.actionSlug ?? "google_unknown",
            modelUsed: opts.modelId,
            tokensIn: 0,
            tokensOut: 0,
            status: classifyStreamError(err),
            errorMessage: errorMessage.slice(0, 200),
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onError(errorMessage)
    }
}

// ─── Image Generation Providers ──────────────────────────────────────

async function generateOpenAIImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({ apiKey: opts.apiKey, timeout: 120_000, maxRetries: 0 })

    const response = await client.images.generate({
        model: opts.modelId,
        prompt: opts.prompt,
        n: 1,
        size: (opts.size as "1024x1024" | "1792x1024" | "1024x1792") || "1024x1024",
        response_format: "url",
    })

    const url = response.data?.[0]?.url
    if (!url) throw new Error("No image URL returned")
    return { imageUrl: url }
}

async function generateStabilityImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
    // Stable Image Ultra uses the v2beta multipart/form-data API
    const formData = new FormData()
    formData.append("prompt", opts.prompt)
    formData.append("output_format", "png")

    const response = await fetch(
        "https://api.stability.ai/v2beta/stable-image/generate/ultra",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${opts.apiKey}`,
                Accept: "image/*",
            },
            body: formData,
            signal: opts.signal,
        }
    )

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Stability AI error: ${err}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    return { imageUrl: `data:image/png;base64,${base64}` }
}

async function generateGoogleImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
    // Gemini 3 Pro Image uses the Gemini API with responseModalities including IMAGE
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.modelId}:generateContent?key=${opts.apiKey}`

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: opts.prompt }] }],
            generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
            },
        }),
        signal: opts.signal,
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Google AI image error: ${err}`)
    }

    const data = await response.json()
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData)

    if (!imagePart?.inlineData) {
        throw new Error("No image data returned from Gemini")
    }

    const { mimeType, data: base64 } = imagePart.inlineData
    return { imageUrl: `data:${mimeType};base64,${base64}` }
}

async function generateReplicateImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
    // Replicate uses a two-step process: create prediction, then poll for result
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
            version: opts.modelId.includes("/") ? undefined : opts.modelId,
            model: opts.modelId.includes("/") ? opts.modelId : undefined,
            input: { prompt: opts.prompt },
        }),
        signal: opts.signal,
    })

    if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`Replicate error: ${err}`)
    }

    const prediction = await createRes.json()
    let result = prediction

    // Poll for completion (max 120s)
    const deadline = Date.now() + 120_000
    while (result.status !== "succeeded" && result.status !== "failed" && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000))
        if (opts.signal?.aborted) throw new Error("Aborted")
        const pollRes = await fetch(result.urls.get, {
            headers: { Authorization: `Bearer ${opts.apiKey}` },
            signal: opts.signal,
        })
        result = await pollRes.json()
    }

    if (result.status === "failed") throw new Error(result.error || "Replicate generation failed")
    const output = Array.isArray(result.output) ? result.output[0] : result.output
    if (!output) throw new Error("No output from Replicate")
    return { imageUrl: output }
}

// ─── Audio Generation Providers ──────────────────────────────────────

async function generateOpenAIAudio(opts: AudioGenerationOptions): Promise<AudioGenerationResult> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({ apiKey: opts.apiKey, timeout: 120_000, maxRetries: 0 })

    const response = await client.audio.speech.create({
        model: opts.modelId,
        voice: (opts.voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer") || "nova",
        input: opts.text,
    })

    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    return { audioUrl: `data:audio/mpeg;base64,${base64}` }
}

async function generateElevenLabsAudio(opts: AudioGenerationOptions): Promise<AudioGenerationResult> {
    // Default voice ID (Rachel) if none specified
    const voiceId = opts.voice || "21m00Tcm4TlvDq8ikWAM"

    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": opts.apiKey,
            },
            body: JSON.stringify({
                text: opts.text,
                model_id: opts.modelId,
            }),
            signal: opts.signal,
        }
    )

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`ElevenLabs error: ${err}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    return { audioUrl: `data:audio/mpeg;base64,${base64}` }
}

// ─── MiniMax Text Streaming ──────────────────────────────────────────

/**
 * Streams text from MiniMax via their OpenAI-compatible API endpoint.
 *
 * @description MiniMax exposes an OpenAI-compatible chat completions API
 * at api.minimax.io/v1. We reuse the OpenAI SDK with a custom baseURL,
 * keeping the implementation minimal and battle-tested.
 *
 * @see https://platform.minimax.io/docs/api-reference/text-openai-api
 */
async function streamMiniMax(opts: StreamingTextOptions): Promise<void> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({
        apiKey: opts.apiKey,
        baseURL: "https://api.minimax.io/v1",
        timeout: 90_000,
        maxRetries: 0,
    })

    const messages = buildMessages(opts)

    // estimated, no usage block from provider — accumulate output chars.
    let outputCharCount = 0

    try {
        const stream = await client.chat.completions.create({
            model: opts.modelId,
            messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
            stream: true,
            max_tokens: opts.maxTokens ?? 4096,
        })

        for await (const chunk of stream) {
            if (opts.signal?.aborted) break
            const text = chunk.choices[0]?.delta?.content ?? ""
            if (text) {
                outputCharCount += text.length
                opts.onChunk(text)
            }
        }
        // estimated, no usage block from MiniMax stream chunks.
        const tokensIn = estimateTokens(opts.systemPrompt + opts.userPrompt)
        const tokensOut = Math.ceil(outputCharCount / 4)
        void logLlmUsage({
            action: opts.actionSlug ?? "minimax_unknown",
            modelUsed: opts.modelId,
            tokensIn,
            tokensOut,
            status: "success",
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onDone()
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error("[streamMiniMax] Stream failed:", { model: opts.modelId, error: errorMessage })
        void logLlmUsage({
            action: opts.actionSlug ?? "minimax_unknown",
            modelUsed: opts.modelId,
            tokensIn: 0,
            tokensOut: 0,
            status: classifyStreamError(err),
            errorMessage: errorMessage.slice(0, 200),
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onError(errorMessage)
    }
}

// ─── DeepSeek Text Streaming (OpenAI-compatible) ─────────────────────

/**
 * Streams text from DeepSeek via their OpenAI-compatible endpoint.
 * DeepSeek V4 and R1 use the same chat completions API at
 * `https://api.deepseek.com`.
 */
async function streamDeepSeek(opts: StreamingTextOptions): Promise<void> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({
        apiKey: opts.apiKey,
        baseURL: "https://api.deepseek.com",
        timeout: 90_000,
        maxRetries: 0,
    })

    const messages = buildMessages(opts)

    // GOTCHA: DeepSeek API rejects max_tokens above its model cap with HTTP 400.
    // V4-Pro reasoning_content is billed as output and a complex Finn analysis
    // can blow past 8192 mid-stream — see forgeos_deepseek_max_tokens_cap.md.
    // The DeepSeek chat completions API accepts up to 32768 (per AWS Bedrock + DeepSeek docs)
    // so we clamp at that ceiling. Callers requesting more (e.g. 32768 thinking budget) get
    // clamped DOWN; callers requesting less pass through unchanged.
    const DEEPSEEK_MAX_TOKENS = 32768
    const requestedMaxTokens = opts.maxTokens ?? 4096
    const clampedMaxTokens = Math.min(requestedMaxTokens, DEEPSEEK_MAX_TOKENS)

    // estimated, no usage block from provider — accumulate output chars.
    let outputCharCount = 0

    try {
        const stream = await client.chat.completions.create({
            model: opts.modelId,
            messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
            stream: true,
            max_tokens: clampedMaxTokens,
        })

        for await (const chunk of stream) {
            if (opts.signal?.aborted) break
            const text = chunk.choices[0]?.delta?.content ?? ""
            if (text) {
                outputCharCount += text.length
                opts.onChunk(text)
            }
        }
        // estimated, no usage block from DeepSeek stream chunks.
        const tokensIn = estimateTokens(opts.systemPrompt + opts.userPrompt)
        const tokensOut = Math.ceil(outputCharCount / 4)
        void logLlmUsage({
            action: opts.actionSlug ?? "deepseek_unknown",
            modelUsed: opts.modelId,
            tokensIn,
            tokensOut,
            status: "success",
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onDone()
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error("[streamDeepSeek] Stream failed:", { model: opts.modelId, error: errorMessage })
        void logLlmUsage({
            action: opts.actionSlug ?? "deepseek_unknown",
            modelUsed: opts.modelId,
            tokensIn: 0,
            tokensOut: 0,
            status: classifyStreamError(err),
            errorMessage: errorMessage.slice(0, 200),
            foundryId: opts.foundryId,
            userId: opts.userId,
            specialistId: opts.specialistId,
        })
        opts.onError(errorMessage)
    }
}

// ─── Together AI Text Streaming (OpenAI-compatible) ──────────────────

/**
 * Streams text from Together AI via their OpenAI-compatible endpoint.
 * Uses Qwen 3.5 (397B MoE) as default — same model as DashScope but
 * hosted on Together's infrastructure with better global availability.
 */
async function streamTogether(opts: StreamingTextOptions): Promise<void> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({
        apiKey: opts.apiKey,
        baseURL: "https://api.together.xyz/v1",
        timeout: 90_000,
        maxRetries: 0,
    })

    const messages = buildMessages(opts)

    try {
        const stream = await client.chat.completions.create({
            model: opts.modelId,
            messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
            stream: true,
            max_tokens: opts.maxTokens ?? 4096,
        })

        for await (const chunk of stream) {
            if (opts.signal?.aborted) break
            const text = chunk.choices[0]?.delta?.content ?? ""
            if (text) opts.onChunk(text)
        }
        opts.onDone()
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error("[streamTogether] Stream failed:", { model: opts.modelId, error: errorMessage })
        opts.onError(errorMessage)
    }
}

// ─── Qwen Text Streaming (DashScope / OpenAI-compatible) ─────────────

/**
 * Streams text from Alibaba's Qwen models via the DashScope OpenAI-compatible endpoint.
 *
 * @description DashScope exposes an OpenAI-compatible chat completions API at
 * `https://dashscope.aliyuncs.com/compatible-mode/v1`. We reuse the OpenAI SDK
 * with a custom baseURL — identical to the MiniMax pattern.
 *
 * Qwen3.5-plus is a Hybrid Sparse MoE model (397B total, 17B active) that
 * delivers frontier-class performance at dramatically lower inference cost.
 * Supports 201 languages and Multi-Token Prediction for up to 8× speed gains.
 *
 * @see https://www.alibabacloud.com/help/en/model-studio/getting-started/models
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api
 */
async function streamQwen(opts: StreamingTextOptions): Promise<void> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({
        apiKey: opts.apiKey,
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        timeout: 90_000,
        maxRetries: 0,
    })

    // Qwen3.5-plus supports enable_thinking for extended reasoning (similar to Anthropic)
    // When enableThinking is true, include extra_body to activate thinking mode
    const extraParams: Record<string, unknown> = {}
    if (opts.enableThinking) {
        extraParams.extra_body = {
            enable_thinking: true,
        }
    }

    const messages = buildMessages(opts)

    const stream = await client.chat.completions.create({
        model: opts.modelId,
        messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
        stream: true,
        max_tokens: opts.maxTokens ?? 8192,
        ...extraParams,
    })

    for await (const chunk of stream) {
        if (opts.signal?.aborted) break
        const text = chunk.choices[0]?.delta?.content ?? ""
        if (text) opts.onChunk(text)
    }
    opts.onDone()
}

// ─── Qwen Local (Ollama) Text Streaming ──────────────────────────────

/**
 * Streams text from a locally-hosted Qwen3 model via Ollama's OpenAI-compatible endpoint.
 *
 * @description Ollama exposes an OpenAI-compatible API at localhost:11434/v1.
 * This enables zero-cost, zero-latency-to-API inference for specialist agents
 * when running on hardware with sufficient memory (Mac Studio recommended).
 *
 * The base URL is configurable via OLLAMA_BASE_URL env var, defaulting to
 * localhost. This supports both direct localhost and ngrok tunnel scenarios.
 *
 * @security Runs entirely on-premises — no data leaves the local network.
 * Ideal for sensitive business strategy and financial discussions.
 *
 * @see https://ollama.com/library/qwen3
 */
async function streamQwenLocal(opts: StreamingTextOptions): Promise<void> {
    const OpenAI = (await import("openai")).default
    const baseURL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1"
    const client = new OpenAI({
        apiKey: opts.apiKey || "ollama",
        baseURL,
        timeout: 240_000,
        maxRetries: 0,
    })

    const messages = buildMessages(opts)

    const stream = await client.chat.completions.create({
        model: opts.modelId,
        messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
        stream: true,
        // Ollama handles max_tokens differently; cap at a reasonable default
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    })

    for await (const chunk of stream) {
        if (opts.signal?.aborted) break
        const text = chunk.choices[0]?.delta?.content ?? ""
        if (text) opts.onChunk(text)
    }
    opts.onDone()
}

// ─── MiniMax Image Generation ────────────────────────────────────────

/**
 * Generates an image via MiniMax's native image generation API.
 *
 * @description POST to /v1/image_generation with model, prompt, and format.
 * Returns a URL to the generated image (valid 24 hours).
 *
 * @see https://platform.minimax.io/docs/api-reference/image-generation-t2i
 */
async function generateMiniMaxImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const response = await fetch("https://api.minimax.io/v1/image_generation", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
            model: opts.modelId,
            prompt: opts.prompt,
            aspect_ratio: "1:1",
            response_format: "url",
            n: 1,
            prompt_optimizer: true,
        }),
        signal: opts.signal,
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`MiniMax image error: ${err}`)
    }

    const data = await response.json()

    if (data.base_resp?.status_code !== 0) {
        throw new Error(`MiniMax image error: ${data.base_resp?.status_msg || "Unknown error"}`)
    }

    const imageUrl = data.data?.image_urls?.[0]
    if (!imageUrl) throw new Error("No image URL returned from MiniMax")
    return { imageUrl }
}

// ─── MiniMax Audio Generation (T2A) ─────────────────────────────────

/**
 * Generates speech audio via MiniMax's T2A (Text-to-Audio) HTTP API.
 *
 * @description POST to /v1/t2a_v2 with model, text, and voice settings.
 * Uses output_format "url" for simplicity — returns a URL valid 24 hours.
 * Falls back to hex→base64 conversion if a hex response is received.
 *
 * @see https://platform.minimax.io/docs/api-reference/speech-t2a-http
 */
async function generateMiniMaxAudio(opts: AudioGenerationOptions): Promise<AudioGenerationResult> {
    const response = await fetch("https://api.minimax.io/v1/t2a_v2", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
            model: opts.modelId,
            text: opts.text,
            stream: false,
            output_format: "url",
            language_boost: "auto",
            voice_setting: {
                voice_id: opts.voice || "English_expressive_narrator",
                speed: 1,
                vol: 1,
                pitch: 0,
            },
            audio_setting: {
                sample_rate: 32000,
                bitrate: 128000,
                format: "mp3",
                channel: 1,
            },
        }),
        signal: opts.signal,
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`MiniMax TTS error: ${err}`)
    }

    const data = await response.json()

    if (data.base_resp?.status_code !== 0) {
        throw new Error(`MiniMax TTS error: ${data.base_resp?.status_msg || "Unknown error"}`)
    }

    const audioData = data.data?.audio
    if (!audioData) throw new Error("No audio data returned from MiniMax")

    // output_format: "url" returns a direct URL; "hex" returns hex-encoded audio
    if (typeof audioData === "string" && audioData.startsWith("http")) {
        return { audioUrl: audioData }
    }

    // Fallback: convert hex-encoded audio to base64 data URI
    const buffer = Buffer.from(audioData, "hex")
    const base64 = buffer.toString("base64")
    return { audioUrl: `data:audio/mpeg;base64,${base64}` }
}

// ─── MiniMax Video Generation (Hailuo) ──────────────────────────────

/**
 * Generates video via MiniMax's native async video generation API.
 *
 * @description Three-step process:
 * 1. POST /v1/video_generation to create a task → returns task_id
 * 2. Poll GET /v1/query/video_generation?task_id=... until Success/Fail
 * 3. GET /v1/files/retrieve?file_id=... to get the download URL
 *
 * @see https://platform.minimax.io/docs/api-reference/video-generation-t2v
 * @see https://platform.minimax.io/docs/api-reference/video-generation-query
 */
async function generateMiniMaxVideo(opts: VideoGenerationOptions): Promise<VideoGenerationResult> {
    // Build the request body, supporting T2V (text-to-video) and I2V (image-to-video)
    const requestBody: Record<string, unknown> = {
        model: opts.modelId,
        prompt: opts.prompt,
        duration: opts.duration ?? 6,
        resolution: opts.resolution ?? "1080P",
    }

    // Enable prompt optimizer by default — MiniMax enhances the prompt for better video quality
    if (opts.promptOptimizer !== false) {
        requestBody.prompt_optimizer = true
    }

    // Image-to-Video: if a first frame image URL is provided, include it
    // This enables I2V mode — the video animates from the still image
    if (opts.firstFrameImage) {
        requestBody.first_frame_image = opts.firstFrameImage
    }

    // Step 1: Create video generation task
    const createRes = await fetch("https://api.minimax.io/v1/video_generation", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: opts.signal,
    })

    if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`MiniMax video error: ${err}`)
    }

    const createData = await createRes.json()

    if (createData.base_resp?.status_code !== 0) {
        throw new Error(`MiniMax video error: ${createData.base_resp?.status_msg || "Task creation failed"}`)
    }

    const taskId = createData.task_id
    if (!taskId) throw new Error("No task_id returned from MiniMax video generation")

    // Step 2: Poll for completion (max 300s for video)
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000))
        if (opts.signal?.aborted) throw new Error("Aborted")

        const queryRes = await fetch(
            `https://api.minimax.io/v1/query/video_generation?task_id=${taskId}`,
            {
                headers: { Authorization: `Bearer ${opts.apiKey}` },
                signal: opts.signal,
            }
        )

        if (!queryRes.ok) {
            const err = await queryRes.text()
            throw new Error(`MiniMax video query error: ${err}`)
        }

        const queryData = await queryRes.json()

        if (queryData.status === "Success") {
            const fileId = queryData.file_id
            if (!fileId) throw new Error("No file_id in completed MiniMax video task")

            // Step 3: Get download URL via file retrieval API
            const fileRes = await fetch(
                `https://api.minimax.io/v1/files/retrieve?file_id=${fileId}`,
                {
                    headers: { Authorization: `Bearer ${opts.apiKey}` },
                    signal: opts.signal,
                }
            )

            if (!fileRes.ok) {
                const err = await fileRes.text()
                throw new Error(`MiniMax file retrieve error: ${err}`)
            }

            const fileData = await fileRes.json()
            const downloadUrl = fileData.file?.download_url
            if (!downloadUrl) throw new Error("No download URL returned for MiniMax video")
            return { videoUrl: downloadUrl }
        }

        if (queryData.status === "Fail") {
            throw new Error(queryData.base_resp?.status_msg || "MiniMax video generation failed")
        }

        // Still processing (Preparing, Queueing, Processing) — continue polling
    }

    throw new Error("MiniMax video generation timed out (300s)")
}

// ─── Video Generation (Replicate) ────────────────────────────────────

export interface VideoGenerationOptions {
    apiKey: string
    modelId: string
    prompt: string
    /** Video duration in seconds (MiniMax supports 5 or 6, default 6) */
    duration?: number
    /** Video resolution (MiniMax supports "720P" or "1080P", default "1080P") */
    resolution?: string
    /** URL of an image to use as the first frame (enables Image-to-Video mode) */
    firstFrameImage?: string
    /** Whether to use MiniMax's prompt optimizer (default true) */
    promptOptimizer?: boolean
    signal?: AbortSignal
}

export interface VideoGenerationResult {
    videoUrl: string
}

async function generateReplicateVideo(opts: VideoGenerationOptions): Promise<VideoGenerationResult> {
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
            model: opts.modelId,
            input: { prompt: opts.prompt },
        }),
        signal: opts.signal,
    })

    if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`Replicate error: ${err}`)
    }

    const prediction = await createRes.json()
    let result = prediction

    // Poll for completion (max 300s for video)
    const deadline = Date.now() + 300_000
    while (result.status !== "succeeded" && result.status !== "failed" && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000))
        if (opts.signal?.aborted) throw new Error("Aborted")
        const pollRes = await fetch(result.urls.get, {
            headers: { Authorization: `Bearer ${opts.apiKey}` },
            signal: opts.signal,
        })
        result = await pollRes.json()
    }

    if (result.status === "failed") throw new Error(result.error || "Video generation failed")
    const output = Array.isArray(result.output) ? result.output[0] : result.output
    if (!output) throw new Error("No video output from Replicate")
    return { videoUrl: output }
}

// ─── Registry Maps ──────────────────────────────────────────────────

type TextStreamFn = (opts: StreamingTextOptions) => Promise<void>
type ImageGenFn = (opts: ImageGenerationOptions) => Promise<ImageGenerationResult>
type AudioGenFn = (opts: AudioGenerationOptions) => Promise<AudioGenerationResult>
type VideoGenFn = (opts: VideoGenerationOptions) => Promise<VideoGenerationResult>

const TEXT_PROVIDERS: Partial<Record<AIProviderId, TextStreamFn>> = {
    openai: streamOpenAI,
    anthropic: streamAnthropic,
    google: streamGoogle,
    qwen: streamQwen,
    "qwen-local": streamQwenLocal,
    minimax: streamMiniMax,
    together: streamTogether,
    deepseek: streamDeepSeek,
}

const IMAGE_PROVIDERS: Partial<Record<AIProviderId, ImageGenFn>> = {
    openai: generateOpenAIImage,
    google: generateGoogleImage,
    stability: generateStabilityImage,
    replicate: generateReplicateImage,
    minimax: generateMiniMaxImage,
}

const AUDIO_PROVIDERS: Partial<Record<AIProviderId, AudioGenFn>> = {
    openai: generateOpenAIAudio,
    elevenlabs: generateElevenLabsAudio,
    minimax: generateMiniMaxAudio,
}

const VIDEO_PROVIDERS: Partial<Record<AIProviderId, VideoGenFn>> = {
    replicate: generateReplicateVideo,
    minimax: generateMiniMaxVideo,
}

// ─── Public API ──────────────────────────────────────────────────────

export function getTextProvider(providerId: AIProviderId): TextStreamFn | undefined {
    return TEXT_PROVIDERS[providerId]
}

export function getImageProvider(providerId: AIProviderId): ImageGenFn | undefined {
    return IMAGE_PROVIDERS[providerId]
}

export function getAudioProvider(providerId: AIProviderId): AudioGenFn | undefined {
    return AUDIO_PROVIDERS[providerId]
}

export function getVideoProvider(providerId: AIProviderId): VideoGenFn | undefined {
    return VIDEO_PROVIDERS[providerId]
}

export function supportsModality(providerId: AIProviderId, modality: OutputModality): boolean {
    switch (modality) {
        case "text": return !!TEXT_PROVIDERS[providerId]
        case "image": return !!IMAGE_PROVIDERS[providerId]
        case "audio": return !!AUDIO_PROVIDERS[providerId]
        case "video": return !!VIDEO_PROVIDERS[providerId]
        default: return false
    }
}
