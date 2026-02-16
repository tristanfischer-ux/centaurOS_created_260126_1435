/**
 * @file client.ts — PersonaPlex API client for ForgeOS.
 *
 * @description Provides a typed client for NVIDIA's PersonaPlex speech-to-speech API.
 * Handles session creation, WebSocket connection management, and audio streaming.
 *
 * PersonaPlex is a full-duplex voice model: it listens and speaks simultaneously,
 * enabling natural interruptions, barge-ins, and backchannels.
 *
 * @security API key is stored server-side and never exposed to the browser.
 * The browser connects via a relay endpoint that injects the API key.
 *
 * @related
 * - Types: src/lib/personaplex/types.ts
 * - Engine: src/lib/agents/engines/personaplex-voice-engine.ts
 * - API route: src/app/api/agents/personaplex-session/route.ts
 */

import type {
    PersonaPlexClientConfig,
    PersonaPlexSessionConfig,
    PersonaPlexSessionResponse,
} from "./types"

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://api.personaplex.io"
const DEFAULT_SAMPLE_RATE = 24000

// ─── PersonaPlexClient ──────────────────────────────────────────────────────

/**
 * Server-side client for the PersonaPlex API.
 *
 * @description Used in API routes to create sessions and manage
 * PersonaPlex resources. Never instantiated in browser code.
 *
 * @example
 * const client = new PersonaPlexClient({ apiKey: process.env.PERSONAPLEX_API_KEY! })
 * const session = await client.createSession({
 *   voice: "NATF2",
 *   persona: "You are a corporate legal advisor named Leo...",
 * })
 */
export class PersonaPlexClient {
    private readonly apiKey: string
    private readonly baseUrl: string

    constructor(config: PersonaPlexClientConfig) {
        if (!config.apiKey) {
            throw new Error("[PersonaPlexClient] API key is required")
        }
        this.apiKey = config.apiKey
        this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    }

    /**
     * Create a new PersonaPlex voice session.
     *
     * @description Initializes a full-duplex voice session with the specified
     * voice and persona. Returns a WebSocket URL for audio streaming.
     *
     * @param config - Session configuration (voice, persona, sample rate)
     * @returns Session details including WebSocket URL and session ID
     *
     * @throws {Error} If the API key is invalid or the request fails
     *
     * @security The API key is sent server-side only. The returned WebSocket
     * URL includes a session token that expires after the session.
     */
    async createSession(config: PersonaPlexSessionConfig): Promise<PersonaPlexSessionResponse> {
        const response = await fetch(`${this.baseUrl}/v1/sessions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                voice: config.voice,
                persona: config.persona,
                sample_rate: config.sampleRate ?? DEFAULT_SAMPLE_RATE,
                modalities: ["audio", "text"],
                audio_format: "pcm16",
                enable_transcription: true,
                enable_interruption: true,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error")
            console.error("[PersonaPlexClient] Session creation failed:", {
                status: response.status,
                error: errorText,
            })
            throw new Error(
                `PersonaPlex session creation failed (${response.status}): ${errorText}`
            )
        }

        const data = (await response.json()) as PersonaPlexSessionResponse
        return data
    }

    /**
     * End an active PersonaPlex session.
     *
     * @param sessionId - The session to terminate
     */
    async endSession(sessionId: string): Promise<void> {
        try {
            await fetch(`${this.baseUrl}/v1/sessions/${sessionId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            })
        } catch (err) {
            // Non-critical — sessions expire automatically
            console.warn("[PersonaPlexClient] Failed to end session:", {
                sessionId,
                error: err instanceof Error ? err.message : "Unknown error",
            })
        }
    }

    /**
     * Check API health and validate credentials.
     *
     * @returns True if the API is reachable and credentials are valid
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/v1/health`, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            })
            return response.ok
        } catch {
            return false
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a PersonaPlexClient using the environment variable.
 *
 * @returns A configured client, or null if the API key is not set
 */
export function createPersonaPlexClient(): PersonaPlexClient | null {
    const apiKey = process.env.PERSONAPLEX_API_KEY
    if (!apiKey) {
        console.warn("[PersonaPlex] PERSONAPLEX_API_KEY not set — voice calls disabled")
        return null
    }
    return new PersonaPlexClient({ apiKey })
}
