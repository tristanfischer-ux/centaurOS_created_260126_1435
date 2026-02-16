/**
 * @file types.ts — Type definitions for the PersonaPlex integration.
 *
 * @description Defines the TypeScript types for NVIDIA's PersonaPlex speech-to-speech
 * API, including session configuration, voice IDs, events, and persona mapping.
 *
 * @related
 * - PersonaPlex API: https://personaplex.io
 * - PersonaPlex GitHub: https://github.com/NVIDIA/personaplex
 * - Model: https://huggingface.co/nvidia/personaplex-7b-v1
 */

// ─── Voice Identifiers ──────────────────────────────────────────────────────

/**
 * Pre-built voice embeddings from PersonaPlex.
 * Natural (NAT) voices sound more conversational; Variety (VAR) voices are more diverse.
 *
 * @see https://github.com/NVIDIA/personaplex#voices
 */
export const PERSONAPLEX_VOICES = {
    /** Natural female voices — conversational and warm */
    NATF0: "NATF0",
    NATF1: "NATF1",
    NATF2: "NATF2",
    NATF3: "NATF3",
    /** Natural male voices — conversational and warm */
    NATM0: "NATM0",
    NATM1: "NATM1",
    NATM2: "NATM2",
    NATM3: "NATM3",
    /** Variety female voices — more diverse characteristics */
    VARF0: "VARF0",
    VARF1: "VARF1",
    VARF2: "VARF2",
    VARF3: "VARF3",
    VARF4: "VARF4",
    /** Variety male voices — more diverse characteristics */
    VARM0: "VARM0",
    VARM1: "VARM1",
    VARM2: "VARM2",
    VARM3: "VARM3",
    VARM4: "VARM4",
} as const

export type PersonaPlexVoiceId = keyof typeof PERSONAPLEX_VOICES

// ─── Session Configuration ──────────────────────────────────────────────────

/**
 * Configuration for creating a PersonaPlex voice session.
 *
 * @param voice - Voice embedding ID (e.g., "NATF2")
 * @param persona - Text prompt defining the agent's role, personality, and context
 * @param sampleRate - Audio sample rate in Hz (default: 24000)
 */
export interface PersonaPlexSessionConfig {
    /** Voice embedding ID from PERSONAPLEX_VOICES */
    voice: PersonaPlexVoiceId
    /** Text prompt defining the agent's role and personality */
    persona: string
    /** Audio sample rate in Hz */
    sampleRate?: number
}

// ─── API Events ─────────────────────────────────────────────────────────────

/**
 * Events received from the PersonaPlex WebSocket connection.
 * PersonaPlex operates in full-duplex: it can listen and speak simultaneously.
 */
export type PersonaPlexEventType =
    | "session.created"           // Session established, ready for audio
    | "session.error"             // Session-level error
    | "audio.delta"               // Outgoing audio chunk (agent speaking)
    | "audio.done"                // Agent finished speaking
    | "transcript.agent.delta"    // Real-time transcript of agent speech
    | "transcript.agent.done"     // Final transcript of agent speech
    | "transcript.user.delta"     // Real-time transcript of user speech
    | "transcript.user.done"      // Final transcript of user speech
    | "turn.started"              // Agent started a new turn (began speaking)
    | "turn.ended"                // Agent ended a turn (stopped speaking)
    | "interruption.detected"     // User interrupted the agent
    | "backchannel"               // Agent backchannel response (uh-huh, etc.)

export interface PersonaPlexEvent {
    type: PersonaPlexEventType
    /** Session ID */
    sessionId?: string
    /** Base64-encoded audio data (for audio.delta) */
    audio?: string
    /** Transcript text (for transcript events) */
    text?: string
    /** Error details (for session.error) */
    error?: { message: string; code: string }
}

// ─── Persona Mapping ────────────────────────────────────────────────────────

/**
 * Maps a ForgeOS specialist to PersonaPlex session parameters.
 *
 * @description Each specialist gets a PersonaPlex voice assignment and a compiled
 * text prompt that captures their personality, backstory, and interaction style.
 */
export interface SpecialistPersonaPlexMapping {
    /** ForgeOS specialist ID */
    specialistId: string
    /** Human name of the specialist */
    name: string
    /** Functional title */
    title: string
    /** PersonaPlex voice embedding ID */
    voice: PersonaPlexVoiceId
    /** Compiled text prompt for PersonaPlex persona */
    textPrompt: string
}

// ─── Client Types ───────────────────────────────────────────────────────────

/**
 * Response from the session creation endpoint.
 */
export interface PersonaPlexSessionResponse {
    /** WebSocket URL to connect for audio streaming */
    wsUrl: string
    /** Session identifier */
    sessionId: string
    /** Session expiry timestamp (ISO 8601) */
    expiresAt: string
}

/**
 * Configuration for the PersonaPlex API client.
 */
export interface PersonaPlexClientConfig {
    /** PersonaPlex API key */
    apiKey: string
    /** Base URL for the PersonaPlex API (default: https://api.personaplex.io) */
    baseUrl?: string
}

// ─── Cost Tracking ──────────────────────────────────────────────────────────

/**
 * Usage record for a PersonaPlex voice session.
 * Used for billing and cost tracking.
 */
export interface PersonaPlexUsageRecord {
    /** Session identifier */
    sessionId: string
    /** Specialist ID used in this session */
    specialistId: string
    /** User ID who initiated the session */
    userId: string
    /** Foundry ID for multi-tenant billing */
    foundryId: string
    /** Duration of the session in seconds */
    durationSeconds: number
    /** Cost of the session in USD (at $0.08/min) */
    costUsd: number
    /** Timestamp when the session started */
    startedAt: string
    /** Timestamp when the session ended */
    endedAt: string
}
