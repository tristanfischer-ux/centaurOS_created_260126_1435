"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    Loader2, Send, AlertCircle, Copy, Check, Eye,
    MessageSquareQuote, ArrowRight, Clock,
    History, Mic, MicOff, Volume2, VolumeX, Sparkles, Brain,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Markdown } from "@/components/ui/markdown"
import { getPromptsByCategory } from "./lib/prompt-library"
import { getOrCreateSpecialistThread, getRecentSpecialistOutputs, getSpecialistThreadHistory } from "@/actions/agent-memory"
import type { SpecialistHistoryMessage } from "@/actions/agent-memory"
import { createArtifact } from "@/actions/agent-artifacts"
import { getSpecialistById, SPECIALISTS } from "./specialists-data"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useTts } from "@/hooks/use-tts"
import { useScreenContext } from "@/contexts/screen-context"
import { SpecialistChatAvatar } from "@/components/specialists/specialist-presentation"
import type { PromptTemplate } from "./lib/agent-types"
import type { Specialist } from "./specialists-data"

// ─── Conversation Mode (Feature Flag) ────────────────────────────────────────
// When NEXT_PUBLIC_ENABLE_VOICE_AVATAR is set, users with eligible tiers
// can switch between text, voice, and avatar modes. Until the relay server
// endpoints are deployed, only "text" mode is functional.
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENABLE_ADVANCED_MODES = typeof window !== "undefined"
    && process.env.NEXT_PUBLIC_ENABLE_VOICE_AVATAR === "true"

// ─── Specialist Model Configuration ───────────────────────────────────────────
// Centralizes model choices so upgrades are a one-line change.
// MiniMax M2.5 provides frontier-quality reasoning at ~100x lower cost than
// Claude Opus 4.6. Uses their OpenAI-compatible API at api.minimax.io/v1.

const SPECIALIST_MODELS = {
    greeting: { providerId: "minimax", modelId: "MiniMax-M2.5" },
    conversation: { providerId: "minimax", modelId: "MiniMax-M2.5" },
} as const

const DEEP_THINK_STORAGE_KEY = "forgeOS-specialist-deep-think"

// ─── Video Intro Configuration ────────────────────────────────────────────

/**
 * Feature flag for specialist video intros.
 * When enabled, plays a pre-rendered video greeting when the dialog opens.
 * Videos are generated via MiniMax I2V and stored in /videos/specialists/
 */
const ENABLE_VIDEO_INTROS = process.env.NEXT_PUBLIC_ENABLE_VIDEO_INTROS === "true"

/**
 * Get the video intro URL for a specialist.
 * Videos are stored at /videos/specialists/{specialist-id}.mp4
 * Returns undefined if the video doesn't exist or feature is disabled.
 */
function getSpecialistIntroVideoUrl(specialistId: string): string | undefined {
    if (!ENABLE_VIDEO_INTROS) return undefined
    // In production, these would be real video files
    // For now, return undefined to disable until videos are generated
    return undefined
    // return `/videos/specialists/${specialistId}.mp4`
}

/**
 * Build a static fallback greeting from specialist personality when the API greeting fails.
 * Uses tagline and first signature phrase so the user still sees an in-character opening.
 */
function getFallbackGreeting(specialist: Specialist): string {
    const phrase = specialist.personality.voice.signaturePhrases[0]
    return phrase
        ? `${specialist.tagline} ${phrase}`
        : `${specialist.tagline} What's the one thing we should focus on first?`
}

/**
 * Show a friendly, actionable message when the specialist can't connect (e.g. provider unavailable).
 */
function normalizeSpecialistError(error: string, specialistName: string): string {
    if (
        error.includes("temporarily unavailable") ||
        error.includes("not configured") ||
        error.includes("PROVIDER_UNAVAILABLE")
    ) {
        return `${specialistName} is having trouble connecting right now. Try again in a moment, or check your AI provider settings.`
    }
    return error
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "assistant"
    content: string
    timestamp: Date
    /** Marks messages loaded from previous sessions (shown dimmer with separator) */
    historical?: boolean
}

interface BriefSpecialistDialogProps {
    /** The specialist being briefed */
    specialist: Specialist
    /** Dialog open state */
    open: boolean
    /** Dialog state change handler */
    onOpenChange: (open: boolean) => void
    /** Callback to open a different specialist's dialog with optional handoff context */
    onSwitchSpecialist?: (specialistId: string, handoffContext?: string) => void
    /** Context passed from a referring specialist when switching */
    handoffContext?: string | null
    /** Name of the specialist that referred the user */
    referredBy?: string | null
    /** Optional label shown as a badge in the header indicating what entity is being discussed */
    contextLabel?: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * BriefSpecialistDialog -- Full-featured specialist briefing dialog with
 * persistent memory, conversational chat, cross-specialist awareness,
 * auto-save to deliverables, and suggested next specialists.
 *
 * @description On open, resolves the specialist's memory thread and fetches
 * cross-specialist context. Supports multi-turn conversation within the same
 * thread, with all messages persisted for future sessions. After each response,
 * auto-saves to Deliverables and shows suggested next specialists.
 */
export function BriefSpecialistDialog({
    specialist,
    open,
    onOpenChange,
    onSwitchSpecialist,
    handoffContext,
    referredBy,
    contextLabel,
}: BriefSpecialistDialogProps) {
    // ─── State ────────────────────────────────────────────────────────────
    const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null)
    const [briefText, setBriefText] = useState("")
    const [isExecuting, setIsExecuting] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingResponse, setStreamingResponse] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [threadId, setThreadId] = useState<string | null>(null)
    const [isLoadingThread, setIsLoadingThread] = useState(false)
    const [crossSpecialistContext, setCrossSpecialistContext] = useState("")
    const [showHistory, setShowHistory] = useState(false)
    const [historyMessages, setHistoryMessages] = useState<SpecialistHistoryMessage[]>([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [dynamicSuggestion, setDynamicSuggestion] = useState<{
        specialistId: string
        reason: string
    } | null>(null)

    const [isGeneratingGreeting, setIsGeneratingGreeting] = useState(false)
    const [isPlayingIntroVideo, setIsPlayingIntroVideo] = useState(false)
    const [introVideoUrl, setIntroVideoUrl] = useState<string | null>(null)
    const [deepThinkEnabled, setDeepThinkEnabled] = useState(() => {
        if (typeof window === "undefined") return false
        try {
            return localStorage.getItem(DEEP_THINK_STORAGE_KEY) === "true"
        } catch {
            return false
        }
    })

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const videoIntroRef = useRef<HTMLVideoElement>(null)
    /** Tracks whether we've already generated a proactive greeting for this specialist session */
    const greetingGeneratedRef = useRef(false)
    /** Tracks whether we've already played the intro video for this specialist session */
    const introVideoPlayedRef = useRef(false)
    /** AbortController for in-flight execute request — aborted when dialog closes or specialist changes */
    const executeAbortRef = useRef<AbortController | null>(null)

    // ─── Screen Awareness ─────────────────────────────────────────────────
    const { serializeScreenContext, screenContext } = useScreenContext()

    // ─── Voice Hooks ──────────────────────────────────────────────────────
    const tts = useTts()
    const speechRecognition = useSpeechRecognition({
        onResult: (transcript) => {
            setBriefText((prev) => (prev ? prev + " " + transcript : transcript))
        },
    })

    const suggestedSpecialists = useMemo(() => {
        if (!specialist.suggestedNext) return []
        return specialist.suggestedNext
            .map((id) => getSpecialistById(id))
            .filter(Boolean) as Specialist[]
    }, [specialist.suggestedNext])

    // ─── Initialize Thread & Cross-Specialist Context on Open ─────────
    useEffect(() => {
        if (!open) {
            // Stop voice when dialog closes
            tts.stop()
            if (speechRecognition.isListening) speechRecognition.stop()
            return
        }

        // Reset transient state
        setSelectedPrompt(null)
        setBriefText("")
        setStreamingResponse("")
        setError(null)
        setCopied(false)
        setShowHistory(false)
        // Don't reset messages -- we want to preserve the current conversation

        let cancelled = false

        async function initialize(): Promise<void> {
            setIsLoadingThread(true)
            try {
                // Fetch thread, cross-specialist context, AND history in parallel
                const [threadResult, crossResult, historyResult] = await Promise.all([
                    getOrCreateSpecialistThread(specialist.id),
                    getRecentSpecialistOutputs(specialist.id, 5),
                    getSpecialistThreadHistory(specialist.id, 20),
                ])

                if (cancelled) return

                if (threadResult.threadId) {
                    setThreadId(threadResult.threadId)
                } else {
                    console.warn("[BriefDialog] Could not get thread:", threadResult.error)
                }

                // Build cross-specialist context block
                if (crossResult.data && crossResult.data.length > 0) {
                    const lines = crossResult.data.map((item) => {
                        const name = getSpecialistById(item.specialistId)?.name ?? item.specialistId
                        return `[${name}]: ${item.summary}`
                    })
                    setCrossSpecialistContext(
                        `Your colleagues have been working on:\n${lines.join("\n\n")}`
                    )
                } else {
                    setCrossSpecialistContext("")
                }

                // Pre-populate chat with recent history so users see previous discussion
                if (historyResult.data && historyResult.data.length > 0) {
                    setHistoryMessages(historyResult.data)
                    // Show the last 6 messages (3 exchanges) as inline historical context
                    const recentHistory = historyResult.data.slice(-6)
                    const historicalMessages: ChatMessage[] = recentHistory.map((msg) => ({
                        role: msg.role as "user" | "assistant",
                        content: msg.content,
                        timestamp: new Date(msg.createdAt),
                        historical: true,
                    }))
                    setMessages(historicalMessages)
                }
            } catch (err) {
                console.error("[BriefDialog] Init failed:", err)
            } finally {
                if (!cancelled) setIsLoadingThread(false)
            }
        }

        initialize()
        return () => { cancelled = true }
    }, [open, specialist.id])

    // ─── Video Intro ─────────────────────────────────────────────────────────
    // Play a pre-rendered video greeting when the dialog opens (if available)
    // We check historical messages state at initialization time
    const hasHistoricalMessagesRef = useRef(false)
    useEffect(() => {
        hasHistoricalMessagesRef.current = messages.some((m) => m.historical)
    }, [messages])

    useEffect(() => {
        // Only play if dialog is open, thread is loaded, and video is available
        if (!open || isLoadingThread) return
        if (introVideoPlayedRef.current) return

        const videoUrl = getSpecialistIntroVideoUrl(specialist.id)
        if (!videoUrl) return

        // Skip if there are historical messages (returning user, not first time)
        if (hasHistoricalMessagesRef.current) return

        introVideoPlayedRef.current = true
        setIntroVideoUrl(videoUrl)
        setIsPlayingIntroVideo(true)
    }, [open, isLoadingThread, specialist.id])

    // Handle video end
    const handleIntroVideoEnded = useCallback(() => {
        setIsPlayingIntroVideo(false)
    }, [])

    // Reset messages and greeting flag when specialist changes
    useEffect(() => {
        setMessages([])
        setHistoryMessages([])
        setShowHistory(false)
        greetingGeneratedRef.current = false
        introVideoPlayedRef.current = false
        setIsPlayingIntroVideo(false)
        setIntroVideoUrl(null)
    }, [specialist.id])

    // Abort in-flight execute request when dialog closes or specialist changes
    useEffect(() => {
        return () => {
            executeAbortRef.current?.abort()
            executeAbortRef.current = null
        }
    }, [open, specialist.id])

    // Focus textarea when ready
    useEffect(() => {
        if (open && !isLoadingThread && !isExecuting) {
            setTimeout(() => textareaRef.current?.focus(), 150)
        }
    }, [open, isLoadingThread, isExecuting])

    // Auto-scroll chat as messages come in
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, streamingResponse])

    // ─── Proactive Greeting ──────────────────────────────────────────────
    // After initialization, always generate a proactive opening message from the specialist.
    // Tiered: with history/cross-context reference it; first-time use company context or a compelling opening question.
    useEffect(() => {
        if (isLoadingThread || !open) return
        if (greetingGeneratedRef.current) return
        greetingGeneratedRef.current = true

        const controller = new AbortController()
        const signal = controller.signal

        async function generateGreeting(): Promise<void> {
            setIsGeneratingGreeting(true)

            // Build context summary for the greeting prompt
            const historyContext = messages
                .filter((m) => m.historical)
                .slice(-4)
                .map((m) => `${m.role === "user" ? "User" : specialist.name}: ${m.content.slice(0, 200)}`)
                .join("\n")

            const contextParts: string[] = []
            if (historyContext) {
                contextParts.push(`## Previous Conversation\n${historyContext}`)
            }
            if (crossSpecialistContext) {
                contextParts.push(`## ${crossSpecialistContext}`)
            }

            const hasContextToReference = contextParts.length > 0
            const greetingInstructions = hasContextToReference
                ? `The founder is opening a conversation with you. Based on the context below, write a brief, proactive opening message (2-4 sentences). Reference specific details. Either:
- Pick up where you left off and suggest a next step
- Comment on what other specialists have been working on and connect it to your domain
- Ask a pointed question that would advance their work

Stay in character as ${specialist.name}. Be concise, direct, and actionable. Jump straight into substance — no "Hi!" or "Welcome back!" greetings.`
                : `A founder is meeting you for the first time. Write a brief, engaging opening (2-3 sentences) that:
- Introduces your perspective and what you bring to the table
- Asks ONE specific, thought-provoking question that shows your expertise
- Makes the founder feel like they just gained a sharp advisor

If company context is provided below, reference specific details and suggest 1-2 things you could help with right now. If no company context is provided, ask something that will help you quickly understand their situation.

Stay in character as ${specialist.name}. Be warm but direct. No generic pleasantries.`

            const greetingPrompt = `You are ${specialist.name}, the ${specialist.title} specialist. ${specialist.workingStyle}

${greetingInstructions}

${contextParts.length > 0 ? contextParts.join("\n\n") + "\n\n" : ""}{{input}}

{{company_context}}`

            try {
                const res = await fetch("/api/agents/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: greetingPrompt,
                        input: "Generate a proactive opening message.",
                        providerId: SPECIALIST_MODELS.greeting.providerId,
                        modelId: SPECIALIST_MODELS.greeting.modelId,
                        threadId: threadId ?? undefined,
                        specialistId: specialist.id,
                    }),
                    signal,
                })

                if (!res.ok || signal.aborted) {
                    const fallback: ChatMessage = {
                        role: "assistant",
                        content: getFallbackGreeting(specialist),
                        timestamp: new Date(),
                    }
                    setMessages((prev) => [...prev, fallback])
                    return
                }

                // Consume SSE stream
                const reader = res.body?.getReader()
                if (!reader) return
                const decoder = new TextDecoder()
                let fullResponse = ""

                while (true) {
                    const { done, value } = await reader.read()
                    if (done || signal.aborted) break
                    const chunk = decoder.decode(value, { stream: true })
                    for (const line of chunk.split("\n")) {
                        if (line.startsWith("data: ")) {
                            const data = line.slice(6)
                            if (data === "[DONE]") continue
                            try {
                                const parsed = JSON.parse(data) as { text?: string; error?: string }
                                if (parsed.error) {
                                    setError(normalizeSpecialistError(parsed.error, specialist.name))
                                    const fallback: ChatMessage = {
                                        role: "assistant",
                                        content: getFallbackGreeting(specialist),
                                        timestamp: new Date(),
                                    }
                                    setMessages((prev) => [...prev, fallback])
                                    return
                                }
                                if (parsed.text) fullResponse += parsed.text
                            } catch {
                                fullResponse += data
                            }
                        }
                    }
                }

                if (signal.aborted || !fullResponse.trim()) {
                    const fallback: ChatMessage = {
                        role: "assistant",
                        content: getFallbackGreeting(specialist),
                        timestamp: new Date(),
                    }
                    setMessages((prev) => [...prev, fallback])
                    return
                }

                // Strip any NEXT_SPECIALIST recommendation from the greeting
                const cleaned = fullResponse.replace(/NEXT_SPECIALIST:\s*\S+\s*\|.*/i, "").trim()

                const greetingMessage: ChatMessage = {
                    role: "assistant",
                    content: cleaned,
                    timestamp: new Date(),
                }
                setMessages((prev) => [...prev, greetingMessage])

                // Auto-play greeting via TTS if voice is enabled
                if (tts.voiceEnabled && specialist.voice) {
                    tts.play(cleaned, specialist.voice).catch((err) => {
                        console.warn("[BriefDialog] Greeting TTS failed:", err)
                    })
                }
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") return
                // Greeting failed — show static fallback so the user still sees an in-character opening
                console.warn("[BriefDialog] Greeting generation failed:", err)
                const fallback: ChatMessage = {
                    role: "assistant",
                    content: getFallbackGreeting(specialist),
                    timestamp: new Date(),
                }
                setMessages((prev) => [...prev, fallback])
            } finally {
                if (!signal.aborted) setIsGeneratingGreeting(false)
            }
        }

        generateGreeting()
        return () => {
            controller.abort()
        }
    }, [isLoadingThread, open, specialist.id, specialist.name, specialist.title, specialist.workingStyle, specialist.voice, threadId, messages, crossSpecialistContext, tts.voiceEnabled])

    // ─── Handlers ─────────────────────────────────────────────────────────

    const handleExecute = useCallback(async () => {
        const userInput = briefText.trim()
        if (!userInput) {
            setError("Tell your specialist what you need.")
            return
        }

        // AUDIO: Unlock AudioContext on user gesture (click "Go") so TTS works later
        tts.warmUp()

        // Add user message to chat
        const userMessage: ChatMessage = {
            role: "user",
            content: selectedPrompt
                ? `[${selectedPrompt.title}] ${userInput}`
                : userInput,
            timestamp: new Date(),
        }
        setMessages((prev) => [...prev, userMessage])
        setBriefText("")
        setSelectedPrompt(null)
        setIsExecuting(true)
        setStreamingResponse("")
        setError(null)
        setDynamicSuggestion(null)

        // Build the prompt with specialist personality, cross-specialist context, screen awareness, and handoff
        const systemExtras: string[] = []

        // Screen awareness: tell the specialist what the user is currently looking at
        const screenContextStr = serializeScreenContext()
        if (screenContextStr) {
            systemExtras.push(`\n\n${screenContextStr}`)
        }

        if (handoffContext && messages.length <= 1) {
            // Only inject handoff on the first exchange
            systemExtras.push(`\n\n## Handoff Context\n${handoffContext}`)
        }
        if (crossSpecialistContext) {
            systemExtras.push(`\n\n## Team Context\n${crossSpecialistContext}

IMPORTANT: If you notice overlaps, synergies, or potential conflicts between your advice and what your colleagues have been working on, proactively mention them. For example: "I notice the Sales Lead has been working on pricing — my recommendation here has implications for that discussion..." This helps the founder connect the dots across their team.`)
        }

        // Dynamic specialist recommendation: ask the AI to suggest who to talk to next
        const otherSpecialists = SPECIALISTS
            .filter((s) => s.id !== specialist.id)
            .map((s) => `- ${s.name} (${s.id}): ${s.description.slice(0, 100)}`)
            .join("\n")
        systemExtras.push(`\n\n## Specialist Recommendation
At the very end of your response, add a recommendation for which specialist the founder should talk to next. Use this EXACT format on its own line:

NEXT_SPECIALIST: [specialist_id] | [one-sentence reason why]

Available specialists:
${otherSpecialists}

Only recommend ONE specialist. Choose based on what gaps or next steps emerged from this conversation. If no follow-up is needed, write: NEXT_SPECIALIST: none | No immediate follow-up needed.`)

        const promptTemplate = selectedPrompt?.defaultPrompt ??
            `You are ${specialist.name}, the ${specialist.title} specialist for this company. ${specialist.workingStyle}\n\n{{input}}\n\n{{company_context}}\n\nProvide a thorough, actionable response that demonstrates deep expertise. Use markdown formatting with headers, tables, and bullet points for clarity.`

        const controller = new AbortController()
        executeAbortRef.current = controller

        try {
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: promptTemplate,
                    input: userInput,
                    providerId: SPECIALIST_MODELS.conversation.providerId,
                    modelId: SPECIALIST_MODELS.conversation.modelId,
                    modality: "text",
                    threadId: threadId ?? undefined,
                    specialistId: specialist.id,
                    customSystemPromptSuffix: systemExtras.join(""),
                    enableThinking: deepThinkEnabled,
                }),
                signal: controller.signal,
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Execution failed" }))
                const rawError = errData.error || `HTTP ${res.status}`
                throw new Error(normalizeSpecialistError(rawError, specialist.name))
            }

            // Handle streaming response
            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullResponse = ""
            let streamError: string | null = null

            while (true) {
                const { done, value } = await reader.read()
                if (done || controller.signal.aborted) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split("\n")
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6)
                        if (data === "[DONE]") continue
                        try {
                            const parsed = JSON.parse(data) as { text?: string; error?: string }
                            if (parsed.error) {
                                streamError = parsed.error
                                break
                            }
                            if (parsed.text) {
                                fullResponse += parsed.text
                                setStreamingResponse(fullResponse)
                            }
                        } catch {
                            fullResponse += data
                            setStreamingResponse(fullResponse)
                        }
                    }
                }
                if (streamError) break
            }

            if (streamError) {
                setError(normalizeSpecialistError(streamError, specialist.name))
                return
            }

            if (!fullResponse) {
                fullResponse = "No response received. Please try again."
            }

            // Parse dynamic specialist recommendation from the response
            const nextMatch = fullResponse.match(/NEXT_SPECIALIST:\s*(\S+)\s*\|\s*(.+)/i)
            let displayResponse = fullResponse
            if (nextMatch) {
                const [fullMatch, specId, reason] = nextMatch
                // Strip the recommendation line from the displayed response
                displayResponse = fullResponse.replace(fullMatch, "").trim()
                if (specId && specId !== "none") {
                    setDynamicSuggestion({ specialistId: specId.trim(), reason: reason.trim() })
                } else {
                    setDynamicSuggestion(null)
                }
            }

            // Add assistant message to chat (with recommendation stripped)
            const assistantMessage: ChatMessage = {
                role: "assistant",
                content: displayResponse,
                timestamp: new Date(),
            }
            setMessages((prev) => [...prev, assistantMessage])
            setStreamingResponse("")

            // Auto-play TTS if voice output is enabled (use clean response)
            if (tts.voiceEnabled && specialist.voice) {
                tts.play(displayResponse, specialist.voice).catch((err) => {
                    console.warn("[BriefDialog] TTS playback failed:", err)
                })
            }

            // Auto-save to deliverables (fire and forget)
            createArtifact({
                title: `${specialist.name}: ${userMessage.content.slice(0, 80)}`,
                content: displayResponse,
                contentType: "document",
                metadata: {
                    specialistId: specialist.id,
                    specialistName: specialist.name,
                    source: "specialist-brief",
                    userPrompt: userMessage.content,
                },
            }).then((result) => {
                if (result.data) {
                    toast.success("Saved to Deliverables", {
                        description: "You can find this output in your Deliverables.",
                        duration: 3000,
                    })
                }
            }).catch((err) => {
                console.warn("[BriefDialog] Auto-save failed:", err)
            })

        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[BriefDialog] Execution failed:", { specialist: specialist.id, error: message })
            setError(message)
            setStreamingResponse("")
        } finally {
            executeAbortRef.current = null
            setIsExecuting(false)
        }
    }, [briefText, selectedPrompt, specialist, threadId, crossSpecialistContext, handoffContext, messages, tts.voiceEnabled, tts.warmUp, tts.play, deepThinkEnabled, serializeScreenContext])

    const handleCopyLast = useCallback(async () => {
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
        if (!lastAssistant) return
        try {
            await navigator.clipboard.writeText(lastAssistant.content)
            setCopied(true)
            toast.success("Copied to clipboard")
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error("Failed to copy")
        }
    }, [messages])

    /** Pre-fill the textarea with a natural question from a conversation starter chip. */
    const handleStarterClick = useCallback((highlight: string) => {
        setBriefText(`Help me with ${highlight}`)
        setError(null)
        textareaRef.current?.focus()
    }, [])

    const handleSwitchSpecialist = useCallback((id: string) => {
        // Build rich handoff context that feels like a real colleague briefing
        const targetSpec = getSpecialistById(id)
        let handoff: string | undefined
        if (messages.length > 0) {
            const userMessages = messages.filter((m) => m.role === "user" && !m.historical)
            const assistantMessages = messages.filter((m) => m.role === "assistant" && !m.historical)
            const lastAssistant = assistantMessages[assistantMessages.length - 1]
            const firstUserMsg = userMessages[0]

            // Build a natural handoff that feels like a colleague briefing you
            const parts: string[] = [
                `## Handoff from ${specialist.name} (${specialist.title})`,
                "",
                `${specialist.name} just finished working with the founder on this topic and is bringing you in because your expertise is needed next.`,
            ]

            if (firstUserMsg) {
                parts.push(`\n**What the founder originally asked about:**\n"${firstUserMsg.content.slice(0, 400)}"`)
            }

            if (lastAssistant) {
                parts.push(`\n**Key points ${specialist.name} covered:**\n${lastAssistant.content.slice(0, 600)}`)
            }

            // Check if the referring specialist has a relationship defined with the target
            const relationship = specialist.personality.relationships?.[id]
            if (relationship && targetSpec) {
                parts.push(`\n**Your working relationship with ${specialist.name}:** ${relationship.pattern}`)
            }

            parts.push(`\n**Your job:** Pick up where ${specialist.name} left off. Don't repeat what was already covered — BUILD on it. Start substantively as if ${specialist.name} just briefed you in the hallway. The founder doesn't want to re-explain.`)

            handoff = parts.join("\n")
        }

        onOpenChange(false)
        // Small delay to let dialog close animation finish
        setTimeout(() => onSwitchSpecialist?.(id, handoff), 200)
    }, [onOpenChange, onSwitchSpecialist, messages, specialist])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleExecute()
        }
    }, [handleExecute])

    const handleToggleHistory = useCallback(async () => {
        if (showHistory) {
            setShowHistory(false)
            return
        }
        setShowHistory(true)
        // History is already loaded during initialization, but load if somehow empty
        if (historyMessages.length === 0) {
            setIsLoadingHistory(true)
            const result = await getSpecialistThreadHistory(specialist.id, 50)
            if (result.data) {
                setHistoryMessages(result.data)
            }
            setIsLoadingHistory(false)
        }
    }, [showHistory, historyMessages.length, specialist.id])

    // ─── Derived State ────────────────────────────────────────────────────
    const hasNonHistoricalMessages = messages.some((m) => !m.historical)
    const hasConversation = hasNonHistoricalMessages || isGeneratingGreeting
    const hasHistoricalMessages = messages.some((m) => m.historical)
    const isStreaming = isExecuting && streamingResponse.length > 0
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant" && !m.historical)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
                {/* Header */}
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 relative h-12 w-12 rounded-full overflow-hidden bg-muted">
                            {specialist.avatarImage ? (
                                <Image
                                    src={specialist.avatarImage}
                                    alt={specialist.name}
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full w-full">
                                    <span className="text-lg font-display font-semibold text-foreground">
                                        {specialist.name.charAt(0)}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <DialogTitle className="font-display">
                                {specialist.name}
                                <span className="text-sm font-normal text-muted-foreground ml-2">
                                    {specialist.title}
                                </span>
                            </DialogTitle>
                            <p className="text-sm text-muted-foreground italic mt-0.5">
                                &ldquo;{specialist.tagline}&rdquo;
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {contextLabel ? (
                                <Badge variant="secondary" className="text-xs gap-1 max-w-[180px] truncate">
                                    <MessageSquareQuote className="h-3 w-3 flex-shrink-0" />
                                    {contextLabel}
                                </Badge>
                            ) : screenContext.pageTitle !== "ForgeOS Platform" ? (
                                <Badge variant="secondary" className="text-[10px] gap-1 max-w-[180px] truncate opacity-70">
                                    <Eye className="h-3 w-3 flex-shrink-0" />
                                    Seeing: {screenContext.pageTitle}
                                </Badge>
                            ) : null}
                            {referredBy && (
                                <Badge variant="default" className="text-xs gap-1 bg-international-orange/10 text-international-orange border-international-orange/20">
                                    <ArrowRight className="h-3 w-3" />
                                    Referred by {referredBy}
                                </Badge>
                            )}
                            {threadId && (
                                <Badge variant="secondary" className="text-xs gap-1">
                                    <Clock className="h-3 w-3" />
                                    Remembers you
                                </Badge>
                            )}
                            {/* Voice output toggle */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    const enabling = !tts.voiceEnabled
                                    tts.setVoiceEnabled(enabling)
                                    // Unlock AudioContext when enabling voice via this user gesture
                                    if (enabling) tts.warmUp()
                                }}
                                className={cn(
                                    "h-7 w-7 p-0",
                                    tts.voiceEnabled && "text-international-orange",
                                    tts.isPlaying && "animate-pulse"
                                )}
                                aria-label={tts.voiceEnabled ? "Mute voice output" : "Enable voice output"}
                            >
                                {tts.voiceEnabled ? (
                                    <Volume2 className="h-4 w-4" />
                                ) : (
                                    <VolumeX className="h-4 w-4" />
                                )}
                            </Button>
                            {threadId && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleToggleHistory}
                                    className={cn(
                                        "h-7 w-7 p-0",
                                        showHistory && "text-international-orange"
                                    )}
                                    aria-label="Show conversation history"
                                >
                                    <History className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {/* Loading State */}
                {isLoadingThread && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                        <span className="text-sm text-muted-foreground">Connecting to {specialist.name}...</span>
                    </div>
                )}

                {/* History Panel */}
                {showHistory && !isLoadingThread && (
                    <div className="border rounded-lg bg-muted/20 max-h-[40vh] overflow-y-auto">
                        <div className="px-3 py-2 border-b bg-muted/50 sticky top-0">
                            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                Past conversations
                            </p>
                        </div>
                        {isLoadingHistory ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                                <span className="text-sm text-muted-foreground">Loading history...</span>
                            </div>
                        ) : historyMessages.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                No previous conversations with {specialist.name}.
                            </div>
                        ) : (
                            <div className="p-3 space-y-3">
                                {historyMessages.map((msg, i) => (
                                    <div key={i} className={cn(
                                        "text-xs",
                                        msg.role === "user" ? "text-foreground" : "text-muted-foreground"
                                    )}>
                                        <span className="font-semibold">
                                            {msg.role === "user" ? "You" : specialist.name}:
                                        </span>{" "}
                                        <span className="line-clamp-3">
                                            {msg.content.slice(0, 200)}
                                            {msg.content.length > 200 ? "..." : ""}
                                        </span>
                                        <span className="block text-[10px] text-muted-foreground mt-0.5">
                                            {new Date(msg.createdAt).toLocaleDateString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Content */}
                {!isLoadingThread && (
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* Video Intro */}
                        {introVideoUrl && (
                            <div className="flex-shrink-0 mb-4">
                                <div className="relative rounded-lg overflow-hidden border bg-black aspect-video max-h-[200px]">
                                    <video
                                        ref={videoIntroRef}
                                        src={introVideoUrl}
                                        autoPlay
                                        muted
                                        playsInline
                                        onEnded={handleIntroVideoEnded}
                                        className="w-full h-full object-contain"
                                    />
                                    {isPlayingIntroVideo && (
                                        <div className="absolute bottom-2 right-2">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => {
                                                    setIsPlayingIntroVideo(false)
                                                    if (videoIntroRef.current) {
                                                        videoIntroRef.current.pause()
                                                    }
                                                }}
                                                className="h-7 text-xs bg-foreground/50 text-background hover:bg-foreground/70 border-0"
                                            >
                                                Skip
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Chat Messages Area */}
                        {(hasConversation || hasHistoricalMessages) && (
                            <div
                                ref={scrollRef}
                                role="log"
                                aria-live="polite"
                                aria-label="Conversation with specialist"
                                className="flex-1 min-h-0 overflow-y-auto space-y-4 mb-4 pr-1"
                                style={{ maxHeight: "45vh" }}
                            >
                                {messages.map((msg, i) => {
                                    const isLastAssistant = msg.role === "assistant" && !msg.historical && i === messages.length - 1
                                    const isFirstHistorical = msg.historical && i === 0
                                    const isTransitionToNew = !msg.historical && i > 0 && messages[i - 1]?.historical
                                    return (
                                    <div key={i}>
                                        {/* "Previous conversation" separator */}
                                        {isFirstHistorical && (
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="flex-1 border-t border-muted" />
                                                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                                    Previous conversation
                                                </span>
                                                <div className="flex-1 border-t border-muted" />
                                            </div>
                                        )}
                                        {/* "Now" separator between historical and new messages */}
                                        {isTransitionToNew && (
                                            <div className="flex items-center gap-2 my-4">
                                                <div className="flex-1 border-t border-international-orange/30" />
                                                <span className="text-[10px] font-mono uppercase tracking-widest text-international-orange/70">
                                                    Now
                                                </span>
                                                <div className="flex-1 border-t border-international-orange/30" />
                                            </div>
                                        )}
                                        <div className={cn(
                                            "flex gap-3",
                                            msg.role === "user" ? "justify-end" : "justify-start",
                                            msg.historical && "opacity-60"
                                        )}>
                                            {msg.role === "assistant" && (
                                                <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-1">
                                                    <SpecialistChatAvatar
                                                        specialist={specialist}
                                                        state={isLastAssistant && (tts.isPlaying || tts.isLoading) ? "speaking" : "idle"}
                                                    />
                                                </div>
                                            )}
                                            <div className={cn(
                                                "max-w-[85%] rounded-lg px-4 py-3",
                                                msg.role === "user"
                                                    ? "bg-international-orange/10 text-foreground"
                                                    : "bg-muted/50 border border-muted"
                                            )}>
                                                {msg.role === "user" ? (
                                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                ) : (
                                                    <Markdown content={msg.content} className="text-sm" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    )
                                })}

                                {/* Streaming indicator */}
                                {isStreaming && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="flex-shrink-0 mt-1">
                                            <SpecialistChatAvatar
                                                specialist={specialist}
                                                state="speaking"
                                            />
                                        </div>
                                        <div className="max-w-[85%] rounded-lg px-4 py-3 bg-muted/50 border border-muted">
                                            <Markdown content={streamingResponse} className="text-sm" />
                                        </div>
                                    </div>
                                )}

                                {/* Typing indicator — personality-specific thinking message */}
                                {(isExecuting && !isStreaming) && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="flex-shrink-0 mt-1">
                                            <SpecialistChatAvatar
                                                specialist={specialist}
                                                state="thinking"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                                            {deepThinkEnabled ? (
                                                <Brain className="h-4 w-4 animate-pulse text-international-orange" />
                                            ) : (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            )}
                                            {deepThinkEnabled
                                                ? `${specialist.name} is analyzing deeply...`
                                                : specialist.thinkingIndicator
                                                    ? `${specialist.name}: ${specialist.thinkingIndicator}`
                                                    : `${specialist.name} is thinking...`
                                            }
                                        </div>
                                    </div>
                                )}

                                {/* Greeting generation indicator — shows specialist reviewing context */}
                                {isGeneratingGreeting && !isExecuting && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="flex-shrink-0 mt-1">
                                            <SpecialistChatAvatar
                                                specialist={specialist}
                                                state="thinking"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1 py-3">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                {specialist.name} is catching up...
                                            </div>
                                            {hasHistoricalMessages && (
                                                <p className="text-xs text-muted-foreground/70 ml-6">
                                                    Reviewing your previous conversation and team updates
                                                </p>
                                            )}
                                            {!hasHistoricalMessages && crossSpecialistContext && (
                                                <p className="text-xs text-muted-foreground/70 ml-6">
                                                    Checking what the team has been working on
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Suggested Next Specialists (after at least one response) */}
                        {/* AI-Powered Dynamic Recommendation */}
                        {lastAssistantMessage && !isExecuting && dynamicSuggestion && (() => {
                            const suggested = getSpecialistById(dynamicSuggestion.specialistId)
                            if (!suggested) return null
                            return (
                                <div className="mb-4 p-3 rounded-lg bg-international-orange/5 border border-international-orange/20">
                                    <p className="text-xs font-medium text-international-orange mb-2 flex items-center gap-1.5">
                                        <Sparkles className="h-3 w-3" />
                                        Recommended Next
                                    </p>
                                    <button
                                        onClick={() => handleSwitchSpecialist(suggested.id)}
                                        className="flex items-center gap-3 w-full px-3 py-2 rounded-md bg-background border border-international-orange/30 hover:border-international-orange/60 transition-colors text-sm group"
                                    >
                                        {suggested.avatarImage && (
                                            <div className="relative h-6 w-6 rounded-full overflow-hidden flex-shrink-0">
                                                <Image
                                                    src={suggested.avatarImage}
                                                    alt={suggested.name}
                                                    fill
                                                    className="object-cover"
                                                    sizes="24px"
                                                />
                                            </div>
                                        )}
                                        <div className="flex-1 text-left">
                                            <span className="font-medium text-foreground">{suggested.name}</span>
                                            <p className="text-xs text-muted-foreground">{dynamicSuggestion.reason}</p>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-international-orange group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                </div>
                            )
                        })()}

                        {/* Static fallback suggestions (only if no dynamic recommendation) */}
                        {lastAssistantMessage && !isExecuting && !dynamicSuggestion && suggestedSpecialists.length > 0 && (
                            <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-muted/50">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                    Continue with...
                                </p>
                                <div className="flex gap-2">
                                    {suggestedSpecialists.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => handleSwitchSpecialist(s.id)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border border-muted hover:border-international-orange/50 transition-colors text-sm group"
                                        >
                                            {s.avatarImage && (
                                                <div className="relative h-5 w-5 rounded-full overflow-hidden flex-shrink-0">
                                                    <Image
                                                        src={s.avatarImage}
                                                        alt={s.name}
                                                        fill
                                                        className="object-cover"
                                                        sizes="20px"
                                                    />
                                                </div>
                                            )}
                                            <span className="font-medium text-foreground">{s.name}</span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-international-orange transition-colors" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Intro card: conversation starters (history-based for returning users, highlights for new) */}
                        {!hasConversation && !hasHistoricalMessages && (
                            <div className="mb-4 p-4 rounded-lg bg-muted/30 border border-muted space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0">
                                        <SpecialistChatAvatar
                                            specialist={specialist}
                                            state={isGeneratingGreeting ? "thinking" : "idle"}
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1 pt-0.5">
                                        <p className="text-sm font-medium text-foreground italic">
                                            &ldquo;{specialist.tagline}&rdquo;
                                        </p>
                                        {isGeneratingGreeting && (
                                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                {specialist.name} is getting up to speed...
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {specialist.highlights.length > 0 && (
                                    <>
                                        <p className="text-xs font-medium text-muted-foreground">
                                            Start with a topic
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {specialist.highlights.map((highlight) => (
                                                <button
                                                    key={highlight}
                                                    type="button"
                                                    onClick={() => handleStarterClick(highlight)}
                                                    disabled={isExecuting}
                                                    className={cn(
                                                        "inline-flex items-center rounded-md border border-muted bg-background px-3 py-1.5 text-sm font-medium text-foreground",
                                                        "hover:border-international-orange/50 hover:bg-muted/50 transition-colors",
                                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2"
                                                    )}
                                                >
                                                    {highlight}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Returning user card: history-based conversation starters */}
                        {!hasConversation && hasHistoricalMessages && !isGeneratingGreeting && (
                            <div className="mb-4 p-4 rounded-lg bg-muted/30 border border-muted space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0">
                                        <SpecialistChatAvatar specialist={specialist} state="idle" />
                                    </div>
                                    <div className="min-w-0 flex-1 pt-0.5">
                                        <p className="text-sm text-muted-foreground">
                                            Pick up where you left off, or start something new.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {/* Generate history-based starters from previous user messages */}
                                    {(() => {
                                        const pastUserMsgs = historyMessages
                                            .filter(m => m.role === "user")
                                            .slice(-3)
                                            .map(m => m.content.slice(0, 60) + (m.content.length > 60 ? "..." : ""))
                                        const starters = pastUserMsgs.length > 0
                                            ? [`Follow up on: "${pastUserMsgs[pastUserMsgs.length - 1]}"`, ...specialist.highlights.slice(0, 3)]
                                            : specialist.highlights.slice(0, 4)
                                        return starters.map((starter) => (
                                            <button
                                                key={starter}
                                                type="button"
                                                onClick={() => {
                                                    setBriefText(starter.startsWith("Follow up") ? "" : `Help me with ${starter}`)
                                                    setError(null)
                                                    textareaRef.current?.focus()
                                                }}
                                                disabled={isExecuting}
                                                className={cn(
                                                    "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-foreground",
                                                    starter.startsWith("Follow up")
                                                        ? "border-international-orange/30 bg-international-orange/5 hover:border-international-orange/50"
                                                        : "border-muted bg-background hover:border-international-orange/50 hover:bg-muted/50",
                                                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2"
                                                )}
                                            >
                                                {starter}
                                            </button>
                                        ))
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Text Input (always visible at bottom) */}
                        <div className="space-y-2">
                            {!hasNonHistoricalMessages && !isGeneratingGreeting && !hasHistoricalMessages && (
                                <Label htmlFor="brief-text" className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    {selectedPrompt?.inputLabel ?? "Describe what you need"}
                                </Label>
                            )}
                            <div className="relative">
                                <Textarea
                                    ref={textareaRef}
                                    id="brief-text"
                                    value={briefText}
                                    onChange={(e) => {
                                        setBriefText(e.target.value)
                                        if (error) setError(null)
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder={
                                        speechRecognition.isProcessing
                                            ? "Transcribing..."
                                            : speechRecognition.isListening
                                                ? "Listening... speak now"
                                                : hasNonHistoricalMessages
                                                ? `Follow up with ${specialist.name}...`
                                                : selectedPrompt
                                                    ? `Paste or type your ${selectedPrompt.inputLabel.toLowerCase()} here...`
                                                    : `What do you need from ${specialist.name} (${specialist.title})?`
                                    }
                                    className={cn(
                                        "resize-none pr-20",
                                        hasNonHistoricalMessages ? "min-h-[60px]" : "min-h-[100px]",
                                        (speechRecognition.isListening || speechRecognition.isProcessing) && "border-destructive/50"
                                    )}
                                    aria-required
                                    disabled={isExecuting}
                                />
                                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                    {/* Deep Think toggle */}
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                            const next = !deepThinkEnabled
                                            setDeepThinkEnabled(next)
                                            try {
                                                localStorage.setItem(DEEP_THINK_STORAGE_KEY, String(next))
                                            } catch { /* localStorage unavailable */ }
                                            toast.success(next ? "Deep Think enabled" : "Deep Think disabled", {
                                                description: next
                                                    ? "Responses will take longer but use deeper reasoning."
                                                    : "Standard response speed.",
                                                duration: 2000,
                                            })
                                        }}
                                        disabled={isExecuting}
                                        className={cn(
                                            "h-8 w-8",
                                            deepThinkEnabled
                                                ? "text-international-orange"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        aria-label={deepThinkEnabled ? "Disable deep thinking" : "Enable deep thinking"}
                                    >
                                        <Brain className="h-4 w-4" />
                                    </Button>
                                    {/* Mic button */}
                                    {speechRecognition.isSupported && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                                if (speechRecognition.isListening) {
                                                    speechRecognition.stop()
                                                } else {
                                                    speechRecognition.start()
                                                }
                                            }}
                                            disabled={isExecuting || speechRecognition.isProcessing}
                                            className={cn(
                                                "h-8 w-8",
                                                speechRecognition.isListening
                                                    ? "text-destructive animate-pulse"
                                                    : speechRecognition.isProcessing
                                                        ? "text-muted-foreground"
                                                        : "text-muted-foreground hover:text-foreground"
                                            )}
                                            aria-label={speechRecognition.isListening ? "Stop listening" : speechRecognition.isProcessing ? "Transcribing audio" : "Start voice input"}
                                        >
                                            {speechRecognition.isProcessing ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : speechRecognition.isListening ? (
                                                <MicOff className="h-4 w-4" />
                                            ) : (
                                                <Mic className="h-4 w-4" />
                                            )}
                                        </Button>
                                    )}
                                    {/* Send button */}
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleExecute}
                                        disabled={isExecuting || !briefText.trim()}
                                        className="h-8 w-8 text-muted-foreground hover:text-international-orange"
                                        aria-label="Send brief"
                                    >
                                        {isExecuting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            {/* Voice listening / processing indicator */}
                            {speechRecognition.isListening && (
                                <p className="text-xs text-destructive animate-pulse">
                                    Listening... speak now (stops on silence)
                                </p>
                            )}
                            {speechRecognition.isProcessing && (
                                <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-1.5">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Transcribing your voice...
                                </p>
                            )}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <p className="text-xs text-muted-foreground">
                                        {hasNonHistoricalMessages ? "⌘+Enter to send" : `${briefText.length.toLocaleString()} characters`}
                                    </p>
                                    {deepThinkEnabled && (
                                        <span className="flex items-center gap-1 text-xs text-international-orange">
                                            <Brain className="h-3 w-3" />
                                            Deep Think
                                        </span>
                                    )}
                                </div>
                                {hasNonHistoricalMessages && !isExecuting && lastAssistantMessage && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCopyLast}
                                        className="text-xs h-6 px-2"
                                    >
                                        {copied ? (
                                            <Check className="h-3 w-3 mr-1" />
                                        ) : (
                                            <Copy className="h-3 w-3 mr-1" />
                                        )}
                                        {copied ? "Copied" : "Copy last response"}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <Alert variant="destructive" className="mt-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}

                {/* Footer */}
                <DialogFooter>
                    <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    const hasUserMessages = messages.some((m) => m.role === "user" && !m.historical)
                                    if (hasUserMessages && !isExecuting) {
                                        // Generate a quick conversation summary before clearing
                                        const userMsgs = messages.filter((m) => m.role === "user" && !m.historical)
                                        const assistMsgs = messages.filter((m) => m.role === "assistant" && !m.historical)
                                        if (userMsgs.length > 0 && assistMsgs.length > 0) {
                                            const topicSummary = userMsgs[0].content.slice(0, 80)
                                            const keyPoints = assistMsgs.length
                                            toast.success(`${specialist.name}: Got it. We covered "${topicSummary}${topicSummary.length >= 80 ? "..." : ""}" — ${keyPoints} exchange${keyPoints > 1 ? "s" : ""}. It's saved to Deliverables. Ready for the next topic.`, {
                                                duration: 4000,
                                            })
                                        }
                                        // Start a new topic (clear non-historical messages but keep thread)
                                        setMessages((prev) => prev.filter((m) => m.historical))
                                        setSelectedPrompt(null)
                                        setBriefText("")
                                        setError(null)
                                        setDynamicSuggestion(null)
                                        greetingGeneratedRef.current = false
                                    } else {
                                        onOpenChange(false)
                                    }
                                }}
                                disabled={isExecuting || isGeneratingGreeting}
                            >
                                {messages.some((m) => m.role === "user" && !m.historical) && !isExecuting ? "New Topic" : "Close"}
                            </Button>
                        </div>
                        {!messages.some((m) => m.role === "user" && !m.historical) && (
                            <Button
                                onClick={handleExecute}
                                disabled={isExecuting || isGeneratingGreeting || !briefText.trim()}
                                className="bg-international-orange hover:bg-international-orange-hover text-white"
                            >
                                {isExecuting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Working...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Go
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
