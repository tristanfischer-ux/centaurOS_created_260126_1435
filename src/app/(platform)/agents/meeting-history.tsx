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

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
    Users,
    Calendar,
    ChevronDown,
    ChevronUp,
    ArrowRight,
    MessageSquare,
    Search,
    GitBranch,
    ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { listMeetingThreads } from "@/actions/meeting-threads"
import { getMeetingHistory } from "@/actions/agent-artifacts"
import type { MeetingThreadSummary } from "@/actions/meeting-threads"
import type { MeetingHistoryItem } from "@/actions/agent-artifacts"

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRangeFilter = "all" | "week" | "month"

interface MeetingHistoryProps {
    /** Max meetings to show initially (before "View All") */
    initialLimit?: number
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
}

function MeetingCard({ meeting }: MeetingCardProps) {
    const hasPermalink = !meeting.id.startsWith("legacy-")
    const tierLabel = TIER_LABELS[meeting.councilTier] ?? meeting.councilTier

    return (
        <Card
            className={cn(
                "border rounded-xl",
                "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
            )}
        >
            <CardContent className="pt-5 space-y-3">
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

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MeetingHistory -- Searchable list of past brainstorming sessions.
 *
 * @description Fetches saved meeting threads (new) and legacy agent_artifacts
 * meetings (old). Renders compact cards with search, date filter chips, and
 * "Branched only" toggle. Each card links to /agents/m/<id> for persistent access.
 */
export function MeetingHistory({ initialLimit = 3 }: MeetingHistoryProps) {
    const [meetings, setMeetings] = useState<MeetingThreadSummary[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showAll, setShowAll] = useState(false)

    // Search + filter state
    const [search, setSearch] = useState("")
    const [dateRange, setDateRange] = useState<DateRangeFilter>("all")
    const [branchedOnly, setBranchedOnly] = useState(false)
    const [isFiltering, setIsFiltering] = useState(false)

    // Initial load — try meeting_threads first, fall back to legacy artifacts
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
    }, [])

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

    if (!isLoading && meetings.length === 0 && !search && dateRange === "all" && !branchedOnly) {
        return null
    }

    const visibleMeetings = showAll ? meetings : meetings.slice(0, initialLimit)
    const hasMore = meetings.length > initialLimit

    return (
        <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-electric-blue" />
                <div className="flex-1">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-foreground font-semibold">
                        Meeting History
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Previous team discussions and action items
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

            {/* Empty search state */}
            {!isLoading && !isFiltering && meetings.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                    No meetings match your search. Try a different term or filter.
                </p>
            )}

            {/* Meeting Cards */}
            {!isLoading && !isFiltering && meetings.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleMeetings.map((meeting) => (
                        <MeetingCard key={meeting.id} meeting={meeting} />
                    ))}
                </div>
            )}
        </div>
    )
}
