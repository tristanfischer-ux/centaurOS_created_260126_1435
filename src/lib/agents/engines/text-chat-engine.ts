/**
 * @file text-chat-engine.ts
 *
 * @description Tier 0/1 ConversationEngine — wraps the existing SSE-based chat
 * flow. Sends text to /api/agents/execute, streams back via SSE, and optionally
 * plays TTS audio after each response.
 *
 * This is a thin wrapper around the current implementation in
 * brief-specialist-dialog.tsx, extracted into the ConversationEngine interface
 * so voice and avatar engines can be swapped in later.
 *
 * @related
 * - src/lib/agents/conversation-engine.ts — Interface definition
 * - src/app/api/agents/execute/route.ts — SSE endpoint this engine calls
 * - src/hooks/use-tts.ts — TTS playback (managed externally by the UI)
 */

import type {
    ConversationEngine,
    ConversationEngineConfig,
    ConversationEvent,
    SpecialistState,
} from "../conversation-engine"
import { registerEngine } from "../conversation-engine"
import { stripThinkTags, stripPartialThinkTags } from "@/lib/utils/strip-think-tags"

// ─── SSE Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse SSE lines from a chunk of streamed data.
 * Extracts text tokens from `data: {...}` lines.
 */
function parseSSEChunk(chunk: string): string {
    let text = ""
    for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6)
        if (data === "[DONE]") continue
        try {
            const parsed = JSON.parse(data) as { text?: string }
            if (parsed.text) text += parsed.text
        } catch {
            text += data
        }
    }
    return text
}

/**
 * Parse the NEXT_SPECIALIST recommendation from a full response.
 * Returns the cleaned response and any specialist suggestion.
 */
function parseSpecialistSuggestion(response: string): {
    cleanResponse: string
    suggestion?: { specialistId: string; reason: string }
} {
    const match = response.match(/NEXT_SPECIALIST:\s*(\S+)\s*\|\s*(.+)/i)
    if (!match) return { cleanResponse: response }

    const [fullMatch, specId, reason] = match
    const cleanResponse = response.replace(fullMatch, "").trim()

    if (specId && specId !== "none") {
        return {
            cleanResponse,
            suggestion: { specialistId: specId.trim(), reason: reason.trim() },
        }
    }
    return { cleanResponse }
}

// ─── TextChatEngine ──────────────────────────────────────────────────────────

/**
 * Tier 0/1 conversation engine — SSE text streaming with optional TTS.
 *
 * This is a stateless-per-request engine: each sendText() call is an
 * independent HTTP request. The server maintains thread context via threadId.
 *
 * @implements ConversationEngine
 */
class TextChatEngine implements ConversationEngine {
    readonly mode = "text" as const

    private config: ConversationEngineConfig | null = null
    private handlers: Set<(event: ConversationEvent) => void> = new Set()
    private transcript: Array<{ role: "user" | "assistant"; content: string }> = []
    private currentState: SpecialistState = "idle"
    private abortController: AbortController | null = null

    // ─── ConversationEngine interface ────────────────────────────────────

    async connect(config: ConversationEngineConfig): Promise<void> {
        this.config = config
        this.transcript = []
        this.setState("idle")
    }

    async sendText(message: string, promptTemplate?: string): Promise<void> {
        if (!this.config) {
            this.emit({ type: "error", error: "Engine not connected" })
            return
        }

        // Add user message to transcript
        this.transcript.push({ role: "user", content: message })

        // Update state to thinking
        this.setState("thinking")

        // Abort any previous request
        this.abortController?.abort()
        this.abortController = new AbortController()

        const { specialistId, threadId, providerId, modelId, systemPromptSuffix, deepThinkEnabled } = this.config

        try {
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: promptTemplate ?? undefined,
                    input: message,
                    providerId,
                    modelId,
                    modality: "text",
                    threadId: threadId ?? undefined,
                    specialistId,
                    customSystemPromptSuffix: systemPromptSuffix,
                    enableThinking: deepThinkEnabled,
                }),
                signal: this.abortController.signal,
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Execution failed" }))
                throw new Error(errData.error || `HTTP ${res.status}`)
            }

            // Stream SSE response
            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullResponse = ""
            let accumulatedVisible = ""

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const text = parseSSEChunk(chunk)

                if (text) {
                    fullResponse += text
                    const visibleNow = stripPartialThinkTags(fullResponse)
                    if (visibleNow !== accumulatedVisible) {
                        const newVisible = visibleNow.slice(accumulatedVisible.length)
                        accumulatedVisible = visibleNow
                        this.setState("speaking")
                        this.emit({ type: "text_chunk", text: newVisible })
                    }
                }
            }

            if (!fullResponse) {
                fullResponse = "No response received. Please try again."
            }

            // Strip think tags and parse specialist suggestion
            const responseWithoutThink = stripThinkTags(fullResponse)
            const { cleanResponse, suggestion } = parseSpecialistSuggestion(responseWithoutThink)

            // Emit completed response
            this.emit({ type: "text_done", text: cleanResponse })

            // Emit suggestion if found
            if (suggestion) {
                this.emit({ type: "suggestion", suggestion })
            }

            // Add to transcript
            this.transcript.push({ role: "assistant", content: cleanResponse })

            this.setState("idle")
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return

            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[TextChatEngine] Execution failed:", { specialistId, error: message })
            this.emit({ type: "error", error: message })
            this.setState("error")
        }
    }

    async sendAudio(_audioData: Blob): Promise<void> {
        // In text mode, audio is handled externally by useSpeechRecognition
        // which transcribes then calls sendText(). This is a no-op here.
        this.emit({
            type: "error",
            error: "Audio input not supported in text mode. Use speech recognition hook instead.",
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

    async disconnect(): Promise<void> {
        this.abortController?.abort()
        this.abortController = null
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
                console.error("[TextChatEngine] Event handler error:", err)
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

registerEngine("text", () => new TextChatEngine())

export { TextChatEngine }
