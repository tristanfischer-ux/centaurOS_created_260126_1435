/**
 * @file /api/agents/tts/route.ts
 *
 * @description Text-to-speech proxy for specialist voice output. Supports both
 * OpenAI gpt-4o-mini-tts and MiniMax Speech 2.6/2.8 for specialist voice output.
 *
 * MiniMax offers 300+ voices with emotion control, 40 languages, and faster latency
 * compared to OpenAI TTS. Use NEXT_PUBLIC_TTS_PROVIDER=minimax to enable.
 *
 * @security Requires authenticated user. Rate-limited to 20 req/min per user.
 * @audit Tracks usage under the 'specialist_tts' AI feature.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import OpenAI from "openai"
import { rateLimit } from "@/lib/security/rate-limit"
import { aiGuard } from "@/lib/ai/guard"
import { getAudioProvider, type AudioGenerationOptions } from "@/lib/ai-providers/registry"

// ─── Configuration ────────────────────────────────────────────────────────────

/** Which TTS provider to use: "openai" (default) or "minimax" */
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
    
    // Additional mapping for common voices
    alloy: "male-qn-qingse",
    coral: "female-shaonv",
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

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // SECURITY: Check provider configuration
        if (TTS_PROVIDER === "minimax" && !getMiniMaxKey()) {
            console.error("[TTS] MiniMax API key not configured")
            return NextResponse.json(
                { error: "TTS provider not configured. Please set MINIMAX_API_KEY." },
                { status: 503 }
            )
        }

        if (TTS_PROVIDER === "openai" && !getOpenAIKey()) {
            console.error("[TTS] OpenAI API key not configured")
            return NextResponse.json(
                { error: "Service temporarily unavailable" },
                { status: 503 }
            )
        }

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
        const activeProvider = provider ?? TTS_PROVIDER

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

        if (activeProvider === "minimax") {
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

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": String(audioBuffer.byteLength),
                "Cache-Control": "no-store",
            },
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error("[TTS] Failed:", { 
            error: message, 
            activeProvider, 
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
