/**
 * @file personaplex-voice-engine.ts
 *
 * @description ConversationEngine implementation using NVIDIA PersonaPlex for
 * full-duplex, real-time speech-to-speech conversations with specialists.
 *
 * Key differences from the OpenAI Realtime engine:
 * - Full-duplex: PersonaPlex listens while speaking (natural interruptions)
 * - Single model: No cascaded ASR→LLM→TTS pipeline — one model handles everything
 * - ~170ms latency: Fastest open-source voice model available
 * - Persona control: Voice + text prompts define the specialist's identity
 *
 * Connection flow:
 * 1. connect() POSTs to /api/agents/personaplex-session to create a session
 * 2. API route creates session via PersonaPlex API, returns WebSocket URL
 * 3. Engine connects to the PersonaPlex WebSocket for audio streaming
 * 4. User audio is streamed via microphone capture (PCM16, 24kHz mono)
 * 5. Agent audio flows back as PCM16 chunks for playback
 * 6. disconnect() ends the session and cleans up resources
 *
 * Cost model (Feb 2026):
 * - $0.08/min via hosted API (personaplex.io)
 * - Open weights available for self-hosting on A100/H100 GPUs
 *
 * @related
 * - Conversation engine interface: src/lib/agents/conversation-engine.ts
 * - PersonaPlex client: src/lib/personaplex/client.ts
 * - Persona mapping: src/lib/personaplex/persona-mapping.ts
 * - API route: src/app/api/agents/personaplex-session/route.ts
 */

import type {
    ConversationEngine,
    ConversationEngineConfig,
    ConversationEvent,
    SpecialistState,
} from "../conversation-engine"
import { registerEngine } from "../conversation-engine"
import type { PersonaPlexEvent } from "@/lib/personaplex/types"

// ─── Constants ───────────────────────────────────────────────────────────────

/** API route for creating PersonaPlex sessions */
const SESSION_ENDPOINT = "/api/agents/personaplex-session"

/** Audio sample rate — PersonaPlex uses 24kHz mono PCM16 */
const SAMPLE_RATE = 24000

/** Buffer size for microphone capture — 2048 samples ≈ 85ms at 24kHz */
const BUFFER_SIZE = 2048

// ─── PersonaPlexVoiceEngine ─────────────────────────────────────────────────

/**
 * Full-duplex voice conversation engine using NVIDIA PersonaPlex.
 *
 * @description Provides real-time, bidirectional voice conversation with
 * ForgeOS specialist agents. The agent listens and speaks simultaneously,
 * handling interruptions, barge-ins, and backchannels naturally.
 *
 * @implements ConversationEngine
 */
class PersonaPlexVoiceEngine implements ConversationEngine {
    readonly mode = "voice" as const

    private config: ConversationEngineConfig | null = null
    private ws: WebSocket | null = null
    private handlers: Set<(event: ConversationEvent) => void> = new Set()
    private transcript: Array<{ role: "user" | "assistant"; content: string }> = []
    private currentState: SpecialistState = "idle"
    private sessionId: string | null = null

    // Audio capture
    private mediaStream: MediaStream | null = null
    private audioContext: AudioContext | null = null
    private scriptProcessor: ScriptProcessorNode | null = null

    // Audio playback
    private playbackContext: AudioContext | null = null
    private playbackQueue: ArrayBuffer[] = []
    private isPlayingAudio = false

    // Partial transcript buffers
    private agentTranscriptBuffer = ""
    private userTranscriptBuffer = ""

    // ─── ConversationEngine Interface ────────────────────────────────────

    /**
     * Initialize a PersonaPlex voice session.
     *
     * @description Creates a session via the ForgeOS API route, then opens
     * a WebSocket to PersonaPlex for bidirectional audio streaming.
     *
     * @param config - Specialist and session configuration
     * @throws {Error} If session creation or WebSocket connection fails
     */
    async connect(config: ConversationEngineConfig): Promise<void> {
        this.config = config
        this.transcript = []
        this.agentTranscriptBuffer = ""
        this.userTranscriptBuffer = ""
        this.setState("connecting")

        try {
            // Step 1: Create session via our API route
            const sessionResponse = await fetch(SESSION_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    specialistId: config.specialistId,
                    threadId: config.threadId,
                    foundryId: config.foundryId,
                    systemPromptSuffix: config.systemPromptSuffix,
                    voice: config.voice,
                }),
                signal: config.signal,
            })

            if (!sessionResponse.ok) {
                const errorText = await sessionResponse.text().catch(() => "Unknown error")
                throw new Error(`Session creation failed: ${errorText}`)
            }

            const { wsUrl, sessionId } = (await sessionResponse.json()) as {
                wsUrl: string
                sessionId: string
            }
            this.sessionId = sessionId

            // Step 2: Connect WebSocket to PersonaPlex
            await this.connectWebSocket(wsUrl)

            // Step 3: Start microphone capture
            await this.startMicrophoneStream()

            this.setState("idle")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Connection failed"
            console.error("[PersonaPlexVoiceEngine] Connect failed:", message)
            this.emit({ type: "error", error: message })
            this.setState("error")
            throw err
        }
    }

    /**
     * Send a text message to the PersonaPlex session.
     *
     * @description Text input is converted to speech by PersonaPlex's model
     * and processed as if the user had spoken it.
     */
    async sendText(message: string): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }

        this.transcript.push({ role: "user", content: message })
        this.setState("thinking")

        this.wsSend({
            type: "text.input",
            text: message,
        })
    }

    /**
     * Send an audio blob to the PersonaPlex session.
     *
     * @description Converts the blob to base64 PCM16 and sends it through
     * the WebSocket. In practice, microphone audio is streamed continuously
     * via startMicrophoneStream() rather than sent as discrete blobs.
     */
    async sendAudio(audioData: Blob): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }

        this.setState("listening")

        const arrayBuffer = await audioData.arrayBuffer()
        const base64 = this.arrayBufferToBase64(arrayBuffer)

        this.wsSend({
            type: "audio.input",
            audio: base64,
        })
    }

    onEvent(handler: (event: ConversationEvent) => void): () => void {
        this.handlers.add(handler)
        return () => {
            this.handlers.delete(handler)
        }
    }

    getTranscript(): Array<{ role: "user" | "assistant"; content: string }> {
        return [...this.transcript]
    }

    getState(): SpecialistState {
        return this.currentState
    }

    /**
     * Clean up all resources and end the session.
     */
    async disconnect(): Promise<void> {
        this.stopMicrophoneStream()
        this.stopPlayback()

        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, "Client disconnect")
            }
            this.ws = null
        }

        // End the session server-side
        if (this.sessionId) {
            try {
                await fetch(`${SESSION_ENDPOINT}?sessionId=${this.sessionId}`, {
                    method: "DELETE",
                })
            } catch {
                // Non-critical — session will expire
            }
        }

        this.handlers.clear()
        this.config = null
        this.sessionId = null
        this.setState("idle")
    }

    // ─── WebSocket Management ────────────────────────────────────────────

    /**
     * Connect to the PersonaPlex WebSocket endpoint.
     */
    private async connectWebSocket(wsUrl: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("WebSocket connection timeout"))
            }, 10_000)

            this.ws = new WebSocket(wsUrl)

            this.ws.onopen = () => {
                clearTimeout(timeout)
                resolve()
            }

            this.ws.onerror = (event) => {
                clearTimeout(timeout)
                console.error("[PersonaPlexVoiceEngine] WebSocket error:", event)
                reject(new Error("WebSocket connection failed"))
            }

            this.ws.onclose = () => {
                clearTimeout(timeout)
                this.setState("idle")
            }

            this.ws.onmessage = (event) => {
                this.handleServerEvent(event)
            }
        })
    }

    /**
     * Handle events from the PersonaPlex WebSocket.
     *
     * @description Maps PersonaPlex events to ConversationEngine events
     * and manages specialist state transitions.
     */
    private handleServerEvent(event: MessageEvent): void {
        let data: PersonaPlexEvent
        try {
            data = JSON.parse(event.data as string) as PersonaPlexEvent
        } catch {
            console.warn("[PersonaPlexVoiceEngine] Invalid server event:", event.data)
            return
        }

        switch (data.type) {
            case "session.created":
                this.sessionId = data.sessionId ?? this.sessionId
                break

            case "audio.delta":
                if (data.audio) {
                    const audioBuffer = this.base64ToArrayBuffer(data.audio)
                    this.setState("speaking")
                    this.emit({ type: "audio_chunk", audio: audioBuffer })
                    this.queuePlayback(audioBuffer)
                }
                break

            case "audio.done":
                this.emit({ type: "audio_done" })
                this.setState("idle")
                break

            case "transcript.agent.delta":
                if (data.text) {
                    this.agentTranscriptBuffer += data.text
                    this.emit({ type: "text_chunk", text: data.text })
                }
                break

            case "transcript.agent.done":
                if (data.text || this.agentTranscriptBuffer) {
                    const finalText = data.text || this.agentTranscriptBuffer
                    this.transcript.push({ role: "assistant", content: finalText })
                    this.emit({ type: "text_done", text: finalText })
                    this.agentTranscriptBuffer = ""
                }
                break

            case "transcript.user.delta":
                if (data.text) {
                    this.userTranscriptBuffer += data.text
                }
                break

            case "transcript.user.done":
                if (data.text || this.userTranscriptBuffer) {
                    const finalText = data.text || this.userTranscriptBuffer
                    this.transcript.push({ role: "user", content: finalText })
                    this.emit({ type: "transcript", text: finalText })
                    this.userTranscriptBuffer = ""
                }
                break

            case "turn.started":
                this.setState("speaking")
                break

            case "turn.ended":
                this.setState("idle")
                break

            case "interruption.detected":
                // User interrupted — stop playback, switch to listening
                this.stopPlayback()
                this.setState("listening")
                break

            case "backchannel":
                // Natural backchannel (uh-huh, right, etc.) — no state change
                break

            case "session.error":
                console.error("[PersonaPlexVoiceEngine] Server error:", data.error)
                this.emit({
                    type: "error",
                    error: data.error?.message ?? "PersonaPlex session error",
                })
                this.setState("error")
                break

            default:
                break
        }
    }

    // ─── Microphone Capture ──────────────────────────────────────────────

    /**
     * Start capturing microphone audio and streaming to PersonaPlex.
     *
     * @description Captures PCM16 audio at 24kHz mono and streams it to the
     * WebSocket in real-time. PersonaPlex handles VAD (voice activity detection)
     * on its end, so we stream continuously.
     */
    private async startMicrophoneStream(): Promise<void> {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: SAMPLE_RATE,
                },
            })

            this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
            const source = this.audioContext.createMediaStreamSource(this.mediaStream)

            const processor = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1)
            this.scriptProcessor = processor

            processor.onaudioprocess = (event) => {
                if (this.ws?.readyState !== WebSocket.OPEN) return

                const input = event.inputBuffer.getChannelData(0)
                const base64 = this.float32ToPcm16Base64(input)

                this.wsSend({
                    type: "audio.input",
                    audio: base64,
                })
            }

            source.connect(processor)
            processor.connect(this.audioContext.destination)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Microphone access denied"
            console.error("[PersonaPlexVoiceEngine] Mic start failed:", message)
            this.emit({ type: "error", error: message })
        }
    }

    /**
     * Stop microphone capture and clean up audio resources.
     */
    private stopMicrophoneStream(): void {
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect()
            this.scriptProcessor = null
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop())
            this.mediaStream = null
        }
        if (this.audioContext) {
            this.audioContext.close().catch(() => {
                /* ignore */
            })
            this.audioContext = null
        }
    }

    // ─── Audio Playback ──────────────────────────────────────────────────

    /**
     * Queue an audio buffer for sequential playback.
     */
    private queuePlayback(audioBuffer: ArrayBuffer): void {
        this.playbackQueue.push(audioBuffer)
        if (!this.isPlayingAudio) {
            this.processPlaybackQueue()
        }
    }

    /**
     * Process queued audio buffers for playback.
     */
    private async processPlaybackQueue(): Promise<void> {
        if (this.isPlayingAudio) return
        this.isPlayingAudio = true

        if (!this.playbackContext) {
            this.playbackContext = new AudioContext({ sampleRate: SAMPLE_RATE })
        }

        while (this.playbackQueue.length > 0) {
            const buffer = this.playbackQueue.shift()
            if (!buffer) continue

            try {
                // Convert PCM16 to Float32 for Web Audio API
                const pcm16 = new Int16Array(buffer)
                const float32 = new Float32Array(pcm16.length)
                for (let i = 0; i < pcm16.length; i++) {
                    float32[i] = pcm16[i] / 0x7fff
                }

                const audioBuffer = this.playbackContext.createBuffer(1, float32.length, SAMPLE_RATE)
                audioBuffer.getChannelData(0).set(float32)

                const source = this.playbackContext.createBufferSource()
                source.buffer = audioBuffer
                source.connect(this.playbackContext.destination)
                source.start()

                // Wait for this chunk to finish before playing next
                await new Promise<void>((resolve) => {
                    source.onended = () => resolve()
                })
            } catch (err) {
                console.warn("[PersonaPlexVoiceEngine] Playback error:", err)
            }
        }

        this.isPlayingAudio = false
    }

    /**
     * Stop audio playback immediately (e.g., on interruption).
     */
    private stopPlayback(): void {
        this.playbackQueue = []
        this.isPlayingAudio = false
        if (this.playbackContext) {
            this.playbackContext.close().catch(() => {
                /* ignore */
            })
            this.playbackContext = null
        }
    }

    // ─── Utility Methods ─────────────────────────────────────────────────

    /**
     * Convert Float32Array (Web Audio) to PCM16 base64 (PersonaPlex format).
     */
    private float32ToPcm16Base64(input: Float32Array): string {
        const pcm16 = new Int16Array(input.length)
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        return this.arrayBufferToBase64(pcm16.buffer)
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer)
        let binary = ""
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes.buffer
    }

    private wsSend(data: Record<string, unknown>): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data))
        }
    }

    private emit(event: ConversationEvent): void {
        for (const handler of this.handlers) {
            try {
                handler(event)
            } catch (err) {
                console.error("[PersonaPlexVoiceEngine] Event handler error:", err)
            }
        }
    }

    private setState(state: SpecialistState): void {
        if (state === this.currentState) return
        this.currentState = state
        this.emit({ type: "state_change", state })
    }
}

// ─── Register ────────────────────────────────────────────────────────────────

/**
 * Register the PersonaPlex engine as the "voice" conversation engine.
 *
 * NOTE: This overrides the OpenAI Realtime engine registration from
 * realtime-voice-engine.ts. Import order determines which engine wins.
 * To use PersonaPlex, import this module AFTER realtime-voice-engine.ts,
 * or conditionally register based on environment configuration.
 */
registerEngine("voice", () => new PersonaPlexVoiceEngine())

export { PersonaPlexVoiceEngine }
