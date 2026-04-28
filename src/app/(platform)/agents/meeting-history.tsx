"use client"

/**
 * @file meeting-history.tsx
 *
 * @description Searchable history of past brainstorming sessions.
 * Each meeting card links to its persistent /agents/m/<id> URL so founders
 * can return to, share, follow up on, or branch from any session.
 *
 * Features added (RED-TEAM-PIVOT-PLAN.md Tier 4 step 21):
 *  - Search box across topic text
 *  - Filter chips: Last 7 days / Last 30 days / All time / Branched only
 *  - Each result links to /agents/m/<id>
 *
 * @related
 * - src/actions/meeting-threads.ts -- listMeetingThreads server action
 * - src/actions/agent-artifacts.ts -- getMeetingHistory (legacy fallback)
 * - src/app/(platform)/agents/m/[id]/page.tsx -- Persistent meeting view
 * - specialists-landing.tsx -- Parent integration
 */

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    MessageSquare,
    Search,
    GitBranch,
    ExternalLink,
    Pin,
    PinOff,
    Trash2,
    AudioLines,
    ImageIcon,
    Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import {
    listMeetingThreads,
    deleteMeetingThread,
    togglePinMeetingThread,
} from "@/actions/meeting-threads"
import { getMeetingHistory } from "@/actions/agent-artifacts"
import type { MeetingThreadSummary } from "@/actions/meeting-threads"
import type { MeetingHistoryItem } from "@/actions/agent-artifacts"

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRangeFilter = "all" | "week" | "month"

interface MeetingHistoryProps {
    /** Max meetings to show initially (before "View All") */
    initialLimit?: number
    /**
     * W7: Increment this key to trigger a re-fetch of the sessions list.
     * BrainstormingCouncilView bumps it after each successful session save
     * so the new session appears in the panel without a page refresh.
     */
    refreshKey?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
    quick:    "Quick",
    full:     "Full Council",
    deep:     "Deep Council",
    strategy: "Strategy",
}

/** Normalise a MeetingHistoryItem (legacy artifact) into MeetingThreadSummary shape */
function legacyToSummary(item: MeetingHistoryItem): MeetingThreadSummary {
    return {
        id: item.id,
        topic: item.topic || item.title,
        councilTier: (item.metadata.councilTier as string) ?? "quick",
        specialistIds: item.attendees,
        snippet: item.summary?.slice(0, 200) ?? "",
        entryCount: item.roundCount,
        parentThreadId: null,
        createdAt: item.createdAt,
        // F1 / F2 / F3 fields don't exist on legacy artifacts
        isPinned: false,
        pinnedAt: null,
        coverImageUrl: null,
        coverStatus: 'pending',
        audioStatus: 'pending',
        audioClipsCount: 0,
    }
}

// ─── Filter Chips ─────────────────────────────────────────────────────────────

interface FilterChipsProps {
    dateRange: DateRangeFilter
    onDateRange: (v: DateRangeFilter) => void
    branchedOnly: boolean
    onBranchedOnly: (v: boolean) => void
}

function FilterChips({ dateRange, onDateRange, branchedOnly, onBranchedOnly }: FilterChipsProps) {
    const dateOptions: { label: string; value: DateRangeFilter }[] = [
        { label: "All time", value: "all" },
        { label: "Last 7 days", value: "week" },
        { label: "Last 30 days", value: "month" },
    ]

    return (
        <div className="flex flex-wrap items-center gap-2">
            {dateOptions.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onDateRange(opt.value)}
                    className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                        dateRange === opt.value
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                    )}
                >
                    {opt.label}
                </button>
            ))}
            <button
                onClick={() => onBranchedOnly(!branchedOnly)}
                className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1",
                    branchedOnly
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                )}
            >
                <GitBranch className="h-3 w-3" />
                Branched only
            </button>
        </div>
    )
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────

interface MeetingCardProps {
    meeting: MeetingThreadSummary
    onPinToggle: (id: string, pinned: boolean) => void
    onRequestDelete: (m: MeetingThreadSummary) => void
    isMutating?: boolean
}

function MeetingCard({ meeting, onPinToggle, onRequestDelete, isMutating }: MeetingCardProps) {
    const hasPermalink = !meeting.id.startsWith("legacy-")
    const tierLabel = TIER_LABELS[meeting.councilTier] ?? meeting.councilTier
    const canMutate = hasPermalink

    return (
        <Card
            className={cn(
                "border rounded-xl group relative overflow-hidden",
                "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
                meeting.isPinned && "border-international-orange/40 bg-international-orange/[0.02]",
            )}
        >
            {/* Cover image / placeholder strip — F2 thumbnail surface */}
            <div className="relative h-32 w-full bg-gradient-to-br from-electric-blue/5 via-international-orange/5 to-electric-blue/5 border-b border-border">
                {meeting.coverImageUrl && meeting.coverStatus === "ready" ? (
                    // Use a plain <img> for signed Supabase URLs — next/image
                    // requires the host in remotePatterns, and signed URLs
                    // include query params next/image rejects without config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={meeting.coverImageUrl}
                        alt={`Cover for: ${meeting.topic}`}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : meeting.coverStatus === "generating" || meeting.coverStatus === "pending" ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                        <Sparkles className="h-5 w-5 text-electric-blue/60 animate-pulse" />
                        <span className="text-[10px] text-muted-foreground">
                            {meeting.coverStatus === "generating"
                                ? "Generating cover image…"
                                : "Cover image queued"}
                        </span>
                    </div>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground/60">
                            No cover image
                        </span>
                    </div>
                )}

                {/* Pin / delete affordances — surfaced on hover, always accessible via keyboard */}
                {canMutate && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 bg-background/95 hover:bg-background shadow-sm"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onPinToggle(meeting.id, !meeting.isPinned)
                            }}
                            disabled={isMutating}
                            aria-label={meeting.isPinned ? "Unpin session" : "Pin session"}
                            title={meeting.isPinned ? "Unpin" : "Pin to top"}
                        >
                            {meeting.isPinned ? (
                                <PinOff className="h-3.5 w-3.5 text-international-orange" />
                            ) : (
                                <Pin className="h-3.5 w-3.5" />
                            )}
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 bg-background/95 hover:bg-destructive hover:text-destructive-foreground shadow-sm"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onRequestDelete(meeting)
                            }}
                            disabled={isMutating}
                            aria-label="Delete session"
                            title="Delete session"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}

                {meeting.isPinned && (
                    <Badge
                        variant="default"
                        className="absolute top-2 left-2 bg-international-orange text-white text-[9px] px-1.5 py-0 gap-1"
                    >
                        <Pin className="h-2.5 w-2.5" />
                        Pinned
                    </Badge>
                )}
            </div>

            <CardContent className="pt-4 space-y-3">
                {/* Topic */}
                <h4 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                    {meeting.topic}
                </h4>

                {/* Snippet */}
                {meeting.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                        {meeting.snippet}
                        {meeting.snippet.length >= 200 ? "..." : ""}
                    </p>
                )}

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(meeting.createdAt), "MMM d, yyyy")}
                    </span>
                    {meeting.entryCount > 0 && (
                        <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {meeting.entryCount} response{meeting.entryCount !== 1 ? "s" : ""}
                        </span>
                    )}
                    {meeting.parentThreadId && (
                        <span className="flex items-center gap-1 text-international-orange">
                            <GitBranch className="h-3 w-3" />
                            Branch
                        </span>
                    )}
                    {meeting.audioStatus === "ready" && meeting.audioClipsCount > 0 && (
                        <span className="flex items-center gap-1 text-electric-blue">
                            <AudioLines className="h-3 w-3" />
                            Audio
                        </span>
                    )}
                    {meeting.audioStatus === "generating" && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                            <AudioLines className="h-3 w-3 animate-pulse" />
                            Generating audio…
                        </span>
                    )}
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                        {tierLabel}
                    </Badge>
                </div>

                {/* CTA */}
                {hasPermalink && (
                    <div className="pt-1">
                        <Link
                            href={`/agents/m/${meeting.id}`}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-electric-blue hover:text-electric-blue/80 transition-colors"
                        >
                            View meeting
                            <ExternalLink className="h-3 w-3" />
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ─── Delete Confirmation Dialog ───────────────────────────────────────────────

interface DeleteSessionDialogProps {
    meeting: MeetingThreadSummary | null
    onConfirm: () => Promise<void>
    onCancel: () => void
    isDeleting: boolean
}

function DeleteSessionDialog({ meeting, onConfirm, onCancel, isDeleting }: DeleteSessionDialogProps) {
    const open = meeting !== null
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !isDeleting) onCancel()
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-destructive" />
                        Delete brainstorming session?
                    </DialogTitle>
                    <DialogDescription>
                        This will permanently remove the session, every specialist response,
                        the cover image, and any audio clips. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                {meeting && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                        <p className="text-sm font-semibold line-clamp-2">{meeting.topic}</p>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(meeting.createdAt), "MMMM d, yyyy")}
                            {meeting.entryCount > 0 && ` · ${meeting.entryCount} responses`}
                            {meeting.audioClipsCount > 0 && ` · ${meeting.audioClipsCount} audio clips`}
                        </p>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={onCancel} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
                        {isDeleting ? "Deleting…" : "Delete session"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MeetingHistory -- Searchable list of past brainstorming sessions.
 *
 * @description Fetches saved meeting threads (new) and legacy agent_artifacts
 * meetings (old). Renders compact cards with search, date filter chips, and
 * "Branched only" toggle. Each card links to /agents/m/<id> for persistent access.
 */
export function MeetingHistory({ initialLimit = 3, refreshKey = 0 }: MeetingHistoryProps) {
    const [meetings, setMeetings] = useState<MeetingThreadSummary[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showAll, setShowAll] = useState(false)

    // Search + filter state
    const [search, setSearch] = useState("")
    const [dateRange, setDateRange] = useState<DateRangeFilter>("all")
    const [branchedOnly, setBranchedOnly] = useState(false)
    const [isFiltering, setIsFiltering] = useState(false)

    // F1: pin / delete state
    const [mutatingId, setMutatingId] = useState<string | null>(null)
    const [pendingDelete, setPendingDelete] = useState<MeetingThreadSummary | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const handlePinToggle = useCallback(
        async (id: string, pinned: boolean) => {
            // Optimistic update
            setMutatingId(id)
            setMeetings((prev) => {
                const next = prev.map((m) =>
                    m.id === id
                        ? { ...m, isPinned: pinned, pinnedAt: pinned ? new Date().toISOString() : null }
                        : m,
                )
                // Re-sort: pinned-first, then by pinnedAt desc, then createdAt desc
                next.sort((a, b) => {
                    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
                    if (a.isPinned && b.isPinned) {
                        const ap = a.pinnedAt ?? a.createdAt
                        const bp = b.pinnedAt ?? b.createdAt
                        return bp.localeCompare(ap)
                    }
                    return b.createdAt.localeCompare(a.createdAt)
                })
                return next
            })

            const result = await togglePinMeetingThread(id, pinned)
            setMutatingId(null)
            if (!result.ok) {
                console.error("[MeetingHistory] Pin toggle failed:", result.error)
                // Rollback on failure
                setMeetings((prev) =>
                    prev.map((m) => (m.id === id ? { ...m, isPinned: !pinned } : m)),
                )
            }
        },
        [],
    )

    const handleRequestDelete = useCallback((m: MeetingThreadSummary) => {
        setPendingDelete(m)
    }, [])

    const handleCancelDelete = useCallback(() => {
        setPendingDelete(null)
    }, [])

    const handleConfirmDelete = useCallback(async () => {
        if (!pendingDelete) return
        setIsDeleting(true)
        const result = await deleteMeetingThread(pendingDelete.id)
        setIsDeleting(false)
        if (result.ok) {
            setMeetings((prev) => prev.filter((m) => m.id !== pendingDelete.id))
            setPendingDelete(null)
        } else {
            console.error("[MeetingHistory] Delete failed:", result.error)
            // Keep the dialog open so the user sees the error state; surface
            // via console for now (the action returns sanitised errors).
            alert(result.error ?? "Failed to delete session. Please try again.")
        }
    }, [pendingDelete])

    // Initial load + W7 refresh — re-fires when refreshKey increments
    // (bumped by BrainstormingCouncilView after each successful session save).
    useEffect(() => {
        async function fetchMeetings(): Promise<void> {
            setIsLoading(true)
            try {
                const threadResult = await listMeetingThreads({ limit: 50 })
                if (!threadResult.error && threadResult.data.length > 0) {
                    setMeetings(threadResult.data)
                } else {
                    // Fallback to legacy artifacts for older meetings
                    const legacyResult = await getMeetingHistory(50)
                    if (!legacyResult.error) {
                        setMeetings(legacyResult.data.map(legacyToSummary))
                    }
                }
            } catch (err) {
                console.error("[MeetingHistory] Failed to fetch:", err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchMeetings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey])

    // Re-fetch when filters change (uses the server-side filter)
    useEffect(() => {
        if (isLoading) return // skip the initial load
        const handler = setTimeout(async () => {
            setIsFiltering(true)
            try {
                const result = await listMeetingThreads({
                    search: search.trim() || undefined,
                    dateRange: dateRange === "all" ? undefined : dateRange,
                    branchedOnly: branchedOnly || undefined,
                    limit: 50,
                })
                if (!result.error) {
                    setMeetings(result.data)
                }
            } catch {
                // Non-critical
            } finally {
                setIsFiltering(false)
            }
        }, 300) // debounce

        return () => clearTimeout(handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, dateRange, branchedOnly])

    // F1: always render the panel — even when empty, founders need to see
    // the affordance ("your saved sessions show up here") so the feature
    // is discoverable. Previously this returned null and hid the section.
    const visibleMeetings = showAll ? meetings : meetings.slice(0, initialLimit)
    const hasMore = meetings.length > initialLimit

    return (
        <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-electric-blue" />
                <div className="flex-1">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-foreground font-semibold">
                        Saved Sessions
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Pin to keep at the top. Delete to remove a session, its responses, and any generated assets.
                    </p>
                </div>
                {hasMore && !search && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAll(!showAll)}
                        className="text-xs"
                    >
                        {showAll ? (
                            <>
                                Show Less
                                <ChevronUp className="h-3.5 w-3.5 ml-1" />
                            </>
                        ) : (
                            <>
                                View All ({meetings.length})
                                <ChevronDown className="h-3.5 w-3.5 ml-1" />
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Search + filters */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search your meetings..."
                        className="pl-8 h-8 text-xs"
                    />
                </div>
                <FilterChips
                    dateRange={dateRange}
                    onDateRange={setDateRange}
                    branchedOnly={branchedOnly}
                    onBranchedOnly={setBranchedOnly}
                />
            </div>

            {/* Loading State */}
            {(isLoading || isFiltering) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: initialLimit }).map((_, i) => (
                        <Card key={i} className="border">
                            <CardContent className="pt-5 space-y-3">
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-2/3" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Empty state — split between "no sessions yet" and "no matches" */}
            {!isLoading && !isFiltering && meetings.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
                    {search || dateRange !== "all" || branchedOnly ? (
                        <p className="text-sm text-muted-foreground">
                            No saved sessions match this search. Try a different term or clear the filters.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <Sparkles className="h-6 w-6 text-electric-blue/60 mx-auto" />
                            <p className="text-sm font-medium text-foreground">
                                Your saved brainstorms show up here
                            </p>
                            <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                Run a Quick or Full Council session above. Each session is saved automatically with a generated cover image and audio recording.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Meeting Cards */}
            {!isLoading && !isFiltering && meetings.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleMeetings.map((meeting) => (
                        <MeetingCard
                            key={meeting.id}
                            meeting={meeting}
                            onPinToggle={handlePinToggle}
                            onRequestDelete={handleRequestDelete}
                            isMutating={mutatingId === meeting.id}
                        />
                    ))}
                </div>
            )}

            {/* Delete confirmation dialog */}
            <DeleteSessionDialog
                meeting={pendingDelete}
                onConfirm={handleConfirmDelete}
                onCancel={handleCancelDelete}
                isDeleting={isDeleting}
            />
        </div>
    )
}
