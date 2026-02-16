/**
 * @file route.ts — Lightweight endpoint to check which voice backend is available.
 *
 * @description Returns which voice engine the client should use:
 * - "personaplex" if PERSONAPLEX_API_KEY is set (full-duplex upgrade)
 * - "half-duplex" otherwise (base case using existing STT + Execute + TTS)
 *
 * This is a fast, no-auth, no-rate-limit endpoint. It only checks
 * environment variables and returns a string — no external API calls.
 *
 * @returns { backend: "personaplex" | "half-duplex" }
 *
 * @security No sensitive data exposed. Only reveals whether an env var is SET,
 * not its value. Safe to call without authentication.
 */

import { NextResponse } from "next/server"

export async function GET(): Promise<NextResponse> {
    const hasPersonaPlex = Boolean(process.env.PERSONAPLEX_API_KEY?.trim())

    return NextResponse.json({
        backend: hasPersonaPlex ? "personaplex" : "half-duplex",
    })
}
