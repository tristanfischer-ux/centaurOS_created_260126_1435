"use client"

/**
 * @file use-specialist-chat.ts
 *
 * @description React hook that encapsulates all specialist conversation state
 * and logic. Acts as the bridge between the UI (BriefSpecialistDialog) and
 * the ConversationEngine abstraction layer.
 *
 * This hook manages:
 * - Chat messages (historical + current session)
 * - Streaming response accumulation
 * - ConversationEngine lifecycle (connect/disconnect)
 * - Specialist state (idle, thinking, speaking, etc.)
 * - Dynamic specialist suggestions parsed from responses
 * - Auto-save to deliverables
 *
 * The conversation mode (text, voice, avatar) is determined by the tier
 * param and what engines are available. The hook handles graceful fallback.
 *
 * @example
 * const chat = useSpecialistChat({
 *   specialist,
 *   threadId,
 *   mode: 'text',
 *   systemPromptSuffix: '...',
 * })
 *
 * // Send a message
 * await chat.sendMessage("What's our go-to-market strategy?")
 *
 * // Access state
 * chat.messages
 * chat.streamingResponse
 * chat.specialistState
 *
 * @related
 * - src/lib/agents/conversation-engine.ts — Engine interface
 * - src/lib/agents/engines/ — Engine implementations
 * - src/app/(platform)/agents/brief-specialist-dialog.tsx — Primary consumer
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "sonner"
import { createArtifact } from "@/actions/agent-artifacts"
import type { ConversationMode, ConversationEngine, SpecialistState } from "@/lib/agents/conversation-engine"
import { createConversationEngine, resolveConversationMode } from "@/lib/agents/conversation-engine"
import { compilePersonalityPrompt } from "@/lib/agents/personality"
// Register all engines on import
import "@/lib/agents/engines"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
    role: "user" | "assistant"
    content: string
    timestamp: Date
    /** Marks messages loaded from previous sessions (shown dimmer with separator) */
    historical?: boolean
}

export interface UseSpecialistChatOptions {
    /** The specialist being chatted with */
    specialist: Specialist
    /** Memory thread ID for persistence */
    threadId: string | null
    /** Desired conversation mode (will fall back if unavailable) */
    preferredMode: ConversationMode
    /** AI provider ID (e.g., "minimax", "anthropic") */
    providerId: string
    /** Model ID (e.g., "MiniMax-M2.5", "claude-opus-4-6") */
    modelId: string
    /** Pre-built system prompt suffix (screen context, handoff, cross-specialist) */
    systemPromptSuffix: string
    /** Whether deep thinking is enabled */
    deepThinkEnabled: boolean
    /** Model tier for provider failover (e.g., "claude", "qwen", "minimax") */
    modelTier?: string
    /** Whether the dialog is open (triggers connect/disconnect) */
    isOpen: boolean
}

export interface UseSpecialistChatReturn {
    /** All chat messages (historical + current session) */
    messages: ChatMessage[]
    /** Set messages (for loading historical messages from outside) */
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
    /** Currently streaming response text (partial) */
    streamingResponse: string
    /** Whether the engine is currently processing a request */
    isExecuting: boolean
    /** Current specialist visual state */
    specialistState: SpecialistState
    /** Current error message, if any */
    error: string | null
    /** AI-recommended next specialist */
    dynamicSuggestion: { specialistId: string; reason: string } | null
    /** The resolved conversation mode (may differ from preferred if fallback occurred) */
    activeMode: ConversationMode
    /** Video stream for avatar mode */
    videoStream: MediaStream | null
    /** Send a text message to the specialist */
    sendMessage: (message: string, promptTemplate?: string) => Promise<void>
    /** Clear error state */
    clearError: () => void
    /** Reset the conversation (keep thread, clear messages) */
    resetConversation: () => void
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSpecialistChat({
    specialist,
    threadId,
    preferredMode,
    providerId,
    modelId,
    systemPromptSuffix,
    deepThinkEnabled,
    modelTier,
    isOpen,
}: UseSpecialistChatOptions): UseSpecialistChatReturn {
    // ─── State ───────────────────────────────────────────────────────────
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingResponse, setStreamingResponse] = useState("")
    const [isExecuting, setIsExecuting] = useState(false)
    const [specialistState, setSpecialistState] = useState<SpecialistState>("idle")
    const [error, setError] = useState<string | null>(null)
    const [dynamicSuggestion, setDynamicSuggestion] = useState<{
        specialistId: string
        reason: string
    } | null>(null)
    const [activeMode, setActiveMode] = useState<ConversationMode>("text")
    const [videoStream, setVideoStream] = useState<MediaStream | null>(null)

    // ─── Refs ────────────────────────────────────────────────────────────
    const engineRef = useRef<ConversationEngine | null>(null)
    const unsubscribeRef = useRef<(() => void) | null>(null)
    const lastUserMessageRef = useRef<string | null>(null)

    // ─── Engine Lifecycle ────────────────────────────────────────────────

    // Connect engine when dialog opens, disconnect when it closes
    useEffect(() => {
        if (!isOpen) {
            // Disconnect on close
            if (engineRef.current) {
                engineRef.current.disconnect().catch((err) => {
                    console.warn("[useSpecialistChat] Disconnect error:", err)
                })
                engineRef.current = null
            }
            unsubscribeRef.current?.()
            unsubscribeRef.current = null
            setVideoStream(null)
            return
        }

        // Resolve which mode to actually use
        const resolvedMode = resolveConversationMode(preferredMode)
        setActiveMode(resolvedMode)

        // For voice/avatar: build full system prompt (personality + context).
        // Text mode uses execute API which builds it server-side.
        const fullSystemPrompt =
            resolvedMode === "text"
                ? systemPromptSuffix
                : [
                      compilePersonalityPrompt(
                          specialist.name,
                          specialist.personality,
                          undefined,
                          specialist.id,
                      ),
                      systemPromptSuffix,
                  ]
                      .filter(Boolean)
                      .join("\n\n")

        // Create the engine
        const engine = createConversationEngine(resolvedMode)
        if (!engine) {
            console.error("[useSpecialistChat] No engine for mode:", resolvedMode)
            setError(`Conversation mode "${resolvedMode}" is not available.`)
            return
        }

        engineRef.current = engine

        // Subscribe to engine events
        const unsub = engine.onEvent((event) => {
            switch (event.type) {
                case "text_chunk":
                    setStreamingResponse((prev) => prev + (event.text ?? ""))
                    break

                case "text_done": {
                    const text = event.text ?? ""
                    if (text) {
                        const assistantMessage: ChatMessage = {
                            role: "assistant",
                            content: text,
                            timestamp: new Date(),
                        }
                        setMessages((prev) => [...prev, assistantMessage])

                        // Auto-save to deliverables (fire on completion, not setTimeout)
                        const userMsg = lastUserMessageRef.current
                        if (userMsg) {
                            lastUserMessageRef.current = null
                            createArtifact({
                                title: `${specialist.name}: ${userMsg.slice(0, 80)}`,
                                content: text,
                                contentType: "document",
                                metadata: {
                                    specialistId: specialist.id,
                                    specialistName: specialist.name,
                                    source: "specialist-brief",
                                    conversationMode: resolvedMode,
                                    userPrompt: userMsg,
                                },
                            }).then((result) => {
                                if (result.data) {
                                    toast.success("Saved to Deliverables", {
                                        description: "You can find this output in your Deliverables.",
                                        duration: 3000,
                                    })
                                }
                            }).catch((err) => {
                                console.warn("[useSpecialistChat] Auto-save failed:", err)
                            })
                        }
                    }
                    setStreamingResponse("")
                    setIsExecuting(false)
                    break
                }

                case "state_change":
                    if (event.state) {
                        setSpecialistState(event.state)
                    }
                    break

                case "suggestion":
                    if (event.suggestion) {
                        setDynamicSuggestion(event.suggestion)
                    }
                    break

                case "video_stream":
                    if (event.videoStream) {
                        setVideoStream(event.videoStream)
                    }
                    break

                case "transcript":
                    // Real-time transcript of user speech (voice/avatar modes)
                    // Could update an interim transcript display
                    break

                case "error":
                    setError(event.error ?? "An error occurred")
                    setIsExecuting(false)
                    break

                case "audio_chunk":
                case "audio_done":
                    // Audio playback handled by the engine or passed through
                    break
            }
        })
        unsubscribeRef.current = unsub

        // Connect the engine
        engine.connect({
            specialistId: specialist.id,
            threadId,
            foundryId: null, // Resolved server-side from auth
            providerId,
            modelId,
            modelTier,
            systemPromptSuffix: fullSystemPrompt,
            voice: specialist.voice,
            deepThinkEnabled,
        }).catch((err) => {
            console.error("[useSpecialistChat] Engine connect failed:", err)
            setError(err instanceof Error ? err.message : "Connection failed")
        })

        // Cleanup
        return () => {
            unsub()
            engine.disconnect().catch(() => { /* ignore cleanup errors */ })
            engineRef.current = null
        }
    }, [isOpen, specialist.id, specialist.name, specialist.personality, preferredMode, systemPromptSuffix])

    // ─── Send Message ────────────────────────────────────────────────────

    const sendMessage = useCallback(async (message: string, promptTemplate?: string) => {
        if (!engineRef.current) {
            setError("Not connected. Please close and reopen the dialog.")
            return
        }

        // Add user message to chat
        const userMessage: ChatMessage = {
            role: "user",
            content: message,
            timestamp: new Date(),
        }
        setMessages((prev) => [...prev, userMessage])
        setStreamingResponse("")
        setIsExecuting(true)
        setError(null)
        setDynamicSuggestion(null)

        lastUserMessageRef.current = message

        try {
            await engineRef.current.sendText(message, promptTemplate)
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : "Unknown error"
            console.error("[useSpecialistChat] Send failed:", errMessage)
            setError(errMessage)
            setIsExecuting(false)
            lastUserMessageRef.current = null
        }
    }, [specialist])

    // ─── Helpers ─────────────────────────────────────────────────────────

    const clearError = useCallback(() => setError(null), [])

    const resetConversation = useCallback(() => {
        setMessages((prev) => prev.filter((m) => m.historical))
        setStreamingResponse("")
        setError(null)
        setDynamicSuggestion(null)
    }, [])

    return {
        messages,
        setMessages,
        streamingResponse,
        isExecuting,
        specialistState,
        error,
        dynamicSuggestion,
        activeMode,
        videoStream,
        sendMessage,
        clearError,
        resetConversation,
    }
}
