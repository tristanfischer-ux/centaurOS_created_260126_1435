import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getTextProvider, getImageProvider, getAudioProvider, getVideoProvider } from "@/lib/ai-providers/registry"
import { decryptApiKey } from "@/lib/ai-providers/key-vault"
import type { AIProviderId, OutputModality } from "@/lib/ai-providers/types"
import { PROVIDER_REGISTRY } from "@/lib/ai-providers/types"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min for video generation

const SYSTEM_PROMPT =
    "You are a world-class business strategist and AI assistant. Execute the prompt below with precision, depth, and actionable detail. Be thorough and practical."

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

    // 2. Parse body
    let prompt: string
    let input: string
    let providerId: AIProviderId
    let modelId: string
    let modality: OutputModality

    try {
        const body = await request.json()
        prompt = body.prompt
        input = body.input ?? ""
        providerId = body.providerId ?? "openai"
        modelId = body.modelId ?? "gpt-4o"
        modality = body.modality ?? "text"

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

    // 4. Build the final prompt
    const finalPrompt = prompt.replace(/\{\{input\}\}/g, input)

    // 5. Route to the right provider based on modality
    try {
        if (modality === "text") {
            return await handleTextStreaming(apiKey, providerId, modelId, finalPrompt)
        }
        if (modality === "slides") {
            // Slides use text generation with a structured output prompt
            return await handleTextStreaming(apiKey, providerId, modelId, finalPrompt, SLIDES_SYSTEM_PROMPT)
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
    customSystemPrompt?: string
): Promise<Response> {
    const streamFn = getTextProvider(providerId)
    if (!streamFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support text generation` },
            { status: 400 }
        )
    }

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
        async start(controller) {
            try {
                await streamFn({
                    apiKey,
                    modelId,
                    systemPrompt: customSystemPrompt ?? SYSTEM_PROMPT,
                    userPrompt: finalPrompt,
                    maxTokens: 4096,
                    onChunk(text) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                    },
                    onDone() {
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                        controller.close()
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
