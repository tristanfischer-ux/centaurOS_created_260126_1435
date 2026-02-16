/**
 * @file half-duplex-voice-engine.ts
 *
 * @description Base-case voice engine that works TODAY without any additional API keys.
 * Uses the existing ForgeOS pipeline: Whisper STT → /api/agents/execute (SSE) → TTS.
 *
 * This is the "call your specialist" experience that ships now. The flow:
 * 1. Listen: Record user's voice (MediaRecorder + silence detection)
 * 2. Transcribe: Send audio to /api/agents/stt (Whisper)
 * 3. Think: Stream specialist response from /api/agents/execute (SSE)
 * 4. Speak: Play response audio via /api/agents/tts
 * 5. Repeat: Go back to listening after agent finishes speaking
 *
 * Half-duplex means the agent can't listen while speaking (no interruptions).
 * When PersonaPlex arrives, the system upgrades to full-duplex automatically.
 *
 * Cost: Uses existing OpenAI API keys — no additional API costs beyond
 * what's already budgeted for specialist conversations and TTS.
 *
 * @related
 * - Conversation engine interface: src/lib/agents/conversation-engine.ts
 * - STT endpoint: src/app/api/agents/stt/route.ts
 * - Execute endpoint: src/app/api/agents/execute/route.ts
 * - TTS endpoint: src/app/api/agents/tts/route.ts
 * - PersonaPlex upgrade: src/lib/agents/engines/personaplex-voice-engine.ts
 */

import type {
    ConversationEngine,
    ConversationEngineConfig,
    ConversationEvent,
    SpecialistState,
} from "../conversation-engine"

// ─── Constants ───────────────────────────────────────────────────────────────

/** RMS threshold below which audio is considered silence (0-1 scale) */
const SILENCE_THRESHOLD = 0.015

/** Milliseconds of silence before auto-stopping recording */
const SILENCE_TIMEOUT_MS = 2500

/** Maximum recording duration (safety valve) */
const MAX_RECORDING_MS = 60_000

/** Preferred MIME types for MediaRecorder */
const PREFERRED_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupportedMimeType(): string {
    if (typeof MediaRecorder === "undefined") return ""
    for (const mime of PREFERRED_MIME_TYPES) {
        if (MediaRecorder.isTypeSupported(mime)) return mime
    }
    return ""
}

/** Strip markdown for TTS — same logic as use-tts.ts */
function stripMarkdownForTTS(text: string): string {
    return text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^[-*]\s+/gm, "")
        .replace(/^\d+\.\s+/gm, "")
        .replace(/^>\s+/gm, "")
        .replace(/\n{2,}/g, ". ")
        .replace(/\s+/g, " ")
        .trim()
}

// ─── HalfDuplexVoiceEngine ──────────────────────────────────────────────────

/**
 * Base-case voice engine using existing Whisper → Execute → TTS pipeline.
 *
 * @description Provides a "phone call" experience with specialists using
 * infrastructure that already exists. No new API keys needed.
 *
 * The conversation loop is:
 * idle → listening → thinking → speaking → idle → listening → ...
 *
 * @implements ConversationEngine
 */
export class HalfDuplexVoiceEngine implements ConversationEngine {
    readonly mode = "voice" as const

    private config: ConversationEngineConfig | null = null
    private handlers: Set<(event: ConversationEvent) => void> = new Set()
    private transcript: Array<{ role: "user" | "assistant"; content: string }> = []
    private currentState: SpecialistState = "idle"
    private isConnected = false
    private abortController: AbortController | null = null

    // Audio recording
    private mediaRecorder: MediaRecorder | null = null
    private mediaStream: MediaStream | null = null
    private audioContext: AudioContext | null = null
    private analyser: AnalyserNode | null = null
    private audioChunks: Blob[] = []
    private silenceStart: number | null = null
    private animFrame: number | null = null
    private maxDurationTimer: ReturnType<typeof setTimeout> | null = null
    private mimeType = ""
    private autoListenAfterSpeak = true

    // Audio playback
    private playbackContext: AudioContext | null = null
    private sourceNode: AudioBufferSourceNode | null = null

    // ─── ConversationEngine Interface ────────────────────────────────────

    /**
     * Initialize the half-duplex voice engine.
     *
     * @description No external connections needed — just verifies microphone
     * access and starts the first listening cycle.
     */
    async connect(config: ConversationEngineConfig): Promise<void> {
        this.config = config
        this.transcript = []
        this.isConnected = true
        this.autoListenAfterSpeak = true
        this.setState("connecting")

        try {
            // Verify microphone access early so we fail fast
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            })
            // Release immediately — we'll re-request for each recording cycle
            stream.getTracks().forEach((track) => track.stop())

            // Warm up playback context
            this.playbackContext = new AudioContext()

            this.setState("idle")

            // Start the first listening cycle after a brief pause
            setTimeout(() => {
                if (this.isConnected) {
                    this.startListening()
                }
            }, 500)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Microphone access denied"
            console.error("[HalfDuplexVoiceEngine] Connect failed:", message)
            this.emit({ type: "error", error: message })
            this.setState("error")
            throw err
        }
    }

    /**
     * Send a text message directly (bypasses voice recording).
     */
    async sendText(message: string, _promptTemplate?: string): Promise<void> {
        if (!this.isConnected || !this.config) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }

        this.stopListening()
        this.transcript.push({ role: "user", content: message })
        this.emit({ type: "transcript", text: message })

        await this.executeAndSpeak(message)
    }

    /**
     * Send an audio blob for transcription, then process the response.
     */
    async sendAudio(audioData: Blob): Promise<void> {
        if (!this.isConnected || !this.config) {
            this.emit({ type: "error", error: "Not connected" })
            return
        }

        this.setState("thinking")

        // Transcribe via Whisper
        const text = await this.transcribeAudio(audioData)
        if (!text) {
            // No speech detected — go back to listening
            this.startListening()
            return
        }

        this.transcript.push({ role: "user", content: text })
        this.emit({ type: "transcript", text })

        await this.executeAndSpeak(text)
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

    async disconnect(): Promise<void> {
        this.isConnected = false
        this.autoListenAfterSpeak = false

        if (this.abortController) {
            this.abortController.abort()
            this.abortController = null
        }

        this.stopListening()
        this.stopPlayback()

        if (this.playbackContext && this.playbackContext.state !== "closed") {
            this.playbackContext.close().catch(() => { /* ignore */ })
            this.playbackContext = null
        }

        this.handlers.clear()
        this.config = null
        this.setState("idle")
    }

    // ─── Voice Recording ─────────────────────────────────────────────────

    /**
     * Start recording from the microphone with silence detection.
     */
    private async startListening(): Promise<void> {
        if (!this.isConnected) return

        this.audioChunks = []
        this.setState("listening")

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            })

            // Set up silence detection
            this.audioContext = new AudioContext()
            this.analyser = this.audioContext.createAnalyser()
            this.analyser.fftSize = 2048
            const source = this.audioContext.createMediaStreamSource(this.mediaStream)
            source.connect(this.analyser)

            // Create recorder
            this.mimeType = getSupportedMimeType()
            this.mediaRecorder = new MediaRecorder(
                this.mediaStream,
                this.mimeType ? { mimeType: this.mimeType } : undefined
            )

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data)
                }
            }

            this.mediaRecorder.onstop = () => {
                this.cleanupRecording()
                const audioBlob = new Blob(this.audioChunks, {
                    type: this.mediaRecorder?.mimeType || "audio/webm",
                })
                this.audioChunks = []

                if (audioBlob.size > 0 && this.isConnected) {
                    this.sendAudio(audioBlob)
                }
            }

            this.mediaRecorder.onerror = () => {
                this.cleanupRecording()
                this.emit({ type: "error", error: "Recording failed" })
                // Retry listening after a brief pause
                if (this.isConnected) {
                    setTimeout(() => this.startListening(), 1000)
                }
            }

            // Start recording
            this.mediaRecorder.start(250)
            this.silenceStart = null

            // Start silence monitoring
            this.monitorSilence()

            // Safety valve
            this.maxDurationTimer = setTimeout(() => {
                if (this.mediaRecorder?.state === "recording") {
                    this.mediaRecorder.stop()
                }
            }, MAX_RECORDING_MS)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Microphone error"
            console.error("[HalfDuplexVoiceEngine] Listen failed:", message)
            this.emit({ type: "error", error: message })
            this.setState("error")
        }
    }

    /**
     * Monitor audio levels and auto-stop on silence.
     */
    private monitorSilence(): void {
        if (!this.analyser || !this.isConnected) return

        const dataArray = new Float32Array(this.analyser.fftSize)
        this.analyser.getFloatTimeDomainData(dataArray)

        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)

        if (rms < SILENCE_THRESHOLD) {
            if (this.silenceStart === null) {
                this.silenceStart = Date.now()
            } else if (Date.now() - this.silenceStart > SILENCE_TIMEOUT_MS) {
                // Silence exceeded threshold — stop recording
                if (this.mediaRecorder?.state === "recording") {
                    this.mediaRecorder.stop()
                }
                return
            }
        } else {
            this.silenceStart = null
        }

        this.animFrame = requestAnimationFrame(() => this.monitorSilence())
    }

    /**
     * Stop listening and clean up recording resources.
     */
    private stopListening(): void {
        if (this.mediaRecorder?.state === "recording") {
            try {
                this.mediaRecorder.stop()
            } catch { /* ignore */ }
        }
        this.cleanupRecording()
    }

    private cleanupRecording(): void {
        if (this.animFrame !== null) {
            cancelAnimationFrame(this.animFrame)
            this.animFrame = null
        }
        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer)
            this.maxDurationTimer = null
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop())
            this.mediaStream = null
        }
        if (this.audioContext && this.audioContext.state !== "closed") {
            this.audioContext.close().catch(() => { /* ignore */ })
            this.audioContext = null
        }
        this.analyser = null
        this.mediaRecorder = null
        this.silenceStart = null
    }

    // ─── Transcription (STT) ─────────────────────────────────────────────

    /**
     * Transcribe audio via the existing Whisper STT endpoint.
     */
    private async transcribeAudio(audioBlob: Blob): Promise<string | null> {
        try {
            const formData = new FormData()
            const ext = this.mimeType.includes("mp4") ? "mp4" : "webm"
            formData.append("audio", audioBlob, `recording.${ext}`)

            const res = await fetch("/api/agents/stt", {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                console.warn("[HalfDuplexVoiceEngine] STT failed:", res.status)
                return null
            }

            const data = (await res.json()) as { transcript: string }
            const text = data.transcript?.trim()
            return text || null
        } catch (err) {
            console.error("[HalfDuplexVoiceEngine] Transcription error:", err)
            return null
        }
    }

    // ─── Specialist Execution ────────────────────────────────────────────

    /**
     * Send text to the specialist via SSE, then speak the response.
     *
     * @description This is the core loop: user text → specialist response → TTS.
     * After the agent finishes speaking, it automatically goes back to listening.
     */
    private async executeAndSpeak(userMessage: string): Promise<void> {
        if (!this.config) return

        this.setState("thinking")
        this.abortController = new AbortController()

        let fullResponse = ""

        try {
            // Stream the specialist response via SSE
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage,
                    specialistId: this.config.specialistId,
                    threadId: this.config.threadId,
                    foundryId: this.config.foundryId,
                    providerId: this.config.providerId,
                    modelId: this.config.modelId,
                    systemPromptSuffix: this.config.systemPromptSuffix,
                    deepThinkEnabled: this.config.deepThinkEnabled,
                    voice: this.config.voice,
                }),
                signal: this.abortController.signal,
            })

            if (!res.ok || !res.body) {
                throw new Error(`Execute failed: ${res.status}`)
            }

            // Parse SSE stream
            const reader = res.body.getReader()
            const decoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split("\n")

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6)
                        if (data === "[DONE]") continue

                        try {
                            const parsed = JSON.parse(data) as { text?: string; type?: string }
                            if (parsed.text) {
                                fullResponse += parsed.text
                                this.emit({ type: "text_chunk", text: parsed.text })
                            }
                        } catch {
                            // Not JSON — might be a raw text chunk
                            if (data && data !== "[DONE]") {
                                fullResponse += data
                                this.emit({ type: "text_chunk", text: data })
                            }
                        }
                    }
                }
            }

            if (!fullResponse.trim()) {
                // No response — go back to listening
                this.startListening()
                return
            }

            // Commit the full response to transcript
            this.transcript.push({ role: "assistant", content: fullResponse })
            this.emit({ type: "text_done", text: fullResponse })

            // Speak the response via TTS
            await this.speakText(fullResponse)

        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return
            const message = err instanceof Error ? err.message : "Response failed"
            console.error("[HalfDuplexVoiceEngine] Execute error:", message)
            this.emit({ type: "error", error: message })
            this.setState("error")
            // Retry listening after error
            if (this.isConnected) {
                setTimeout(() => this.startListening(), 2000)
            }
        }
    }

    // ─── TTS Playback ────────────────────────────────────────────────────

    /**
     * Speak text via the existing TTS endpoint.
     *
     * @description Strips markdown, sends to TTS API, plays audio. When
     * playback finishes, automatically starts the next listening cycle.
     */
    private async speakText(text: string): Promise<void> {
        if (!this.config || !this.isConnected) return

        this.setState("speaking")
        const cleanText = stripMarkdownForTTS(text)

        if (!cleanText.trim()) {
            if (this.autoListenAfterSpeak) {
                this.startListening()
            }
            return
        }

        try {
            // Ensure playback context exists
            if (!this.playbackContext || this.playbackContext.state === "closed") {
                this.playbackContext = new AudioContext()
            }
            if (this.playbackContext.state === "suspended") {
                await this.playbackContext.resume()
            }

            const controller = new AbortController()
            this.abortController = controller

            const res = await fetch("/api/agents/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: cleanText,
                    voice: this.config.voice,
                }),
                signal: controller.signal,
            })

            if (!res.ok) {
                console.warn("[HalfDuplexVoiceEngine] TTS failed:", res.status)
                if (this.autoListenAfterSpeak && this.isConnected) {
                    this.startListening()
                }
                return
            }

            const arrayBuffer = await res.arrayBuffer()
            if (controller.signal.aborted) return

            const audioBuffer = await this.playbackContext.decodeAudioData(arrayBuffer)
            if (controller.signal.aborted) return

            // Play the audio
            const source = this.playbackContext.createBufferSource()
            source.buffer = audioBuffer
            source.connect(this.playbackContext.destination)
            this.sourceNode = source

            this.emit({ type: "audio_chunk", audio: arrayBuffer })

            await new Promise<void>((resolve) => {
                source.onended = () => {
                    this.sourceNode = null
                    this.emit({ type: "audio_done" })
                    resolve()
                }
                source.start()
            })

            // After speaking, go back to listening
            if (this.autoListenAfterSpeak && this.isConnected) {
                this.setState("idle")
                // Brief pause before next listening cycle
                setTimeout(() => {
                    if (this.isConnected) {
                        this.startListening()
                    }
                }, 300)
            }
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return
            console.warn("[HalfDuplexVoiceEngine] TTS playback error:", err)
            if (this.autoListenAfterSpeak && this.isConnected) {
                this.startListening()
            }
        }
    }

    /**
     * Stop audio playback immediately.
     */
    private stopPlayback(): void {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop()
            } catch { /* ignore */ }
            this.sourceNode = null
        }
    }

    // ─── Event Helpers ───────────────────────────────────────────────────

    private emit(event: ConversationEvent): void {
        for (const handler of this.handlers) {
            try {
                handler(event)
            } catch (err) {
                console.error("[HalfDuplexVoiceEngine] Event handler error:", err)
            }
        }
    }

    private setState(state: SpecialistState): void {
        if (state === this.currentState) return
        this.currentState = state
        this.emit({ type: "state_change", state })
    }
}
