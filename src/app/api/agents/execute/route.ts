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

    try {
        const body = await request.json()
        prompt = body.prompt
        input = body.input ?? ""
        providerId = body.providerId ?? "anthropic"
        modelId = body.modelId ?? "claude-opus-4-6"
        modality = body.modality ?? "text"
        threadId = body.threadId ?? undefined

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
    // First try user's own key from DB, then fall back to env vars
    let apiKey: string | null = null

    const { data: keyRow } = await supabase
        .from("ai_provider_keys")
        .select("encrypted_key")
        .eq("user_id", user.id)
        .eq("provider_id", providerId)
        .single()

    if (keyRow?.encrypted_key) {
        try {
            apiKey = decryptApiKey(keyRow.encrypted_key)
        } catch (err) {
            console.error("[agents/execute] Failed to decrypt user key:", err)
        }
    }

    // Fall back to platform keys from env
    if (!apiKey) {
        const envMap: Partial<Record<AIProviderId, string>> = {
            openai: process.env.OPENAI_API_KEY ?? "",
            anthropic: process.env.ANTHROPIC_API_KEY ?? "",
            google: process.env.GOOGLE_AI_API_KEY ?? "",
            stability: process.env.STABILITY_API_KEY ?? "",
            elevenlabs: process.env.ELEVENLABS_API_KEY ?? "",
            replicate: process.env.REPLICATE_API_TOKEN ?? "",
        }
        apiKey = envMap[providerId] || null
    }

    if (!apiKey) {
        return NextResponse.json(
            {
                error: `No API key for ${PROVIDER_REGISTRY[providerId].name}. Add your key in Settings → AI Providers.`,
            },
            { status: 503 }
        )
    }

    // 4. Build company context from foundry data
    let companyContext = ""
    try {
        const { data: profile } = await supabase
            .from("profiles")
            .select("foundry_id, active_foundry_id")
            .eq("id", user.id)
            .single()

        const foundryId = profile?.active_foundry_id || profile?.foundry_id
        if (foundryId) {
            const { data: foundry } = await supabase
                .from("foundries")
                .select("name, industry, stage, purpose_data")
                .eq("id", foundryId)
                .single()

            if (foundry) {
                const parts: string[] = []
                if (foundry.name) parts.push(`Company: ${foundry.name}`)
                if (foundry.industry) parts.push(`Industry: ${foundry.industry}`)
                if (foundry.stage) parts.push(`Stage: ${foundry.stage}`)

                const purposeData = foundry.purpose_data as {
                    purpose?: string
                    mission?: string | null
                    vision?: string | null
                } | null

                if (purposeData?.purpose) parts.push(`Purpose: ${purposeData.purpose}`)
                if (purposeData?.mission) parts.push(`Mission: ${purposeData.mission}`)

                if (parts.length > 0) {
                    companyContext = `[Company Context: ${parts.join(" | ")}]`
                }
            }
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
    const foundryId = await resolveFoundryId(supabase, user.id)

    if (threadId && foundryId) {
        try {
            const memoryContext = await getMemoryContext(threadId, foundryId, true)
            memoryBlock = formatMemoryForPrompt(memoryContext)

            // Record the user's prompt as a message in the memory thread
            await addMemoryMessage(threadId, foundryId, "user", finalPrompt)
        } catch (err) {
            // Non-critical — proceed without memory context
            console.warn("[agents/execute] Could not load agent memory:", err)
        }
    }

    let systemPromptWithContext = SYSTEM_PROMPT
    if (companyContext) {
        systemPromptWithContext += `\n\n## Company Context\n${companyContext}`
    }
    if (memoryBlock) {
        systemPromptWithContext += `\n\n## Agent Memory\n${memoryBlock}`
    }

    // 7. Route to the right provider based on modality
    // Memory callback: record assistant response and process memory after streaming
    const memoryCallback = threadId && foundryId
        ? async (fullOutput: string) => {
            try {
                await addMemoryMessage(threadId!, foundryId, "assistant", fullOutput)
                // Process memory asynchronously (observe/reflect if thresholds hit)
                // Fire-and-forget — don't block the response
                processMemory(threadId!, foundryId).catch((err) => {
                    console.warn("[agents/execute] Memory processing failed:", err)
                })
            } catch (err) {
                console.warn("[agents/execute] Failed to record assistant message:", err)
            }
        }
        : undefined

    try {
        if (modality === "text") {
            return await handleTextStreaming(apiKey, providerId, modelId, finalPrompt, systemPromptWithContext, memoryCallback)
        }
        if (modality === "slides") {
            // Slides use text generation with a structured output prompt
            return await handleTextStreaming(apiKey, providerId, modelId, finalPrompt, SLIDES_SYSTEM_PROMPT, memoryCallback)
        }
        if (modality === "image") {
            return await handleImageGeneration(apiKey, providerId, modelId, finalPrompt)
        }
        if (modality === "audio") {
            return await handleAudioGeneration(apiKey, providerId, modelId, finalPrompt)
        }
        if (modality === "video") {
            return await handleVideoGeneration(apiKey, providerId, modelId, finalPrompt)
        }

        return NextResponse.json({ error: `Unsupported modality: ${modality}` }, { status: 400 })
    } catch (err) {
        console.error(`[agents/execute] ${providerId}/${modality} error:`, err)
        const message = err instanceof Error ? err.message : "Failed to execute prompt"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// ─── Text Streaming Handler ──────────────────────────────────────────

async function handleTextStreaming(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string,
    customSystemPrompt?: string,
    onComplete?: (fullOutput: string) => Promise<void>
): Promise<Response> {
    const streamFn = getTextProvider(providerId)
    if (!streamFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support text generation` },
            { status: 400 }
        )
    }

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
                    maxTokens: 16384,
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

async function handleVideoGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string
): Promise<Response> {
    const genFn = getVideoProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support video generation` },
            { status: 400 }
        )
    }

    const result = await genFn({ apiKey, modelId, prompt: finalPrompt })
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
