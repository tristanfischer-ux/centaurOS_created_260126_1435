import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/security/rate-limit"
import { getTextProvider, getImageProvider, getAudioProvider, getVideoProvider } from "@/lib/ai-providers/registry"
import { decryptApiKey } from "@/lib/ai-providers/key-vault"
import type { AIProviderId, OutputModality } from "@/lib/ai-providers/types"
import { PROVIDER_REGISTRY } from "@/lib/ai-providers/types"
import {
    getMemoryContext,
    formatMemoryForPrompt,
    addMemoryMessage,
    processMemory,
} from "@/lib/agent-memory"
import { buildAIContext } from "@/lib/ai-context/builder"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { compilePersonalityPrompt } from "@/lib/agents/personality"
import { compileTemporalPrompt } from "@/lib/agents/temporal-context"
import { compileEmotionalPrompt } from "@/lib/agents/emotional-context"
import {
    getFounderPreferences,
    getSpecialistRelationship,
    compileFounderPreferencesPrompt,
    recordInteraction,
} from "@/lib/agents/founder-preferences"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min for video generation

const SYSTEM_PROMPT = `You are a world-class business strategist and AI assistant helping startup founders and operators build, grow, and scale their companies.

## Your Standards
- Be direct and actionable. Every recommendation should be something the reader can act on this week.
- Write for busy founders — use clear structure, short paragraphs, and bullet points. No filler, no fluff, no corporate speak.
- Use markdown formatting: headers for sections, tables for comparative data, bold for key terms, bullet points for lists.
- When presenting numbers, use tables. When comparing options, use tables. When showing timelines, use tables.

## Honesty & Accuracy
- Clearly distinguish between: (1) data the user provided, (2) widely-accepted industry knowledge, and (3) your estimates or assumptions.
- Flag assumptions explicitly: "Assumption: ..." or mark estimates with "~" or "[estimated]".
- Never fabricate specific statistics, company names, or benchmark numbers. If you don't have real data, say so and provide ranges or directional guidance instead.
- When uncertain, say "I'd recommend validating this with..." rather than presenting guesses as facts.

## Output Quality
- Prioritize depth on the 2-3 most important points over shallow coverage of everything.
- End with clear next steps: who does what, by when.
- If the user's input is missing critical information, note what's missing and work with what you have rather than asking questions (since this is a one-shot prompt, not a conversation).
- Calibrate your response length to the complexity of the request — don't pad short answers.`

const SLIDES_SYSTEM_PROMPT = `You are a slide deck creator. Generate a structured slide deck in JSON format.

Return ONLY valid JSON wrapped in a markdown code block. Use this exact structure:

\`\`\`json
{
  "title": "Deck Title",
  "slides": [
    {
      "title": "Slide Title",
      "subtitle": "Optional subtitle",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "notes": "Speaker notes",
      "layout": "title"
    }
  ],
  "theme": {
    "primaryColor": "EA580C",
    "secondaryColor": "1E293B"
  }
}
\`\`\`

Layout options: "title" (first slide), "content" (standard), "two-column" (split bullets), "closing" (last slide).
Create 6-12 slides with clear, concise bullet points. Make the content professional and actionable.`

export async function POST(request: Request) {
    // 1. Authenticate
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // SECURITY: Rate limit to prevent API cost abuse (AI calls are expensive)
    const rateLimitResult = await rateLimit('api', `agent-execute:${user.id}`, { limit: 30, window: 3600 })
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: "Rate limit exceeded. Please wait before running more AI agents." },
            { status: 429 }
        )
    }

    // 2. Parse body
    let prompt: string
    let input: string
    let providerId: AIProviderId
    let modelId: string
    let modality: OutputModality
    let threadId: string | undefined
    let customSystemPromptSuffix: string | undefined
    let specialistId: string | undefined
    let enableThinking: boolean
    let videoConfig: { duration?: number; resolution?: string; promptOptimizer?: boolean } | undefined
    let firstFrameImage: string | undefined

    try {
        const body = await request.json()
        prompt = body.prompt
        input = body.input ?? ""
        providerId = body.providerId ?? "anthropic"
        modelId = body.modelId ?? "claude-opus-4-6"
        modality = body.modality ?? "text"
        threadId = body.threadId ?? undefined
        customSystemPromptSuffix =
            typeof body.customSystemPromptSuffix === "string"
                ? body.customSystemPromptSuffix.slice(0, 2000)
                : undefined
        specialistId = typeof body.specialistId === "string" ? body.specialistId : undefined
        enableThinking = body.enableThinking === true
        videoConfig = body.videoConfig ?? undefined
        firstFrameImage = typeof body.firstFrameImage === "string" ? body.firstFrameImage : undefined

        if (!prompt || typeof prompt !== "string") {
            return NextResponse.json({ error: "prompt is required" }, { status: 400 })
        }
        if (typeof input !== "string") {
            return NextResponse.json({ error: "input must be a string" }, { status: 400 })
        }
        if (prompt.length > 50_000) {
            return NextResponse.json({ error: "prompt too long (max 50k chars)" }, { status: 400 })
        }
        if (input.length > 100_000) {
            return NextResponse.json({ error: "input too long (max 100k chars)" }, { status: 400 })
        }
        if (!PROVIDER_REGISTRY[providerId]) {
            return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 })
        }
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // 3. Resolve API key
    // Platform provides AI — use env vars by default.
    // Users can optionally bring their own key (BYOK) to override.
    let apiKey: string | null = null
    let keySource: "platform" | "user" = "platform"

    // Check for platform keys first (this is the standard path)
    const envMap: Partial<Record<AIProviderId, string>> = {
        openai: process.env.OPENAI_API_KEY ?? "",
        anthropic: process.env.ANTHROPIC_API_KEY ?? "",
        google: process.env.GOOGLE_AI_API_KEY ?? "",
        stability: process.env.STABILITY_API_KEY ?? "",
        elevenlabs: process.env.ELEVENLABS_API_KEY ?? "",
        replicate: process.env.REPLICATE_API_TOKEN ?? "",
        minimax: process.env.MINIMAX_API_KEY ?? "",
    }
    apiKey = envMap[providerId] || null

    // Allow user's own key to override (BYOK), if configured
    const { data: keyRow } = await supabase
        .from("ai_provider_keys")
        .select("encrypted_key")
        .eq("user_id", user.id)
        .eq("provider_id", providerId)
        .single()

    if (keyRow?.encrypted_key) {
        try {
            const userKey = decryptApiKey(keyRow.encrypted_key)
            if (userKey) {
                apiKey = userKey
                keySource = "user"
            }
        } catch (err) {
            // Non-critical — fall back to platform key
            console.warn("[agents/execute] User key decrypt failed, using platform key:", err)
        }
    }

    if (!apiKey) {
        const providerName = PROVIDER_REGISTRY[providerId]?.name ?? providerId
        console.error("[agents/execute] No API key configured for provider:", { providerId, modelId })
        return NextResponse.json(
            {
                error: `${providerName} is not configured. Try again later or add an API key in settings.`,
                code: "PROVIDER_UNAVAILABLE",
                providerId,
            },
            { status: 503 }
        )
    }

    // 4. Build rich company context using the AI Context Builder
    const foundryId = await resolveFoundryId(supabase, user.id)

    // 4b. Validate threadId belongs to user's foundry (IDOR prevention)
    if (threadId && foundryId) {
        const { data: thread } = await supabase
            .from("agent_memory_threads")
            .select("id")
            .eq("id", threadId)
            .eq("foundry_id", foundryId)
            .single()
        if (!thread) {
            return NextResponse.json(
                { error: "Invalid or inaccessible thread" },
                { status: 403 }
            )
        }
    }
    let companyContext = ""
    try {
        if (foundryId) {
            companyContext = await buildAIContext(foundryId, user.id, {
                includeActivity: true,
                includeObjectives: true,
                includeUserProfile: false, // Skip heavy profile for streaming performance
                includeInsightHistory: false,
            })
        }
    } catch (err) {
        // Non-critical — proceed without company context
        console.warn("[agents/execute] Could not load company context:", err)
    }

    // 5. Build the final prompt
    let finalPrompt = prompt.replace(/\{\{input\}\}/g, input)
    finalPrompt = finalPrompt.replace(/\{\{company_context\}\}/g, companyContext)

    // 6. Build system prompt with company context + agent memory
    let memoryBlock = ""

    if (threadId && foundryId) {
        try {
            const memoryContext = await getMemoryContext(threadId, foundryId, true)
            memoryBlock = formatMemoryForPrompt(memoryContext)

            // Record the user's ACTUAL input as a message in the memory thread.
            // We save `input` (what the user typed) rather than `finalPrompt`
            // (which includes the full template + company context) so that
            // conversation history reads naturally when fetched back.
            const userMessageForHistory = input.trim() || finalPrompt.slice(0, 500)
            await addMemoryMessage(threadId, foundryId, "user", userMessageForHistory)
        } catch (err) {
            // Non-critical — proceed without memory context
            console.warn("[agents/execute] Could not load agent memory:", err)
        }
    }

    // Build system prompt: personality FIRST (identity leads), then context layers.
    // Structure: personality → temporal → emotional → company → memory → custom suffix
    // This ensures the specialist's identity is the dominant instruction, not a footnote.

    let systemPromptWithContext = ""

    // Inject specialist personality FIRST — identity leads, everything else is context.
    if (specialistId) {
        const specialist = getSpecialistById(specialistId)
        if (specialist) {
            const personalityPrompt = compilePersonalityPrompt(
                `${specialist.name}, the ${specialist.title} specialist`,
                specialist.personality,
                specialist.description,
                specialistId,
            )
            systemPromptWithContext = personalityPrompt
        }
    }

    // If no specialist, fall back to generic system prompt
    if (!systemPromptWithContext) {
        systemPromptWithContext = SYSTEM_PROMPT
    }

    // Add core business standards (condensed — the specialist personality already
    // covers most of the behavioral guidance)
    systemPromptWithContext += `\n\n## Response Standards
- Be direct and actionable. Use markdown: headers, tables, bullets.
- Distinguish between data the user provided, industry knowledge, and your estimates.
- Flag assumptions explicitly. Never fabricate statistics.
- End with clear next steps: who does what, by when.`

    // Founder preferences: learned communication style, trust level, pet peeves
    if (foundryId && specialistId && threadId) {
        try {
            const [founderPrefs, specialistRel] = await Promise.all([
                getFounderPreferences(foundryId),
                getSpecialistRelationship(threadId, foundryId),
            ])
            const specialist = getSpecialistById(specialistId)
            const prefsBlock = compileFounderPreferencesPrompt(
                founderPrefs,
                specialistRel,
                specialist?.name ?? specialistId,
            )
            if (prefsBlock) {
                systemPromptWithContext += `\n\n${prefsBlock}`
            }
        } catch (err) {
            // Non-critical — proceed without preferences
            console.warn("[agents/execute] Could not load founder preferences:", err)
        }
    }

    // Temporal awareness: what time/day it is, how to adjust behavior
    // Also includes milestone awareness if we know when the foundry was created
    let foundryCreatedAt: string | null = null
    if (foundryId) {
        try {
            const { data: foundryData } = await supabase
                .from("foundries")
                .select("created_at")
                .eq("id", foundryId)
                .single()
            foundryCreatedAt = foundryData?.created_at ?? null
        } catch {
            // Non-critical
        }
    }
    const temporalBlock = compileTemporalPrompt(undefined, foundryCreatedAt)
    systemPromptWithContext += `\n\n${temporalBlock}`

    // Emotional awareness: detect founder's emotional state from their message
    const emotionalBlock = compileEmotionalPrompt(input)
    if (emotionalBlock) {
        systemPromptWithContext += `\n\n${emotionalBlock}`
    }

    if (companyContext) {
        systemPromptWithContext += `\n\n${companyContext}`
    }
    if (memoryBlock) {
        systemPromptWithContext += `\n\n## Agent Memory\n${memoryBlock}`
    }
    if (customSystemPromptSuffix) {
        systemPromptWithContext += customSystemPromptSuffix
    }

    // 7. Route to the right provider based on modality
    // AUDIT: Log usage for metered billing and track AI costs
    const logUsageAfterCompletion = async (outputLength: number): Promise<void> => {
        if (!foundryId) return // Can't log without a foundry

        try {
            // Estimate token counts: ~4 chars per token is a reasonable approximation
            const estimatedInputTokens = Math.ceil((finalPrompt.length + systemPromptWithContext.length) / 4)
            const estimatedOutputTokens = Math.ceil(outputLength / 4)
            const totalTokens = estimatedInputTokens + estimatedOutputTokens

            await supabase.from("ai_usage_log").insert({
                user_id: user.id,
                foundry_id: foundryId,
                feature: `specialist-${modality}`,
                model: `${providerId}/${modelId}`,
                prompt_tokens: estimatedInputTokens,
                completion_tokens: estimatedOutputTokens,
                total_tokens: totalTokens,
                estimated_cost_usd: 0, // Will be calculated by billing system
                key_source: keySource,
                metadata: { modality, providerId, modelId },
            })
        } catch (err) {
            // Non-critical — don't fail the request over usage logging
            console.warn("[agents/execute] Failed to log usage:", err)
        }
    }

    // Memory callback: record assistant response, process memory, and track interaction
    const memoryCallback = threadId && foundryId
        ? async (fullOutput: string) => {
            try {
                // Strip internal NEXT_SPECIALIST directive before saving to history
                const cleanOutput = fullOutput.replace(/NEXT_SPECIALIST:\s*\S+\s*\|.*/i, "").trim()
                await addMemoryMessage(threadId!, foundryId, "assistant", cleanOutput || fullOutput)

                // Track this interaction for trust level progression (fire-and-forget)
                recordInteraction(threadId!, foundryId).catch((err) => {
                    console.warn("[agents/execute] Failed to record interaction:", err)
                })

                // Process memory asynchronously (observe/reflect if thresholds hit)
                processMemory(threadId!, foundryId).catch((err) => {
                    console.warn("[agents/execute] Memory processing failed:", err)
                })
            } catch (err) {
                console.warn("[agents/execute] Failed to record assistant message:", err)
            }
            // AUDIT: Log usage after successful completion
            await logUsageAfterCompletion(fullOutput.length)
        }
        : async (fullOutput: string) => {
            // Even without memory thread, log usage for billing
            await logUsageAfterCompletion(fullOutput.length)
        }

    try {
        if (modality === "text") {
            return await handleTextStreaming(apiKey, providerId, modelId, finalPrompt, systemPromptWithContext, memoryCallback, enableThinking)
        }
        if (modality === "slides") {
            // Slides use text generation with a structured output prompt
            return await handleTextStreaming(apiKey, providerId, modelId, finalPrompt, SLIDES_SYSTEM_PROMPT, memoryCallback)
        }
        if (modality === "image") {
            const result = await handleImageGeneration(apiKey, providerId, modelId, finalPrompt)
            // Log usage for non-streaming modalities
            logUsageAfterCompletion(0).catch(() => {})
            return result
        }
        if (modality === "audio") {
            const result = await handleAudioGeneration(apiKey, providerId, modelId, finalPrompt)
            logUsageAfterCompletion(0).catch(() => {})
            return result
        }
        if (modality === "video") {
            const result = await handleVideoGeneration(apiKey, providerId, modelId, finalPrompt, videoConfig, firstFrameImage)
            logUsageAfterCompletion(0).catch(() => {})
            return result
        }

        return NextResponse.json({ error: `Unsupported modality: ${modality}` }, { status: 400 })
    } catch (err) {
        console.error(`[agents/execute] ${providerId}/${modality} error:`, err)
        const message = err instanceof Error ? err.message : "Failed to execute prompt"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// ─── Text Streaming Handler ──────────────────────────────────────────

/**
 * Streams a text generation response back to the client via SSE.
 *
 * @param apiKey - Resolved API key for the provider
 * @param providerId - Which AI provider to use
 * @param modelId - Specific model ID
 * @param finalPrompt - The user prompt with placeholders resolved
 * @param customSystemPrompt - System prompt override
 * @param onComplete - Callback fired after streaming completes (for memory + usage logging)
 * @param enableThinking - When true, enables Anthropic extended thinking for deeper reasoning
 */
async function handleTextStreaming(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string,
    customSystemPrompt?: string,
    onComplete?: (fullOutput: string) => Promise<void>,
    enableThinking?: boolean
): Promise<Response> {
    const streamFn = getTextProvider(providerId)
    if (!streamFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support text generation` },
            { status: 400 }
        )
    }

    // Extended thinking requires more output headroom for the thinking budget + response
    const maxTokens = enableThinking ? 32768 : 16384

    const encoder = new TextEncoder()
    let fullOutput = ""

    const readable = new ReadableStream({
        async start(controller) {
            try {
                await streamFn({
                    apiKey,
                    modelId,
                    systemPrompt: customSystemPrompt ?? SYSTEM_PROMPT,
                    userPrompt: finalPrompt,
                    maxTokens,
                    enableThinking: enableThinking && providerId === "anthropic",
                    onChunk(text) {
                        fullOutput += text
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                    },
                    onDone() {
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                        controller.close()
                        // Record the full output to agent memory (fire-and-forget)
                        if (onComplete && fullOutput) {
                            onComplete(fullOutput).catch(() => {})
                        }
                    },
                    onError(error) {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ error })}\n\n`)
                        )
                        controller.close()
                    },
                })
            } catch (err) {
                const message = err instanceof Error ? err.message : "Stream interrupted"
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
                )
                controller.close()
            }
        },
    })

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    })
}

// ─── Image Generation Handler ────────────────────────────────────────

async function handleImageGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string
): Promise<Response> {
    const genFn = getImageProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support image generation` },
            { status: 400 }
        )
    }

    const result = await genFn({ apiKey, modelId, prompt: finalPrompt })
    return NextResponse.json({ modality: "image", imageUrl: result.imageUrl })
}

// ─── Audio Generation Handler ────────────────────────────────────────

async function handleAudioGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string
): Promise<Response> {
    const genFn = getAudioProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support audio generation` },
            { status: 400 }
        )
    }

    const result = await genFn({ apiKey, modelId, text: finalPrompt })
    return NextResponse.json({ modality: "audio", audioUrl: result.audioUrl })
}

// ─── Video Generation Handler ────────────────────────────────────────

/**
 * Handles video generation with optional configuration and first-frame image.
 *
 * @param videoConfig - Optional duration, resolution, and prompt optimizer settings
 * @param firstFrameImage - Optional image URL for Image-to-Video mode (I2V)
 */
async function handleVideoGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string,
    videoConfig?: { duration?: number; resolution?: string; promptOptimizer?: boolean },
    firstFrameImage?: string,
): Promise<Response> {
    const genFn = getVideoProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support video generation` },
            { status: 400 }
        )
    }

    const result = await genFn({
        apiKey,
        modelId,
        prompt: finalPrompt,
        duration: videoConfig?.duration,
        resolution: videoConfig?.resolution,
        promptOptimizer: videoConfig?.promptOptimizer,
        firstFrameImage,
    })
    return NextResponse.json({ modality: "video", videoUrl: result.videoUrl })
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the active foundry ID for a user.
 *
 * @param supabase - Authenticated Supabase client
 * @param userId - The authenticated user's ID
 * @returns The foundry ID, or null if not found
 */
async function resolveFoundryId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
): Promise<string | null> {
    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id, active_foundry_id")
        .eq("id", userId)
        .single()

    return profile?.active_foundry_id || profile?.foundry_id || null
}
