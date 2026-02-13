/**
 * @file /api/agents/stt/route.ts
 *
 * @description Speech-to-text proxy for specialist voice input. Accepts an audio
 * blob (via FormData), forwards it to OpenAI Whisper, and returns the transcript.
 * Works with any browser that supports MediaRecorder (all modern browsers).
 *
 * @security Requires authenticated user. Rate-limited to 30 req/min per user.
 * @audit Tracks usage under the 'specialist_stt' AI feature.
 *
 * @related
 * - src/hooks/use-speech-recognition.ts - Client-side hook that records and sends audio
 * - src/app/api/agents/tts/route.ts - Companion TTS route
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import OpenAI, { toFile } from "openai"
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

/** Maximum audio file size (25MB — OpenAI's limit) */
const MAX_AUDIO_SIZE = 25 * 1024 * 1024

/** Allowed audio MIME types from MediaRecorder */
const ALLOWED_MIME_TYPES = new Set([
    "audio/webm",        // Chrome, Edge, Firefox
    "audio/ogg",         // Firefox fallback
    "audio/mp4",         // Safari
    "audio/m4a",         // Safari fallback
    "audio/mpeg",        // MP3
    "audio/wav",         // WAV
    "audio/x-m4a",       // Safari variant
])

/**
 * Map MIME type to a file extension Whisper recognizes.
 *
 * @description OpenAI Whisper identifies format by file extension, not MIME type.
 * We must provide the correct extension for the audio container format.
 */
function mimeToExtension(mime: string): string {
    const map: Record<string, string> = {
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/mp4": "mp4",
        "audio/m4a": "m4a",
        "audio/x-m4a": "m4a",
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
    }
    return map[mime] ?? "webm"
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // SECURITY: Check if OpenAI is configured
        if (!process.env.OPENAI_API_KEY) {
            console.error("[STT] OpenAI API key not configured")
            return NextResponse.json(
                { error: "Service temporarily unavailable" },
                { status: 503 }
            )
        }

        const supabase = await createClient()

        // AUTH: Verify user is authenticated and within AI limits
        const guard = await aiGuard(supabase, "specialist_stt")
        if (guard.denied) return guard.response

        // SECURITY: Rate limit to prevent cost abuse (30 per minute per user)
        const rateLimitResult = await rateLimit("api", `stt:${guard.userId}`, {
            limit: 30,
            window: 60,
        })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before transcribing more audio." },
                { status: 429 }
            )
        }

        // VALIDATION: Parse FormData and extract audio blob
        const formData = await req.formData()
        const audioBlob = formData.get("audio")

        if (!audioBlob || !(audioBlob instanceof Blob)) {
            return NextResponse.json(
                { error: "Audio file is required. Send as FormData with 'audio' field." },
                { status: 400 }
            )
        }

        // VALIDATION: Check file size
        if (audioBlob.size > MAX_AUDIO_SIZE) {
            return NextResponse.json(
                { error: `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE / 1024 / 1024}MB.` },
                { status: 400 }
            )
        }

        if (audioBlob.size === 0) {
            return NextResponse.json(
                { error: "Audio file is empty." },
                { status: 400 }
            )
        }

        // VALIDATION: Check MIME type
        const mimeBase = audioBlob.type.split(";")[0].trim()
        if (!ALLOWED_MIME_TYPES.has(mimeBase)) {
            console.warn("[STT] Unexpected MIME type:", audioBlob.type)
            // Don't reject — MediaRecorder can produce various types, Whisper is flexible
        }

        // Convert blob to a File object that the OpenAI SDK expects
        const extension = mimeToExtension(mimeBase)
        const audioBuffer = await audioBlob.arrayBuffer()
        const file = await toFile(
            new Uint8Array(audioBuffer),
            `recording.${extension}`,
            { type: audioBlob.type }
        )

        // Call OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
            file,
            model: "whisper-1",
            response_format: "text",
            language: "en",
        })

        // AUDIT: Track usage (fire and forget)
        guard.trackUsage({
            model: "whisper-1",
            metadata: {
                audioSize: audioBlob.size,
                mimeType: mimeBase,
                transcriptLength: typeof transcription === "string" ? transcription.length : 0,
            },
        }).catch((err: unknown) => {
            console.warn("[STT] Usage tracking failed:", err)
        })

        // The response_format "text" returns a plain string
        const transcript = typeof transcription === "string"
            ? transcription.trim()
            : (transcription as unknown as { text: string }).text?.trim() ?? ""

        return NextResponse.json({ transcript })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error("[STT] Failed:", { error: message })

        if (message.includes("API key")) {
            return NextResponse.json(
                { error: "AI service configuration error" },
                { status: 503 }
            )
        }

        return NextResponse.json(
            { error: "Failed to transcribe audio" },
            { status: 500 }
        )
    }
}
