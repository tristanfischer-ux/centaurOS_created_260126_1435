"use client"

/**
 * @file meeting-thread-view.tsx
 *
 * @description Persistent brainstorming thread view.
 * Renders a full read-back surface for any past meeting — topic, Council tier,
 * attendee pills, full transcript with position pills + arrival timers, and a
 * source citations sidebar. Two CTAs at the bottom: "Run a follow-up" and
 * "Branch from here" on any individual entry.
 *
 * @related
 * - src/app/(platform)/agents/m/[id]/page.tsx — Server component wrapper
 * - src/actions/meeting-threads.ts — Server actions
 * - src/lib/agents/council.ts — CouncilPosition labels
 */

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import {
    ArrowLeft,
    Calendar,
    Users,
    GitBranch,
    MessageSquare,
    Clock,
    ChevronRight,
    BookOpen,
    Loader2,
    Send,
    Link2,
    Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { COUNCIL_POSITION_LABELS } from "@/lib/agents/council"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { appendMeetingEntries, branchMeetingThread } from "@/actions/meeting-threads"
import type { MeetingThreadDetail, MeetingEntryRow } from "@/actions/meeting-threads"
import type { SubscriptionTier } from "@/lib/billing/plans"
import { getPrimaryTargetForTier } from "@/lib/agents/failover"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeetingThreadViewProps {
    thread: MeetingThreadDetail
    currentUserId: string
    userTier: SubscriptionTier
}

// ─── Council tier display labels ──────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
    quick:    "Quick Council",
    full:     "Full Council",
    deep:     "Deep Council",
    strategy: "Strategy Council",
}

// ─── Position pill colour mapping ─────────────────────────────────────────────

const POSITION_PILL_CLASS: Record<string, string> = {
    opener:       "bg-electric-blue/10 text-electric-blue border-electric-blue/20",
    reactor:      "bg-international-orange/10 text-international-orange border-international-orange/20",
    deep:         "bg-info/10 text-info border-info/20",
    "host-close": "bg-muted text-muted-foreground border-border",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatArrivalMs(ms: number | null): string | null {
    if (ms === null || ms === undefined) return null
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

interface EntryCardProps {
    entry: MeetingEntryRow
    onBranch: (entryId: string) => void
    isBranching: boolean
    /** Whether this entry is the one being branched */
    isBranchTarget: boolean
}

function EntryCard({ entry, onBranch, isBranching, isBranchTarget }: EntryCardProps) {
    const specialist = entry.specialistId ? getSpecialistById(entry.specialistId) : null
    const positionLabel = entry.councilPosition
        ? (COUNCIL_POSITION_LABELS[entry.councilPosition as keyof typeof COUNCIL_POSITION_LABELS] ?? entry.councilPosition)
        : null
    const positionClass = entry.councilPosition ? (POSITION_PILL_CLASS[entry.councilPosition] ?? POSITION_PILL_CLASS["host-close"]) : null
    const arrivalLabel = formatArrivalMs(entry.arrivalMs)

    if (entry.role === "founder") {
        return (
            <div className="flex justify-end mb-4">
                <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-international-orange/10 border border-international-orange/20 px-4 py-3">
                    <p className="text-xs font-semibold text-international-orange mb-1">You</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{entry.content}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="mb-4 group">
            {/* Position + arrival pills */}
            <div className="flex items-center gap-2 mb-1.5 pl-1">
                {positionLabel && positionClass && (
                    <span className={cn(
                        "inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                        positionClass,
                    )}>
                        {positionLabel}
                    </span>
                )}
                {arrivalLabel && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {arrivalLabel}
                    </span>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">
                    Round {entry.roundNumber}
                </span>
            </div>

            <Card className={cn(
                "border",
                isBranchTarget && "ring-2 ring-international-orange/30",
            )}>
                <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {specialist?.avatarImage && (
                                <img
                                    src={specialist.avatarImage}
                                    alt={entry.specialistName ?? ""}
                                    className="h-7 w-7 rounded-full object-cover flex-shrink-0"
                                />
                            )}
                            <div>
                                <p className="text-sm font-semibold text-foreground leading-none">
                                    {entry.specialistName ?? "Specialist"}
                                </p>
                                {specialist?.title && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {specialist.title}
                                    </p>
                                )}
                            </div>
                        </div>
                        {/* Branch CTA — only visible on hover */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-7 text-xs gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity",
                                isBranchTarget && "opacity-100",
                            )}
                            onClick={() => onBranch(entry.id)}
                            disabled={isBranching}
                        >
                            {isBranching && isBranchTarget ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <GitBranch className="h-3 w-3" />
                            )}
                            Branch from here
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                    <Markdown content={entry.content} className="text-sm" />
                </CardContent>
            </Card>
        </div>
    )
}

// ─── Citations Sidebar ────────────────────────────────────────────────────────

interface Citation {
    url?: string
    title?: string
    text?: string
    source?: string
}

function CitationsSidebar({ citations }: { citations: unknown[] }) {
    const typed = citations as Citation[]

    return (
        <aside className="w-72 flex-shrink-0">
            <div className="sticky top-6 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Sources</h3>
                </div>

                {typed.length === 0 ? (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Citations are recorded for new meetings going forward.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {typed.map((c, i) => (
                            <li key={i} className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
                                {c.title && (
                                    <p className="font-medium text-foreground line-clamp-2">{c.title}</p>
                                )}
                                {c.text && (
                                    <p className="text-muted-foreground line-clamp-3">{c.text}</p>
                                )}
                                {c.url && (
                                    <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-electric-blue hover:underline break-all"
                                    >
                                        {c.source ?? c.url}
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    )
}

// ─── Follow-up Composer ───────────────────────────────────────────────────────

interface FollowUpComposerProps {
    thread: MeetingThreadDetail
    onNewEntries: (entries: MeetingEntryRow[]) => void
}

function FollowUpComposer({ thread, onNewEntries }: FollowUpComposerProps) {
    const [text, setText] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const currentMaxRound = thread.entries.reduce(
        (max, e) => Math.max(max, e.roundNumber),
        1,
    )

    const handleSubmit = useCallback(async () => {
        const trimmed = text.trim()
        if (!trimmed || isSubmitting) return

        setIsSubmitting(true)

        // Persist the founder's message immediately
        const founderEntryInput = {
            roundNumber: currentMaxRound + 1,
            content: trimmed,
            role: "founder" as const,
        }

        const appendResult = await appendMeetingEntries(thread.id, [founderEntryInput])
        if (appendResult.error) {
            toast.error("Failed to save your follow-up", {
                description: appendResult.error,
            })
            setIsSubmitting(false)
            return
        }

        // Optimistically show the founder message
        const founderEntry: MeetingEntryRow = {
            id: appendResult.entryIds[0] ?? crypto.randomUUID(),
            threadId: thread.id,
            specialistId: null,
            specialistName: null,
            councilPosition: null,
            arrivalMs: null,
            roundNumber: currentMaxRound + 1,
            content: trimmed,
            role: "founder",
            createdAt: new Date().toISOString(),
        }
        onNewEntries([founderEntry])
        setText("")

        // Build context from prior entries for the follow-up
        const priorContext = thread.entries
            .slice(-6) // last 6 entries for context window
            .map((e) => `${e.specialistName ?? "You"}: ${e.content}`)
            .join("\n\n")

        // Dispatch one follow-up specialist call per tier
        // We use the same council tier as the original meeting
        const targetTier = thread.councilTier === "deep" || thread.councilTier === "strategy"
            ? "claude"
            : thread.councilTier === "full"
                ? "sonnet"
                : "haiku"

        const followUpTarget = getPrimaryTargetForTier(targetTier)

        try {
            const followUpPrompt = `You are continuing a brainstorming session on the topic: "${thread.topic}".

Prior discussion context:
${priorContext}

The founder has a follow-up question:
${trimmed}

Respond as the specialist you are. Be direct and actionable. Keep your response focused on the follow-up question while building on what has already been discussed.`

            // Get the first specialist from the original meeting
            const specialistId = thread.specialistIds[0]
            const specialist = specialistId ? getSpecialistById(specialistId) : null

            const startMs = Date.now()
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: followUpPrompt,
                    input: trimmed,
                    providerId: followUpTarget.providerId,
                    modelId: followUpTarget.modelId,
                    modelTier: followUpTarget.modelTier,
                    modality: "text",
                }),
            })

            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullContent = ""
            let streamingEntry: MeetingEntryRow = {
                id: "streaming",
                threadId: thread.id,
                specialistId: specialistId ?? null,
                specialistName: specialist?.name ?? "Specialist",
                councilPosition: "reactor",
                arrivalMs: null,
                roundNumber: currentMaxRound + 1,
                content: "",
                role: "specialist",
                createdAt: new Date().toISOString(),
            }

            // Show streaming placeholder
            onNewEntries([{ ...streamingEntry, content: "..." }])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                for (const line of chunk.split("\n")) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6)
                        if (data === "[DONE]") continue
                        try {
                            const parsed = JSON.parse(data) as { text?: string }
                            if (parsed.text) fullContent += parsed.text
                        } catch {
                            fullContent += data
                        }
                    }
                }
                // Update streaming entry
                streamingEntry = { ...streamingEntry, content: fullContent }
                onNewEntries([streamingEntry])
            }

            const arrivalMs = Date.now() - startMs
            const finalEntry: MeetingEntryRow = {
                ...streamingEntry,
                content: fullContent,
                arrivalMs,
            }
            onNewEntries([finalEntry])

            // Persist the specialist reply
            await appendMeetingEntries(thread.id, [
                {
                    specialistId: specialistId,
                    specialistName: specialist?.name,
                    councilPosition: "reactor",
                    arrivalMs,
                    roundNumber: currentMaxRound + 1,
                    content: fullContent,
                    role: "specialist",
                },
            ])
        } catch (err) {
            console.error("[FollowUp] Failed to get specialist response:", err)
            toast.error("Failed to get specialist response", {
                description: err instanceof Error ? err.message : "Unknown error",
            })
        } finally {
            setIsSubmitting(false)
        }
    }, [text, isSubmitting, thread, currentMaxRound, onNewEntries])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <div className="mt-8 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Ask a follow-up</h3>
            </div>
            <Textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Continue the discussion or ask a new angle..."
                rows={3}
                className="resize-none mb-3"
                disabled={isSubmitting}
            />
            <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                    Press Cmd+Enter to submit
                </p>
                <Button
                    onClick={handleSubmit}
                    disabled={!text.trim() || isSubmitting}
                    size="sm"
                    className="gap-2"
                >
                    {isSubmitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Send className="h-3.5 w-3.5" />
                    )}
                    Run a follow-up
                </Button>
            </div>
        </div>
    )
}

// ─── Main View ────────────────────────────────────────────────────────────────

/**
 * MeetingThreadView — the full persistent meeting page.
 *
 * @description Renders the topic, Council tier badge, attendee list,
 * full transcript (with position pills + arrival timers), source
 * citations sidebar, follow-up composer, and per-entry branch CTAs.
 */
export function MeetingThreadView({
    thread,
    currentUserId,
    userTier,
}: MeetingThreadViewProps) {
    const router = useRouter()
    const [entries, setEntries] = useState<MeetingEntryRow[]>(thread.entries)
    const [branchingEntryId, setBranchingEntryId] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const isAuthor = thread.authorUserId === currentUserId

    const outputs = thread.outputs as {
        notes?: {
            summary?: string
            keyDecisions?: string[]
            actionItems?: string[]
            openQuestions?: string[]
            nextSteps?: string[]
        }
    } | null

    // Called by FollowUpComposer to append entries (streaming + final)
    const handleNewEntries = useCallback((newEntries: MeetingEntryRow[]) => {
        setEntries((prev) => {
            // Replace streaming placeholder if present, else append
            const withoutPlaceholder = prev.filter((e) => e.id !== "streaming")
            return [...withoutPlaceholder, ...newEntries]
        })
    }, [])

    const handleBranch = useCallback(async (entryId: string) => {
        setBranchingEntryId(entryId)
        try {
            const result = await branchMeetingThread(thread.id, entryId)
            if (result.error || !result.threadId) {
                toast.error("Failed to create branch", { description: result.error ?? "Unknown error" })
                return
            }
            toast.success("Branch created", { description: "Opening your new branch..." })
            router.push(`/agents/m/${result.threadId}`)
        } catch (err) {
            toast.error("Failed to create branch")
            console.error("[MeetingThreadView] Branch failed:", err)
        } finally {
            setBranchingEntryId(null)
        }
    }, [thread.id, router])

    const handleCopyLink = useCallback(() => {
        const url = `${window.location.origin}/agents/m/${thread.id}`
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }, [thread.id])

    const tierLabel = TIER_LABELS[thread.councilTier] ?? thread.councilTier
    const citations = (thread.citations ?? []) as unknown[]

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Back navigation */}
            <div>
                <Link
                    href="/agents"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Team
                </Link>
            </div>

            {/* Header */}
            <div className="space-y-3">
                {/* Branch provenance */}
                {thread.parentThreadId && thread.parentTopic && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitBranch className="h-3.5 w-3.5" />
                        <span>Branched from</span>
                        <Link
                            href={`/agents/m/${thread.parentThreadId}`}
                            className="text-electric-blue hover:underline truncate max-w-[300px]"
                        >
                            {thread.parentTopic}
                        </Link>
                        {thread.parentCreatedAt && (
                            <span>
                                on {format(new Date(thread.parentCreatedAt), "MMM d, yyyy")}
                            </span>
                        )}
                    </div>
                )}

                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                        <h1 className="text-xl font-display font-semibold text-foreground leading-snug">
                            {thread.topic}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {format(new Date(thread.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </span>
                            <span className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" />
                                {thread.specialistIds.length} specialist{thread.specialistIds.length !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {entries.length} response{entries.length !== 1 ? "s" : ""}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                                {tierLabel}
                            </Badge>
                        </div>
                    </div>

                    {/* Copy link CTA */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0 gap-1.5 text-xs"
                        onClick={handleCopyLink}
                    >
                        {copied ? (
                            <>
                                <Check className="h-3.5 w-3.5 text-success" />
                                Copied
                            </>
                        ) : (
                            <>
                                <Link2 className="h-3.5 w-3.5" />
                                Copy link
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Summary panel (from outputs) */}
            {outputs?.notes?.summary && (
                <Card className="border">
                    <CardContent className="pt-4 pb-4">
                        <h2 className="text-sm font-semibold text-foreground mb-2">Summary</h2>
                        <Markdown content={outputs.notes.summary} className="text-sm" />
                    </CardContent>
                </Card>
            )}

            {/* Main layout: transcript + citations sidebar */}
            <div className="flex gap-6 items-start">
                {/* Transcript */}
                <div className="flex-1 min-w-0">
                    {entries.length === 0 ? (
                        <div className="text-center py-12 text-sm text-muted-foreground">
                            No responses recorded for this session yet.
                        </div>
                    ) : (
                        <div>
                            {entries.map((entry) => (
                                <EntryCard
                                    key={entry.id}
                                    entry={entry}
                                    onBranch={handleBranch}
                                    isBranching={branchingEntryId !== null}
                                    isBranchTarget={branchingEntryId === entry.id}
                                />
                            ))}
                        </div>
                    )}

                    {/* Follow-up composer — only for the thread author */}
                    {isAuthor && (
                        <FollowUpComposer
                            thread={{ ...thread, entries }}
                            onNewEntries={handleNewEntries}
                        />
                    )}
                </div>

                {/* Citations sidebar */}
                <CitationsSidebar citations={citations} />
            </div>

            {/* Outputs detail: action items + decisions */}
            {outputs?.notes && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {outputs.notes.keyDecisions && outputs.notes.keyDecisions.length > 0 && (
                        <Card className="border">
                            <CardContent className="pt-4 pb-4">
                                <h3 className="text-sm font-semibold text-foreground mb-2">Key Decisions</h3>
                                <ul className="space-y-1.5">
                                    {outputs.notes.keyDecisions.map((d, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                            {d}
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}

                    {outputs.notes.actionItems && outputs.notes.actionItems.length > 0 && (
                        <Card className="border">
                            <CardContent className="pt-4 pb-4">
                                <h3 className="text-sm font-semibold text-foreground mb-2">Action Items</h3>
                                <ul className="space-y-1.5">
                                    {outputs.notes.actionItems.map((a, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                            <ChevronRight className="h-3.5 w-3.5 text-international-orange flex-shrink-0 mt-0.5" />
                                            {a}
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    )
}
