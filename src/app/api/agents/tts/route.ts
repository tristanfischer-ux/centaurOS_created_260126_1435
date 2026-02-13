/**
 * @file /api/agents/tts/route.ts
 *
 * @description Text-to-speech proxy for specialist voice output. Accepts text
 * and an OpenAI voice ID, streams back audio/mpeg via OpenAI gpt-4o-mini-tts.
 *
 * @security Requires authenticated user. Rate-limited to 20 req/min per user.
 * @audit Tracks usage under the 'specialist_tts' AI feature.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import OpenAI from "openai"
import { rateLimit } from "@/lib/security/rate-limit"
import { aiGuard } from "@/lib/ai/guard"

// SECURITY: Fail fast if OpenAI API key is not configured
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey && process.env.NODE_ENV === "production") {
    console.error("[CRITICAL] OPENAI_API_KEY not configured in production!")
}

const openai = new OpenAI({
    apiKey: apiKey || "dummy-key-for-build",
})

/** Allowed OpenAI TTS voices */
const ALLOWED_VOICES = new Set([
    "alloy", "ash", "ballad", "coral", "echo",
    "fable", "nova", "onyx", "sage", "shimmer", "verse",
])

/** Maximum text length to send to TTS (chars) */
const MAX_TEXT_LENGTH = 4000

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // SECURITY: Check if OpenAI is configured
        if (!process.env.OPENAI_API_KEY) {
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
            window: 60,
        })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before requesting more speech." },
                { status: 429 }
            )
        }

        // VALIDATION: Parse and validate request body
        const body = await req.json()
        const { text, voice } = body as { text?: string; voice?: string }

        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return NextResponse.json(
                { error: "Text is required" },
                { status: 400 }
            )
        }

        if (!voice || !ALLOWED_VOICES.has(voice)) {
            return NextResponse.json(
                { error: `Invalid voice. Allowed: ${[...ALLOWED_VOICES].join(", ")}` },
                { status: 400 }
            )
        }

        // Truncate long text gracefully
        const truncatedText = text.length > MAX_TEXT_LENGTH
            ? text.slice(0, MAX_TEXT_LENGTH) + "..."
            : text

        // Call OpenAI TTS
        const audioResponse = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: voice as "alloy",
            input: truncatedText,
            response_format: "mp3",
        })

        // AUDIT: Track usage (fire and forget)
        guard.trackUsage({
            model: "gpt-4o-mini-tts",
            metadata: { voice, textLength: truncatedText.length },
        }).catch((err: unknown) => {
            console.warn("[TTS] Usage tracking failed:", err)
        })

        // Stream the audio response back to the client
        const audioBuffer = await audioResponse.arrayBuffer()

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
        console.error("[TTS] Failed:", { error: message })

        // Check for OpenAI-specific errors
        if (message.includes("API key")) {
            return NextResponse.json(
                { error: "AI service configuration error" },
                { status: 503 }
            )
        }

        return NextResponse.json(
            { error: "Failed to generate speech" },
            { status: 500 }
        )
    }
}
