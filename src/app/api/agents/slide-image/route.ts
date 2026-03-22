/**
 * @file /api/agents/slide-image
 *
 * @description Generates a single presentation slide image using Gemini.
 * Called by InlinePresentationCard for each slide that has an imagePrompt.
 * Returns a base64 data URI that the client renders inline.
 *
 * @security Authenticated endpoint -- requires valid Supabase session.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { aiGuard } from "@/lib/ai/guard"
import { rateLimit } from "@/lib/security/rate-limit"
import { getImageProvider } from "@/lib/ai-providers/registry"

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview"

export async function POST(request: NextRequest): Promise<NextResponse> {
    // AUTH + AI GATE: Verify user session and check AI usage limits
    const supabase = await createClient()
    const guard = await aiGuard(supabase, 'slide_image')
    if (guard.denied) return guard.response

    // SECURITY: Rate limit image generation (20 per minute per user)
    const rateLimitResult = await rateLimit('api', `slide-image:${guard.userId}`, { limit: 20, window: 60 * 1000 })
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: "Rate limit exceeded. Please wait before generating more images." },
            { status: 429 },
        )
    }

    const body = await request.json() as { imagePrompt?: string }
    const { imagePrompt } = body

    if (!imagePrompt || typeof imagePrompt !== "string") {
        return NextResponse.json(
            { error: "imagePrompt is required" },
            { status: 400 },
        )
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY?.trim() ?? process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
        return NextResponse.json(
            { error: "Google AI API key not configured" },
            { status: 500 },
        )
    }

    const generateImage = getImageProvider("google")
    if (!generateImage) {
        return NextResponse.json(
            { error: "Google image provider not available" },
            { status: 500 },
        )
    }

    try {
        const result = await generateImage({
            apiKey,
            modelId: GEMINI_IMAGE_MODEL,
            prompt: imagePrompt,
        })
        await guard.trackUsage({ model: GEMINI_IMAGE_MODEL })
        return NextResponse.json({ imageUrl: result.imageUrl })
    } catch (err) {
        console.error("[SlideImage] Generation failed:", {
            error: err instanceof Error ? err.message : "Unknown error",
            userId: guard.userId,
        })
        return NextResponse.json(
            { error: "Image generation failed" },
            { status: 500 },
        )
    }
}
