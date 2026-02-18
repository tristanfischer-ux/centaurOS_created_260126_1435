"use client"

/**
 * @file voice-session-dialog.tsx
 *
 * @description Voice conversation dialog with ForgeOS specialists.
 * Auto-detects the best available backend:
 * - **Base case (now):** Half-duplex via Whisper STT + Execute + TTS
 * - **Upgrade case:** Full-duplex via PersonaPlex when API key is configured
 *
 * Design principles:
 * - Human-first: presented as "Call [Name]", not "AI Voice Agent"
 * - Minimal UI: avatar, status, mute button, end call
 * - Live transcript scrolls below for reference
 * - Timer shows call duration
 * - Technology is invisible — feels like calling a colleague
 *
 * @component
 *
 * @example
 * <VoiceSessionDialog
 *   specialist={specialist}
 *   open={isCallActive}
 *   onOpenChange={setIsCallActive}
 *   foundryId={foundryId}
 * />
 */

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Mic,
    MicOff,
    PhoneOff,
    Volume2,
    VolumeX,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"
import type { ConversationEngine, ConversationEvent, SpecialistState } from "@/lib/agents/conversation-engine"

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoiceSessionDialogProps {
    /** The specialist to have a voice conversation with */
    specialist: Specialist
    /** Whether the dialog is open */
    open: boolean
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void
    /** Foundry ID for multi-tenant isolation */
    foundryId: string | null
    /** Memory thread ID for conversation persistence */
    threadId?: string | null
}

interface TranscriptEntry {
    role: "user" | "assistant"
    content: string
    timestamp: Date
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** State label shown below the specialist name */
const STATE_LABELS: Record<SpecialistState, string> = {
    idle: "Listening...",
    listening: "Hearing you...",
    thinking: "Thinking...",
    speaking: "Speaking...",
    connecting: "Connecting...",
    error: "Connection lost",
}

/** Pulse animation colors per state */
const STATE_RING_CLASSES: Record<SpecialistState, string> = {
    idle: "ring-muted",
    listening: "ring-status-success",
    thinking: "ring-status-warning",
    speaking: "ring-international-orange",
    connecting: "ring-muted",
    error: "ring-destructive",
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * VoiceSessionDialog — Full-duplex voice conversation with a specialist.
 *
 * @description Opens a centered dialog with the specialist's avatar, a live
 * state indicator, mute/unmute controls, and a scrolling transcript. The
 * PersonaPlex engine handles full-duplex audio (listening while speaking).
 *
 * The UI is deliberately minimal: no chat bubbles, no typing indicators,
 * no complex controls. It should feel like a phone call with a colleague.
 */
export function VoiceSessionDialog({
    specialist,
    open,
    onOpenChange,
    foundryId,
    threadId,
}: VoiceSessionDialogProps) {
    // ─── State ───────────────────────────────────────────────────────────

    const [callState, setCallState] = useState<SpecialistState>("connecting")
    const [isMuted, setIsMuted] = useState(false)
    const [isSpeakerOff, setIsSpeakerOff] = useState(false)
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [isConnected, setIsConnected] = useState(false)
    const [currentAgentText, setCurrentAgentText] = useState("")

    // Refs
    const transcriptEndRef = useRef<HTMLDivElement>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const engineRef = useRef<ConversationEngine | null>(null)

    // ─── Timer ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (isConnected) {
            timerRef.current = setInterval(() => {
                setElapsedSeconds((prev) => prev + 1)
            }, 1000)
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
    }, [isConnected])

    // ─── Auto-scroll transcript ──────────────────────────────────────────

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [transcript, currentAgentText])

    // ─── Format timer ────────────────────────────────────────────────────

    const formatTime = useCallback((seconds: number): string => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, "0")}`
    }, [])

    // ─── Connect to Voice Engine ────────────────────────────────────────
    // Auto-detects: PersonaPlex (full-duplex) if configured, else half-duplex.

    useEffect(() => {
        if (!open) return

        let cancelled = false

        async function startSession(): Promise<void> {
            try {
                setCallState("connecting")
                setTranscript([])
                setElapsedSeconds(0)
                setCurrentAgentText("")

                // Auto-detect the best available backend
                const { checkVoiceBackend } = await import(
                    "@/lib/personaplex/availability"
                )
                const backend = await checkVoiceBackend()

                if (cancelled) return

                // Dynamically import the right engine
                let engine: ConversationEngine

                if (backend === "personaplex") {
                    const { PersonaPlexVoiceEngine } = await import(
                        "@/lib/agents/engines/personaplex-voice-engine"
                    )
                    engine = new PersonaPlexVoiceEngine()
                } else {
                    const { HalfDuplexVoiceEngine } = await import(
                        "@/lib/agents/engines/half-duplex-voice-engine"
                    )
                    engine = new HalfDuplexVoiceEngine()
                }

                if (cancelled) return
                engineRef.current = engine

                // Subscribe to events (same interface for both engines)
                engine.onEvent((event: ConversationEvent) => {
                    if (cancelled) return

                    switch (event.type) {
                        case "state_change":
                            if (event.state) {
                                setCallState(event.state)
                                if (event.state === "idle" && !isConnected) {
                                    setIsConnected(true)
                                }
                            }
                            break

                        case "text_chunk":
                            if (event.text) {
                                setCurrentAgentText((prev) => prev + event.text)
                            }
                            break

                        case "text_done":
                            if (event.text) {
                                setTranscript((prev) => [
                                    ...prev,
                                    {
                                        role: "assistant",
                                        content: event.text!,
                                        timestamp: new Date(),
                                    },
                                ])
                                setCurrentAgentText("")
                            }
                            break

                        case "transcript":
                            if (event.text) {
                                setTranscript((prev) => [
                                    ...prev,
                                    {
                                        role: "user",
                                        content: event.text!,
                                        timestamp: new Date(),
                                    },
                                ])
                            }
                            break

                        case "error":
                            console.error("[VoiceSession] Error:", event.error)
                            break
                    }
                })

                // Resolve provider/model for the specialist
                const providerConfig = backend === "personaplex"
                    ? { providerId: "personaplex", modelId: "personaplex-7b-v1" }
                    : specialist.modelTier === "claude"
                        ? { providerId: "anthropic", modelId: "claude-sonnet-4-6" }
                        : { providerId: "minimax", modelId: "MiniMax-M2.5" }

                await engine.connect({
                    specialistId: specialist.id,
                    threadId: threadId ?? null,
                    foundryId,
                    ...providerConfig,
                    modelTier: specialist.modelTier,
                    systemPromptSuffix: "",
                    voice: specialist.voice,
                    deepThinkEnabled: false,
                })

                if (!cancelled) {
                    setIsConnected(true)
                    setCallState("idle")
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("[VoiceSession] Connection failed:", err)
                    setCallState("error")
                }
            }
        }

        startSession()

        return () => {
            cancelled = true
            engineRef.current?.disconnect()
            engineRef.current = null
            setIsConnected(false)
            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, specialist.id])

    // ─── Handlers ────────────────────────────────────────────────────────

    const handleEndCall = useCallback(async () => {
        await engineRef.current?.disconnect()
        engineRef.current = null
        setIsConnected(false)
        onOpenChange(false)
    }, [onOpenChange])

    const handleToggleMute = useCallback(() => {
        setIsMuted((prev) => !prev)
        // TODO: Actually mute/unmute the microphone stream in the engine
    }, [])

    const handleToggleSpeaker = useCallback(() => {
        setIsSpeakerOff((prev) => !prev)
        // TODO: Actually mute/unmute the playback in the engine
    }, [])

    // ─── Render ──────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                size="md"
                className="max-h-[90vh] overflow-hidden p-0 [&>button:last-child]:hidden"
            >
                <div className="flex flex-col h-[600px]">
                    {/* ── Call Header: Avatar + Status ─────────────────────── */}
                    <div className="flex flex-col items-center pt-10 pb-6 bg-muted/30">
                        {/* Specialist Avatar with state ring */}
                        <div className="relative mb-4">
                            <div
                                className={cn(
                                    "rounded-full ring-4 transition-all duration-500",
                                    STATE_RING_CLASSES[callState],
                                    callState === "speaking" && "ring-[6px]",
                                )}
                            >
                                {specialist.avatarImage ? (
                                    <Image
                                        src={specialist.avatarImage}
                                        alt={specialist.name}
                                        width={96}
                                        height={96}
                                        className="rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                                        <span className="text-2xl font-semibold text-foreground">
                                            {specialist.name.charAt(0)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Pulse animation when speaking */}
                            <AnimatePresence>
                                {callState === "speaking" && (
                                    <motion.div
                                        className="absolute inset-0 rounded-full border-2 border-international-orange"
                                        initial={{ scale: 1, opacity: 0.6 }}
                                        animate={{ scale: 1.4, opacity: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{
                                            duration: 1.5,
                                            repeat: Infinity,
                                            ease: "easeOut",
                                        }}
                                    />
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Specialist name and title */}
                        <h2 className="text-xl font-semibold text-foreground">
                            {specialist.name}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {specialist.title}
                        </p>

                        {/* Call state + timer */}
                        <div className="flex items-center gap-3 mt-3">
                            <span
                                className={cn(
                                    "text-sm font-medium",
                                    callState === "error"
                                        ? "text-destructive"
                                        : "text-muted-foreground"
                                )}
                            >
                                {STATE_LABELS[callState]}
                            </span>
                            {isConnected && (
                                <span className="text-sm font-mono text-muted-foreground">
                                    {formatTime(elapsedSeconds)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── Live Transcript ──────────────────────────────────── */}
                    <ScrollArea className="flex-1 px-6 py-4">
                        <div className="space-y-3">
                            {transcript.length === 0 && !currentAgentText && (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    {callState === "connecting"
                                        ? `Connecting to ${specialist.name}...`
                                        : "Start speaking — the conversation will appear here."
                                    }
                                </p>
                            )}

                            {transcript.map((entry, index) => (
                                <div
                                    key={index}
                                    className={cn(
                                        "text-sm leading-relaxed",
                                        entry.role === "user"
                                            ? "text-foreground"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    <span className="font-medium">
                                        {entry.role === "user" ? "You" : specialist.name}
                                        {": "}
                                    </span>
                                    {entry.content}
                                </div>
                            ))}

                            {/* Streaming agent text (not yet committed) */}
                            {currentAgentText && (
                                <div className="text-sm leading-relaxed text-muted-foreground">
                                    <span className="font-medium">
                                        {specialist.name}
                                        {": "}
                                    </span>
                                    {currentAgentText}
                                    <motion.span
                                        className="inline-block w-1.5 h-4 bg-international-orange ml-0.5 align-text-bottom"
                                        animate={{ opacity: [1, 0] }}
                                        transition={{
                                            duration: 0.8,
                                            repeat: Infinity,
                                            ease: "easeInOut",
                                        }}
                                    />
                                </div>
                            )}

                            <div ref={transcriptEndRef} />
                        </div>
                    </ScrollArea>

                    {/* ── Call Controls ────────────────────────────────────── */}
                    <div className="flex items-center justify-center gap-6 py-6 border-t bg-background">
                        {/* Mute microphone */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-12 w-12 rounded-full transition-colors",
                                isMuted
                                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            onClick={handleToggleMute}
                            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                        >
                            {isMuted ? (
                                <MicOff className="h-5 w-5" />
                            ) : (
                                <Mic className="h-5 w-5" />
                            )}
                        </Button>

                        {/* End call */}
                        <Button
                            variant="destructive"
                            size="icon"
                            className="h-14 w-14 rounded-full shadow-lg"
                            onClick={handleEndCall}
                            aria-label="End call"
                        >
                            <PhoneOff className="h-6 w-6" />
                        </Button>

                        {/* Speaker toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-12 w-12 rounded-full transition-colors",
                                isSpeakerOff
                                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            onClick={handleToggleSpeaker}
                            aria-label={isSpeakerOff ? "Turn speaker on" : "Turn speaker off"}
                        >
                            {isSpeakerOff ? (
                                <VolumeX className="h-5 w-5" />
                            ) : (
                                <Volume2 className="h-5 w-5" />
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
