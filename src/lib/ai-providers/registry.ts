/**
 * Provider Registry — contains the actual execution logic for each provider.
 * Each provider implements a streaming text generator (and later, image/audio/video).
 * This is server-only code, imported by the API route.
 */

import type { AIProviderId, OutputModality } from "./types"

// ─── Common types for provider implementations ──────────────────────

export interface StreamingTextOptions {
    apiKey: string
    modelId: string
    systemPrompt: string
    userPrompt: string
    maxTokens?: number
    /** Enable Anthropic extended thinking for deeper reasoning. Only applies to Anthropic models. */
    enableThinking?: boolean
    /** Token budget for extended thinking (default: 10000). Only used when enableThinking is true. */
    thinkingBudget?: number
    onChunk: (text: string) => void
    onDone: () => void
    onError: (error: string) => void
    signal?: AbortSignal
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

// ─── Text Streaming Providers ────────────────────────────────────────

async function streamOpenAI(opts: StreamingTextOptions): Promise<void> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({ apiKey: opts.apiKey })

    const stream = await client.chat.completions.create({
        model: opts.modelId,
        messages: [
            { role: "system", content: opts.systemPrompt },
            { role: "user", content: opts.userPrompt },
        ],
        stream: true,
        max_tokens: opts.maxTokens ?? 4096,
    })

    for await (const chunk of stream) {
        if (opts.signal?.aborted) break
        const text = chunk.choices[0]?.delta?.content ?? ""
        if (text) opts.onChunk(text)
    }
    opts.onDone()
}

async function streamAnthropic(opts: StreamingTextOptions): Promise<void> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: opts.apiKey })

    // Build stream parameters, conditionally enabling extended thinking
    // Extended thinking adds an internal chain-of-thought step before the
    // final response, improving reasoning quality for complex analysis.
    const thinkingBudget = opts.thinkingBudget ?? 10_000
    const streamParams: Parameters<typeof client.messages.stream>[0] = {
        model: opts.modelId,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userPrompt }],
        ...(opts.enableThinking && {
            thinking: {
                type: "enabled" as const,
                budget_tokens: thinkingBudget,
            },
        }),
    }

    const stream = await client.messages.stream(streamParams)

    for await (const event of stream) {
        if (opts.signal?.aborted) break
        // Only stream text deltas to the user -- thinking blocks are internal
        // reasoning that improves quality silently without exposing raw chain-of-thought.
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            opts.onChunk(event.delta.text)
        }
    }
    opts.onDone()
}

async function streamGoogle(opts: StreamingTextOptions): Promise<void> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai")
    const genAI = new GoogleGenerativeAI(opts.apiKey)
    const model = genAI.getGenerativeModel({ model: opts.modelId })

    const result = await model.generateContentStream({
        contents: [{ role: "user", parts: [{ text: `${opts.systemPrompt}\n\n${opts.userPrompt}` }] }],
        generationConfig: {
            maxOutputTokens: opts.maxTokens ?? 4096,
        },
    })

    for await (const chunk of result.stream) {
        if (opts.signal?.aborted) break
        const text = chunk.text()
        if (text) opts.onChunk(text)
    }
    opts.onDone()
}

// ─── Image Generation Providers ──────────────────────────────────────

async function generateOpenAIImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({ apiKey: opts.apiKey })

    const response = await client.images.generate({
        model: opts.modelId,
        prompt: opts.prompt,
        n: 1,
        size: (opts.size as "1024x1024" | "1792x1024" | "1024x1792") || "1024x1024",
        response_format: "url",
    })

    const url = response.data[0]?.url
    if (!url) throw new Error("No image URL returned")
    return { imageUrl: url }
}

async function generateStabilityImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const response = await fetch(
        `https://api.stability.ai/v1/generation/${opts.modelId}/text-to-image`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${opts.apiKey}`,
                Accept: "application/json",
            },
            body: JSON.stringify({
                text_prompts: [{ text: opts.prompt, weight: 1 }],
                cfg_scale: 7,
                height: 1024,
                width: 1024,
                steps: 30,
                samples: 1,
            }),
            signal: opts.signal,
        }
    )

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Stability AI error: ${err}`)
    }

    const data = await response.json()
    const base64 = data.artifacts?.[0]?.base64
    if (!base64) throw new Error("No image data returned")
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
    const client = new OpenAI({ apiKey: opts.apiKey })

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

// ─── Video Generation (Replicate) ────────────────────────────────────

export interface VideoGenerationOptions {
    apiKey: string
    modelId: string
    prompt: string
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
}

const IMAGE_PROVIDERS: Partial<Record<AIProviderId, ImageGenFn>> = {
    openai: generateOpenAIImage,
    google: generateGoogleImage,
    stability: generateStabilityImage,
    replicate: generateReplicateImage,
}

const AUDIO_PROVIDERS: Partial<Record<AIProviderId, AudioGenFn>> = {
    openai: generateOpenAIAudio,
    elevenlabs: generateElevenLabsAudio,
}

const VIDEO_PROVIDERS: Partial<Record<AIProviderId, VideoGenFn>> = {
    replicate: generateReplicateVideo,
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
