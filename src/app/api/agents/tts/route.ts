/**
 * @file /api/agents/tts/route.ts
 *
 * @description Text-to-speech proxy for specialist voice output. Supports both
 * OpenAI gpt-4o-mini-tts and MiniMax Speech 2.6/2.8 for specialist voice output.
 *
 * DECISION: OpenAI responses are streamed through to the client instead of
 * buffering the entire MP3 server-side. This reduces time-to-first-byte by
 * eliminating the server buffering step (previously waited for full arrayBuffer
 * before responding). The client can begin decoding/playing sooner.
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

/** Which TTS provider to use: "openai" (default) or "minimax" */
const TTS_PROVIDER = process.env.NEXT_PUBLIC_TTS_PROVIDER ?? "openai"

/** Default MiniMax model for TTS */
const MINIMAX_TTS_MODEL = "speech-2.6-turbo"

let minimaxApiKey: string | undefined
function getMiniMaxKey(): string | undefined {
    if (!minimaxApiKey) {
        minimaxApiKey = process.env.MINIMAX_API_KEY
    }
    return minimaxApiKey
}

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return null
    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey })
    }
    return openaiClient
}

// ─── Voice Mapping ────────────────────────────────────────────────────────────

const ALLOWED_OPENAI_VOICES = new Set([
    "alloy", "ash", "ballad", "coral", "echo",
    "fable", "nova", "onyx", "sage", "shimmer", "verse",
])

const OPENAI_TO_MINIMAX_VOICE: Record<string, string> = {
    alloy: "male-qn-qingse",
    echo: "male-qn-jingying",
    coral: "female-shaonv",
    ash: "male-qn-badao",
    nova: "female-yujie",
    sage: "male-qn-qingse",
    ballad: "female-yujie",
    fable: "female-shaonv",
    shimmer: "female-xingchen",
    onyx: "male-qn-badao",
    verse: "male-qn-jingying",
}

const MAX_TEXT_LENGTH = 4000

// ─── OpenAI TTS (Streaming) ─────────────────────────────────────────────────

/**
 * INTENT: Stream the OpenAI TTS response body directly instead of buffering
 * the entire MP3 into an ArrayBuffer. This lets the client start receiving
 * audio bytes as soon as OpenAI begins generating, cutting time-to-first-byte.
 */
async function streamOpenAITTS(text: string, voice: string): Promise<Response> {
    const openai = getOpenAI()
    if (!openai) {
        throw new Error("OpenAI API key not configured")
    }

    const audioResponse = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: voice as "alloy",
        input: text,
        response_format: "mp3",
    })

    const body = audioResponse.body
    if (!body) {
        throw new Error("OpenAI TTS returned empty body")
    }

    return new Response(body as ReadableStream, {
        status: 200,
        headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
        },
    })
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

    const response = await fetch(result.audioUrl)
    if (!response.ok) {
        throw new Error(`Failed to fetch MiniMax audio: ${response.status}`)
    }

    return response.arrayBuffer()
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
    let activeProvider: "openai" | "minimax" = TTS_PROVIDER === "minimax" ? "minimax" : "openai"

    try {
        const supabase = await createClient()

        const guard = await aiGuard(supabase, "specialist_tts")
        if (guard.denied) return guard.response

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

        if (provider === "openai" || provider === "minimax") {
            activeProvider = provider
        } else {
            activeProvider = TTS_PROVIDER === "minimax" ? "minimax" : "openai"
        }

        if (activeProvider !== "openai" && activeProvider !== "minimax") {
            return NextResponse.json(
                { error: `Unsupported provider: ${activeProvider}` },
                { status: 400 }
            )
        }

        if (activeProvider === "minimax" && !getMiniMaxKey()) {
            console.error("[TTS] MiniMax API key not configured")
            return NextResponse.json(
                { error: "TTS provider not configured. Please set MINIMAX_API_KEY." },
                { status: 503 }
            )
        }

        if (activeProvider === "openai" && !getOpenAI()) {
            console.error("[TTS] OpenAI API key not configured")
            return NextResponse.json(
                { error: "Service temporarily unavailable" },
                { status: 503 }
            )
        }

        if (activeProvider === "openai") {
            if (!voice || !ALLOWED_OPENAI_VOICES.has(voice)) {
                return NextResponse.json(
                    { error: `Invalid OpenAI voice. Allowed: ${[...ALLOWED_OPENAI_VOICES].join(", ")}` },
                    { status: 400 }
                )
            }
        }

        const truncatedText = text.length > MAX_TEXT_LENGTH
            ? text.slice(0, MAX_TEXT_LENGTH) + "..."
            : text

        const modelUsed = activeProvider === "minimax" ? MINIMAX_TTS_MODEL : "gpt-4o-mini-tts"
        guard.trackUsage({
            model: modelUsed,
            metadata: { voice, provider: activeProvider, textLength: truncatedText.length },
        }).catch((err: unknown) => {
            console.warn("[TTS] Usage tracking failed:", err)
        })

        if (activeProvider === "openai") {
            return await streamOpenAITTS(truncatedText, voice ?? "alloy")
        }

        console.info(`[TTS] Using MiniMax TTS with voice: ${voice}`)
        const audioBuffer = await generateMiniMaxTTS(truncatedText, voice ?? "echo")

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
            hasOpenAI: !!getOpenAI()
        })

        if (message.includes("API key") || message.includes("not configured") || message.includes("not available")) {
            return NextResponse.json(
                { error: "AI service not configured. Please contact support." },
                { status: 503 }
            )
        }

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
