"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Loader2, Send, AlertCircle, Copy, Check, Eye, AlertTriangle,
    MessageSquareQuote, ArrowRight, Clock, ChevronDown, ChevronUp,
    History, Mic, MicOff, Volume2, VolumeX, Sparkles, Brain, X,
    HelpCircle,
    Paperclip,
    FileIcon,
    ImageIcon,
    MoreVertical,
} from "lucide-react"
import { validateFile, formatFileSize, isImageFile } from "@/lib/file-upload"
import { cn } from "@/lib/utils"
import { stripThinkTags, stripPartialThinkTags } from "@/lib/utils/strip-think-tags"
import { toast } from "sonner"
import { Markdown } from "@/components/ui/markdown"
import { getPromptsByCategory } from "./lib/prompt-library"
import { getOrCreateSpecialistThread, getRecentSpecialistOutputs, getSpecialistThreadHistory } from "@/actions/agent-memory"
import type { SpecialistHistoryMessage } from "@/actions/agent-memory"
import { createArtifact, exportArtifactToGoogleDocs } from "@/actions/agent-artifacts"
import { exportAsPDF } from "@/lib/export-utils"
import { getSpecialistById, SPECIALISTS } from "./specialists-data"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useTts } from "@/hooks/use-tts"
import { useScreenContext } from "@/contexts/screen-context"
import { useBrowseContext } from "@/contexts/browse-context"
import { parseSlideDeckFromText } from "@/lib/ai-providers/slide-parser"
import type { SlideDeckContent } from "@/lib/ai-providers/types"
import { SpecialistChatAvatar } from "@/components/specialists/specialist-presentation"
import { InlinePresentationCard } from "@/components/specialists/inline-presentation-card"
import { ProposedActionsCard } from "@/components/specialists/proposed-actions-card"
import type { PromptTemplate } from "./lib/agent-types"
import type { Specialist } from "./specialists-data"

// ─── Presentation Intent Detection ───────────────────────────────────────────
// When the user's message contains presentation-related keywords, we switch
// the API modality from "text" to "slides" so the response comes back as a
// structured JSON slide deck instead of prose.

const PRESENTATION_KEYWORDS = [
    "presentation", "slides", "slide deck", "pitch deck",
    "deck", "powerpoint", "pptx",
] as const

function detectPresentationIntent(message: string): boolean {
    const lower = message.toLowerCase()
    return PRESENTATION_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Conversation Mode (Feature Flag) ────────────────────────────────────────
// When NEXT_PUBLIC_ENABLE_VOICE_AVATAR is set, users with eligible tiers
// can switch between text, voice, and avatar modes. Until the relay server
// endpoints are deployed, only "text" mode is functional.
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENABLE_ADVANCED_MODES = typeof window !== "undefined"
    && process.env.NEXT_PUBLIC_ENABLE_VOICE_AVATAR === "true"

// ─── Specialist Model Configuration ───────────────────────────────────────────
// Per-specialist model tiers: "claude" for high-stakes reasoning (strategy,
// finance, legal, CTO, chief of staff) and "minimax" for high-volume work
// (marketing, sales, HR, engineering, manufacturing, supply chain, etc.).
// Each specialist declares its tier in specialists-data.ts via `modelTier`.

const MODEL_TIERS = {
    claude: { providerId: "anthropic", modelId: "claude-sonnet-4-6" },
    qwen: { providerId: "qwen", modelId: "qwen3.5-plus" },
    "qwen-local": { providerId: "qwen-local", modelId: "qwen3:30b-a3b" },
    minimax: { providerId: "minimax", modelId: "MiniMax-M2.5" },
} as const

/** Resolve the provider + model for a specialist based on their declared tier. */
function getSpecialistModel(specialist: Specialist): { providerId: string; modelId: string } {
    return MODEL_TIERS[specialist.modelTier]
}

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

/** Per-message export menu: Copy, Save as artifact, Export PDF, Google Drive. */
function MessageExportMenu({ content }: { content: string }) {
    const [open, setOpen] = useState(false)
    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(content)
            toast.success("Copied to clipboard")
            setOpen(false)
        } catch {
            toast.error("Failed to copy")
        }
    }, [content])
    const handleSaveAsArtifact = useCallback(async () => {
        const { data, error } = await createArtifact({
            title: "Message export",
            content,
            contentType: "document",
            metadata: { source: "specialist-message-export" },
        })
        if (error) {
            toast.error(error)
            return
        }
        toast.success("Saved to Deliverables")
        setOpen(false)
    }, [content])
    const handleExportPdf = useCallback(async () => {
        try {
            await exportAsPDF(content, "message-export.pdf")
            toast.success("PDF downloaded")
            setOpen(false)
        } catch {
            toast.error("Failed to export PDF")
        }
    }, [content])
    const handleGoogleDrive = useCallback(async () => {
        const { data: artifact, error: createErr } = await createArtifact({
            title: "Message export",
            content,
            contentType: "document",
            metadata: { source: "specialist-message-export" },
        })
        if (createErr || !artifact) {
            toast.error(createErr ?? "Failed to save")
            return
        }
        const { docUrl, error: driveErr } = await exportArtifactToGoogleDocs(artifact.id)
        if (driveErr) {
            toast.error(driveErr)
            return
        }
        if (docUrl) window.open(docUrl, "_blank")
        toast.success("Opened in Google Docs")
        setOpen(false)
    }, [content])
    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Export message">
                    <MoreVertical className="h-3.5 w-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopy}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSaveAsArtifact}>
                    <FileIcon className="h-4 w-4 mr-2" />
                    Save as artifact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>
                    <FileIcon className="h-4 w-4 mr-2" />
                    Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleGoogleDrive}>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Send to Google Drive
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// AUDIT: readWithTimeout, isRetryableStreamError, and normalizeSpecialistError were
// extracted to src/lib/utils/stream-helpers.ts (2026-02-19, refactor step 2 of 8).
// They are pure functions with no React dependencies — now independently testable.
import { readWithTimeout, isRetryableStreamError, normalizeSpecialistError } from "@/lib/utils/stream-helpers"

/**
 * Per-chunk timeout for SSE stream reads. If no data arrives within this
 * window, the connection is considered stale (proxy dropped, provider hung).
 */
const STREAM_CHUNK_TIMEOUT_MS = 30_000

/** Greeting fetch timeout — show static fallback if greeting takes too long. */
const GREETING_TIMEOUT_MS = 15_000

/** Message fetch TTFB timeout — how long to wait for the server to start responding. */
const MESSAGE_TTFB_TIMEOUT_MS = 60_000

// ─── Types ────────────────────────────────────────────────────────────────────

/** Valid action types for specialist proposals. */
export type ProposedActionType = "objective" | "task" | "archive_objective" | "archive_task"

/** Structured proposal from the Specialist for one-click creation or archival (parsed from PROPOSED_ACTIONS block). */
export interface ProposedAction {
    type: ProposedActionType
    title: string
    description?: string
    /** For tasks: exact title of an objective in the same batch to link under. */
    objectiveTitle?: string
    /** For objectives: title of the strategic goal this objective should be nested under. */
    strategicGoalTitle?: string
}

/** Whether a proposed action is destructive (archive/remove). */
export function isDestructiveAction(action: ProposedAction): boolean {
    return action.type === "archive_objective" || action.type === "archive_task"
}

/** Attachment returned from /api/agents/upload, sent with execute request. */
interface PendingAttachment {
    path: string
    url: string | null
    filename: string
    size: number
    mimeType: string
}

interface ChatMessage {
    role: "user" | "assistant"
    content: string
    timestamp: Date
    /** Marks messages loaded from previous sessions (shown dimmer with separator) */
    historical?: boolean
    /** Parsed from PROPOSED_ACTIONS in assistant messages; shown as inline approval cards. */
    proposals?: ProposedAction[]
    /** Rollout id from execute response; used to attach rewards when tasks from this message are completed. */
    rolloutId?: string | null
    /** Parsed slide deck for presentation messages; rendered as InlinePresentationCard. */
    slideDeck?: SlideDeckContent | null
}

/**
 * Ordered list of regex patterns to extract PROPOSED_ACTIONS from specialist output.
 *
 * @description Different LLMs produce the block in different formats:
 * - Claude reliably outputs `<!-- PROPOSED_ACTIONS [...] -->`
 * - MiniMax and other models sometimes use markdown fences, omit delimiters,
 *   or wrap the block differently. These fallback patterns handle common variations.
 *
 * Patterns are tried in order; the first match wins.
 */
const PROPOSED_ACTIONS_PATTERNS: RegExp[] = [
    // Pattern 1: Standard HTML comment (Claude-reliable)
    /<!--\s*PROPOSED_ACTIONS\s*([\s\S]*?)\s*-->/i,
    // Pattern 2: Markdown code fence with PROPOSED_ACTIONS label
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_ACTIONS\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/i,
    // Pattern 3: PROPOSED_ACTIONS on its own line followed by JSON array (no delimiters)
    /PROPOSED_ACTIONS\s*\n\s*(\[[\s\S]*?\])\s*(?:-->)?/i,
    // Pattern 4: Just a bare JSON array after the PROPOSED_ACTIONS keyword on the same line
    /PROPOSED_ACTIONS\s*(\[[\s\S]*?\])\s*(?:-->)?/i,
]

/**
 * Combined regex for stripping ALL variations of PROPOSED_ACTIONS blocks from display content.
 */
const STRIP_PROPOSED_ACTIONS_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_ACTIONS\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_ACTIONS\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
    /PROPOSED_ACTIONS\s*\n?\s*\[[\s\S]*?\]\s*(?:-->)?/gi,
]

/**
 * Validates and filters a parsed array into valid ProposedAction items.
 *
 * @param parsed - Unknown parsed JSON value
 * @returns Array of valid ProposedAction items
 */
function validateProposedActions(parsed: unknown): ProposedAction[] {
    if (!Array.isArray(parsed)) return []
    const VALID_TYPES: ProposedActionType[] = ["objective", "task", "archive_objective", "archive_task"]
    return parsed.filter(
        (item): item is ProposedAction =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as ProposedAction).type === "string" &&
            typeof (item as ProposedAction).title === "string" &&
            VALID_TYPES.includes((item as ProposedAction).type as ProposedActionType)
    )
}

/**
 * Parse PROPOSED_ACTIONS JSON block from Specialist response.
 *
 * @description Tries multiple regex patterns to handle output format differences
 * across LLM providers (Claude, MiniMax, Qwen, GPT). Logs diagnostic info
 * when blocks are found but fail to parse, aiding debugging of LLM-specific issues.
 *
 * @param content - The raw specialist response text
 * @returns Array of valid ProposedAction items, or empty array if none found
 */
export function parseProposedActions(content: string): ProposedAction[] {
    // Try each pattern in order
    for (let i = 0; i < PROPOSED_ACTIONS_PATTERNS.length; i++) {
        const pattern = PROPOSED_ACTIONS_PATTERNS[i]
        const match = content.match(pattern)
        if (!match || !match[1]) continue

        try {
            const raw = match[1].trim()
            const parsed = JSON.parse(raw) as unknown
            const actions = validateProposedActions(parsed)
            if (actions.length > 0) {
                if (i > 0) {
                    console.info("[ProposedActions] Parsed via fallback pattern", i, "—", actions.length, "actions found")
                }
                return actions
            }
        } catch (parseErr) {
            // JSON parse failed for this pattern — log and try next
            console.warn("[ProposedActions] Pattern", i, "matched but JSON parse failed:", {
                snippet: match[1].slice(0, 200),
                error: parseErr instanceof Error ? parseErr.message : "Unknown parse error",
            })
        }
    }

    // No pattern matched — check if the content contains the keyword at all
    // (diagnostic: LLM tried but produced an unparseable format)
    if (content.includes("PROPOSED_ACTIONS")) {
        console.warn("[ProposedActions] Content contains PROPOSED_ACTIONS keyword but no pattern matched. Tail:", content.slice(-500))
    }

    return []
}

/**
 * Remove PROPOSED_ACTIONS blocks (all format variations) from content so they don't render in Markdown.
 *
 * @param content - Raw specialist response with potential PROPOSED_ACTIONS blocks
 * @returns Content with all PROPOSED_ACTIONS blocks stripped
 */
export function stripProposedActionsBlock(content: string): string {
    let result = content
    for (const pattern of STRIP_PROPOSED_ACTIONS_PATTERNS) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}

/** Render mode: "dialog" for centered modal, "panel" for persistent sidebar */
export type SpecialistRenderMode = "dialog" | "panel"

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
    /** Render mode: "dialog" for centered modal (default), "panel" for sidebar layout */
    renderMode?: SpecialistRenderMode
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
    renderMode = "dialog",
}: BriefSpecialistDialogProps) {
    const isPanel = renderMode === "panel"
    // ─── State ────────────────────────────────────────────────────────────
    const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null)
    const [briefText, setBriefText] = useState("")
    const [isExecuting, setIsExecuting] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingResponse, setStreamingResponse] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [threadId, setThreadId] = useState<string | null>(null)
    const [contextGrounding, setContextGrounding] = useState<{
        availableSections: string[]
        missingContextHints: string[]
    } | null>(null)
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
    const [thinkingPhaseIndex, setThinkingPhaseIndex] = useState(0)
    const [isHandoffBriefingExpanded, setIsHandoffBriefingExpanded] = useState(true)
    /** When set, the next greeting should acknowledge this previous topic and re-engage */
    const [newTopicPreviousSummary, setNewTopicPreviousSummary] = useState<string | null>(null)
    /** Dynamic conversation starters generated from company context for first-time users */
    const [dynamicStarters, setDynamicStarters] = useState<string[] | null>(null)
    /** Whether urgency was detected in the user's last message */
    const [isUrgentMessage, setIsUrgentMessage] = useState(false)
    /** Tension detected between this specialist and another */
    const [tensionCard, setTensionCard] = useState<{ specialistId: string; description: string } | null>(null)
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
    /** Files attached to the next message (uploaded to storage, sent with execute). */
    const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
    const [isDraggingOver, setIsDraggingOver] = useState(false)
    const [isUploadingFile, setIsUploadingFile] = useState(false)

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const panelFileInputRef = useRef<HTMLInputElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const videoIntroRef = useRef<HTMLVideoElement>(null)
    /** Tracks whether we've already generated a proactive greeting for this specialist session */
    const greetingGeneratedRef = useRef(false)
    /** Tracks whether we've already played the intro video for this specialist session */
    const introVideoPlayedRef = useRef(false)
    /** AbortController for in-flight execute request — aborted when dialog closes or specialist changes */
    const executeAbortRef = useRef<AbortController | null>(null)
    /** Snapshot of messages for the greeting effect — avoids re-running (and aborting) the greeting when messages change */
    const messagesSnapshotRef = useRef(messages)
    messagesSnapshotRef.current = messages
    /** Smart scroll: true when the user is near the bottom of the chat — auto-scroll only fires when true */
    const isNearBottomRef = useRef(true)

    // Derived: true when the AI response is actively streaming visible text
    const isStreaming = isExecuting && streamingResponse.length > 0

    // ─── Progressive Thinking Phases ──────────────────────────────────────
    // Cycles through personality-specific thinking messages at 0s, 3s, 8s
    useEffect(() => {
        if (!isExecuting || isStreaming) {
            setThinkingPhaseIndex(0)
            return
        }
        const phase2Timer = setTimeout(() => setThinkingPhaseIndex(1), 3000)
        const phase3Timer = setTimeout(() => setThinkingPhaseIndex(2), 8000)
        return () => {
            clearTimeout(phase2Timer)
            clearTimeout(phase3Timer)
        }
    }, [isExecuting, isStreaming])


    // ─── Screen Awareness ─────────────────────────────────────────────────
    const { serializeScreenContext, screenContext } = useScreenContext()

    // ─── Browse Context (In-App Browser) ─────────────────────────────────
    const { formatForPrompt: formatBrowseContext } = useBrowseContext()

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

                // Build cross-specialist context block with "I noticed" instructions
                if (crossResult.data && crossResult.data.length > 0) {
                    const lines = crossResult.data.map((item) => {
                        const otherSpec = getSpecialistById(item.specialistId)
                        const name = otherSpec?.name ?? item.specialistId
                        const title = otherSpec?.title ?? ""
                        return `[${name}${title ? ` (${title})` : ""}]: ${item.summary}`
                    })
                    setCrossSpecialistContext(
                        `Your colleagues have been working on:\n${lines.join("\n\n")}\n\nIMPORTANT — "I noticed" pattern: If you see overlaps, synergies, or potential CONFLICTS between your work and theirs, PROACTIVELY flag them. Real colleagues catch these connections. Example: "I see ${crossResult.data[0] ? (getSpecialistById(crossResult.data[0].specialistId)?.name ?? "a colleague") : "a colleague"} has been working on something that connects to what we should discuss..."`
                    )
                } else {
                    setCrossSpecialistContext("")
                }

                // Pre-populate chat with recent history so users see previous discussion
                if (historyResult.data && historyResult.data.length > 0) {
                    setHistoryMessages(historyResult.data)
                    // Show the last 10 messages (5 exchanges) as inline historical context
                    const recentHistory = historyResult.data.slice(-10)
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

    // Smart auto-scroll: only scroll to bottom when user is near the bottom.
    // This lets users scroll up to read earlier messages without being yanked back down
    // on every streaming chunk. Standard chat UX (Slack, Discord, etc.).
    const handleChatScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const threshold = 120
        isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    }, [])

    useEffect(() => {
        if (scrollRef.current && isNearBottomRef.current) {
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

            // Build context summary for the greeting prompt.
            // Uses messagesSnapshotRef to avoid re-running this effect when messages change
            // (which would abort the greeting mid-stream during specialist switches).
            const historyContext = messagesSnapshotRef.current
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
            const hasCrossContext = !!crossSpecialistContext
            const hasHistory = !!historyContext

            // Calculate time since last conversation for re-engagement awareness
            const lastHistoryMessage = historyMessages.length > 0
                ? historyMessages[historyMessages.length - 1]
                : null
            const daysSinceLastChat = lastHistoryMessage
                ? Math.floor((Date.now() - new Date(lastHistoryMessage.createdAt).getTime()) / (1000 * 60 * 60 * 24))
                : null

            const timeGapContext = daysSinceLastChat !== null && daysSinceLastChat >= 3
                ? `\n\nIMPORTANT TIME CONTEXT: It has been ${daysSinceLastChat} day${daysSinceLastChat === 1 ? "" : "s"} since your last conversation with this founder. Acknowledge the gap naturally — ask if they've made progress on what you discussed, or note that you've been thinking about their situation since then. Don't be dramatic about it, just show you're aware time has passed. Example: "It's been a couple of weeks since we talked about [topic] — have you had a chance to move on that?"`
                : ""

            // Detect guidance mode from handoff context
            const isGuidanceMode = handoffContext?.startsWith("__GUIDE_MODE__") ?? false
            const isFirstVisitToPage = screenContext.isFirstVisit ?? false

            // Build specific greeting instructions based on what context is available
            let greetingInstructions: string
            if (isGuidanceMode) {
                // "Guide me" mode — walk the user through the current page step-by-step
                greetingInstructions = `The founder clicked "Guide me through this page." They want you to walk them through the ${screenContext.pageTitle} page.

Write a friendly, structured page orientation (4-6 sentences) that:
1. Briefly names the page and its purpose (one sentence)
2. Walks through the 2-3 most important actions they can take, in order of priority
3. For each action, explain WHERE to find it (be specific about buttons, sections) and WHEN to use it
4. End by asking which action they'd like to try first, or if they have a specific question

Use the page knowledge provided in the system context. Be specific about UI locations — "Click the '+ Add Pillar' button in the top right" not "you can add pillars."

Stay in character as ${specialist.name}. Be warm, encouraging, and practical — like a knowledgeable colleague showing someone around.

IMPORTANT: After your walkthrough, output 3 follow-up starters in this format:
STARTERS:
- [action-oriented question about the most important feature, e.g. "Help me create my first strategic pillar"]
- [question about a specific workflow on this page]
- [question about how this page connects to other parts of ForgeOS]`
            } else if (newTopicPreviousSummary) {
                // "New Topic" variant — the user just cleared a conversation, re-engage naturally
                greetingInstructions = `The founder just finished discussing "${newTopicPreviousSummary}" with you and wants to move to a new topic.

Write a brief re-engagement (1-2 sentences) that:
- Briefly acknowledges you covered the previous topic (don't repeat the whole thing)
- Invites the next topic with energy — "What else is on your mind?" or something in your own voice
- Feels like a natural transition, NOT a reset

Stay in character as ${specialist.name}. Be warm and direct. Example tone: "Good — that's handled. What's next?"`
                // Clear it so the next greeting is back to normal
                setNewTopicPreviousSummary(null)
            } else if (hasHistory && hasCrossContext) {
                // Best case: we have both past conversation AND team context
                greetingInstructions = `The founder is opening a conversation with you. You have BOTH previous conversation history AND knowledge of what other specialists have been working on.

Write a proactive opening (2-4 sentences) that does ONE of these:
1. **"I noticed something"**: If you spot a connection, overlap, or conflict between your domain and what other specialists discussed, FLAG IT. Example: "I noticed Sal has been working on enterprise pricing while we discussed SMB positioning — we should align on target segment."
2. **Pick up where you left off**: Reference the last topic and suggest the logical next step.
3. **Surface a recurring theme**: If the same topic keeps coming up, name it: "We keep coming back to pricing — maybe it's time to make a decision."

CRITICAL: Be specific. Reference names, topics, and details from the context below. Generic openings are forbidden.
Stay in character as ${specialist.name}. Jump straight into substance — no "Hi!" or "Welcome back!".${timeGapContext}`
            } else if (hasHistory) {
                greetingInstructions = `The founder is returning to continue working with you. Based on your conversation history below, write a proactive opening (2-3 sentences) that:
- References what you discussed last time with specific details
- Suggests a concrete next step or asks a follow-up question
- Shows you remember and have been thinking about their situation

Stay in character as ${specialist.name}. Be concise, direct, and actionable. Jump straight into substance — no greetings.${timeGapContext}`
            } else if (hasCrossContext) {
                greetingInstructions = `The founder is meeting you for the first time, BUT you can see what other specialists on the team have been working on.

Write a proactive opening (2-3 sentences) that:
- Introduces your perspective by connecting it to what other specialists discussed
- Example: "I see Sage has been working on competitive strategy — from a finance perspective, here's what I'd want to stress-test..."
- Asks ONE specific question that shows your expertise and connects to the team's work

Stay in character as ${specialist.name}. Be warm but direct. No generic pleasantries.`
            } else {
                const firstVisitHint = isFirstVisitToPage && screenContext.pageTitle !== "ForgeOS Platform"
                    ? `\n\nIMPORTANT: This is the founder's FIRST TIME on the ${screenContext.pageTitle} page. After your opening, briefly mention that you can walk them through this page if they'd like — something natural like "By the way, I can walk you through everything on this page if you'd like a quick tour." Don't make it the focus, just a helpful offer.`
                    : ""

                greetingInstructions = `A founder is meeting you for the first time. Write a brief, engaging opening (2-3 sentences) that:
- Introduces your perspective and what you bring to the table
- Asks ONE specific, thought-provoking question that shows your expertise
- Makes the founder feel like they just gained a sharp advisor

If company context is provided below, reference specific details and suggest 1-2 things you could help with right now. If no company context is provided, ask something that will help you quickly understand their situation.

Stay in character as ${specialist.name}. Be warm but direct. No generic pleasantries.${firstVisitHint}

IMPORTANT: After your opening message, on a new line, output exactly 3 conversation starter questions the founder could ask you, in this exact format:
STARTERS:
- [first specific question they could ask you, based on company context if available]
- [second specific question]
- [third specific question]

Make these specific and contextual, not generic. If you know the company context, tailor them. For example, instead of "Help me with pricing strategy", write "Should we price our widget at $99 or $199 for SMBs?"`
            }

            const greetingPrompt = `You are ${specialist.name}, the ${specialist.title} specialist. ${specialist.workingStyle}

${greetingInstructions}

${contextParts.length > 0 ? contextParts.join("\n\n") + "\n\n" : ""}{{input}}

{{company_context}}`

            try {
                // Greeting timeout: abort after GREETING_TIMEOUT_MS and show
                // static fallback immediately so the user isn't waiting.
                const greetingTimeout = setTimeout(() => {
                    if (!signal.aborted) controller.abort()
                }, GREETING_TIMEOUT_MS)

                const res = await fetch("/api/agents/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: greetingPrompt,
                        input: "Generate a proactive opening message.",
                        providerId: getSpecialistModel(specialist).providerId,
                        modelId: getSpecialistModel(specialist).modelId,
                        modelTier: specialist.modelTier,
                        threadId: threadId ?? undefined,
                        specialistId: specialist.id,
                    }),
                    signal,
                })
                clearTimeout(greetingTimeout)

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
                    const { done, value } = await readWithTimeout(reader, STREAM_CHUNK_TIMEOUT_MS)
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

                // Strip think tags and NEXT_SPECIALIST recommendation from the greeting
                let cleaned = stripThinkTags(fullResponse.replace(/NEXT_SPECIALIST:\s*\S+\s*\|.*/i, "").trim())

                // Extract dynamic conversation starters (STARTERS: block) if present
                const startersMatch = cleaned.match(/STARTERS:\s*\n((?:\s*-\s*.+\n?)+)/i)
                if (startersMatch) {
                    const parsedStarters = startersMatch[1]
                        .split("\n")
                        .map((line) => line.replace(/^\s*-\s*/, "").trim())
                        .filter((s) => s.length > 0)
                        .slice(0, 3)
                    if (parsedStarters.length > 0) {
                        setDynamicStarters(parsedStarters)
                    }
                    // Remove the STARTERS block from the visible greeting
                    cleaned = cleaned.replace(/STARTERS:\s*\n((?:\s*-\s*.+\n?)+)/i, "").trim()
                }

                const greetingMessage: ChatMessage = {
                    role: "assistant",
                    content: cleaned,
                    timestamp: new Date(),
                }
                setMessages((prev) => [...prev, greetingMessage])

                // Auto-play greeting via TTS if voice is enabled (chunked for faster start)
                if (tts.voiceEnabled && specialist.voice) {
                    tts.playChunked(cleaned, specialist.voice).catch((err) => {
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
                // Always reset isGeneratingGreeting, even if aborted.
                // The guard `greetingGeneratedRef.current` prevents re-generation,
                // but we must clear the loading state so the UI is not stuck.
                setIsGeneratingGreeting(false)
            }
        }

        generateGreeting()
        return () => {
            controller.abort()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messages accessed via messagesSnapshotRef to prevent greeting abort on message changes
    }, [isLoadingThread, open, specialist.id, specialist.name, specialist.title, specialist.workingStyle, specialist.voice, threadId, crossSpecialistContext, tts.voiceEnabled, tts.playChunked])

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
        const attachmentsToSend = [...pendingAttachments]
        setPendingAttachments([])
        setIsExecuting(true)
        setStreamingResponse("")
        setError(null)
        setDynamicSuggestion(null)

        // Always scroll to bottom when the user sends a message — they should see their own message
        isNearBottomRef.current = true

        // Detect urgency in user message for visual feedback
        const urgencySignals = /!{2,}|HELP|URGENT|ASAP|EMERGENCY|CRISIS|CRITICAL/i
        setIsUrgentMessage(urgencySignals.test(userInput))

        // Build the prompt with specialist personality, cross-specialist context, screen awareness, and handoff
        const systemExtras: string[] = []

        // Screen awareness: tell the specialist what the user is currently looking at
        const screenContextStr = serializeScreenContext()
        if (screenContextStr) {
            systemExtras.push(`\n\n${screenContextStr}`)
        }

        // Browse context: inject web page content from the in-app browser
        const browseContextStr = formatBrowseContext()
        if (browseContextStr) {
            systemExtras.push(browseContextStr)
        }

        if (handoffContext && messages.length <= 1) {
            // Only inject handoff on the first exchange
            systemExtras.push(`\n\n## Handoff Context\n${handoffContext}`)
        }
        if (crossSpecialistContext) {
            systemExtras.push(`\n\n## Team Context\n${crossSpecialistContext}

IMPORTANT: If you notice overlaps, synergies, or potential conflicts between your advice and what your colleagues have been working on, proactively mention them. For example: "I notice the Sales Lead has been working on pricing — my recommendation here has implications for that discussion..." This helps the founder connect the dots across their team.

Additionally, if your recommendation DISAGREES with or TENSIONS with another specialist's recent work, add this on its own line after your response (before NEXT_SPECIALIST):

TENSION: [other_specialist_id] | [brief description of the disagreement, e.g. "Sage recommended aggressive expansion, but current cash flow suggests caution"]

Only include TENSION if there's a genuine conflict of perspective. Don't force it.`)
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

        // Conversation-aware prompt: once the specialist has greeted the user,
        // all subsequent messages are conversational follow-ups. Use a lightweight
        // template so the AI treats them as natural conversation turns.
        // The specialist personality, memory, and response standards are
        // already in the system prompt — no need to repeat "demonstrate
        // deep expertise" on every message (which overrides conversational intent).
        // We check for an assistant message (the greeting) rather than user messages
        // because setMessages for the current user message hasn't flushed yet.
        const isFollowUp = messages.some(m => !m.historical && m.role === "assistant")

        const promptTemplate = selectedPrompt?.defaultPrompt
            ?? (isFollowUp
                ? `{{input}}\n\n{{company_context}}`
                : `You are ${specialist.name}, the ${specialist.title} specialist for this company. ${specialist.workingStyle}\n\n{{input}}\n\n{{company_context}}\n\nProvide a thorough, actionable response that demonstrates deep expertise. Use markdown formatting with headers, tables, and bullet points for clarity.`
            )

        // Determine if we should stream TTS (declared before try so catch can stop it)
        const isTtsStreaming = tts.voiceEnabled && !!specialist.voice
        const isSlideRequest = detectPresentationIntent(userInput)

        try {
            // Auto-retry: one transparent retry for transient stream failures
            // (connection drops, provider timeouts). Non-retryable errors (auth,
            // rate limit, content) surface immediately.
            const MAX_ATTEMPTS = 2
            let fullResponse = ""
            let rolloutIdFromResponse: string | null = null

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                // Fresh AbortController per attempt — a previous TTFB timeout
                // aborts the controller, so reusing it would instantly abort the retry.
                const controller = new AbortController()
                executeAbortRef.current = controller

                // TTFB timeout: abort if the server doesn't start responding
                // within MESSAGE_TTFB_TIMEOUT_MS. Once streaming starts, the
                // per-chunk timeout (readWithTimeout) takes over.
                const ttfbTimeout = setTimeout(() => {
                    if (!controller.signal.aborted) controller.abort()
                }, MESSAGE_TTFB_TIMEOUT_MS)

                const res = await fetch("/api/agents/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: promptTemplate,
                        input: userInput,
                        providerId: getSpecialistModel(specialist).providerId,
                        modelId: getSpecialistModel(specialist).modelId,
                        modelTier: specialist.modelTier,
                        modality: isSlideRequest ? "slides" : "text",
                        threadId: threadId ?? undefined,
                        specialistId: specialist.id,
                        customSystemPromptSuffix: systemExtras.join(""),
                        enableThinking: deepThinkEnabled,
                        attachments: attachmentsToSend.length > 0
                            ? attachmentsToSend.map((a) => ({ path: a.path, url: a.url, filename: a.filename, mimeType: a.mimeType }))
                            : undefined,
                    }),
                    signal: controller.signal,
                })
                clearTimeout(ttfbTimeout)

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({ error: "Execution failed" }))
                    const rawError = errData.error || `HTTP ${res.status}`
                    throw new Error(normalizeSpecialistError(rawError, specialist.name))
                }

                rolloutIdFromResponse = res.headers.get("X-Rollout-Id")

                // Handle streaming response
                const reader = res.body?.getReader()
                if (!reader) throw new Error("No response body")

                // Start streaming TTS so speech begins as sentences arrive
                if (isTtsStreaming && attempt === 1) {
                    tts.startStreaming(specialist.voice)
                }

                const decoder = new TextDecoder()
                fullResponse = ""
                let streamError: string | null = null

                try {
                    while (true) {
                        const { done, value } = await readWithTimeout(reader, STREAM_CHUNK_TIMEOUT_MS)
                        if (done || controller.signal.aborted) break

                        const chunk = decoder.decode(value, { stream: true })
                        const lines = chunk.split("\n")
                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const data = line.slice(6)
                                if (data === "[DONE]") continue
                                try {
                                    const parsed = JSON.parse(data) as {
                                        text?: string
                                        error?: string
                                        rawHint?: string
                                        errorCategory?: string
                                        grounding?: { availableSections: string[]; missingContextHints: string[] }
                                    }
                                    if (parsed.grounding) {
                                        setContextGrounding(parsed.grounding)
                                        continue
                                    }
                                    if (parsed.error) {
                                        streamError = parsed.error
                                        if (parsed.rawHint || parsed.errorCategory) {
                                            console.error("[BriefDialog] Provider error detail:", {
                                                classified: parsed.error,
                                                rawHint: parsed.rawHint,
                                                category: parsed.errorCategory,
                                                specialist: specialist.id,
                                                responseLength: fullResponse.length,
                                                attempt,
                                            })
                                        }
                                        break
                                    }
                                    if (parsed.text) {
                                        fullResponse += parsed.text
                                        const strippedText = stripPartialThinkTags(fullResponse)
                                        setStreamingResponse(strippedText)
                                        if (isTtsStreaming) {
                                            tts.feedStreamingText(strippedText)
                                        }
                                    }
                                } catch {
                                    fullResponse += data
                                    const strippedText = stripPartialThinkTags(fullResponse)
                                    setStreamingResponse(strippedText)
                                    if (isTtsStreaming) {
                                        tts.feedStreamingText(strippedText)
                                    }
                                }
                            }
                        }
                        if (streamError) break
                    }
                } catch (readErr) {
                    // Chunk timeout or network error during stream read
                    const errMsg = readErr instanceof Error ? readErr.message : "Stream read failed"
                    streamError = errMsg
                    try { reader.cancel() } catch { /* already closed */ }
                }

                if (streamError) {
                    // Check if this is a retryable error and we have attempts left
                    if (attempt < MAX_ATTEMPTS && isRetryableStreamError(streamError)) {
                        console.warn("[BriefDialog] Stream error, retrying:", {
                            attempt,
                            error: streamError,
                            specialist: specialist.id,
                            responseLength: fullResponse.length,
                        })
                        // Reset streaming state for retry
                        setStreamingResponse("")
                        fullResponse = ""
                        if (isTtsStreaming) tts.stop()
                        continue // Retry
                    }

                    // No more retries — surface the error
                    if (isTtsStreaming) tts.stop()
                    setError(normalizeSpecialistError(streamError, specialist.name))
                    return
                }

                // Stream completed successfully — exit the retry loop
                break
            }

            if (!fullResponse) {
                fullResponse = "No response received. Please try again."
            }

            // Strip think tags and parse dynamic specialist recommendation from the response
            const responseWithoutThink = stripThinkTags(fullResponse)
            const nextMatch = responseWithoutThink.match(/NEXT_SPECIALIST:\s*(\S+)\s*\|\s*(.+)/i)
            let displayResponse = responseWithoutThink
            if (nextMatch) {
                const [fullMatch, specId, reason] = nextMatch
                // Strip the recommendation line from the displayed response
                displayResponse = responseWithoutThink.replace(fullMatch, "").trim()
                if (specId && specId !== "none") {
                    setDynamicSuggestion({ specialistId: specId.trim(), reason: reason.trim() })
                } else {
                    setDynamicSuggestion(null)
                }
            }

            // Parse TENSION marker from response (cross-specialist disagreements)
            const tensionMatch = displayResponse.match(/TENSION:\s*(\S+)\s*\|\s*(.+)/i)
            if (tensionMatch) {
                const [tensionFullMatch, tensionSpecId, tensionDesc] = tensionMatch
                displayResponse = displayResponse.replace(tensionFullMatch, "").trim()
                if (tensionSpecId && tensionDesc) {
                    setTensionCard({ specialistId: tensionSpecId.trim(), description: tensionDesc.trim() })
                }
            } else {
                setTensionCard(null)
            }

            // Parse PROPOSED_ACTIONS from response and strip the block from displayed content
            const proposals = parseProposedActions(displayResponse)
            if (proposals.length > 0) {
                console.info("[SpecialistChat] PROPOSED_ACTIONS parsed:", {
                    specialist: specialist.id,
                    modelTier: specialist.modelTier,
                    actionCount: proposals.length,
                    types: proposals.map((p) => p.type),
                })
            } else if (displayResponse.length > 200) {
                // Long response with no actions — log for diagnostic purposes
                console.info("[SpecialistChat] No PROPOSED_ACTIONS in response:", {
                    specialist: specialist.id,
                    modelTier: specialist.modelTier,
                    responseLength: displayResponse.length,
                    containsKeyword: displayResponse.includes("PROPOSED_ACTIONS"),
                    tail: displayResponse.slice(-300),
                })
            }
            displayResponse = stripProposedActionsBlock(displayResponse)

            // Parse slides when a presentation was requested so the inline
            // card renderer can display a visual carousel instead of raw JSON.
            const parsedDeck = isSlideRequest ? parseSlideDeckFromText(fullResponse) : null

            // Add assistant message to chat (with think tags, recommendation, and proposal block stripped)
            const assistantMessage: ChatMessage = {
                role: "assistant",
                content: displayResponse,
                timestamp: new Date(),
                ...(proposals.length > 0 ? { proposals } : {}),
                ...(rolloutIdFromResponse ? { rolloutId: rolloutIdFromResponse } : {}),
                ...(parsedDeck ? { slideDeck: parsedDeck } : {}),
            }
            setMessages((prev) => [...prev, assistantMessage])
            setStreamingResponse("")

            // Finish streaming TTS with the cleaned display text (plays any remaining sentence)
            if (isTtsStreaming) {
                tts.finishStreaming(displayResponse)
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
            if (isTtsStreaming) tts.stop()
            if (err instanceof Error && err.name === "AbortError") return
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[BriefDialog] Execution failed:", { specialist: specialist.id, error: message })
            setError(message)
            setStreamingResponse("")
        } finally {
            executeAbortRef.current = null
            setIsExecuting(false)
            setIsUrgentMessage(false)
        }
    }, [briefText, selectedPrompt, specialist, threadId, crossSpecialistContext, handoffContext, messages, pendingAttachments, tts.voiceEnabled, tts.warmUp, tts.startStreaming, tts.feedStreamingText, tts.finishStreaming, tts.stop, deepThinkEnabled, serializeScreenContext, formatBrowseContext])

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

    const MAX_ATTACHMENTS = 5

    /** Upload a file to agent-attachments and add to pending attachments. */
    const handleFileAttach = useCallback(
        async (file: File) => {
            const validation = validateFile(file)
            if (!validation.valid) {
                toast.error(validation.error ?? "Invalid file")
                return
            }
            if (!threadId) {
                toast.error("Start the conversation first, then attach files.")
                return
            }
            if (pendingAttachments.length >= MAX_ATTACHMENTS) {
                toast.error(`Maximum ${MAX_ATTACHMENTS} files per message.`)
                return
            }
            setIsUploadingFile(true)
            try {
                const formData = new FormData()
                formData.set("file", file)
                formData.set("threadId", threadId)
                const res = await fetch("/api/agents/upload", {
                    method: "POST",
                    body: formData,
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) {
                    toast.error(data.error ?? "Upload failed")
                    return
                }
                setPendingAttachments((prev) => [
                    ...prev,
                    {
                        path: data.path,
                        url: data.url ?? null,
                        filename: data.filename,
                        size: data.size,
                        mimeType: data.mimeType,
                    },
                ])
            } finally {
                setIsUploadingFile(false)
            }
        },
        [threadId, pendingAttachments.length],
    )

    /** "Walk me through this page" starter — shown when page knowledge is available */
    const pageGuidanceStarter = useMemo(() => {
        if (!screenContext.availableActions || screenContext.availableActions.length === 0) return null
        if (screenContext.pageTitle === "ForgeOS Platform") return null
        return `Walk me through the ${screenContext.pageTitle} page`
    }, [screenContext.availableActions, screenContext.pageTitle])

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

        // Abort any in-flight request from the current specialist before switching
        executeAbortRef.current?.abort()
        executeAbortRef.current = null

        if (isPanel) {
            // Panel mode: switch directly without close/reopen cycle.
            // The close-then-reopen pattern causes a race condition where the
            // open→false→true transition triggers cleanup effects that abort
            // the new specialist's greeting stream mid-flight.
            onSwitchSpecialist?.(id, handoff)
        } else {
            // Dialog mode: close first, then reopen with new specialist
            // after the close animation finishes.
            onOpenChange(false)
            setTimeout(() => onSwitchSpecialist?.(id, handoff), 200)
        }
    }, [isPanel, onOpenChange, onSwitchSpecialist, messages, specialist])

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
    // isStreaming is declared earlier (before the useEffect that depends on it)
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant" && !m.historical)

    // ─── Specialist Switcher State ───────────────────────────────────────
    const [isSwitcherOpen, setIsSwitcherOpen] = useState(false)

    // ─── Panel Header (for panel mode) ──────────────────────────────────
    // Two-row layout: Row 1 = specialist identity (clickable to switch) + close; Row 2 = context badge + actions
    const panelHeader = (
        <div className="flex flex-col gap-2 px-4 py-3 border-b bg-background">
            {/* Row 1: Specialist switcher (left) + close (right) */}
            <div className="flex items-center gap-2 min-w-0">
                <Popover open={isSwitcherOpen} onOpenChange={setIsSwitcherOpen}>
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                    <button
                                        className="flex items-center gap-3 flex-1 min-w-0 rounded-lg px-2 py-1.5 border border-dashed border-muted-foreground/20 hover:bg-muted/60 hover:border-muted-foreground/40 transition-colors text-left group"
                                        aria-label={`Switch specialist. Current: ${specialist.name}, ${specialist.title}`}
                                    >
                                        <div className="flex-shrink-0 relative h-10 w-10 rounded-full overflow-hidden bg-muted">
                                            {specialist.avatarImage ? (
                                                <Image
                                                    src={specialist.avatarImage}
                                                    alt={specialist.name}
                                                    fill
                                                    className="object-cover"
                                                    sizes="40px"
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center h-full w-full">
                                                    <span className="text-base font-display font-semibold text-foreground">
                                                        {specialist.name.charAt(0)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h2 className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                                {specialist.name}
                                                <span className="text-xs font-normal text-muted-foreground">
                                                    {specialist.title}
                                                </span>
                                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
                                            </h2>
                                            <p className="text-xs text-muted-foreground italic mt-0.5 truncate">
                                                &ldquo;{specialist.tagline}&rdquo;
                                            </p>
                                        </div>
                                    </button>
                                </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                Switch specialist
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                <PopoverContent
                    align="start"
                    sideOffset={8}
                    className="w-[340px] p-0 max-h-[420px] overflow-y-auto"
                >
                    <div className="px-3 py-2.5 border-b">
                        <p className="text-xs font-medium text-muted-foreground">Switch Specialist</p>
                    </div>
                    <div className="py-1">
                        {SPECIALISTS.map((s) => {
                            const isActive = s.id === specialist.id
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        if (!isActive) {
                                            onSwitchSpecialist?.(s.id)
                                        }
                                        setIsSwitcherOpen(false)
                                    }}
                                    className={cn(
                                        "flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors",
                                        isActive
                                            ? "bg-muted/60"
                                            : "hover:bg-muted/40"
                                    )}
                                >
                                    <div className="flex-shrink-0 relative h-8 w-8 rounded-full overflow-hidden bg-muted">
                                        {s.avatarImage ? (
                                            <Image
                                                src={s.avatarImage}
                                                alt={s.name}
                                                fill
                                                className="object-cover"
                                                sizes="32px"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full w-full">
                                                <span className="text-xs font-display font-semibold text-foreground">
                                                    {s.name.charAt(0)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            "text-sm font-medium",
                                            isActive ? "text-international-orange" : "text-foreground"
                                        )}>
                                            {s.name}
                                            <span className="text-xs font-normal text-muted-foreground ml-1.5">
                                                {s.title}
                                            </span>
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                                            {s.description.slice(0, 60)}{s.description.length > 60 ? "..." : ""}
                                        </p>
                                    </div>
                                    {isActive && (
                                        <Check className="h-3.5 w-3.5 text-international-orange flex-shrink-0" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </PopoverContent>
            </Popover>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    className="h-8 w-8 p-0 flex-shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Close advisor panel"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
            {/* Row 2: Context badge + voice, history, other actions */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                {contextLabel ? (
                    <Badge variant="secondary" className="text-[10px] gap-1 max-w-[140px] truncate">
                        <MessageSquareQuote className="h-2.5 w-2.5 flex-shrink-0" />
                        {contextLabel}
                    </Badge>
                ) : screenContext.pageTitle !== "ForgeOS Platform" ? (
                    <Badge variant="secondary" className="text-[10px] gap-1 max-w-[140px] truncate opacity-70">
                        <Eye className="h-2.5 w-2.5 flex-shrink-0" />
                        {screenContext.pageTitle}
                    </Badge>
                ) : null}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        const enabling = !tts.voiceEnabled
                        tts.setVoiceEnabled(enabling)
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
                        <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                        <VolumeX className="h-3.5 w-3.5" />
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
                        <History className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    )

    // ─── Render ──────────────────────────────────────────────────────────

    // Panel mode: render as a sidebar div (no Dialog wrapper)
    if (isPanel) {
        if (!open) return null

        return (
            <div className="flex flex-col h-full bg-background">
                {panelHeader}

                {/* Loading State */}
                {isLoadingThread && (
                    <div className="flex items-center justify-center py-8 flex-1">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                        <span className="text-sm text-muted-foreground">Connecting to {specialist.name}...</span>
                    </div>
                )}

                {/* History Panel */}
                {showHistory && !isLoadingThread && (
                    <div className="border-b bg-muted/20 max-h-[30vh] overflow-y-auto">
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

                {/* Content — fills remaining space */}
                {!isLoadingThread && (
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* Scrollable content — messages, cards, suggestions (single scroll container) */}
                        <div
                            ref={scrollRef}
                            onScroll={handleChatScroll}
                            role="log"
                            aria-live="polite"
                            aria-label="Conversation with specialist"
                            className="flex-1 min-h-0 overflow-y-auto space-y-4 p-4"
                        >
                            {(hasConversation || hasHistoricalMessages) && (
                                <>
                                {/* Handoff Briefing Card */}
                                {referredBy && handoffContext && (
                                    <div className="rounded-lg border border-international-orange/20 bg-international-orange/5 overflow-hidden mb-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsHandoffBriefingExpanded((prev) => !prev)}
                                            className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-international-orange hover:bg-international-orange/10 transition-colors"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <ArrowRight className="h-3 w-3" />
                                                Briefed by {referredBy}
                                            </span>
                                            {isHandoffBriefingExpanded ? (
                                                <ChevronUp className="h-3 w-3" />
                                            ) : (
                                                <ChevronDown className="h-3 w-3" />
                                            )}
                                        </button>
                                        {isHandoffBriefingExpanded && (
                                            <div className="px-3 pb-2.5 text-xs text-muted-foreground leading-relaxed border-t border-international-orange/10 pt-2">
                                                {handoffContext.length > 400
                                                    ? handoffContext.slice(0, 400) + "..."
                                                    : handoffContext
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                                {messages.map((msg, i) => {
                                    const isLastAssistant = msg.role === "assistant" && !msg.historical && i === messages.length - 1
                                    const isFirstHistorical = msg.historical && i === 0
                                    const isTransitionToNew = !msg.historical && i > 0 && messages[i - 1]?.historical
                                    return (
                                    <div key={i}>
                                        {isFirstHistorical && (
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="flex-1 border-t border-muted" />
                                                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                                    Previous conversation
                                                </span>
                                                <div className="flex-1 border-t border-muted" />
                                            </div>
                                        )}
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
                                            "flex gap-2.5",
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
                                                "max-w-[90%] rounded-lg px-3 py-2.5",
                                                msg.role === "user"
                                                    ? "bg-international-orange/10 text-foreground"
                                                    : "bg-muted/50 border border-muted"
                                            )}>
                                                {msg.role === "user" ? (
                                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                ) : msg.slideDeck ? (
                                                    <>
                                                        <InlinePresentationCard deck={msg.slideDeck} />
                                                        {!msg.historical && (
                                                            <div className="mt-2 flex justify-end">
                                                                <MessageExportMenu content={msg.content} />
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Markdown content={msg.content} className="text-sm" />
                                                        {!msg.historical && (
                                                            <div className="mt-2 flex justify-end">
                                                                <MessageExportMenu content={msg.content} />
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    )
                                })}

                                {/* Streaming indicator */}
                                {isStreaming && (
                                    <div className="flex gap-2.5 justify-start">
                                        <div className="flex-shrink-0 mt-1">
                                            <SpecialistChatAvatar specialist={specialist} state="speaking" />
                                        </div>
                                        <div className="max-w-[90%] rounded-lg px-3 py-2.5 bg-muted/50 border border-muted">
                                            <Markdown content={stripProposedActionsBlock(streamingResponse)} className="text-sm" />
                                        </div>
                                    </div>
                                )}

                                {/* Typing indicator */}
                                {(isExecuting && !isStreaming) && (
                                    <div className="flex gap-2.5 justify-start">
                                        <div className={cn("flex-shrink-0 mt-1", isUrgentMessage && "ring-2 ring-international-orange ring-offset-1 rounded-full")}>
                                            <SpecialistChatAvatar specialist={specialist} state="thinking" />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 transition-opacity duration-300">
                                            {deepThinkEnabled ? (
                                                <Brain className="h-4 w-4 animate-pulse text-international-orange" />
                                            ) : isUrgentMessage ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                                            ) : (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            )}
                                            <span key={`${thinkingPhaseIndex}-${isUrgentMessage}`} className="animate-in fade-in duration-300 text-xs">
                                                {deepThinkEnabled
                                                    ? `${specialist.name} is analyzing deeply...`
                                                    : isUrgentMessage
                                                        ? thinkingPhaseIndex === 0
                                                            ? `On it. Prioritizing this now.`
                                                            : thinkingPhaseIndex === 1
                                                                ? `Working through the critical path...`
                                                                : `Almost there — focused recommendation incoming.`
                                                        : specialist.thinkingPhases
                                                            ? `${specialist.thinkingPhases[thinkingPhaseIndex] ?? specialist.thinkingPhases[0]}`
                                                            : specialist.thinkingIndicator ?? `${specialist.name} is thinking...`
                                                }
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Greeting generation indicator */}
                                {isGeneratingGreeting && !isExecuting && (
                                    <div className="flex gap-2.5 justify-start">
                                        <div className="flex-shrink-0 mt-1">
                                            <SpecialistChatAvatar specialist={specialist} state="thinking" />
                                        </div>
                                        <div className="flex flex-col gap-1 py-3">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                {specialist.name} is catching up...
                                            </div>
                                        </div>
                                    </div>
                                )}
                                </>
                            )}

                        {/* Proposed actions */}
                        {lastAssistantMessage && !isExecuting && lastAssistantMessage.proposals && lastAssistantMessage.proposals.length > 0 && (
                            <div className="px-4">
                                <ProposedActionsCard
                                    proposals={lastAssistantMessage.proposals}
                                    specialist={specialist}
                                    rolloutId={lastAssistantMessage.rolloutId ?? undefined}
                                    onDismiss={() => {
                                        setMessages((prev) => {
                                            const idx = prev.map((m, i) => ({ m, i }))
                                                .reverse()
                                                .find(({ m }) => m.role === "assistant" && !m.historical)?.i
                                            if (idx === undefined || !prev[idx].proposals?.length) return prev
                                            return prev.map((msg, i) =>
                                                i === idx ? { ...msg, proposals: undefined } : msg
                                            )
                                        })
                                    }}
                                />
                            </div>
                        )}

                        {/* Dynamic specialist recommendation */}
                        {lastAssistantMessage && !isExecuting && dynamicSuggestion && (() => {
                            const suggested = getSpecialistById(dynamicSuggestion.specialistId)
                            if (!suggested) return null
                            return (
                                <div className="mx-4 mb-3 p-2.5 rounded-lg bg-international-orange/5 border border-international-orange/20">
                                    <p className="text-[10px] font-medium text-international-orange mb-1.5 flex items-center gap-1">
                                        <Sparkles className="h-2.5 w-2.5" />
                                        Recommended Next
                                    </p>
                                    <button
                                        onClick={() => handleSwitchSpecialist(suggested.id)}
                                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md bg-background border border-international-orange/30 hover:border-international-orange/60 transition-colors text-xs group"
                                    >
                                        {suggested.avatarImage && (
                                            <div className="relative h-5 w-5 rounded-full overflow-hidden flex-shrink-0">
                                                <Image src={suggested.avatarImage} alt={suggested.name} fill className="object-cover" sizes="20px" />
                                            </div>
                                        )}
                                        <div className="flex-1 text-left min-w-0">
                                            <span className="font-medium text-foreground">{suggested.name}</span>
                                            <p className="text-[10px] text-muted-foreground truncate">{dynamicSuggestion.reason}</p>
                                        </div>
                                        <ArrowRight className="h-3 w-3 text-international-orange group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                                    </button>
                                </div>
                            )
                        })()}

                        {/* Tension card */}
                        {lastAssistantMessage && !isExecuting && tensionCard && (() => {
                            const tensionSpecialist = getSpecialistById(tensionCard.specialistId)
                            if (!tensionSpecialist) return null
                            return (
                                <div className="mx-4 mb-3 p-2.5 rounded-lg bg-status-warning-light border border-status-warning/30">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="h-3.5 w-3.5 text-status-warning flex-shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-foreground mb-0.5">
                                                Different perspective from {tensionSpecialist.name}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                                {tensionCard.description}
                                            </p>
                                            <button
                                                onClick={() => handleSwitchSpecialist(tensionSpecialist.id)}
                                                className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-status-warning hover:text-foreground transition-colors"
                                            >
                                                Hear {tensionSpecialist.name}&apos;s side
                                                <ArrowRight className="h-2.5 w-2.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Static fallback suggestions */}
                        {lastAssistantMessage && !isExecuting && !dynamicSuggestion && suggestedSpecialists.length > 0 && (
                            <div className="mx-4 mb-3 p-2.5 rounded-lg bg-muted/30 border border-muted/50">
                                <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Continue with...</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {suggestedSpecialists.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => handleSwitchSpecialist(s.id)}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border border-muted hover:border-international-orange/50 transition-colors text-xs group"
                                        >
                                            {s.avatarImage && (
                                                <div className="relative h-4 w-4 rounded-full overflow-hidden flex-shrink-0">
                                                    <Image src={s.avatarImage} alt={s.name} fill className="object-cover" sizes="16px" />
                                                </div>
                                            )}
                                            <span className="font-medium text-foreground">{s.name}</span>
                                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground group-hover:text-international-orange transition-colors" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Intro card for first-time users */}
                        {!hasConversation && !hasHistoricalMessages && (
                            <div className="mx-4 mb-3 p-3 rounded-lg bg-muted/30 border border-muted space-y-3">
                                <div className="flex items-start gap-2.5">
                                    <div className="flex-shrink-0">
                                        <SpecialistChatAvatar specialist={specialist} state={isGeneratingGreeting ? "thinking" : "idle"} />
                                    </div>
                                    <div className="min-w-0 flex-1 pt-0.5">
                                        <p className="text-sm font-medium text-foreground italic">
                                            &ldquo;{specialist.tagline}&rdquo;
                                        </p>
                                        {isGeneratingGreeting && (
                                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                {specialist.name} is getting up to speed...
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {(dynamicStarters || specialist.highlights.length > 0 || pageGuidanceStarter) && (
                                    <>
                                        <p className="text-[10px] font-medium text-muted-foreground">
                                            {dynamicStarters ? "Ask me about..." : "Start with a topic"}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {/* Page guidance starter — always first when available */}
                                            {pageGuidanceStarter && !dynamicStarters && (
                                                <button
                                                    key="__page_guide__"
                                                    type="button"
                                                    onClick={() => {
                                                        setBriefText(pageGuidanceStarter)
                                                        setError(null)
                                                        textareaRef.current?.focus()
                                                    }}
                                                    disabled={isExecuting}
                                                    className={cn(
                                                        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-foreground text-left",
                                                        "border-international-orange/30 bg-international-orange/10 hover:border-international-orange/50",
                                                        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2"
                                                    )}
                                                >
                                                    <HelpCircle className="h-2.5 w-2.5 mr-1 text-international-orange flex-shrink-0" />
                                                    {pageGuidanceStarter}
                                                </button>
                                            )}
                                            {(dynamicStarters ?? specialist.highlights).map((starter) => (
                                                <button
                                                    key={starter}
                                                    type="button"
                                                    onClick={() => {
                                                        if (dynamicStarters) {
                                                            setBriefText(starter)
                                                        } else {
                                                            handleStarterClick(starter)
                                                        }
                                                        setError(null)
                                                        textareaRef.current?.focus()
                                                    }}
                                                    disabled={isExecuting}
                                                    className={cn(
                                                        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-foreground text-left",
                                                        dynamicStarters
                                                            ? "border-international-orange/20 bg-international-orange/5 hover:border-international-orange/40"
                                                            : "border-muted bg-background hover:border-international-orange/50 hover:bg-muted/50",
                                                        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2"
                                                    )}
                                                >
                                                    {dynamicStarters ? <Sparkles className="h-2.5 w-2.5 mr-1 text-international-orange flex-shrink-0" /> : null}
                                                    {starter}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Returning user card */}
                        {!hasConversation && hasHistoricalMessages && !isGeneratingGreeting && (
                            <div className="mx-4 mb-3 p-3 rounded-lg bg-muted/30 border border-muted space-y-3">
                                <div className="flex items-start gap-2.5">
                                    <div className="flex-shrink-0">
                                        <SpecialistChatAvatar specialist={specialist} state="idle" />
                                    </div>
                                    <div className="min-w-0 flex-1 pt-0.5">
                                        <p className="text-xs text-muted-foreground">
                                            Pick up where you left off, or start something new.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(() => {
                                        const pastUserMsgs = historyMessages
                                            .filter(m => m.role === "user")
                                            .slice(-3)
                                            .map(m => m.content.slice(0, 50) + (m.content.length > 50 ? "..." : ""))
                                        const starters = pastUserMsgs.length > 0
                                            ? [`Follow up on: "${pastUserMsgs[pastUserMsgs.length - 1]}"`, ...specialist.highlights.slice(0, 2)]
                                            : specialist.highlights.slice(0, 3)
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
                                                    "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-foreground",
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

                        </div>

                        {/* Text Input (pinned to bottom) */}
                        <div
                            className={cn(
                                "flex-shrink-0 p-4 pt-2 border-t bg-background space-y-2",
                                isDraggingOver && "ring-2 ring-inset ring-international-orange/50 rounded-lg",
                            )}
                            onDragOver={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (!isExecuting) setIsDraggingOver(true)
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setIsDraggingOver(false)
                            }}
                            onDrop={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setIsDraggingOver(false)
                                if (isExecuting) return
                                const files = Array.from(e.dataTransfer.files)
                                files.slice(0, MAX_ATTACHMENTS - pendingAttachments.length).forEach((file) => handleFileAttach(file))
                            }}
                        >
                            {pendingAttachments.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {pendingAttachments.map((a) => (
                                        <span
                                            key={a.path}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-muted bg-muted/50 px-2 py-1 text-xs text-foreground"
                                        >
                                            {isImageFile(a.mimeType) ? (
                                                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            ) : (
                                                <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                            <span className="max-w-[120px] truncate" title={a.filename}>{a.filename}</span>
                                            <span className="text-muted-foreground">{formatFileSize(a.size)}</span>
                                            <button
                                                type="button"
                                                onClick={() => setPendingAttachments((prev) => prev.filter((p) => p.path !== a.path))}
                                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                aria-label={`Remove ${a.filename}`}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="relative">
                                <input
                                    id="panel-file-input"
                                    type="file"
                                    className="hidden"
                                    ref={panelFileInputRef}
                                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                                    multiple
                                    disabled={isExecuting || isUploadingFile}
                                    onChange={(e) => {
                                        const files = e.target.files
                                        if (files) {
                                            Array.from(files).slice(0, MAX_ATTACHMENTS - pendingAttachments.length).forEach((file) => handleFileAttach(file))
                                            e.target.value = ""
                                        }
                                    }}
                                />
                                <Textarea
                                    ref={textareaRef}
                                    id="panel-brief-text"
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
                                                : `What do you need from ${specialist.name}?`
                                    }
                                    className={cn(
                                        "resize-none pr-[140px] min-h-[60px]",
                                        (speechRecognition.isListening || speechRecognition.isProcessing) && "border-destructive/50"
                                    )}
                                    aria-required
                                    disabled={isExecuting}
                                />
                                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        disabled={isExecuting || isUploadingFile || !threadId || pendingAttachments.length >= MAX_ATTACHMENTS}
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        aria-label="Attach file"
                                        onClick={() => panelFileInputRef.current?.click()}
                                    >
                                        {isUploadingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                            const next = !deepThinkEnabled
                                            setDeepThinkEnabled(next)
                                            try { localStorage.setItem(DEEP_THINK_STORAGE_KEY, String(next)) } catch { /* noop */ }
                                            toast.success(next ? "Deep Think enabled" : "Deep Think disabled", { duration: 2000 })
                                        }}
                                        disabled={isExecuting}
                                        className={cn("h-7 w-7", deepThinkEnabled ? "text-international-orange" : "text-muted-foreground hover:text-foreground")}
                                        aria-label={deepThinkEnabled ? "Disable deep thinking" : "Enable deep thinking"}
                                    >
                                        <Brain className="h-3.5 w-3.5" />
                                    </Button>
                                    {speechRecognition.isSupported && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => speechRecognition.isListening ? speechRecognition.stop() : speechRecognition.start()}
                                            disabled={isExecuting || speechRecognition.isProcessing}
                                            className={cn("h-7 w-7", speechRecognition.isListening ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-foreground")}
                                            aria-label={speechRecognition.isListening ? "Stop listening" : "Start voice input"}
                                        >
                                            {speechRecognition.isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : speechRecognition.isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                                        </Button>
                                    )}
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleExecute}
                                        disabled={isExecuting || (!briefText.trim() && pendingAttachments.length === 0)}
                                        className="h-7 w-7 text-muted-foreground hover:text-international-orange"
                                        aria-label="Send message"
                                    >
                                        {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-muted-foreground">
                                    {hasNonHistoricalMessages ? "⌘+Enter to send" : `${briefText.length} chars`}
                                    {deepThinkEnabled && (
                                        <span className="ml-2 text-international-orange">
                                            <Brain className="h-2.5 w-2.5 inline mr-0.5" />Deep Think
                                        </span>
                                    )}
                                </p>
                                {hasNonHistoricalMessages && !isExecuting && lastAssistantMessage && (
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm" onClick={handleCopyLast} className="text-[10px] h-5 px-1.5">
                                            {copied ? <Check className="h-2.5 w-2.5 mr-0.5" /> : <Copy className="h-2.5 w-2.5 mr-0.5" />}
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                const hasUserMessages = messages.some((m) => m.role === "user" && !m.historical)
                                                if (hasUserMessages) {
                                                    const userMsgs = messages.filter((m) => m.role === "user" && !m.historical)
                                                    const topicSummary = userMsgs[0].content.slice(0, 80)
                                                    toast.success(`Topic saved. Ready for the next one.`, { duration: 3000 })
                                                    setNewTopicPreviousSummary(topicSummary)
                                                    setMessages((prev) => prev.filter((m) => m.historical))
                                                    setSelectedPrompt(null)
                                                    setBriefText("")
                                                    setError(null)
                                                    setDynamicSuggestion(null)
                                                    greetingGeneratedRef.current = false
                                                }
                                            }}
                                            disabled={isExecuting || isGeneratingGreeting}
                                            className="text-[10px] h-5 px-1.5"
                                        >
                                            New Topic
                                        </Button>
                                    </div>
                                )}
                            </div>
                            {error && (
                                <Alert variant="destructive" className="mt-1">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    <AlertDescription className="text-xs">{error}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // ─── Dialog Mode (original) ──────────────────────────────────────────

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

                        {/* Scrollable content — messages, cards, suggestions (single scroll container) */}
                        <div
                            ref={scrollRef}
                            onScroll={handleChatScroll}
                            role="log"
                            aria-live="polite"
                            aria-label="Conversation with specialist"
                            className="flex-1 min-h-0 overflow-y-auto space-y-4 mb-4 pr-1"
                        >
                            {(hasConversation || hasHistoricalMessages) && (
                                <>
                                {/* Handoff Briefing Card — shows what context was passed from referring specialist */}
                                {referredBy && handoffContext && (
                                    <div className="rounded-lg border border-international-orange/20 bg-international-orange/5 overflow-hidden mb-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsHandoffBriefingExpanded((prev) => !prev)}
                                            className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-international-orange hover:bg-international-orange/10 transition-colors"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <ArrowRight className="h-3 w-3" />
                                                Briefed by {referredBy}
                                            </span>
                                            {isHandoffBriefingExpanded ? (
                                                <ChevronUp className="h-3 w-3" />
                                            ) : (
                                                <ChevronDown className="h-3 w-3" />
                                            )}
                                        </button>
                                        {isHandoffBriefingExpanded && (
                                            <div className="px-3 pb-2.5 text-xs text-muted-foreground leading-relaxed border-t border-international-orange/10 pt-2">
                                                {handoffContext.length > 400
                                                    ? handoffContext.slice(0, 400) + "..."
                                                    : handoffContext
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
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
                                                ) : msg.slideDeck ? (
                                                    <>
                                                        <InlinePresentationCard deck={msg.slideDeck} />
                                                        {!msg.historical && (
                                                            <div className="mt-2 flex justify-end">
                                                                <MessageExportMenu content={msg.content} />
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Markdown content={msg.content} className="text-sm" />
                                                        {!msg.historical && (
                                                            <div className="mt-2 flex justify-end">
                                                                <MessageExportMenu content={msg.content} />
                                                            </div>
                                                        )}
                                                    </>
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
                                            <Markdown content={stripProposedActionsBlock(streamingResponse)} className="text-sm" />
                                        </div>
                                    </div>
                                )}

                                {/* Typing indicator — personality-specific thinking message */}
                                {(isExecuting && !isStreaming) && (
                                    <div className="flex gap-3 justify-start">
                                        <div className={cn("flex-shrink-0 mt-1", isUrgentMessage && "ring-2 ring-international-orange ring-offset-1 rounded-full")}>
                                            <SpecialistChatAvatar
                                                specialist={specialist}
                                                state="thinking"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 transition-opacity duration-300">
                                            {deepThinkEnabled ? (
                                                <Brain className="h-4 w-4 animate-pulse text-international-orange" />
                                            ) : isUrgentMessage ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                                            ) : (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            )}
                                            <span key={`${thinkingPhaseIndex}-${isUrgentMessage}`} className="animate-in fade-in duration-300">
                                                {deepThinkEnabled
                                                    ? `${specialist.name} is analyzing deeply...`
                                                    : isUrgentMessage
                                                        ? thinkingPhaseIndex === 0
                                                            ? `${specialist.name}: On it. Prioritizing this now.`
                                                            : thinkingPhaseIndex === 1
                                                                ? `${specialist.name}: Working through the critical path...`
                                                                : `${specialist.name}: Almost there — focused recommendation incoming.`
                                                        : specialist.thinkingPhases
                                                            ? `${specialist.name}: ${specialist.thinkingPhases[thinkingPhaseIndex] ?? specialist.thinkingPhases[0]}`
                                                            : specialist.thinkingIndicator
                                                                ? `${specialist.name}: ${specialist.thinkingIndicator}`
                                                                : `${specialist.name} is thinking...`
                                                }
                                            </span>
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
                                </>
                            )}

                        {/* Proposed actions (tasks/objectives) from Specialist response */}
                        {lastAssistantMessage && !isExecuting && lastAssistantMessage.proposals && lastAssistantMessage.proposals.length > 0 && (
                            <ProposedActionsCard
                                proposals={lastAssistantMessage.proposals}
                                specialist={specialist}
                                rolloutId={lastAssistantMessage.rolloutId ?? undefined}
                                onDismiss={() => {
                                    setMessages((prev) => {
                                        const idx = prev.map((m, i) => ({ m, i }))
                                            .reverse()
                                            .find(({ m }) => m.role === "assistant" && !m.historical)?.i
                                        if (idx === undefined || !prev[idx].proposals?.length) return prev
                                        return prev.map((msg, i) =>
                                            i === idx ? { ...msg, proposals: undefined } : msg
                                        )
                                    })
                                }}
                            />
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

                        {/* Different Perspective Card — surfaces tensions between specialists */}
                        {lastAssistantMessage && !isExecuting && tensionCard && (() => {
                            const tensionSpecialist = getSpecialistById(tensionCard.specialistId)
                            if (!tensionSpecialist) return null
                            return (
                                <div className="mb-4 p-3 rounded-lg bg-status-warning-light border border-status-warning/30">
                                    <div className="flex items-start gap-2.5">
                                        <AlertTriangle className="h-4 w-4 text-status-warning flex-shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-foreground mb-1">
                                                Different perspective from {tensionSpecialist.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                {tensionCard.description}
                                            </p>
                                            <button
                                                onClick={() => handleSwitchSpecialist(tensionSpecialist.id)}
                                                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-status-warning hover:text-foreground transition-colors"
                                            >
                                                Hear {tensionSpecialist.name}&apos;s side
                                                <ArrowRight className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>
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
                                {(dynamicStarters || specialist.highlights.length > 0 || pageGuidanceStarter) && (
                                    <>
                                        <p className="text-xs font-medium text-muted-foreground">
                                            {dynamicStarters ? "Ask me about..." : "Start with a topic"}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {/* Page guidance starter — always first when available */}
                                            {pageGuidanceStarter && !dynamicStarters && (
                                                <button
                                                    key="__page_guide__"
                                                    type="button"
                                                    onClick={() => {
                                                        setBriefText(pageGuidanceStarter)
                                                        setError(null)
                                                        textareaRef.current?.focus()
                                                    }}
                                                    disabled={isExecuting}
                                                    className={cn(
                                                        "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-foreground text-left",
                                                        "border-international-orange/30 bg-international-orange/10 hover:border-international-orange/50",
                                                        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2"
                                                    )}
                                                >
                                                    <HelpCircle className="h-3 w-3 mr-1.5 text-international-orange flex-shrink-0" />
                                                    {pageGuidanceStarter}
                                                </button>
                                            )}
                                            {(dynamicStarters ?? specialist.highlights).map((starter) => (
                                                <button
                                                    key={starter}
                                                    type="button"
                                                    onClick={() => {
                                                        if (dynamicStarters) {
                                                            setBriefText(starter)
                                                        } else {
                                                            handleStarterClick(starter)
                                                        }
                                                        setError(null)
                                                        textareaRef.current?.focus()
                                                    }}
                                                    disabled={isExecuting}
                                                    className={cn(
                                                        "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-foreground text-left",
                                                        dynamicStarters
                                                            ? "border-international-orange/20 bg-international-orange/5 hover:border-international-orange/40"
                                                            : "border-muted bg-background hover:border-international-orange/50 hover:bg-muted/50",
                                                        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2"
                                                    )}
                                                >
                                                    {dynamicStarters ? (
                                                        <Sparkles className="h-3 w-3 mr-1.5 text-international-orange flex-shrink-0" />
                                                    ) : null}
                                                    {starter}
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

                        </div>

                        {/* Text Input (always visible at bottom) */}
                        <div className="flex-shrink-0 space-y-2">
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
                                        "resize-none pr-[120px]",
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
                                            // Save topic summary for the re-engagement greeting
                                            setNewTopicPreviousSummary(topicSummary)
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
