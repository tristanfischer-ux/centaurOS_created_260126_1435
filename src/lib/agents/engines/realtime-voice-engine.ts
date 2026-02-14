/**
 * @file realtime-voice-engine.ts
 *
 * @description Tier 2 ConversationEngine — Realtime API for bidirectional
 * voice conversation. Provides sub-300ms latency by combining STT + LLM + TTS
 * in a single WebSocket connection.
 *
 * NOTE: This engine currently uses OpenAI's Realtime API because MiniMax does
 * not offer a unified realtime API equivalent. MiniMax provides separate:
 * - WebSocket TTS (streaming speech synthesis)
 * - HTTP STT (speech-to-text)
 * - HTTP Text (M2.5 for conversation)
 *
 * These are separate APIs requiring custom orchestration, which is a significant
 * undertaking. OpenAI's Realtime API provides a unified bidirectional protocol.
 *
 * Cost model (Feb 2026):
 * - Audio input: ~$0.06/min (100 tokens/sec)
 * - Audio output: ~$0.24/min (gpt-4o-realtime) or ~$0.08/min (gpt-4o-mini-realtime)
 * - Text input/output: same as standard gpt-4o pricing
 *
 * @related
 * - src/lib/agents/conversation-engine.ts — Interface definition
 * - https://platform.openai.com/docs/guides/realtime — OpenAI docs
 * - https://platform.minimax.io/docs/api-reference/speech-t2a-websocket — MiniMax TTS (separate)
 */

import type {
    ConversationEngine,
    ConversationEngineConfig,
    ConversationEvent,
    SpecialistState,
} from "../conversation-engine"
import { registerEngine } from "../conversation-engine"

// ─── Constants ───────────────────────────────────────────────────────────────

/** WebSocket relay endpoint (browser -> our server -> OpenAI Realtime)
 * NOTE: Currently connects directly as OpenAI supports client-side WebSocket
 * with proper authentication. If we switch to MiniMax, we'd need a relay server
 * because MiniMax doesn't support client-side WebSocket authentication.
 */
const RELAY_ENDPOINT = "/api/agents/realtime-relay"

/**
 * Model to use for the Realtime API session.
 * gpt-4o-mini-realtime is ~3x cheaper than gpt-4o-realtime.
 */
const REALTIME_MODEL = "gpt-4o-mini-realtime-preview"

// ─── Types ───────────────────────────────────────────────────────────────────

/** Events received from the OpenAI Realtime API via WebSocket */
interface RealtimeServerEvent {
    type: string
    // Session events
    session?: { id: string; model: string }
    // Audio delta
    delta?: string // base64 audio
    // Transcript
    transcript?: string
    // Response text
    text?: string
    // Error
    error?: { message: string; type: string }
    // Item
    item?: {
        id: string
        type: string
        role: string
        content?: Array<{ type: string; text?: string; transcript?: string }>
    }
}

// ─── RealtimeVoiceEngine ─────────────────────────────────────────────────────

/**
 * Tier 2 conversation engine — real-time bidirectional voice via OpenAI
 * Realtime API over WebSocket.
 *
 * NOTE: OpenAI is used because MiniMax does not offer a unified realtime API.
 * MiniMax requires separate orchestration of TTS (WebSocket), STT (HTTP),
 * and text generation (HTTP), which is more complex to implement.
 *
 * Connection flow:
 * 1. connect() opens WebSocket to our relay server
 * 2. Relay server authenticates and connects to OpenAI Realtime API
 * 3. User audio is streamed via sendAudio() to the WebSocket
 * 4. Server events flow back: transcripts, audio chunks, text responses
 * 5. disconnect() cleanly closes the WebSocket
 *
 * @implements ConversationEngine
 */
class RealtimeVoiceEngine implements ConversationEngine {
    readonly mode = "voice" as const

    private config: ConversationEngineConfig | null = null
    private ws: WebSocket | null = null
    private handlers: Set<(event: ConversationEvent) => void> = new Set()
    private transcript: Array<{ role: "user" | "assistant"; content: string }> = []
    private currentState: SpecialistState = "idle"
    private mediaStream: MediaStream | null = null
    private audioContext: AudioContext | null = null
    private scriptProcessor: ScriptProcessorNode | null = null
    private sessionId: string | null = null

    // ─── ConversationEngine interface ────────────────────────────────────

    async connect(config: ConversationEngineConfig): Promise<void> {
        this.config = config
        this.transcript = []
        this.setState("connecting")

        try {
            // Build WebSocket URL with auth parameters
            const wsUrl = new URL(RELAY_ENDPOINT, window.location.origin)
            wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:"
            wsUrl.searchParams.set("model", REALTIME_MODEL)
            wsUrl.searchParams.set("specialistId", config.specialistId)
            if (config.threadId) wsUrl.searchParams.set("threadId", config.threadId)

            this.ws = new WebSocket(wsUrl.toString())

            await new Promise<void>((resolve, reject) => {
                if (!this.ws) return reject(new Error("WebSocket not created"))

                const timeout = setTimeout(() => {
                    reject(new Error("WebSocket connection timeout"))
                }, 10_000)

                this.ws.onopen = () => {
                    clearTimeout(timeout)
                    this.configureSession()
                    resolve()
                }

                this.ws.onerror = (event) => {
                    clearTimeout(timeout)
                    console.error("[RealtimeVoiceEngine] WebSocket error:", event)
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

            this.setState("idle")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Connection failed"
            console.error("[RealtimeVoiceEngine] Connect failed:", message)
            this.emit({ type: "error", error: message })
            this.setState("error")
            throw err
        }
    }

    async sendText(message: string): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }

        this.transcript.push({ role: "user", content: message })
        this.setState("thinking")

        // Send text input to the Realtime API
        this.wsSend({
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: message }],
            },
        })

        // Request a response
        this.wsSend({ type: "response.create" })
    }

    async sendAudio(audioData: Blob): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }

        this.setState("listening")

        // Convert blob to base64 for the Realtime API
        const arrayBuffer = await audioData.arrayBuffer()
        const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce(
                (data, byte) => data + String.fromCharCode(byte),
                ""
            )
        )

        // Append audio to the input buffer
        this.wsSend({
            type: "input_audio_buffer.append",
            audio: base64,
        })
    }

    /**
     * Converts Float32Array to PCM16 (Int16) and returns base64.
     * Realtime API expects pcm16 at 24kHz mono.
     */
    private float32ToPcm16Base64(input: Float32Array): string {
        const pcm16 = new Int16Array(input.length)
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ""
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
    }

    /**
     * Start streaming microphone audio directly to the Realtime API.
     * Uses ScriptProcessorNode to capture raw PCM16 (required by Realtime API).
     * MediaRecorder produces Opus/WebM which is not supported.
     */
    async startMicrophoneStream(): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 24000,
                },
            })

            this.audioContext = new AudioContext({ sampleRate: 24000 })
            const source = this.audioContext.createMediaStreamSource(this.mediaStream)

            // ScriptProcessorNode captures raw Float32; we convert to PCM16.
            // Buffer 2048 samples ≈ 85ms at 24kHz for low latency.
            const processor = this.audioContext.createScriptProcessor(2048, 1, 1)
            this.scriptProcessor = processor

            processor.onaudioprocess = (event) => {
                if (this.ws?.readyState !== WebSocket.OPEN) return
                const input = event.inputBuffer.getChannelData(0)
                const base64 = this.float32ToPcm16Base64(input)
                this.wsSend({ type: "input_audio_buffer.append", audio: base64 })
            }

            source.connect(processor)
            processor.connect(this.audioContext.destination)
            this.setState("listening")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Microphone access denied"
            console.error("[RealtimeVoiceEngine] Mic start failed:", message)
            this.emit({ type: "error", error: message })
        }
    }

    /**
     * Stop streaming microphone audio and commit the buffer.
     */
    stopMicrophoneStream(): void {
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect()
            this.scriptProcessor = null
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop())
            this.mediaStream = null
        }
        if (this.audioContext) {
            this.audioContext.close().catch(() => { /* ignore */ })
            this.audioContext = null
        }

        // Commit the audio buffer to trigger transcription + response
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.wsSend({ type: "input_audio_buffer.commit" })
            this.wsSend({ type: "response.create" })
        }

        this.setState("thinking")
    }

    onEvent(handler: (event: ConversationEvent) => void): () => void {
        this.handlers.add(handler)
        return () => { this.handlers.delete(handler) }
    }

    getTranscript(): Array<{ role: "user" | "assistant"; content: string }> {
        return [...this.transcript]
    }

    getState(): SpecialistState {
        return this.currentState
    }

    async disconnect(): Promise<void> {
        this.stopMicrophoneStream()

        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, "Client disconnect")
            }
            this.ws = null
        }

        this.handlers.clear()
        this.config = null
        this.sessionId = null
        this.setState("idle")
    }

    // ─── Internal helpers ────────────────────────────────────────────────

    /**
     * Configure the Realtime API session with specialist personality.
     * Sent immediately after WebSocket connection opens.
     * Uses systemPromptSuffix as the full instructions when provided (caller must
     * include personality + context). Fallback for backward compatibility.
     */
    private configureSession(): void {
        if (!this.config) return

        const { specialistId, voice, systemPromptSuffix } = this.config

        const instructions =
            systemPromptSuffix.trim().length > 100
                ? systemPromptSuffix
                : [
                      `You are a specialist AI advisor. Your specialist ID is "${specialistId}".`,
                      systemPromptSuffix,
                  ]
                      .filter(Boolean)
                      .join("\n\n")

        this.wsSend({
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions,
                voice: voice || "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                input_audio_transcription: {
                    model: "whisper-1",
                },
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                },
            },
        })
    }

    /**
     * Handle events received from the OpenAI Realtime API.
     */
    private handleServerEvent(event: MessageEvent): void {
        let data: RealtimeServerEvent
        try {
            data = JSON.parse(event.data as string) as RealtimeServerEvent
        } catch {
            console.warn("[RealtimeVoiceEngine] Invalid server event:", event.data)
            return
        }

        switch (data.type) {
            case "session.created":
                this.sessionId = data.session?.id ?? null
                break

            case "response.audio.delta":
                // Audio chunk from the assistant — convert from base64 and emit
                if (data.delta) {
                    const binary = atob(data.delta)
                    const bytes = new Uint8Array(binary.length)
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i)
                    }
                    this.setState("speaking")
                    this.emit({ type: "audio_chunk", audio: bytes.buffer })
                }
                break

            case "response.audio.done":
                this.emit({ type: "audio_done" })
                this.setState("idle")
                break

            case "response.audio_transcript.delta":
                // Real-time transcript of what the assistant is saying
                if (data.delta) {
                    this.emit({ type: "text_chunk", text: data.delta })
                }
                break

            case "response.audio_transcript.done":
                if (data.transcript) {
                    this.transcript.push({ role: "assistant", content: data.transcript })
                    this.emit({ type: "text_done", text: data.transcript })
                }
                break

            case "conversation.item.input_audio_transcription.completed":
                // Transcript of what the user said
                if (data.transcript) {
                    this.transcript.push({ role: "user", content: data.transcript })
                    this.emit({ type: "transcript", text: data.transcript })
                }
                break

            case "response.text.delta":
                if (data.delta) {
                    this.emit({ type: "text_chunk", text: data.delta })
                }
                break

            case "response.text.done":
                if (data.text) {
                    this.transcript.push({ role: "assistant", content: data.text })
                    this.emit({ type: "text_done", text: data.text })
                }
                this.setState("idle")
                break

            case "input_audio_buffer.speech_started":
                this.setState("listening")
                break

            case "input_audio_buffer.speech_stopped":
                this.setState("thinking")
                break

            case "error":
                console.error("[RealtimeVoiceEngine] Server error:", data.error)
                this.emit({
                    type: "error",
                    error: data.error?.message ?? "Realtime API error",
                })
                this.setState("error")
                break

            default:
                // Ignore other events (rate_limits, etc.)
                break
        }
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
                console.error("[RealtimeVoiceEngine] Event handler error:", err)
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

registerEngine("voice", () => new RealtimeVoiceEngine())

export { RealtimeVoiceEngine }
