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

    const url = response.data?.[0]?.url
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
    })

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
    minimax: streamMiniMax,
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
