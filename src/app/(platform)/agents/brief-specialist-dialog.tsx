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
    Loader2, Send, AlertCircle, Copy, Check,
    MessageSquareQuote, ArrowRight, Clock,
    History,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Markdown } from "@/components/ui/markdown"
import { getPromptsByCategory } from "./lib/prompt-library"
import { getOrCreateSpecialistThread, getRecentSpecialistOutputs, getSpecialistThreadHistory } from "@/actions/agent-memory"
import type { SpecialistHistoryMessage } from "@/actions/agent-memory"
import { createArtifact } from "@/actions/agent-artifacts"
import { getSpecialistById } from "./specialists-data"
import type { PromptTemplate } from "./lib/agent-types"
import type { Specialist } from "./specialists-data"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "assistant"
    content: string
    timestamp: Date
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

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Get all prompts for this specialist's categories
    const capabilities = useMemo(() => {
        const prompts: PromptTemplate[] = []
        for (const cat of specialist.categories) {
            prompts.push(...getPromptsByCategory(cat))
        }
        return prompts
    }, [specialist.categories])

    // Suggested next specialists
    const suggestedSpecialists = useMemo(() => {
        if (!specialist.suggestedNext) return []
        return specialist.suggestedNext
            .map((id) => getSpecialistById(id))
            .filter(Boolean) as Specialist[]
    }, [specialist.suggestedNext])

    // ─── Initialize Thread & Cross-Specialist Context on Open ─────────
    useEffect(() => {
        if (!open) return

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
                // Fetch thread and cross-specialist context in parallel
                const [threadResult, crossResult] = await Promise.all([
                    getOrCreateSpecialistThread(specialist.id),
                    getRecentSpecialistOutputs(specialist.id, 5),
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
            } catch (err) {
                console.error("[BriefDialog] Init failed:", err)
            } finally {
                if (!cancelled) setIsLoadingThread(false)
            }
        }

        initialize()
        return () => { cancelled = true }
    }, [open, specialist.id])

    // Reset messages when specialist changes
    useEffect(() => {
        setMessages([])
        setHistoryMessages([])
        setShowHistory(false)
    }, [specialist.id])

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

    // ─── Handlers ─────────────────────────────────────────────────────────

    const handleSelectCapability = useCallback((prompt: PromptTemplate) => {
        if (selectedPrompt?.id === prompt.id) {
            setSelectedPrompt(null)
        } else {
            setSelectedPrompt(prompt)
            if (!briefText.trim()) {
                textareaRef.current?.focus()
            }
        }
    }, [selectedPrompt, briefText])

    const handleExecute = useCallback(async () => {
        const userInput = briefText.trim()
        if (!userInput && !selectedPrompt) {
            setError("Tell your specialist what you need, or pick a capability above.")
            return
        }

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

        // Build the prompt with specialist personality, cross-specialist context, and handoff
        const systemExtras: string[] = []
        if (handoffContext && messages.length <= 1) {
            // Only inject handoff on the first exchange
            systemExtras.push(`\n\n## Handoff Context\n${handoffContext}`)
        }
        if (crossSpecialistContext) {
            systemExtras.push(`\n\n## Team Context\n${crossSpecialistContext}`)
        }

        const promptTemplate = selectedPrompt?.defaultPrompt ??
            `You are the ${specialist.name} for this company. ${specialist.workingStyle}\n\n{{input}}\n\n{{company_context}}\n\nProvide a thorough, actionable response that demonstrates deep expertise. Use markdown formatting with headers, tables, and bullet points for clarity.`

        try {
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: promptTemplate,
                    input: userInput,
                    providerId: "anthropic",
                    modelId: "claude-sonnet-4-20250514",
                    modality: "text",
                    threadId: threadId ?? undefined,
                    customSystemPromptSuffix: systemExtras.join(""),
                }),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Execution failed" }))
                throw new Error(errData.error || `HTTP ${res.status}`)
            }

            // Handle streaming response
            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullResponse = ""

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
                            const parsed = JSON.parse(data)
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
            }

            if (!fullResponse) {
                fullResponse = "No response received. Please try again."
            }

            // Add assistant message to chat
            const assistantMessage: ChatMessage = {
                role: "assistant",
                content: fullResponse,
                timestamp: new Date(),
            }
            setMessages((prev) => [...prev, assistantMessage])
            setStreamingResponse("")

            // Auto-save to deliverables (fire and forget)
            createArtifact({
                title: `${specialist.name}: ${userMessage.content.slice(0, 80)}`,
                content: fullResponse,
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
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[BriefDialog] Execution failed:", { specialist: specialist.id, error: message })
            setError(message)
            setStreamingResponse("")
        } finally {
            setIsExecuting(false)
        }
    }, [briefText, selectedPrompt, specialist, threadId, crossSpecialistContext])

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

    const handleSwitchSpecialist = useCallback((id: string) => {
        // Build handoff context from recent conversation
        let handoff: string | undefined
        if (messages.length > 0) {
            const firstUserMsg = messages.find((m) => m.role === "user")
            const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
            const parts: string[] = [
                `Handoff from ${specialist.name}:`,
            ]
            if (firstUserMsg) {
                parts.push(`The user was discussing: "${firstUserMsg.content.slice(0, 300)}"`)
            }
            if (lastAssistant) {
                parts.push(`Key points covered:\n${lastAssistant.content.slice(0, 500)}`)
            }
            parts.push("\nThe user has been referred to you to continue this work. Acknowledge the handoff briefly and build on what was discussed.")
            handoff = parts.join("\n\n")
        }

        onOpenChange(false)
        // Small delay to let dialog close animation finish
        setTimeout(() => onSwitchSpecialist?.(id, handoff), 200)
    }, [onOpenChange, onSwitchSpecialist, messages, specialist.name])

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
    const hasConversation = messages.length > 0
    const isStreaming = isExecuting && streamingResponse.length > 0
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant")

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col">
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
                            <DialogTitle className="font-display">{specialist.name}</DialogTitle>
                            <p className="text-sm text-muted-foreground italic mt-0.5">
                                &ldquo;{specialist.tagline}&rdquo;
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
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
                    {/* Working Style */}
                    {!hasConversation && (
                        <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-muted/50 border border-muted">
                            <MessageSquareQuote className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {specialist.workingStyle}
                            </p>
                        </div>
                    )}
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
                        {/* Chat Messages Area */}
                        {hasConversation && (
                            <div
                                ref={scrollRef}
                                className="flex-1 min-h-0 overflow-y-auto space-y-4 mb-4 pr-1"
                                style={{ maxHeight: "45vh" }}
                            >
                                {messages.map((msg, i) => (
                                    <div key={i} className={cn(
                                        "flex gap-3",
                                        msg.role === "user" ? "justify-end" : "justify-start"
                                    )}>
                                        {msg.role === "assistant" && (
                                            <div className="flex-shrink-0 relative h-7 w-7 rounded-full overflow-hidden bg-muted mt-1">
                                                {specialist.avatarImage ? (
                                                    <Image
                                                        src={specialist.avatarImage}
                                                        alt={specialist.name}
                                                        fill
                                                        className="object-cover"
                                                        sizes="28px"
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full w-full text-xs font-semibold text-foreground">
                                                        {specialist.name.charAt(0)}
                                                    </div>
                                                )}
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
                                ))}

                                {/* Streaming indicator */}
                                {isStreaming && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="flex-shrink-0 relative h-7 w-7 rounded-full overflow-hidden bg-muted mt-1">
                                            {specialist.avatarImage ? (
                                                <Image
                                                    src={specialist.avatarImage}
                                                    alt={specialist.name}
                                                    fill
                                                    className="object-cover"
                                                    sizes="28px"
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center h-full w-full text-xs font-semibold text-foreground">
                                                    {specialist.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="max-w-[85%] rounded-lg px-4 py-3 bg-muted/50 border border-muted">
                                            <Markdown content={streamingResponse} className="text-sm" />
                                        </div>
                                    </div>
                                )}

                                {/* Typing indicator */}
                                {isExecuting && !isStreaming && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="flex-shrink-0 h-7 w-7 rounded-full bg-muted mt-1" />
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {specialist.name} is thinking...
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Capability Chips (shown before first message or always accessible) */}
                        {!hasConversation && (
                            <div className="space-y-2 mb-4">
                                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Quick-select a capability
                                </Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {capabilities.map((cap) => (
                                        <Badge
                                            key={cap.id}
                                            variant={selectedPrompt?.id === cap.id ? "default" : "secondary"}
                                            className={cn(
                                                "cursor-pointer text-xs transition-colors",
                                                selectedPrompt?.id === cap.id
                                                    ? "bg-international-orange text-white hover:bg-international-orange-hover"
                                                    : "hover:bg-muted"
                                            )}
                                            onClick={() => handleSelectCapability(cap)}
                                        >
                                            {cap.title}
                                        </Badge>
                                    ))}
                                </div>
                                {selectedPrompt && (
                                    <p className="text-xs text-muted-foreground">
                                        {selectedPrompt.description}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Suggested Next Specialists (after at least one response) */}
                        {lastAssistantMessage && !isExecuting && suggestedSpecialists.length > 0 && (
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

                        {/* Text Input (always visible at bottom) */}
                        <div className="space-y-2">
                            {!hasConversation && (
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
                                        hasConversation
                                            ? `Follow up with your ${specialist.name}...`
                                            : selectedPrompt
                                                ? `Tell your ${specialist.name} the details...`
                                                : `What do you need from your ${specialist.name}?`
                                    }
                                    className={cn(
                                        "resize-none pr-12",
                                        hasConversation ? "min-h-[60px]" : "min-h-[100px]"
                                    )}
                                    aria-required
                                    disabled={isExecuting}
                                />
                                {/* Inline send button */}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={handleExecute}
                                    disabled={isExecuting || (!briefText.trim() && !selectedPrompt)}
                                    className="absolute bottom-2 right-2 h-8 w-8 text-muted-foreground hover:text-international-orange"
                                    aria-label="Send brief"
                                >
                                    {isExecuting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    {hasConversation ? "⌘+Enter to send" : `${briefText.length.toLocaleString()} characters`}
                                </p>
                                {hasConversation && !isExecuting && lastAssistantMessage && (
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
                                    if (hasConversation && !isExecuting) {
                                        // Start a new topic (clear messages but keep thread for memory)
                                        setMessages([])
                                        setSelectedPrompt(null)
                                        setBriefText("")
                                        setError(null)
                                    } else {
                                        onOpenChange(false)
                                    }
                                }}
                                disabled={isExecuting}
                            >
                                {hasConversation && !isExecuting ? "New Topic" : "Close"}
                            </Button>
                        </div>
                        {!hasConversation && (
                            <Button
                                onClick={handleExecute}
                                disabled={isExecuting || (!briefText.trim() && !selectedPrompt)}
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
