/**
 * @file availability.ts — Check which voice backend is available.
 *
 * @description Determines whether to use PersonaPlex (full-duplex) or the
 * half-duplex fallback (Whisper + Execute + TTS). The check is done client-side
 * via a lightweight API call.
 *
 * @related
 * - PersonaPlex engine: src/lib/agents/engines/personaplex-voice-engine.ts
 * - Half-duplex engine: src/lib/agents/engines/half-duplex-voice-engine.ts
 * - Session API: src/app/api/agents/personaplex-session/route.ts
 */

/**
 * Voice backend options.
 *
 * - "personaplex": Full-duplex via NVIDIA PersonaPlex (upgrade case)
 * - "half-duplex": Whisper STT + Execute SSE + TTS (base case, works now)
 * - "unavailable": No voice capability (shouldn't happen if OpenAI key is set)
 */
export type VoiceBackend = "personaplex" | "half-duplex" | "unavailable"

/** Cache the result to avoid repeated API calls */
let cachedBackend: VoiceBackend | null = null

/**
 * Check which voice backend is available.
 *
 * @description Calls a lightweight status endpoint that checks
 * whether the PersonaPlex API key is configured. Does NOT consume
 * rate limit tokens or create sessions.
 *
 * @returns The best available voice backend
 */
export async function checkVoiceBackend(): Promise<VoiceBackend> {
    if (cachedBackend) return cachedBackend

    try {
        const res = await fetch("/api/agents/voice-backend-status")

        if (res.ok) {
            const data = (await res.json()) as { backend: VoiceBackend }
            cachedBackend = data.backend
        } else {
            // Endpoint not available or error — default to half-duplex
            cachedBackend = "half-duplex"
        }
    } catch {
        // Network error — default to half-duplex
        cachedBackend = "half-duplex"
    }

    return cachedBackend
}

/**
 * Reset the cached backend check (e.g., after env changes).
 */
export function resetVoiceBackendCache(): void {
    cachedBackend = null
}
