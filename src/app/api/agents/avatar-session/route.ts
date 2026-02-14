/**
 * @file /api/agents/avatar-session/route.ts
 *
 * @description Relay server for HeyGen LiveAvatar streaming sessions.
 *
 * This endpoint orchestrates WebRTC connections between the client and HeyGen's
 * streaming avatar API. It handles:
 * - POST /api/agents/avatar-session — Create a new HeyGen streaming session
 * - POST /api/agents/avatar-session/answer — Complete the WebRTC handshake
 * - POST /api/agents/avatar-session/close — Clean up the HeyGen session
 *
 * HeyGen LiveAvatar API:
 * - Docs: https://docs.heygen.com/docs/streaming-api-overview
 * - Pricing: ~$0.07/min (billed per second, minimum 1 second)
 *
 * @security Requires authentication. Rate-limited to 10 sessions/minute per user.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/security/rate-limit"
import { aiGuard } from "@/lib/ai/guard"

// ─── Configuration ────────────────────────────────────────────────────────────

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY
const HEYGEN_API_BASE = "https://api.heygen.com"

interface AvatarSession {
    sessionId: string
    userId: string
    createdAt: Date
    closedAt?: Date
}

// In-memory session store (for demo purposes - in production, use Redis)
const sessions = new Map<string, AvatarSession>()

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function createHeyGenSession(
    avatarId: string,
    quality: string,
    background: string
): Promise<{ sessionId: string; sdpOffer: string; iceServers: RTCIceServer[] }> {
    if (!HEYGEN_API_KEY) {
        throw new Error("HeyGen API key not configured")
    }

    // Call HeyGen to create a streaming session
    const response = await fetch(`${HEYGEN_API_BASE}/v1/streaming/avatar`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${HEYGEN_API_KEY}`,
        },
        body: JSON.stringify({
            avatar_id: avatarId,
            quality: quality || "medium",
            background: background || "transparent",
            // WebRTC configuration
            webrtc: {
                // These will be configured by the client
            },
        }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`HeyGen session creation failed: ${error}`)
    }

    const data = await response.json()

    return {
        sessionId: data.session_id,
        sdpOffer: data.webrtc?.sdp || "",
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
        ],
    }
}

async function closeHeyGenSession(sessionId: string): Promise<void> {
    if (!HEYGEN_API_KEY) return

    try {
        await fetch(`${HEYGEN_API_BASE}/v1/streaming/avatar/${sessionId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${HEYGEN_API_KEY}`,
            },
        })
    } catch (err) {
        console.warn("[AvatarSession] Failed to close HeyGen session:", err)
    }
}

// ─── Route Handlers ─────────────────────────────────────────────────────────

/**
 * POST /api/agents/avatar-session
 * Create a new avatar streaming session
 */
export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Check HeyGen configuration
        if (!HEYGEN_API_KEY) {
            return NextResponse.json(
                { error: "Avatar service not configured. Please set HEYGEN_API_KEY." },
                { status: 503 }
            )
        }

        const supabase = await createClient()

        // AUTH: Verify user is authenticated
        const guard = await aiGuard(supabase, "specialist_avatar")
        if (guard.denied) return guard.response

        // Rate limit: 10 sessions per minute
        const rateLimitResult = await rateLimit("api", `avatar-session:${guard.userId}`, {
            limit: 10,
            window: 60 * 1000,
        })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before creating more sessions." },
                { status: 429 }
            )
        }

        // Parse request body
        const body = await req.json()
        const { provider, avatarId, quality, background } = body as {
            provider?: string
            avatarId?: string
            quality?: string
            background?: string
        }

        // Validate provider
        if (provider && provider !== "heygen") {
            return NextResponse.json(
                { error: `Unsupported avatar provider: ${provider}` },
                { status: 400 }
            )
        }

        // Create HeyGen session
        const heygenSession = await createHeyGenSession(
            avatarId || "default",
            quality || "medium",
            background || "transparent"
        )

        // Store session in memory
        const session: AvatarSession = {
            sessionId: heygenSession.sessionId,
            userId: guard.userId,
            createdAt: new Date(),
        }
        sessions.set(heygenSession.sessionId, session)

        console.info(`[AvatarSession] Created session ${heygenSession.sessionId} for user ${guard.userId}`)

        return NextResponse.json({
            sessionId: heygenSession.sessionId,
            sdpOffer: heygenSession.sdpOffer,
            iceServers: heygenSession.iceServers,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error("[AvatarSession] Create failed:", message)
        return NextResponse.json(
            { error: "Failed to create avatar session" },
            { status: 500 }
        )
    }
}

/**
 * POST /api/agents/avatar-session/answer
 * Complete the WebRTC handshake by sending the client's SDP answer
 */
export async function PUT(req: NextRequest): Promise<Response> {
    try {
        if (!HEYGEN_API_KEY) {
            return NextResponse.json(
                { error: "Avatar service not configured" },
                { status: 503 }
            )
        }

        const supabase = await createClient()
        const guard = await aiGuard(supabase, "specialist_avatar")
        if (guard.denied) return guard.response

        const body = await req.json()
        const { sessionId, sdpAnswer } = body as {
            sessionId?: string
            sdpAnswer?: string
        }

        if (!sessionId || !sdpAnswer) {
            return NextResponse.json(
                { error: "sessionId and sdpAnswer are required" },
                { status: 400 }
            )
        }

        // Verify session belongs to user
        const session = sessions.get(sessionId)
        if (!session || session.userId !== guard.userId) {
            return NextResponse.json(
                { error: "Invalid session" },
                { status: 404 }
            )
        }

        // Send SDP answer to HeyGen
        const response = await fetch(
            `${HEYGEN_API_BASE}/v1/streaming/avatar/${sessionId}/answer`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${HEYGEN_API_KEY}`,
                },
                body: JSON.stringify({
                    sdp: sdpAnswer,
                }),
            }
        )

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`HeyGen answer failed: ${error}`)
        }

        console.info(`[AvatarSession] Connected session ${sessionId}`)

        return NextResponse.json({ success: true })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error("[AvatarSession] Answer failed:", message)
        return NextResponse.json(
            { error: "Failed to connect avatar session" },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/agents/avatar-session/close
 * Close an avatar streaming session
 */
export async function DELETE(req: NextRequest): Promise<Response> {
    try {
        const supabase = await createClient()
        const guard = await aiGuard(supabase, "specialist_avatar")
        if (guard.denied) return guard.response

        const body = await req.json()
        const { sessionId } = body as { sessionId?: string }

        if (!sessionId) {
            return NextResponse.json(
                { error: "sessionId is required" },
                { status: 400 }
            )
        }

        // Verify session belongs to user
        const session = sessions.get(sessionId)
        if (!session || session.userId !== guard.userId) {
            return NextResponse.json(
                { error: "Invalid session" },
                { status: 404 }
            )
        }

        // Close HeyGen session
        await closeHeyGenSession(sessionId)

        // Clean up local session
        session.closedAt = new Date()
        sessions.delete(sessionId)

        console.info(`[AvatarSession] Closed session ${sessionId}`)

        return NextResponse.json({ success: true })
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error("[AvatarSession] Close failed:", message)
        return NextResponse.json(
            { error: "Failed to close avatar session" },
            { status: 500 }
        )
    }
}
