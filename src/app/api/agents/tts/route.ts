/**
 * @file /api/agents/tts/route.ts
 *
 * @description Text-to-speech proxy for specialist voice output. Supports three
 * providers: Voicebox (self-hosted voice cloning), OpenAI gpt-4o-mini-tts, and
 * MiniMax Speech 2.6/2.8.
 *
 * Provider priority:
 * 1. **Voicebox** — if configured and specialist has a cloned voice profile,
 *    uses the self-hosted Voicebox server for unique per-specialist voices.
 * 2. **OpenAI / MiniMax** — cloud TTS fallback via NEXT_PUBLIC_TTS_PROVIDER.
 *
 * Voicebox is a local-first voice cloning studio (https://github.com/jamiepine/voicebox)
 * powered by Qwen3-TTS. It gives each specialist a unique, cloned voice identity
 * instead of generic stock voices shared by millions of users.
 *
 * @security Requires authenticated user. Rate-limited to 20 req/min per user.
 * @audit Tracks usage under the 'specialist_tts' AI feature.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import OpenAI from "openai"
import { rateLimit } from "@/lib/security/rate-limit"
import { aiGuard } from "@/lib/ai/guard"
import { getAudioProvider } from "@/lib/ai-providers/registry"

// ─── Configuration ────────────────────────────────────────────────────────────

/** Which TTS provider to use: "openai" (default), "minimax", or "voicebox" */
const TTS_PROVIDER = process.env.NEXT_PUBLIC_TTS_PROVIDER ?? "openai"

/** Default MiniMax model for TTS */
const MINIMAX_TTS_MODEL = "speech-2.6-turbo"

// MiniMax API key (lazy-loaded)
let minimaxApiKey: string | undefined
function getMiniMaxKey(): string | undefined {
    if (!minimaxApiKey) {
        minimaxApiKey = process.env.MINIMAX_API_KEY
    }
    return minimaxApiKey
}

// OpenAI API key (lazy-loaded)
let openaiApiKey: string | undefined
function getOpenAIKey(): string | undefined {
    if (!openaiApiKey) {
        openaiApiKey = process.env.OPENAI_API_KEY
    }
    return openaiApiKey
}

// Voicebox API URL (lazy-loaded)
let voiceboxUrl: string | undefined
function getVoiceboxUrl(): string | undefined {
    if (!voiceboxUrl) {
        voiceboxUrl = process.env.VOICEBOX_API_URL
    }
    return voiceboxUrl
}

/**
 * Mapping from OpenAI voice IDs to Voicebox voice profile IDs.
 *
 * @description Each specialist in specialists-data.ts has an OpenAI voice ID
 * (e.g., "echo", "onyx"). When Voicebox is configured, this mapping translates
 * those IDs to Voicebox profile UUIDs for cloned voice generation.
 *
 * Populate via VOICEBOX_VOICE_MAP env var as JSON, e.g.:
 * VOICEBOX_VOICE_MAP={"echo":"uuid-1","onyx":"uuid-2",...}
 *
 * Or set per-specialist via individual env vars:
 * VOICEBOX_PROFILE_echo=uuid-1
 * VOICEBOX_PROFILE_onyx=uuid-2
 */
let voiceboxVoiceMap: Record<string, string> | null = null
function getVoiceboxProfileId(openaiVoiceId: string): string | undefined {
    if (!voiceboxVoiceMap) {
        // Try JSON map first
        const mapJson = process.env.VOICEBOX_VOICE_MAP
        if (mapJson) {
            try {
                voiceboxVoiceMap = JSON.parse(mapJson) as Record<string, string>
            } catch {
                console.error("[TTS] Invalid VOICEBOX_VOICE_MAP JSON")
                voiceboxVoiceMap = {}
            }
        } else {
            voiceboxVoiceMap = {}
        }

        // Merge individual VOICEBOX_PROFILE_* env vars
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith("VOICEBOX_PROFILE_") && value) {
                const voiceId = key.replace("VOICEBOX_PROFILE_", "")
                voiceboxVoiceMap[voiceId] = value
            }
        }
    }

    return voiceboxVoiceMap[openaiVoiceId]
}

// ─── Voice Mapping ────────────────────────────────────────────────────────────

/** Allowed OpenAI TTS voices */
const ALLOWED_OPENAI_VOICES = new Set([
    "alloy", "ash", "ballad", "coral", "echo",
    "fable", "nova", "onyx", "sage", "shimmer", "verse",
])

/**
 * Mapping from OpenAI voice IDs to MiniMax voice IDs.
 * MiniMax has 300+ voices across 40 languages. These are selected to match
 * the tone and style of the OpenAI voices.
 *
 * Each specialist uses an OpenAI voice ID in specialists-data.ts.
 * This mapping translates to MiniMax equivalents.
 */
const OPENAI_TO_MINIMAX_VOICE: Record<string, string> = {
    // Warm, conversational voices
    alloy: "male-qn-qingse",
    echo: "male-qn-jingying",
    coral: "female-shaonv",
    
    // Clear, professional voices
    ash: "male-qn-badao",
    nova: "female-yujie",
    sage: "male-qn-qingse",
    
    // Expressive, storytelling voices
    ballad: "female-yujie",
    fable: "female-shaonv",
    shimmer: "female-xingchen",
    
    // Deep, authoritative voices
    onyx: "male-qn-badao",
    verse: "male-qn-jingying",
}

/** Maximum text length to send to TTS (chars) */
const MAX_TEXT_LENGTH = 4000

// ─── OpenAI TTS ─────────────────────────────────────────────────────────────

async function generateOpenAITTS(text: string, voice: string): Promise<ArrayBuffer> {
    const apiKey = getOpenAIKey()
    if (!apiKey) {
        throw new Error("OpenAI API key not configured")
    }

    const openai = new OpenAI({ apiKey })

    const audioResponse = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: voice as "alloy",
        input: text,
        response_format: "mp3",
    })

    return audioResponse.arrayBuffer()
}

// ─── MiniMax TTS ────────────────────────────────────────────────────────────

async function generateMiniMaxTTS(text: string, voice: string): Promise<ArrayBuffer> {
    const apiKey = getMiniMaxKey()
    if (!apiKey) {
        throw new Error("MiniMax API key not configured")
    }

    const minimaxVoice = OPENAI_TO_MINIMAX_VOICE[voice] || "male-qn-qingse"

    const audioFn = getAudioProvider("minimax")
    if (!audioFn) {
        throw new Error("MiniMax audio provider not available")
    }

    const result = await audioFn({
        apiKey,
        modelId: MINIMAX_TTS_MODEL,
        text,
        voice: minimaxVoice,
    })

    // Fetch the audio from the returned URL
    const response = await fetch(result.audioUrl)
    if (!response.ok) {
        throw new Error(`Failed to fetch MiniMax audio: ${response.status}`)
    }

    return response.arrayBuffer()
}

// ─── Voicebox TTS ────────────────────────────────────────────────────────────

/**
 * Generate speech via a self-hosted Voicebox server using a cloned voice profile.
 *
 * @description Calls the Voicebox REST API to generate audio with a specific
 * voice profile. Voicebox uses Qwen3-TTS for near-perfect voice cloning from
 * a few seconds of reference audio.
 *
 * @param text - Text to synthesize
 * @param profileId - Voicebox voice profile UUID
 * @returns ArrayBuffer of WAV audio data
 *
 * @throws {Error} If Voicebox URL is not configured or generation fails
 *
 * @see https://github.com/jamiepine/voicebox
 */
async function generateVoiceboxTTS(text: string, profileId: string): Promise<ArrayBuffer> {
    const baseUrl = getVoiceboxUrl()
    if (!baseUrl) {
        throw new Error("Voicebox API URL not configured")
    }

    // Generate speech with the cloned voice profile
    const genResponse = await fetch(`${baseUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            profile_id: profileId,
            text,
            language: "en",
        }),
    })

    if (!genResponse.ok) {
        const errBody = await genResponse.text().catch(() => "Unknown error")
        throw new Error(`Voicebox generation failed (${genResponse.status}): ${errBody}`)
    }

    const generation = await genResponse.json() as { id: string; audio_path: string; duration: number }

    // Download the generated audio
    const audioResponse = await fetch(`${baseUrl}/audio/${generation.id}`)
    if (!audioResponse.ok) {
        throw new Error(`Voicebox audio download failed: ${audioResponse.status}`)
    }

    return audioResponse.arrayBuffer()
}

/**
 * Check if Voicebox is available by testing the health endpoint.
 *
 * @description Quick health check to verify the Voicebox server is reachable
 * before attempting generation. Cached for 60 seconds to avoid hammering
 * the health endpoint on every TTS request.
 *
 * @returns true if Voicebox is healthy and reachable
 */
let voiceboxHealthCache: { healthy: boolean; checkedAt: number } | null = null
const VOICEBOX_HEALTH_CACHE_MS = 60_000

async function isVoiceboxHealthy(): Promise<boolean> {
    const baseUrl = getVoiceboxUrl()
    if (!baseUrl) return false

    // Return cached result if fresh
    if (voiceboxHealthCache && Date.now() - voiceboxHealthCache.checkedAt < VOICEBOX_HEALTH_CACHE_MS) {
        return voiceboxHealthCache.healthy
    }

    try {
        const res = await fetch(`${baseUrl}/health`, {
            signal: AbortSignal.timeout(3000),
        })
        const isHealthy = res.ok
        voiceboxHealthCache = { healthy: isHealthy, checkedAt: Date.now() }
        return isHealthy
    } catch {
        voiceboxHealthCache = { healthy: false, checkedAt: Date.now() }
        return false
    }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
    let activeProvider: "openai" | "minimax" | "voicebox" = TTS_PROVIDER === "minimax" ? "minimax" : TTS_PROVIDER === "voicebox" ? "voicebox" : "openai"

    try {
        const supabase = await createClient()

        // AUTH: Verify user is authenticated and within AI limits
        const guard = await aiGuard(supabase, "specialist_tts")
        if (guard.denied) return guard.response

        // SECURITY: Rate limit to prevent cost abuse (20 per minute per user)
        const rateLimitResult = await rateLimit("api", `tts:${guard.userId}`, {
            limit: 20,
            window: 60 * 1000,
        })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before requesting more speech." },
                { status: 429 }
            )
        }

        // VALIDATION: Parse and validate request body
        const body = await req.json()
        const { text, voice, provider } = body as {
            text?: string
            voice?: string
            provider?: string
        }

        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return NextResponse.json(
                { error: "Text is required" },
                { status: 400 }
            )
        }

        // Determine which provider to use (allow client override for testing)
        if (provider === "openai" || provider === "minimax" || provider === "voicebox") {
            activeProvider = provider
        } else {
            activeProvider = TTS_PROVIDER === "minimax" ? "minimax" : TTS_PROVIDER === "voicebox" ? "voicebox" : "openai"
        }

        // ─── Voicebox: Try cloned voice first, fall back to cloud TTS ─────

        // SECURITY: Check if Voicebox has a profile for this voice.
        // If the provider is explicitly set to "voicebox" or auto-detected,
        // AND a profile mapping exists, AND the server is healthy, use it.
        // Otherwise, fall back gracefully to OpenAI/MiniMax.
        const voiceboxProfileId = voice ? getVoiceboxProfileId(voice) : undefined

        if (voiceboxProfileId && getVoiceboxUrl()) {
            // Voicebox is configured for this voice — try it first
            const healthy = await isVoiceboxHealthy()
            if (healthy) {
                activeProvider = "voicebox"
            } else {
                console.warn("[TTS] Voicebox unhealthy, falling back to cloud TTS")
                activeProvider = TTS_PROVIDER === "minimax" ? "minimax" : "openai"
            }
        } else if (activeProvider === "voicebox") {
            // Provider explicitly set to voicebox but no profile or URL — fall back
            console.warn("[TTS] Voicebox requested but no profile for voice:", voice)
            activeProvider = TTS_PROVIDER === "minimax" ? "minimax" : "openai"
        }

        // VALIDATION: Reject unsupported provider values early.
        if (activeProvider !== "openai" && activeProvider !== "minimax" && activeProvider !== "voicebox") {
            return NextResponse.json(
                { error: `Unsupported provider: ${activeProvider}` },
                { status: 400 }
            )
        }

        // SECURITY: Check provider configuration for the selected provider.
        if (activeProvider === "minimax" && !getMiniMaxKey()) {
            console.error("[TTS] MiniMax API key not configured")
            return NextResponse.json(
                { error: "TTS provider not configured. Please set MINIMAX_API_KEY." },
                { status: 503 }
            )
        }

        if (activeProvider === "openai" && !getOpenAIKey()) {
            console.error("[TTS] OpenAI API key not configured")
            return NextResponse.json(
                { error: "Service temporarily unavailable" },
                { status: 503 }
            )
        }

        // Validate voice based on provider
        if (activeProvider === "openai") {
            if (!voice || !ALLOWED_OPENAI_VOICES.has(voice)) {
                return NextResponse.json(
                    { error: `Invalid OpenAI voice. Allowed: ${[...ALLOWED_OPENAI_VOICES].join(", ")}` },
                    { status: 400 }
                )
            }
        }

        // Truncate long text gracefully
        const truncatedText = text.length > MAX_TEXT_LENGTH
            ? text.slice(0, MAX_TEXT_LENGTH) + "..."
            : text

        // Generate audio based on provider
        let audioBuffer: ArrayBuffer
        let modelUsed: string

        if (activeProvider === "voicebox" && voiceboxProfileId) {
            console.info(`[TTS] Using Voicebox TTS with profile: ${voiceboxProfileId}`)
            try {
                audioBuffer = await generateVoiceboxTTS(truncatedText, voiceboxProfileId)
                modelUsed = "voicebox-qwen3-tts"
            } catch (vbErr) {
                // SECURITY: Graceful fallback — if Voicebox fails mid-request,
                // fall through to cloud TTS so the user still hears something.
                const vbMessage = vbErr instanceof Error ? vbErr.message : "Unknown Voicebox error"
                console.warn("[TTS] Voicebox generation failed, falling back:", vbMessage)
                // Invalidate health cache so next request rechecks
                voiceboxHealthCache = null

                if (TTS_PROVIDER === "minimax" && getMiniMaxKey()) {
                    audioBuffer = await generateMiniMaxTTS(truncatedText, voice ?? "echo")
                    modelUsed = MINIMAX_TTS_MODEL
                } else {
                    audioBuffer = await generateOpenAITTS(truncatedText, voice ?? "alloy")
                    modelUsed = "gpt-4o-mini-tts"
                }
            }
        } else if (activeProvider === "minimax") {
            console.info(`[TTS] Using MiniMax TTS with voice: ${voice}`)
            audioBuffer = await generateMiniMaxTTS(truncatedText, voice ?? "echo")
            modelUsed = MINIMAX_TTS_MODEL
        } else {
            console.info(`[TTS] Using OpenAI TTS with voice: ${voice}`)
            audioBuffer = await generateOpenAITTS(truncatedText, voice ?? "alloy")
            modelUsed = "gpt-4o-mini-tts"
        }

        // AUDIT: Track usage (fire and forget)
        guard.trackUsage({
            model: modelUsed,
            metadata: { voice, provider: activeProvider, textLength: truncatedText.length },
        }).catch((err: unknown) => {
            console.warn("[TTS] Usage tracking failed:", err)
        })

        // Voicebox returns WAV, cloud providers return MP3
        const contentType = activeProvider === "voicebox" ? "audio/wav" : "audio/mpeg"

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(audioBuffer.byteLength),
                "Cache-Control": "no-store",
            },
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error("[TTS] Failed:", { 
            error: message, 
            activeProvider, 
            hasVoicebox: !!getVoiceboxUrl(),
            hasMiniMax: !!getMiniMaxKey(), 
            hasOpenAI: !!getOpenAIKey() 
        })

        // Check for specific errors
        if (message.includes("API key") || message.includes("not configured") || message.includes("not available")) {
            return NextResponse.json(
                { error: "AI service not configured. Please contact support." },
                { status: 503 }
            )
        }

        // Check for Voicebox-specific errors
        if (message.includes("Voicebox") || message.includes("voicebox")) {
            return NextResponse.json(
                { error: "Voice service temporarily unavailable. Please try again." },
                { status: 500 }
            )
        }

        // Check for MiniMax-specific errors
        if (message.includes("MiniMax") || message.includes("minimax")) {
            return NextResponse.json(
                { error: "Voice service temporarily unavailable. Please try again." },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { error: "Failed to generate speech" },
            { status: 500 }
        )
    }
}
