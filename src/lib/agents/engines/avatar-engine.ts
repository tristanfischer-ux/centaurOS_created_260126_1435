/**
 * @file avatar-engine.ts
 *
 * @description Tier 3/4 ConversationEngine — combines the RealtimeVoiceEngine
 * with a visual avatar provider for human-form specialist interactions.
 *
 * EXPERIMENTAL: This engine is a prototype for evaluation. It delegates all
 * voice/LLM work to the RealtimeVoiceEngine and adds a video avatar layer.
 *
 * Architecture:
 * - RealtimeVoiceEngine handles STT + LLM + TTS (currently via OpenAI Realtime API)
 * - Avatar provider renders a video stream driven by the audio output
 * - The specialist's face is lip-synced to the audio in real-time
 *
 * NOTE: OpenAI Realtime API is used for voice because MiniMax does not offer
 * a unified realtime API. See realtime-voice-engine.ts for details.
 *
 * Supported avatar providers (via adapter pattern):
 * - HeyGen LiveAvatar API (Tier 3: $0.07/min)
 * - Tavus/LiveKit (Tier 4: custom pricing)
 * - SimLi (Tier 3: $0.03/min, lower quality)
 *
 * Cost model (Feb 2026):
 * - Voice (OpenAI Realtime): ~$0.08-$0.24/min
 * - Avatar (HeyGen): ~$0.07/min
 * - Combined Tier 3: ~$0.15-$0.31/min
 *
 * @related
 * - src/lib/agents/conversation-engine.ts — Interface definition
 * - src/lib/agents/engines/realtime-voice-engine.ts — Voice layer
 * - https://docs.heygen.com/docs/streaming-api-overview — HeyGen docs
 */

import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"
import type {
    ConversationEngine,
    ConversationEngineConfig,
    ConversationEvent,
    SpecialistState,
} from "../conversation-engine"
import { registerEngine, createConversationEngine } from "../conversation-engine"

// ─── Avatar Provider Interface ───────────────────────────────────────────────

/**
 * Abstraction for avatar rendering providers.
 * Each provider (HeyGen, Tavus, SimLi) implements this interface.
 */
export interface AvatarProvider {
    /** Provider name for logging and UI display */
    readonly name: string

    /**
     * Initialize the avatar session and return a MediaStream for video.
     *
     * @param avatarId - Provider-specific avatar identifier
     * @param config - Session configuration
     * @returns MediaStream that can be attached to a <video> element
     */
    connect(avatarId: string, config: AvatarSessionConfig): Promise<MediaStream>

    /**
     * Send audio data to the avatar for lip-syncing.
     * The avatar renders mouth movements matching the audio.
     */
    sendAudio(audio: ArrayBuffer): void

    /**
     * Update the avatar's visual state (idle animation, listening pose, etc.)
     */
    setState(state: SpecialistState): void

    /** Clean up — close WebRTC connections, stop rendering */
    disconnect(): Promise<void>
}

export interface AvatarSessionConfig {
    /** Quality level: 'low' (360p), 'medium' (720p), 'high' (1080p) */
    quality: "low" | "medium" | "high"
    /** Background style */
    background: "transparent" | "office" | "neutral"
}

// ─── HeyGen Avatar Provider (Default) ────────────────────────────────────────

/**
 * HeyGen LiveAvatar provider — uses HeyGen's streaming API to render
 * a photorealistic avatar driven by audio input.
 *
 * Requires:
 * - HEYGEN_API_KEY environment variable on the relay server
 * - A pre-created avatar ID for each specialist
 *
 * Cost: ~$0.07/min (billed per second, minimum 1 second)
 */
class HeyGenAvatarProvider implements AvatarProvider {
    readonly name = "heygen"

    private sessionId: string | null = null
    private pc: RTCPeerConnection | null = null
    private dc: RTCDataChannel | null = null

    async connect(avatarId: string, config: AvatarSessionConfig): Promise<MediaStream> {
        // Step 1: Request a new streaming session from our relay
        const res = await fetch("/api/agents/avatar-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider: "heygen",
                avatarId,
                quality: config.quality,
                background: config.background,
            }),
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Avatar session failed" }))
            throw new Error(err.error || `Avatar session HTTP ${res.status}`)
        }

        const session = await res.json() as {
            sessionId: string
            sdpOffer: string
            iceServers: RTCIceServer[]
        }

        this.sessionId = session.sessionId

        // Step 2: Set up WebRTC peer connection
        this.pc = new RTCPeerConnection({
            iceServers: session.iceServers,
        })

        // Create a MediaStream to return to the UI
        const videoStream = new MediaStream()

        this.pc.ontrack = (event) => {
            event.streams[0]?.getTracks().forEach((track) => {
                videoStream.addTrack(track)
            })
        }

        // Step 3: Set remote description (SDP offer from HeyGen)
        await this.pc.setRemoteDescription(
            new RTCSessionDescription({
                type: "offer",
                sdp: session.sdpOffer,
            })
        )

        // Step 4: Create and send answer
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)

        // Send SDP answer back to our relay
        await fetch("/api/agents/avatar-session/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sessionId: this.sessionId,
                sdpAnswer: answer.sdp,
            }),
        })

        // Step 5: Open data channel for audio streaming
        this.dc = this.pc.createDataChannel("audio", { ordered: true })

        return videoStream
    }

    sendAudio(audio: ArrayBuffer): void {
        if (this.dc?.readyState === "open") {
            this.dc.send(audio)
        }
    }

    setState(_state: SpecialistState): void {
        // HeyGen handles idle animations automatically.
        // Future: send commands for custom poses/expressions.
    }

    async disconnect(): Promise<void> {
        if (this.dc) {
            this.dc.close()
            this.dc = null
        }
        if (this.pc) {
            this.pc.close()
            this.pc = null
        }
        // Tell our relay to close the HeyGen session
        if (this.sessionId) {
            fetch("/api/agents/avatar-session/close", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: this.sessionId }),
            }).catch((err) => {
                console.warn("[HeyGenProvider] Session close failed:", err)
            })
            this.sessionId = null
        }
    }
}

// ─── AvatarEngine ────────────────────────────────────────────────────────────

/**
 * Tier 3/4 conversation engine — real-time voice + visual avatar.
 *
 * Composes the RealtimeVoiceEngine (for STT/LLM/TTS) with an AvatarProvider
 * (for video rendering). The avatar's lips sync to the audio output in real-time.
 *
 * Connection flow:
 * 1. connect() starts the voice engine AND the avatar provider
 * 2. Voice engine audio_chunk events are forwarded to the avatar for lip-sync
 * 3. Avatar provides a MediaStream emitted as a video_stream event
 * 4. disconnect() tears down both layers
 *
 * @implements ConversationEngine
 */
class AvatarEngine implements ConversationEngine {
    readonly mode = "avatar" as const

    private voiceEngine: ConversationEngine | null = null
    private avatarProvider: AvatarProvider
    private config: ConversationEngineConfig | null = null
    private handlers: Set<(event: ConversationEvent) => void> = new Set()
    private currentState: SpecialistState = "idle"
    private voiceUnsubscribe: (() => void) | null = null

    constructor(avatarProvider?: AvatarProvider) {
        // Default to HeyGen — can be swapped for Tavus, SimLi, etc.
        this.avatarProvider = avatarProvider ?? new HeyGenAvatarProvider()
    }

    // ─── ConversationEngine interface ────────────────────────────────────

    async connect(config: ConversationEngineConfig): Promise<void> {
        this.config = config
        this.setState("connecting")

        try {
            // Step 1: Create and connect the voice engine
            this.voiceEngine = createConversationEngine("voice")
            if (!this.voiceEngine) {
                throw new Error("Voice engine not available — required for avatar mode")
            }

            // Step 2: Forward voice events to our handlers + avatar provider
            this.voiceUnsubscribe = this.voiceEngine.onEvent((event) => {
                // Forward all events to UI
                this.emit(event)

                // Forward audio to avatar for lip-sync
                if (event.type === "audio_chunk" && event.audio) {
                    this.avatarProvider.sendAudio(event.audio)
                }

                // Sync state to avatar
                if (event.type === "state_change" && event.state) {
                    this.currentState = event.state
                    this.avatarProvider.setState(event.state)
                }
            })

            // Step 3: Connect voice engine
            await this.voiceEngine.connect(config)

            // Step 4: Connect avatar provider
            // Map specialist IDs to avatar asset IDs (these would be pre-created in HeyGen)
            const avatarId = getAvatarIdForSpecialist(config.specialistId)
            const videoStream = await this.avatarProvider.connect(avatarId, {
                quality: "medium",
                background: "neutral",
            })

            // Emit the video stream for the UI to attach to a <video> element
            this.emit({ type: "video_stream", videoStream })
            this.setState("idle")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Avatar connection failed"
            console.error("[AvatarEngine] Connect failed:", message)
            this.emit({ type: "error", error: message })
            this.setState("error")
            // Clean up partial connections
            await this.disconnect()
            throw err
        }
    }

    async sendText(message: string, promptTemplate?: string): Promise<void> {
        if (!this.voiceEngine) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }
        await this.voiceEngine.sendText(message, promptTemplate)
    }

    async sendAudio(audioData: Blob): Promise<void> {
        if (!this.voiceEngine) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }
        await this.voiceEngine.sendAudio(audioData)
    }

    onEvent(handler: (event: ConversationEvent) => void): () => void {
        this.handlers.add(handler)
        return () => { this.handlers.delete(handler) }
    }

    getTranscript(): Array<{ role: "user" | "assistant"; content: string }> {
        return this.voiceEngine?.getTranscript() ?? []
    }

    getState(): SpecialistState {
        return this.currentState
    }

    async disconnect(): Promise<void> {
        // Unsubscribe from voice events
        this.voiceUnsubscribe?.()
        this.voiceUnsubscribe = null

        // Disconnect avatar provider
        await this.avatarProvider.disconnect().catch((err) => {
            console.warn("[AvatarEngine] Avatar disconnect error:", err)
        })

        // Disconnect voice engine
        if (this.voiceEngine) {
            await this.voiceEngine.disconnect().catch((err) => {
                console.warn("[AvatarEngine] Voice disconnect error:", err)
            })
            this.voiceEngine = null
        }

        this.handlers.clear()
        this.config = null
        this.setState("idle")
    }

    // ─── Internal helpers ────────────────────────────────────────────────

    private emit(event: ConversationEvent): void {
        for (const handler of this.handlers) {
            try {
                handler(event)
            } catch (err) {
                console.error("[AvatarEngine] Event handler error:", err)
            }
        }
    }

    private setState(state: SpecialistState): void {
        if (state === this.currentState) return
        this.currentState = state
        this.emit({ type: "state_change", state })
    }
}

// ─── Avatar Mapping ──────────────────────────────────────────────────────────

/**
 * Maps specialist IDs to their pre-created avatar asset IDs in the
 * avatar provider (e.g., HeyGen).
 *
 * These would be set up in the HeyGen dashboard with photos/videos
 * matching each specialist's appearance.
 *
 * PLACEHOLDER: Replace with actual HeyGen avatar IDs once created.
 */
const SPECIALIST_AVATAR_MAP: Partial<Record<SpecialistId, string>> = {
    strategist: "avatar_sage_placeholder",        // Sage
    cto: "avatar_max_placeholder",                // Max
    "vp-engineering": "avatar_jian_placeholder",  // Jian
    "vp-manufacturing": "avatar_fang_placeholder", // Fang
    "vp-supply-chain": "avatar_chase_placeholder", // Chase
    "product-lead": "avatar_priya_placeholder",  // Priya
    "growth-marketer": "avatar_mia_placeholder", // Mia
    "sales-lead": "avatar_sal_placeholder",       // Sal
    "chief-of-staff": "avatar_cal_placeholder",  // Cal
    "finance-lead": "avatar_finn_placeholder",   // Finn
    "fundraising-advisor": "avatar_fiona_placeholder", // Fiona
    "hiring-team": "avatar_harper_placeholder",  // Harper
    "legal-counsel": "avatar_leo_placeholder",   // Leo
}

/**
 * Get the avatar provider ID for a specialist.
 * Falls back to a generic avatar if no custom one is configured.
 */
function getAvatarIdForSpecialist(specialistId: string): string {
    return SPECIALIST_AVATAR_MAP[specialistId as SpecialistId] ?? "avatar_default"
}

// ─── Register ────────────────────────────────────────────────────────────────

registerEngine("avatar", () => new AvatarEngine())

export { AvatarEngine, HeyGenAvatarProvider }
