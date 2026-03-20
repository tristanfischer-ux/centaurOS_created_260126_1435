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
    History, Mic, MicOff, Sparkles, Brain, X,
    HelpCircle,
    Paperclip,
    FileIcon,
    ImageIcon,
    MoreVertical,
    Scale,
    Maximize2,
    Minimize2,
} from "lucide-react"
import { validateFile, formatFileSize, isImageFile } from "@/lib/file-upload"
import { cn } from "@/lib/utils"
import { stripThinkTags, stripPartialThinkTags } from "@/lib/utils/strip-think-tags"

// AUDIT: Parser functions extracted to src/lib/agents/message-parsers.ts (2026-02-25, refactor step 1 of 5).
// All parse/strip/validate functions moved verbatim — no logic changes.
import {
    stripComplexityTags,
    isDestructiveAction,
    parseProposedActions,
    stripProposedActionsBlock,
    parseProposedPlan,
    stripProposedPlanBlock,
    parseProposedEdit,
    stripProposedEditBlock,
    parseCharts,
    stripChartBlocks,
    parseExternalActions,
    stripExternalActionBlocks,
    parsePageActions,
    stripPageActionBlocks,
    parseStructuredOutputs,
    stripStructuredOutputBlocks,
} from "@/lib/agents/message-parsers"
import type { ProposedActionType, ProposedAction, ChatMessage } from "@/lib/agents/message-parsers"
export type { ProposedActionType, ProposedAction } from "@/lib/agents/message-parsers"
import { ChatMessageList } from "@/components/specialists/chat-message-list"
import { toast } from "sonner"
import { Markdown } from "@/components/ui/markdown"
import { getOrCreateSpecialistThread, getRecentSpecialistOutputs, getSpecialistThreadHistory, getSpecialistRelationshipSummary } from "@/actions/agent-memory"
import type { SpecialistHistoryMessage, RelationshipSummary } from "@/actions/agent-memory"
import { RelationshipBar } from "@/components/specialists/relationship-bar"
import { ContextLayerPill } from "@/components/specialists/context-layer-pill"
import { ConversationStarterGrid } from "@/components/specialists/conversation-starter-grid"
import { parseStarters } from "@/lib/utils/starter-parser"
import type { StructuredStarter } from "@/lib/utils/starter-parser"
import { DecisionTimeline } from "@/components/specialists/decision-timeline"
import { HandoffCard } from "@/components/specialists/handoff-card"
import { HandoffBreadcrumb } from "@/components/specialists/handoff-breadcrumb"
import type { HandoffTrailEntry } from "@/contexts/advisor-panel-context"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { getProactiveOpener, markInsightRead, getSpecialistGreetingContext } from "@/actions/agent-insights"
import { createArtifact, exportArtifactToGoogleDocs, updateArtifactContent } from "@/actions/agent-artifacts"
import type { ArtifactContentType } from "@/actions/agent-artifacts"
import { detectWorkflowTrigger } from "@/lib/agents/specialist-workflows"
import type { SpecialistId } from "./specialists-data"
import { persistSpecialistHandoff } from "@/actions/agent-handoffs"
import { recordSpecialistFeedback } from "@/actions/specialist-feedback"
import { findRelatedPendingDecisions } from "@/actions/decision-outcomes"
import { DecisionOutcomePrompt } from "@/components/specialists/decision-outcome-prompt"
import type { DecisionEntry } from "@/lib/agents/decision-journal"
import { exportAsPDF } from "@/lib/export-utils"
import { getSpecialistById, SPECIALISTS } from "./specialists-data"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useScreenContext } from "@/contexts/screen-context"
import { useBrowseContext } from "@/contexts/browse-context"
import { parseSlideDeckFromText } from "@/lib/ai-providers/slide-parser"
import type { SlideDeckContent } from "@/lib/ai-providers/types"
import { SpecialistChatAvatar } from "@/components/specialists/specialist-presentation"
import { AiDisclaimer } from "@/components/ui/ai-disclaimer"
import { ProposedActionsCard } from "@/components/specialists/proposed-actions-card"
import type { ChartSpec } from "@/lib/agents/tools/chart-spec"
import type { StructuredOutputSpec } from "@/lib/agents/tools/structured-output-spec"
import { ExternalActionCard } from "@/components/specialists/external-action-card"
import type { ProposedExternalAction } from "@/lib/agents/tools/permission-guard"
import { PageActionCard } from "@/components/specialists/page-action-card"
import type { ProposedPageAction } from "@/lib/agents/tools/page-action-types"
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

// ─── Specialist Model Configuration ───────────────────────────────────────────
// Per-specialist model tiers: "claude" for high-stakes reasoning (strategy,
// finance, legal, CTO, chief of staff) and "minimax" for high-volume work
// (marketing, sales, HR, engineering, manufacturing, supply chain, etc.).
// Each specialist declares its tier in specialists-data.ts via `modelTier`.

const MODEL_TIERS = {
    claude: { providerId: "anthropic", modelId: "claude-opus-4-6" },
    qwen: { providerId: "qwen", modelId: "qwen3.5-plus" },
    "qwen-local": { providerId: "qwen-local", modelId: "qwen3:30b-a3b" },
    minimax: { providerId: "minimax", modelId: "MiniMax-M2.7" },
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

// AUDIT: MessageExportMenu extracted to ./message-export-menu.tsx (2026-02-19, refactor step 8 of 8)
import { MessageExportMenu } from "./message-export-menu"

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

/** Attachment returned from /api/agents/upload, sent with execute request. */
interface PendingAttachment {
    path: string
    url: string | null
    filename: string
    size: number
    mimeType: string
}

// AUDIT: ChatMessage interface moved to src/lib/agents/message-parsers.ts (2026-02-25, refactor step 2 of 5).
// Imported above via: import type { ChatMessage } from "@/lib/agents/message-parsers"

// ─── PROPOSED_PLAN component imports ──────────────────────────────────────────

import type { ExecutionPlan, PlanStep } from "@/lib/agents/execution-plan-types"
import { buildStepContext, countCompletedSteps, getNextPendingStep } from "@/lib/agents/execution-plan-types"
import { ExecutionPlanCard } from "@/components/specialists/execution-plan-card"

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
    onSwitchSpecialist?: (specialistId: string, handoffContext?: string, sourceThreadId?: string, sourceSpecialistId?: string) => void
    /** Context passed from a referring specialist when switching */
    handoffContext?: string | null
    /** Name of the specialist that referred the user */
    referredBy?: string | null
    /** Source specialist's thread ID for deep handoff context (server-side enrichment) */
    handoffSourceThreadId?: string | null
    /** Source specialist's ID for deep handoff context (server-side enrichment) */
    handoffSourceSpecialistId?: string | null
    /** Optional label shown as a badge in the header indicating what entity is being discussed */
    contextLabel?: string | null
    /** Render mode: "dialog" for centered modal (default), "panel" for sidebar layout */
    renderMode?: SpecialistRenderMode
    /** Trail of specialist handoffs for breadcrumb display */
    handoffTrail?: HandoffTrailEntry[]
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
    handoffTrail = [],
    handoffSourceThreadId,
    handoffSourceSpecialistId,
}: BriefSpecialistDialogProps) {
    const isPanel = renderMode === "panel"

    // ─── AdvisorPanel State (always call hook, use result conditionally) ─────
    const advisorPanel = useAdvisorPanel()

    // ─── State ────────────────────────────────────────────────────────────
    const [briefText, setBriefText] = useState("")
    const [isExecuting, setIsExecuting] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingResponse, setStreamingResponse] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [threadId, setThreadId] = useState<string | null>(null)
    const [contextGrounding, setContextGrounding] = useState<{
        availableSections?: string[]
        missingContextHints?: string[]
        activeLayers?: string[]
    } | null>(null)
    const [webSources, setWebSources] = useState<Array<{ title: string; url: string; snippet: string }>>([])
    const [isLoadingThread, setIsLoadingThread] = useState(false)
    const [crossSpecialistContext, setCrossSpecialistContext] = useState("")
    const [showHistory, setShowHistory] = useState(false)
    const [historyMessages, setHistoryMessages] = useState<SpecialistHistoryMessage[]>([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [dynamicSuggestion, setDynamicSuggestion] = useState<{
        specialistId: string
        reason: string
    } | null>(null)

    const [relationshipSummary, setRelationshipSummary] = useState<RelationshipSummary | null>(null)
    const [structuredStarters, setStructuredStarters] = useState<StructuredStarter[] | null>(null)
    const [showDecisionTimeline, setShowDecisionTimeline] = useState(false)
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
    /** Proactive opener from sweep — rendered as first assistant message when specialist initiates */
    const [proactiveOpener, setProactiveOpener] = useState<{
        opener: string; insightId: string; title: string; urgency: string
    } | null>(null)
    /** Real insight titles and overdue tasks for data-driven greeting context */
    const [greetingContext, setGreetingContext] = useState<{
        insightTitles: string[]; overdueTasks: string[]
    }>({ insightTitles: [], overdueTasks: [] })
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

    /** Fullscreen dialog mode for larger workspace */
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Multi-step execution plan state
    const [activePlan, setActivePlan] = useState<ExecutionPlan | null>(null)

    // Speculative dual-stream state
    const [speculativeFastResponse, setSpeculativeFastResponse] = useState("")
    const [speculativeDeepResponse, setSpeculativeDeepResponse] = useState("")
    const [speculativeComplexity, setSpeculativeComplexity] = useState<"simple" | "complex" | null>(null)
    const [isSpeculativeMode, setIsSpeculativeMode] = useState(false)

    // Per-message feedback state (index → rating)
    const [messageFeedback, setMessageFeedback] = useState<Record<number, 'positive' | 'negative'>>({})

    /** Pending decisions surfaced for outcome recording after assistant responses */
    const [decisionPrompts, setDecisionPrompts] = useState<DecisionEntry[]>([])

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
            if (speechRecognition.isListening) speechRecognition.stop()
            return
        }

        // Reset transient state
        setBriefText("")
        setStreamingResponse("")
        setError(null)
        setCopied(false)
        setShowHistory(false)
        setWebSources([])
        // Don't reset messages -- we want to preserve the current conversation

        let cancelled = false

        async function initialize(): Promise<void> {
            setIsLoadingThread(true)
            try {
                // Fetch thread, cross-specialist context, history, proactive opener, AND greeting context in parallel
                const [threadResult, crossResult, historyResult, proactiveResult, greetingCtx, relationshipResult] = await Promise.all([
                    getOrCreateSpecialistThread(specialist.id),
                    getRecentSpecialistOutputs(specialist.id, 5),
                    getSpecialistThreadHistory(specialist.id, 20),
                    getProactiveOpener(specialist.id).catch(() => null),
                    getSpecialistGreetingContext(specialist.id).catch(() => ({ insightTitles: [], overdueTasks: [] })),
                    getSpecialistRelationshipSummary(specialist.id).catch(() => ({ data: null, error: null })),
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

                // Store proactive opener if available (rendered during greeting phase)
                if (proactiveResult) {
                    setProactiveOpener(proactiveResult)
                    // Mark insight as read since we'll render the opener
                    markInsightRead(proactiveResult.insightId).catch(() => {})
                } else {
                    setProactiveOpener(null)
                }

                // Store greeting context for data-driven conversation starters
                if (greetingCtx.insightTitles.length > 0 || greetingCtx.overdueTasks.length > 0) {
                    setGreetingContext(greetingCtx)
                }

                // Store relationship summary
                if (relationshipResult.data) {
                    setRelationshipSummary(relationshipResult.data)
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
        setProactiveOpener(null)
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
    // If the specialist has a proactive opener (from background sweeps), render it as the
    // first message — the specialist initiated the conversation. Otherwise, generate a greeting.
    useEffect(() => {
        if (isLoadingThread || !open) return
        if (greetingGeneratedRef.current) return
        greetingGeneratedRef.current = true

        const controller = new AbortController()
        const signal = controller.signal

        async function generateGreeting(): Promise<void> {
            setIsGeneratingGreeting(true)

            // If we have a proactive opener from a sweep, render it as the first message
            // instead of generating a new greeting — the specialist initiated this conversation
            if (proactiveOpener) {
                const openerMessage: ChatMessage = {
                    role: "assistant",
                    content: proactiveOpener.opener,
                    timestamp: new Date(),
                    isProactive: true,
                }
                setMessages(prev => [...prev, openerMessage])
                setIsGeneratingGreeting(false)
                setProactiveOpener(null)
                return
            }

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

            // Inject real sweep insights and overdue tasks for data-driven greetings
            if (greetingContext.insightTitles.length > 0 || greetingContext.overdueTasks.length > 0) {
                const dataLines: string[] = []
                if (greetingContext.insightTitles.length > 0) {
                    dataLines.push(`Your recent findings: ${greetingContext.insightTitles.join("; ")}`)
                }
                if (greetingContext.overdueTasks.length > 0) {
                    dataLines.push(`Overdue items you're tracking: ${greetingContext.overdueTasks.join("; ")}`)
                }
                contextParts.push(`## Your Active Intelligence\n${dataLines.join("\n")}\nReference these naturally — they make your greeting specific and relevant.`)
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
                        handoffSourceThreadId: handoffSourceThreadId ?? undefined,
                        handoffSourceSpecialistId: handoffSourceSpecialistId ?? undefined,
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
                    const parsed = parseStarters(startersMatch[1])
                    if (parsed.length > 0) {
                        setStructuredStarters(parsed)
                        // Also set legacy starters for fallback rendering
                        setDynamicStarters(parsed.map(s => s.prompt))
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
    }, [isLoadingThread, open, specialist.id, specialist.name, specialist.title, specialist.workingStyle, threadId, crossSpecialistContext])

    // ─── Handlers ─────────────────────────────────────────────────────────

    const handleExecute = useCallback(async () => {
        const userInput = briefText.trim()
        if (!userInput) {
            setError("Tell your specialist what you need.")
            return
        }

        // Add user message to chat
        const userMessage: ChatMessage = {
            role: "user",
            content: userInput,
            timestamp: new Date(),
        }
        setMessages((prev) => [...prev, userMessage])
        setBriefText("")
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

        const promptTemplate = isFollowUp
            ? `{{input}}\n\n{{company_context}}`
            : `You are ${specialist.name}, the ${specialist.title} specialist for this company. ${specialist.workingStyle}\n\n{{input}}\n\n{{company_context}}\n\nProvide a thorough, actionable response that demonstrates deep expertise. Use markdown formatting with headers, tables, and bullet points for clarity.`

        const isSlideRequest = detectPresentationIntent(userInput)

        try {
            // Auto-retry: one transparent retry for transient stream failures
            // (connection drops, provider timeouts). Non-retryable errors (auth,
            // rate limit, content) surface immediately.
            const MAX_ATTEMPTS = 2
            let fullResponse = ""
            let rolloutIdFromResponse: string | null = null
            const useSpeculative = !!(specialist.speculativeEnabled && !isSlideRequest)
            let specFastFull = ""
            let specDeepFull = ""
            let specComplexity: "simple" | "complex" | null = null

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

                if (useSpeculative && attempt === 1) {
                    setIsSpeculativeMode(true)
                    setSpeculativeFastResponse("")
                    setSpeculativeDeepResponse("")
                    setSpeculativeComplexity(null)
                }

                // INTENT: Pass handoff source IDs on the first exchange only, so the
                // server can build deep handoff context from the source specialist's
                // conversation transcript, artifacts, and decisions.
                const isFirstExchange = messages.length <= 1
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
                        speculative: useSpeculative || undefined,
                        attachments: attachmentsToSend.length > 0
                            ? attachmentsToSend.map((a) => ({ path: a.path, url: a.url, filename: a.filename, mimeType: a.mimeType }))
                            : undefined,
                        handoffSourceThreadId: isFirstExchange ? (handoffSourceThreadId ?? undefined) : undefined,
                        handoffSourceSpecialistId: isFirstExchange ? (handoffSourceSpecialistId ?? undefined) : undefined,
                        currentRoute: screenContext.route || undefined,
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

                // Sync thread state if server auto-healed a stale thread
                const newThreadId = res.headers.get("X-New-Thread-Id")
                if (newThreadId) {
                    setThreadId(newThreadId)
                }

                // Handle streaming response
                const reader = res.body?.getReader()
                if (!reader) throw new Error("No response body")

                const decoder = new TextDecoder()
                fullResponse = ""
                let streamError: string | null = null
                specFastFull = ""
                specDeepFull = ""
                specComplexity = null

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
                                        grounding?: { availableSections?: string[]; missingContextHints?: string[]; activeLayers?: string[] }
                                        webSources?: Array<{ title: string; url: string; snippet: string }>
                                        stream?: "fast" | "deep"
                                        done?: boolean
                                        complexity?: "simple" | "complex"
                                        skipped?: boolean
                                    }
                                    if (parsed.grounding) {
                                        setContextGrounding(parsed.grounding)
                                        continue
                                    }
                                    if (parsed.webSources) {
                                        setWebSources(prev => [...prev, ...parsed.webSources!])
                                        continue
                                    }

                                    // ── Speculative tagged chunks ──
                                    if (useSpeculative && parsed.stream) {
                                        if (parsed.error) {
                                            if (parsed.stream === "deep") {
                                                console.warn("[BriefDialog] Deep model error:", parsed.error)
                                            } else {
                                                streamError = parsed.error
                                                break
                                            }
                                            continue
                                        }

                                        if (parsed.stream === "fast") {
                                            if (parsed.done) {
                                                specComplexity = parsed.complexity ?? "complex"
                                                setSpeculativeComplexity(specComplexity)
                                            } else if (parsed.text) {
                                                specFastFull += parsed.text
                                                const visibleFast = stripComplexityTags(stripPartialThinkTags(specFastFull))
                                                setSpeculativeFastResponse(visibleFast)
                                                setStreamingResponse(visibleFast)
                                            }
                                        } else if (parsed.stream === "deep") {
                                            if (parsed.done) {
                                                const cleanFast = stripComplexityTags(specFastFull)
                                                if (!parsed.skipped && specDeepFull) {
                                                    fullResponse = specComplexity === "simple"
                                                        ? cleanFast
                                                        : (cleanFast + "\n\n" + stripPartialThinkTags(specDeepFull)).trim()
                                                } else {
                                                    fullResponse = cleanFast
                                                }
                                            } else if (parsed.text) {
                                                specDeepFull += parsed.text
                                                const visibleDeep = stripPartialThinkTags(specDeepFull)
                                                setSpeculativeDeepResponse(visibleDeep)
                                                const combinedStreaming = stripComplexityTags(specFastFull) + "\n\n" + visibleDeep
                                                setStreamingResponse(combinedStreaming.trim())
                                            }
                                        }
                                        continue
                                    }

                                    // ── Standard (non-speculative) SSE handling ──
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
                                    }
                                } catch {
                                    if (!useSpeculative) {
                                        fullResponse += data
                                        const strippedText = stripPartialThinkTags(fullResponse)
                                        setStreamingResponse(strippedText)
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
                        continue // Retry
                    }

                    // No more retries — surface the error
                    setError(normalizeSpecialistError(streamError, specialist.name))
                    return
                }

                // Stream completed successfully — exit the retry loop
                break
            }

            // For speculative mode: assemble fullResponse from fast/deep if not yet set
            if (useSpeculative && !fullResponse && specFastFull) {
                const cleanFast = stripComplexityTags(specFastFull)
                fullResponse = specComplexity === "simple"
                    ? cleanFast
                    : (cleanFast + (specDeepFull ? "\n\n" + stripPartialThinkTags(specDeepFull) : "")).trim()
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

            // Parse PROPOSED_PLAN from response (multi-step execution plans)
            const parsedPlan = parseProposedPlan(displayResponse, specialist.id)
            if (parsedPlan) {
                console.info("[SpecialistChat] PROPOSED_PLAN parsed:", {
                    specialist: specialist.id,
                    title: parsedPlan.title,
                    stepCount: parsedPlan.steps.length,
                    crossSpecialist: parsedPlan.steps.filter(s => s.specialistId !== specialist.id).length,
                })
                setActivePlan(parsedPlan)
            }
            displayResponse = stripProposedPlanBlock(displayResponse)

            // Parse PROPOSED_EDIT from response (iterative artifact revisions)
            const proposedEdit = parseProposedEdit(displayResponse)
            if (proposedEdit) {
                console.info("[SpecialistChat] PROPOSED_EDIT parsed:", {
                    specialist: specialist.id,
                    artifactId: proposedEdit.artifactId,
                    title: proposedEdit.title,
                    changeSummary: proposedEdit.changeSummary,
                })
                // Fire-and-forget: update the existing artifact with revised content
                // INTENT: The display content (after stripping the edit block) IS the
                // full updated artifact body the specialist produced.
                const editContent = stripProposedEditBlock(displayResponse)
                updateArtifactContent(
                    proposedEdit.artifactId,
                    editContent,
                    proposedEdit.title,
                    proposedEdit.changeSummary,
                ).then((result) => {
                    if (result.data) {
                        toast.success("Deliverable updated", {
                            description: proposedEdit.changeSummary,
                            action: {
                                label: "Open",
                                onClick: () => { window.location.href = "/agents/artifacts" },
                            },
                            duration: 4000,
                        })
                    } else if (result.error) {
                        console.warn("[SpecialistChat] PROPOSED_EDIT update failed:", result.error)
                        toast.error("Failed to update deliverable", {
                            description: result.error,
                        })
                    }
                }).catch((err) => {
                    console.warn("[SpecialistChat] PROPOSED_EDIT update error:", err)
                })
            }
            displayResponse = stripProposedEditBlock(displayResponse)

            // Parse CHART blocks from response (inline data visualizations)
            const parsedCharts = parseCharts(displayResponse)
            if (parsedCharts.length > 0) {
                console.info("[SpecialistChat] CHART blocks parsed:", {
                    specialist: specialist.id,
                    chartCount: parsedCharts.length,
                    types: parsedCharts.map((c) => c.type),
                })
            }
            displayResponse = stripChartBlocks(displayResponse)

            // Parse PROPOSED_EXTERNAL_ACTION blocks from response (Google Sheets, Calendar, Email)
            const parsedExternalActions = parseExternalActions(displayResponse)
            if (parsedExternalActions.length > 0) {
                console.info("[SpecialistChat] PROPOSED_EXTERNAL_ACTION blocks parsed:", {
                    specialist: specialist.id,
                    actionCount: parsedExternalActions.length,
                    types: parsedExternalActions.map((a) => a.type),
                })
            }
            displayResponse = stripExternalActionBlocks(displayResponse)

            // Parse PROPOSED_PAGE_ACTION blocks from response (in-app mutations)
            const parsedPageActions = parsePageActions(displayResponse)
            if (parsedPageActions.length > 0) {
                console.info("[SpecialistChat] PROPOSED_PAGE_ACTION blocks parsed:", {
                    specialist: specialist.id,
                    actionCount: parsedPageActions.length,
                    types: parsedPageActions.map((a) => a.type),
                })
            }
            displayResponse = stripPageActionBlocks(displayResponse)

            // Parse STRUCTURED_OUTPUT blocks (kanban, comparison, dashboard, org chart)
            const parsedStructuredOutputs = parseStructuredOutputs(displayResponse)
            if (parsedStructuredOutputs.length > 0) {
                console.info("[SpecialistChat] STRUCTURED_OUTPUT blocks parsed:", {
                    specialist: specialist.id,
                    outputCount: parsedStructuredOutputs.length,
                    types: parsedStructuredOutputs.map((o) => o.type),
                })
            }
            displayResponse = stripStructuredOutputBlocks(displayResponse)

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
                ...(parsedPlan ? { executionPlan: parsedPlan } : {}),
                ...(parsedCharts.length > 0 ? { charts: parsedCharts } : {}),
                ...(parsedExternalActions.length > 0 ? { externalActions: parsedExternalActions } : {}),
                ...(parsedPageActions.length > 0 ? { pageActions: parsedPageActions } : {}),
                ...(parsedStructuredOutputs.length > 0 ? { structuredOutputs: parsedStructuredOutputs } : {}),
            }
            setMessages((prev) => [...prev, assistantMessage])
            setStreamingResponse("")

            // After response completes, surface any pending decisions related to this response
            setDecisionPrompts([]) // Clear previous prompts
            findRelatedPendingDecisions(displayResponse, specialist.id).then(related => {
                if (related.length > 0) setDecisionPrompts(related)
            }).catch(() => {})

            // Auto-save to deliverables with smart content type detection
            const matchedWorkflow = detectWorkflowTrigger(userMessage.content, specialist.id as SpecialistId)
            const artifactTitle = matchedWorkflow
                ? `${matchedWorkflow.name} — ${new Date().toLocaleDateString()}`
                : `${specialist.name}: ${userMessage.content.slice(0, 80)}`
            // Infer content type from workflow output format or specialist domain
            let contentType: ArtifactContentType = "document"
            if (matchedWorkflow) {
                if (matchedWorkflow.outputFormat === "analysis") contentType = "report"
                else if (matchedWorkflow.outputFormat === "email") contentType = "email"
                else if (matchedWorkflow.outputFormat === "table") contentType = "report"
            } else if (parsedDeck) {
                contentType = "presentation"
            }
            createArtifact({
                workflowId: matchedWorkflow?.id ?? null,
                title: artifactTitle,
                content: displayResponse,
                contentType,
                metadata: {
                    specialistId: specialist.id,
                    specialistName: specialist.name,
                    source: matchedWorkflow ? "specialist-workflow" : "specialist-brief",
                    workflowName: matchedWorkflow?.name,
                    userPrompt: userMessage.content,
                },
            }).then((result) => {
                if (result.data) {
                    toast.success(matchedWorkflow ? `${matchedWorkflow.name} saved` : "Saved to Deliverables", {
                        description: "View it in your Deliverables.",
                        action: {
                            label: "Open",
                            onClick: () => { window.location.href = "/agents/artifacts" },
                        },
                        duration: 4000,
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
            setIsUrgentMessage(false)
            setIsSpeculativeMode(false)
        }
    }, [briefText, specialist, threadId, crossSpecialistContext, handoffContext, handoffSourceThreadId, handoffSourceSpecialistId, messages, pendingAttachments, deepThinkEnabled, serializeScreenContext, formatBrowseContext])

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

    /** Record thumbs-up / thumbs-down feedback for an assistant message. */
    const handleFeedback = useCallback(async (messageIndex: number, rating: 'positive' | 'negative') => {
        setMessageFeedback(prev => ({ ...prev, [messageIndex]: rating }))
        await recordSpecialistFeedback(specialist.id, threadId, messageIndex, rating)
    }, [specialist.id, threadId])

    /** Pre-fill the textarea with a natural question from a conversation starter chip. */
    const handleStarterClick = useCallback((highlight: string) => {
        setBriefText(`Help me with ${highlight}`)
        setError(null)
        textareaRef.current?.focus()
    }, [])

    // ─── Multi-Step Execution Plan Handlers ────────────────────────────────

    /** Execute a single step in the active plan. Streams via /api/agents/execute. */
    const handleExecutePlanStep = useCallback(async (stepIndex: number) => {
        if (!activePlan) return
        const step = activePlan.steps[stepIndex]
        if (!step) return

        // Update plan status
        setActivePlan((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                status: "running",
                currentStep: stepIndex,
                executions: {
                    ...prev.executions,
                    [stepIndex]: { status: "running", startedAt: new Date().toISOString() },
                },
            }
        })

        try {
            // Build upstream context from completed steps
            const upstreamContext = buildStepContext(activePlan, stepIndex)
            const stepSpecialist = getSpecialistById(step.specialistId) ?? specialist
            const systemExtras: string[] = []
            if (upstreamContext) {
                systemExtras.push(`\n\n${upstreamContext}`)
            }
            systemExtras.push(`\n\nYou are executing step ${stepIndex + 1} of ${activePlan.steps.length} in the plan "${activePlan.title}". Focus on producing: ${step.outputLabel}.`)

            const controller = new AbortController()
            executeAbortRef.current = controller

            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: step.prompt,
                    input: step.prompt,
                    providerId: getSpecialistModel(stepSpecialist).providerId,
                    modelId: getSpecialistModel(stepSpecialist).modelId,
                    modelTier: stepSpecialist.modelTier,
                    modality: "text",
                    threadId: threadId ?? undefined,
                    specialistId: step.specialistId,
                    customSystemPromptSuffix: systemExtras.join(""),
                }),
                signal: controller.signal,
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Step execution failed" }))
                throw new Error(errData.error || `HTTP ${res.status}`)
            }

            // Stream the response
            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let stepOutput = ""

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
                            const parsed = JSON.parse(data) as { text?: string; error?: string }
                            if (parsed.error) throw new Error(parsed.error)
                            if (parsed.text) {
                                stepOutput += parsed.text
                            }
                        } catch (parseErr) {
                            if (parseErr instanceof Error && parseErr.message !== data) throw parseErr
                            stepOutput += data
                        }
                    }
                }
            }

            // Strip think tags from step output
            const cleanOutput = stripThinkTags(stepOutput)

            // Move step to review status with output
            setActivePlan((prev) => {
                if (!prev) return prev
                return {
                    ...prev,
                    executions: {
                        ...prev.executions,
                        [stepIndex]: {
                            status: "review",
                            output: cleanOutput,
                            startedAt: prev.executions[stepIndex]?.startedAt,
                            completedAt: new Date().toISOString(),
                        },
                    },
                }
            })
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return
            const errorMsg = err instanceof Error ? err.message : "Step execution failed"
            setActivePlan((prev) => {
                if (!prev) return prev
                return {
                    ...prev,
                    status: "paused",
                    executions: {
                        ...prev.executions,
                        [stepIndex]: {
                            status: "error",
                            error: errorMsg,
                            startedAt: prev.executions[stepIndex]?.startedAt,
                            completedAt: new Date().toISOString(),
                        },
                    },
                }
            })
        } finally {
            executeAbortRef.current = null
        }
    }, [activePlan, specialist, threadId])

    /** Approve a step's output and auto-trigger the next step. */
    const handleApprovePlanStep = useCallback((stepIndex: number) => {
        setActivePlan((prev) => {
            if (!prev) return prev
            const updated: ExecutionPlan = {
                ...prev,
                executions: {
                    ...prev.executions,
                    [stepIndex]: {
                        ...prev.executions[stepIndex],
                        status: "approved",
                    },
                },
            }
            // Check if all steps are done
            const allDone = updated.steps.every((_, i) => {
                const exec = updated.executions[i]
                return exec?.status === "approved" || exec?.status === "skipped"
            })
            if (allDone) {
                updated.status = "completed"
            }
            return updated
        })

        // Auto-trigger next step after a brief delay (allows state to settle)
        setTimeout(() => {
            setActivePlan((current) => {
                if (!current || current.status === "completed") return current
                const nextIdx = getNextPendingStep(current)
                if (nextIdx >= 0) {
                    // Trigger execution of next step (via effect or direct call)
                    handleExecutePlanStep(nextIdx)
                }
                return current
            })
        }, 300)
    }, [handleExecutePlanStep])

    /** Skip a step and move to the next. */
    const handleSkipPlanStep = useCallback((stepIndex: number) => {
        setActivePlan((prev) => {
            if (!prev) return prev
            const updated: ExecutionPlan = {
                ...prev,
                executions: {
                    ...prev.executions,
                    [stepIndex]: { status: "skipped", completedAt: new Date().toISOString() },
                },
            }
            const allDone = updated.steps.every((_, i) => {
                const exec = updated.executions[i]
                return exec?.status === "approved" || exec?.status === "skipped"
            })
            if (allDone) updated.status = "completed"
            return updated
        })

        // Auto-trigger next step
        setTimeout(() => {
            setActivePlan((current) => {
                if (!current || current.status === "completed") return current
                const nextIdx = getNextPendingStep(current)
                if (nextIdx >= 0) handleExecutePlanStep(nextIdx)
                return current
            })
        }, 300)
    }, [handleExecutePlanStep])

    /** Run all steps sequentially. Starts from the first pending step. */
    const handleRunAllSteps = useCallback(() => {
        if (!activePlan) return
        const nextIdx = getNextPendingStep(activePlan)
        if (nextIdx >= 0) handleExecutePlanStep(nextIdx)
    }, [activePlan, handleExecutePlanStep])

    /** Cancel the active plan. */
    const handleCancelPlan = useCallback(() => {
        if (executeAbortRef.current) executeAbortRef.current.abort()
        setActivePlan((prev) => prev ? { ...prev, status: "cancelled" } : prev)
    }, [])

    /** Dismiss the plan card (user doesn't want to execute it). */
    const handleDismissPlan = useCallback(() => {
        setActivePlan(null)
    }, [])

    // Save completed plan as artifact
    useEffect(() => {
        if (!activePlan || activePlan.status !== "completed") return

        // Combine all approved step outputs into one deliverable
        const outputParts: string[] = []
        for (const step of activePlan.steps) {
            const exec = activePlan.executions[step.index]
            if (exec?.status === "approved" && exec.output) {
                outputParts.push(`## ${step.title}\n\n${exec.output}`)
            }
        }
        const combinedOutput = outputParts.join("\n\n---\n\n")

        createArtifact({
            title: `${activePlan.title} — ${new Date().toLocaleDateString()}`,
            content: combinedOutput,
            contentType: "report",
            metadata: {
                specialistId: specialist.id,
                specialistName: specialist.name,
                source: "execution-plan",
                planId: activePlan.id,
                planTitle: activePlan.title,
                stepCount: activePlan.steps.length,
                completedSteps: countCompletedSteps(activePlan),
            },
        }).then((result) => {
            if (result.data) {
                toast.success(`Plan "${activePlan.title}" complete`, {
                    description: "All outputs saved to Deliverables.",
                    action: {
                        label: "Open",
                        onClick: () => { window.location.href = "/agents/artifacts" },
                    },
                    duration: 5000,
                })
            }
        }).catch((err) => {
            console.warn("[BriefDialog] Plan artifact save failed:", err)
        })
    }, [activePlan?.status, activePlan?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
        let conversationSummary: string | undefined
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
                conversationSummary = firstUserMsg.content.slice(0, 300)
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

        // Persist the handoff to the collaboration hub DB (fire-and-forget)
        if (targetSpec) {
            persistSpecialistHandoff({
                fromSpecialistId: specialist.id,
                fromSpecialistName: specialist.name,
                toSpecialistId: id,
                toSpecialistName: targetSpec.name,
                conversationSummary,
                handoffReason: dynamicSuggestion?.specialistId === id
                    ? dynamicSuggestion.reason
                    : undefined,
            }).catch(() => {
                // Silent — persistence is supplementary, never blocks handoff
            })
        }

        // Abort any in-flight request from the current specialist before switching
        executeAbortRef.current?.abort()
        executeAbortRef.current = null

        // INTENT: Pass the source threadId and specialistId so the receiving specialist
        // can fetch deep handoff context server-side (full transcript + artifacts + decisions).
        const sourceThread = threadId ?? undefined
        const sourceSpecialist = specialist.id

        if (isPanel) {
            // Panel mode: switch directly without close/reopen cycle.
            // The close-then-reopen pattern causes a race condition where the
            // open→false→true transition triggers cleanup effects that abort
            // the new specialist's greeting stream mid-flight.
            onSwitchSpecialist?.(id, handoff, sourceThread, sourceSpecialist)
        } else {
            // Dialog mode: close first, then reopen with new specialist
            // after the close animation finishes.
            onOpenChange(false)
            setTimeout(() => onSwitchSpecialist?.(id, handoff, sourceThread, sourceSpecialist), 200)
        }
    }, [isPanel, onOpenChange, onSwitchSpecialist, messages, specialist, dynamicSuggestion])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleExecute()
        }
    }, [handleExecute])

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items
        if (!items) return
        const files: File[] = []
        for (const item of items) {
            if (item.kind === "file") {
                const file = item.getAsFile()
                if (file) files.push(file)
            }
        }
        if (files.length === 0) return
        // Prevent pasted file data from appearing as text in the textarea
        e.preventDefault()
        files.slice(0, MAX_ATTACHMENTS - pendingAttachments.length)
            .forEach((file) => handleFileAttach(file))
    }, [handleFileAttach, pendingAttachments.length])

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
                                                    unoptimized
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
                                            handleSwitchSpecialist(s.id)
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
                                                unoptimized
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
                {/* Fullscreen toggle button (panel mode only) */}
                {isPanel && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={advisorPanel.toggleFullscreen}
                        className="h-8 w-8 p-0 flex-shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={advisorPanel.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    >
                        {advisorPanel.isFullscreen ? (
                            <Minimize2 className="h-4 w-4" />
                        ) : (
                            <Maximize2 className="h-4 w-4" />
                        )}
                    </Button>
                )}
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
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDecisionTimeline(!showDecisionTimeline)}
                    className={cn(
                        "h-7 w-7 p-0",
                        showDecisionTimeline && "text-international-orange"
                    )}
                    aria-label="Show decision timeline"
                >
                    <Scale className="h-3.5 w-3.5" />
                </Button>
            </div>
            {/* Row 3: Relationship bar (trust level, stats) */}
            {relationshipSummary && relationshipSummary.level !== 'new' && (
                <RelationshipBar summary={relationshipSummary} />
            )}
            {/* Handoff trail breadcrumb */}
            {handoffTrail.length > 0 && (
                <HandoffBreadcrumb
                    trail={handoffTrail}
                    currentName={specialist.name}
                    onSwitchBack={(id) => handleSwitchSpecialist(id)}
                />
            )}
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

                {/* Decision Timeline Panel */}
                {showDecisionTimeline && !isLoadingThread && (
                    <div className="border-b bg-muted/20 max-h-[40vh] overflow-y-auto">
                        <div className="px-3 py-2 border-b bg-muted/50 sticky top-0 flex items-center justify-between">
                            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                Decision Journal
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowDecisionTimeline(false)}
                                className="h-6 w-6 p-0"
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                        <div className="p-3">
                            <DecisionTimeline specialistId={specialist.id} />
                        </div>
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
                                {/* AUDIT: message loop extracted to ChatMessageList (2026-02-25, refactor step 2 of 5) */}
                                <ChatMessageList
                                    messages={messages}
                                    specialist={specialist}
                                    messageFeedback={messageFeedback}
                                    onFeedback={handleFeedback}
                                    compact
                                />

                                {/* Decision outcome prompts — surfaces pending decisions matching the last response */}
                                {decisionPrompts.length > 0 && !isExecuting && (
                                    <div className="space-y-1.5">
                                        {decisionPrompts.map(decision => (
                                            <DecisionOutcomePrompt
                                                key={decision.id}
                                                decision={decision}
                                                compact
                                                onDismiss={() => setDecisionPrompts(prev => prev.filter(d => d.id !== decision.id))}
                                                onRecorded={(id) => setDecisionPrompts(prev => prev.filter(d => d.id !== id))}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Streaming indicator — speculative dual-stream or standard */}
                                {isStreaming && (
                                    <div className="flex gap-2.5 justify-start">
                                        <div className="flex-shrink-0 mt-1">
                                            <SpecialistChatAvatar specialist={specialist} state="speaking" />
                                        </div>
                                        <div className="max-w-[90%] space-y-0">
                                            {/* Fast response (always shown during speculative streaming) */}
                                            {isSpeculativeMode && speculativeFastResponse ? (
                                                <>
                                                    <div className="rounded-lg px-3 py-2.5 bg-muted/50 border border-muted">
                                                        <Markdown content={stripProposedActionsBlock(speculativeFastResponse)} className="text-sm" />
                                                    </div>
                                                    {/* Deep response streams below when complex */}
                                                    {speculativeComplexity === "complex" && speculativeDeepResponse && (
                                                        <div className="rounded-lg px-3 py-2.5 bg-muted/50 border border-muted mt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                            <Markdown content={stripProposedActionsBlock(speculativeDeepResponse)} className="text-sm" />
                                                        </div>
                                                    )}
                                                    {/* Thinking indicator while waiting for deep response */}
                                                    {speculativeComplexity === "complex" && !speculativeDeepResponse && (
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 ml-1 animate-in fade-in duration-300">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            <span>Preparing detailed response...</span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="rounded-lg px-3 py-2.5 bg-muted/50 border border-muted">
                                                    <Markdown content={stripProposedActionsBlock(streamingResponse)} className="text-sm" />
                                                </div>
                                            )}
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

                        {/* Context layer indicator */}
                        {lastAssistantMessage && !isExecuting && contextGrounding?.activeLayers && contextGrounding.activeLayers.length > 0 && (
                            <div className="px-4 pb-1">
                                <ContextLayerPill activeLayers={contextGrounding.activeLayers} />
                            </div>
                        )}

                        {/* Web sources from search */}
                        {webSources.length > 0 && (
                            <div className="px-4 pb-2">
                                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Sources</p>
                                    <div className="flex flex-wrap gap-2">
                                        {webSources.slice(0, 5).map((source, idx) => (
                                            <a
                                                key={idx}
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border/50"
                                                title={source.snippet || source.title}
                                            >
                                                <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <path d="M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" />
                                                    <path d="M9.5 2.5h4v4" />
                                                    <path d="M13.5 2.5l-6 6" />
                                                </svg>
                                                <span className="truncate max-w-[180px]">{source.title}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Proposed actions */}
                        {lastAssistantMessage && !isExecuting && lastAssistantMessage.proposals && lastAssistantMessage.proposals.length > 0 && (
                            <div className="px-4">
                                <ProposedActionsCard
                                    proposals={lastAssistantMessage.proposals}
                                    specialist={specialist}
                                    rolloutId={lastAssistantMessage.rolloutId ?? undefined}
                                    sourceThreadId={threadId}
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

                        {/* External action proposals (Google Sheets, Calendar, Email) */}
                        {lastAssistantMessage && !isExecuting && lastAssistantMessage.externalActions && lastAssistantMessage.externalActions.length > 0 && (
                            <div className="px-4 space-y-2">
                                {lastAssistantMessage.externalActions.map((ea, eaIdx) => (
                                    <ExternalActionCard
                                        key={`ext-action-${eaIdx}-${ea.type}`}
                                        action={ea}
                                        onDismiss={() => {
                                            setMessages((prev) => {
                                                const idx = prev.map((m, i) => ({ m, i }))
                                                    .reverse()
                                                    .find(({ m }) => m.role === "assistant" && !m.historical)?.i
                                                if (idx === undefined) return prev
                                                const current = prev[idx].externalActions ?? []
                                                const updated = current.filter((_, i) => i !== eaIdx)
                                                return prev.map((msg, i) =>
                                                    i === idx ? { ...msg, externalActions: updated.length > 0 ? updated : undefined } : msg
                                                )
                                            })
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Page action proposals (in-app mutations: create project, objective, task) */}
                        {lastAssistantMessage && !isExecuting && lastAssistantMessage.pageActions && lastAssistantMessage.pageActions.length > 0 && (
                            <div className="px-4 space-y-2">
                                {lastAssistantMessage.pageActions.map((pa, paIdx) => (
                                    <PageActionCard
                                        key={`page-action-${paIdx}-${pa.type}`}
                                        action={pa}
                                        onDismiss={() => {
                                            setMessages((prev) => {
                                                const idx = prev.map((m, i) => ({ m, i }))
                                                    .reverse()
                                                    .find(({ m }) => m.role === "assistant" && !m.historical)?.i
                                                if (idx === undefined) return prev
                                                const current = prev[idx].pageActions ?? []
                                                const updated = current.filter((_, i) => i !== paIdx)
                                                return prev.map((msg, i) =>
                                                    i === idx ? { ...msg, pageActions: updated.length > 0 ? updated : undefined } : msg
                                                )
                                            })
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Execution plan card */}
                        {activePlan && activePlan.status !== "cancelled" && (
                            <div className="px-4">
                                <ExecutionPlanCard
                                    plan={activePlan}
                                    specialist={specialist}
                                    onExecuteStep={handleExecutePlanStep}
                                    onApproveStep={handleApprovePlanStep}
                                    onSkipStep={handleSkipPlanStep}
                                    onRunAll={handleRunAllSteps}
                                    onCancel={handleCancelPlan}
                                    onDismiss={handleDismissPlan}
                                />
                            </div>
                        )}

                        {/* Dynamic specialist recommendation */}
                        {lastAssistantMessage && !isExecuting && dynamicSuggestion && (() => {
                            const suggested = getSpecialistById(dynamicSuggestion.specialistId)
                            if (!suggested) return null
                            return (
                                <div className="mx-4 mb-3">
                                    <HandoffCard
                                        suggested={suggested}
                                        reason={dynamicSuggestion.reason}
                                        messageCount={messages.length}
                                        onContinue={() => handleSwitchSpecialist(suggested.id)}
                                        onStay={() => setDynamicSuggestion(null)}
                                    />
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
                                        <Tooltip key={s.id}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={() => handleSwitchSpecialist(s.id)}
                                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border border-muted hover:border-international-orange/50 transition-colors text-xs group"
                                                >
                                                    {s.avatarImage && (
                                                        <div className="relative h-4 w-4 rounded-full overflow-hidden flex-shrink-0">
                                                            <Image src={s.avatarImage} alt={s.name} fill unoptimized className="object-cover" sizes="16px" />
                                                        </div>
                                                    )}
                                                    <span className="font-medium text-foreground">{s.name}</span>
                                                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground group-hover:text-international-orange transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-[220px]">
                                                <p className="font-medium">{s.name} — {s.title}</p>
                                                <p className="text-muted-foreground mt-0.5">{s.tagline}</p>
                                            </TooltipContent>
                                        </Tooltip>
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
                                {(structuredStarters || dynamicStarters || specialist.highlights.length > 0 || pageGuidanceStarter) && (
                                    <>
                                        <p className="text-[10px] font-medium text-muted-foreground">
                                            {structuredStarters || dynamicStarters ? "Ask me about..." : "Start with a topic"}
                                        </p>
                                        {structuredStarters ? (
                                            <ConversationStarterGrid
                                                starters={structuredStarters}
                                                onSelect={(prompt) => {
                                                    setBriefText(prompt)
                                                    setError(null)
                                                    textareaRef.current?.focus()
                                                }}
                                                disabled={isExecuting}
                                            />
                                        ) : (
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
                                        )}
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

                        {/* AI disclaimer (persistent, above input) */}
                        <div className="flex-shrink-0 px-4 pt-2">
                            <AiDisclaimer specialistId={specialist.id} />
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
                                    onPaste={handlePaste}
                                    placeholder={
                                        speechRecognition.isProcessing
                                            ? "Transcribing..."
                                            : speechRecognition.isListening
                                                ? (speechRecognition.interimTranscript || "Listening... speak now")
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
            <DialogContent size={isFullscreen ? "full" : "lg"} className={`flex flex-col ${isFullscreen ? "max-h-[95vh]" : "max-h-[90vh]"}`}>
                {/* Header */}
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 relative h-12 w-12 rounded-full overflow-hidden bg-muted">
                            {specialist.avatarImage ? (
                                <Image
                                    src={specialist.avatarImage}
                                    alt={specialist.name}
                                    fill
                                    unoptimized
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
                            {/* Fullscreen toggle */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsFullscreen((f) => !f)}
                                className="h-7 w-7 p-0"
                                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                            >
                                {isFullscreen ? (
                                    <Minimize2 className="h-3.5 w-3.5" />
                                ) : (
                                    <Maximize2 className="h-3.5 w-3.5" />
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
                    {/* Handoff trail breadcrumb (dialog mode) */}
                    {handoffTrail.length > 0 && (
                        <div className="mt-2">
                            <HandoffBreadcrumb
                                trail={handoffTrail}
                                currentName={specialist.name}
                                onSwitchBack={(id) => handleSwitchSpecialist(id)}
                            />
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
                                {/* AUDIT: message loop extracted to ChatMessageList (2026-02-25, refactor step 2 of 5) */}
                                <ChatMessageList
                                    messages={messages}
                                    specialist={specialist}
                                    messageFeedback={messageFeedback}
                                    onFeedback={handleFeedback}
                                />

                                {/* Decision outcome prompts — surfaces pending decisions matching the last response */}
                                {decisionPrompts.length > 0 && !isExecuting && (
                                    <div className="space-y-2">
                                        {decisionPrompts.map(decision => (
                                            <DecisionOutcomePrompt
                                                key={decision.id}
                                                decision={decision}
                                                onDismiss={() => setDecisionPrompts(prev => prev.filter(d => d.id !== decision.id))}
                                                onRecorded={(id) => setDecisionPrompts(prev => prev.filter(d => d.id !== id))}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Streaming indicator — speculative dual-stream or standard */}
                                {isStreaming && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="flex-shrink-0 mt-1">
                                            <SpecialistChatAvatar
                                                specialist={specialist}
                                                state="speaking"
                                            />
                                        </div>
                                        <div className="max-w-[85%] space-y-0">
                                            {isSpeculativeMode && speculativeFastResponse ? (
                                                <>
                                                    <div className="rounded-lg px-4 py-3 bg-muted/50 border border-muted">
                                                        <Markdown content={stripProposedActionsBlock(speculativeFastResponse)} className="text-sm" />
                                                    </div>
                                                    {speculativeComplexity === "complex" && speculativeDeepResponse && (
                                                        <div className="rounded-lg px-4 py-3 bg-muted/50 border border-muted mt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                            <Markdown content={stripProposedActionsBlock(speculativeDeepResponse)} className="text-sm" />
                                                        </div>
                                                    )}
                                                    {speculativeComplexity === "complex" && !speculativeDeepResponse && (
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 ml-1 animate-in fade-in duration-300">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            <span>Preparing detailed response...</span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="rounded-lg px-4 py-3 bg-muted/50 border border-muted">
                                                    <Markdown content={stripProposedActionsBlock(streamingResponse)} className="text-sm" />
                                                </div>
                                            )}
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

                        {/* Web sources from search (panel mode) */}
                        {webSources.length > 0 && (
                            <div className="pb-2">
                                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Sources</p>
                                    <div className="flex flex-wrap gap-2">
                                        {webSources.slice(0, 5).map((source, idx) => (
                                            <a
                                                key={idx}
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border/50"
                                                title={source.snippet || source.title}
                                            >
                                                <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <path d="M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" />
                                                    <path d="M9.5 2.5h4v4" />
                                                    <path d="M13.5 2.5l-6 6" />
                                                </svg>
                                                <span className="truncate max-w-[180px]">{source.title}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </div>
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

                        {/* External action proposals (Google Sheets, Calendar, Email) — panel mode */}
                        {lastAssistantMessage && !isExecuting && lastAssistantMessage.externalActions && lastAssistantMessage.externalActions.length > 0 && (
                            <div className="space-y-2">
                                {lastAssistantMessage.externalActions.map((ea, eaIdx) => (
                                    <ExternalActionCard
                                        key={`ext-action-panel-${eaIdx}-${ea.type}`}
                                        action={ea}
                                        onDismiss={() => {
                                            setMessages((prev) => {
                                                const idx = prev.map((m, i) => ({ m, i }))
                                                    .reverse()
                                                    .find(({ m }) => m.role === "assistant" && !m.historical)?.i
                                                if (idx === undefined) return prev
                                                const current = prev[idx].externalActions ?? []
                                                const updated = current.filter((_, i) => i !== eaIdx)
                                                return prev.map((msg, i) =>
                                                    i === idx ? { ...msg, externalActions: updated.length > 0 ? updated : undefined } : msg
                                                )
                                            })
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Page action proposals (in-app mutations) — panel mode */}
                        {lastAssistantMessage && !isExecuting && lastAssistantMessage.pageActions && lastAssistantMessage.pageActions.length > 0 && (
                            <div className="space-y-2">
                                {lastAssistantMessage.pageActions.map((pa, paIdx) => (
                                    <PageActionCard
                                        key={`page-action-panel-${paIdx}-${pa.type}`}
                                        action={pa}
                                        onDismiss={() => {
                                            setMessages((prev) => {
                                                const idx = prev.map((m, i) => ({ m, i }))
                                                    .reverse()
                                                    .find(({ m }) => m.role === "assistant" && !m.historical)?.i
                                                if (idx === undefined) return prev
                                                const current = prev[idx].pageActions ?? []
                                                const updated = current.filter((_, i) => i !== paIdx)
                                                return prev.map((msg, i) =>
                                                    i === idx ? { ...msg, pageActions: updated.length > 0 ? updated : undefined } : msg
                                                )
                                            })
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Execution plan card (panel mode) */}
                        {activePlan && activePlan.status !== "cancelled" && (
                            <ExecutionPlanCard
                                plan={activePlan}
                                specialist={specialist}
                                onExecuteStep={handleExecutePlanStep}
                                onApproveStep={handleApprovePlanStep}
                                onSkipStep={handleSkipPlanStep}
                                onRunAll={handleRunAllSteps}
                                onCancel={handleCancelPlan}
                                onDismiss={handleDismissPlan}
                            />
                        )}

                        {/* Suggested Next Specialists (after at least one response) */}
                        {/* AI-Powered Dynamic Recommendation */}
                        {lastAssistantMessage && !isExecuting && dynamicSuggestion && (() => {
                            const suggested = getSpecialistById(dynamicSuggestion.specialistId)
                            if (!suggested) return null
                            return (
                                <div className="mb-4">
                                    <HandoffCard
                                        suggested={suggested}
                                        reason={dynamicSuggestion.reason}
                                        messageCount={messages.length}
                                        onContinue={() => handleSwitchSpecialist(suggested.id)}
                                        onStay={() => setDynamicSuggestion(null)}
                                    />
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
                                        <Tooltip key={s.id}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={() => handleSwitchSpecialist(s.id)}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border border-muted hover:border-international-orange/50 transition-colors text-sm group"
                                                >
                                                    {s.avatarImage && (
                                                        <div className="relative h-5 w-5 rounded-full overflow-hidden flex-shrink-0">
                                                            <Image
                                                                src={s.avatarImage}
                                                                alt={s.name}
                                                                fill
                                                                unoptimized
                                                                className="object-cover"
                                                                sizes="20px"
                                                            />
                                                        </div>
                                                    )}
                                                    <span className="font-medium text-foreground">{s.name}</span>
                                                    <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-international-orange transition-colors" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-[240px]">
                                                <p className="font-medium">{s.name} — {s.title}</p>
                                                <p className="text-muted-foreground mt-0.5">{s.tagline}</p>
                                            </TooltipContent>
                                        </Tooltip>
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

                        {/* AI disclaimer (persistent, above input — dialog mode) */}
                        <div className="flex-shrink-0 px-1 pt-2">
                            <AiDisclaimer specialistId={specialist.id} />
                        </div>

                        {/* Text Input (always visible at bottom) */}
                        <div className="flex-shrink-0 space-y-2">
                            {!hasNonHistoricalMessages && !isGeneratingGreeting && !hasHistoricalMessages && (
                                <Label htmlFor="brief-text" className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Describe what you need
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
                                                ? (speechRecognition.interimTranscript || "Listening... speak now")
                                                : hasNonHistoricalMessages
                                                ? `Follow up with ${specialist.name}...`
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
