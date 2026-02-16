/**
 * @file /api/agents/personaplex-session/route.ts
 *
 * @description Creates and manages PersonaPlex voice sessions for specialist
 * conversations. Handles session creation (POST) and teardown (DELETE).
 *
 * The browser never sees the PersonaPlex API key — this route creates the
 * session server-side and returns a WebSocket URL with an embedded session
 * token that the browser connects to directly.
 *
 * @security Requires authenticated user. Rate-limited to 10 sessions/hour.
 * @audit Logs session creation to track voice minute usage for billing.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/security/rate-limit"
import { createPersonaPlexClient } from "@/lib/personaplex/client"
import { getPersonaPlexVoice, compilePersonaPlexPrompt } from "@/lib/personaplex/persona-mapping"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"

// ─── POST: Create a new PersonaPlex voice session ────────────────────────────

/**
 * Creates a PersonaPlex voice session for a specialist conversation.
 *
 * @param request - JSON body with specialistId, threadId, foundryId
 * @returns JSON with wsUrl (WebSocket endpoint) and sessionId
 *
 * @throws 401 if not authenticated
 * @throws 400 if specialistId is missing or invalid
 * @throws 503 if PersonaPlex API key is not configured
 * @throws 429 if rate limit exceeded (10 sessions/hour)
 *
 * @security Requires authenticated Supabase session
 * @audit Logs session creation with specialistId and userId
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // SECURITY: Rate limit — 10 voice sessions per hour per user
    const rateLimitResult = await rateLimit("personaplex", user.id, { limit: 10, window: 3_600_000 })
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: "Rate limit exceeded. Try again later." },
            { status: 429 }
        )
    }

    // VALIDATION: Parse and validate request body
    let body: {
        specialistId?: string
        threadId?: string | null
        foundryId?: string | null
        systemPromptSuffix?: string
        voice?: string
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { specialistId } = body
    if (!specialistId) {
        return NextResponse.json({ error: "specialistId is required" }, { status: 400 })
    }

    // Look up the specialist
    const specialist = getSpecialistById(specialistId)
    if (!specialist) {
        return NextResponse.json({ error: `Unknown specialist: ${specialistId}` }, { status: 400 })
    }

    // Create the PersonaPlex client
    const client = createPersonaPlexClient()
    if (!client) {
        return NextResponse.json(
            { error: "Voice calls are not configured. Set PERSONAPLEX_API_KEY." },
            { status: 503 }
        )
    }

    try {
        // Compile the specialist persona into a PersonaPlex text prompt
        const personaPlexVoice = getPersonaPlexVoice(specialistId)

        // Build the text prompt — use systemPromptSuffix if provided (contains
        // full personality + company context), otherwise compile from specialist data
        let textPrompt: string
        if (body.systemPromptSuffix && body.systemPromptSuffix.trim().length > 100) {
            // Full personality + context prompt from the caller
            textPrompt = [
                body.systemPromptSuffix,
                "",
                "IMPORTANT: You are in a live voice conversation. Keep responses concise and spoken-word-friendly.",
                "No bullet lists, no markdown. You are speaking, not writing.",
                "If the founder interrupts, stop and listen immediately.",
            ].join("\n")
        } else {
            // Compile from specialist personality data
            textPrompt = compilePersonaPlexPrompt(specialist)
        }

        // Create the PersonaPlex session
        const session = await client.createSession({
            voice: personaPlexVoice,
            persona: textPrompt,
            sampleRate: 24000,
        })

        // AUDIT: Log session creation for billing and usage tracking
        console.info("[PersonaPlex] Session created:", {
            sessionId: session.sessionId,
            specialistId,
            userId: user.id,
            foundryId: body.foundryId,
            voice: personaPlexVoice,
        })

        return NextResponse.json({
            wsUrl: session.wsUrl,
            sessionId: session.sessionId,
            specialistId,
            specialistName: specialist.name,
            voice: personaPlexVoice,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Session creation failed"
        console.error("[PersonaPlex] Session creation error:", {
            specialistId,
            userId: user.id,
            error: message,
        })
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// ─── DELETE: End a PersonaPlex voice session ──────────────────────────────────

/**
 * Ends an active PersonaPlex voice session.
 *
 * @param request - Query parameter: sessionId
 * @returns 200 on success
 *
 * @security Requires authenticated user (session ownership not enforced
 * server-side since sessions auto-expire)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId")
    if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    }

    const client = createPersonaPlexClient()
    if (client) {
        await client.endSession(sessionId)
    }

    // AUDIT: Log session end
    console.info("[PersonaPlex] Session ended:", {
        sessionId,
        userId: user.id,
    })

    return NextResponse.json({ success: true })
}
